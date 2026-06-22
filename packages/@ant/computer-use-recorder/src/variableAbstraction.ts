/**
 * Variable Abstraction Engine — Detects parameterizable values in recorded
 * action sequences and generates typed input schemas.
 *
 * Analyzes type/key actions to identify user-entered values that should be
 * abstracted as parameters (dates, names, quantities, search terms, etc.)
 * and generates Zod-compatible schemas for the resulting Skill.
 *
 * Reference:
 * - packages/workflow-engine/src/tool/schema.ts — workflowInputSchema (z.object)
 * - src/services/skillLearning/learningPolicy.ts — learning heuristics
 * - browser-use/browser_use/agent/variable_detector.py — variable detection
 */

import type { RawActionEvent, ElementContext, WindowContext } from './types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A detected variable candidate from the recorded actions. */
export interface DetectedVariable {
  /** Semantic variable name (e.g., "searchKeyword", "orderDate"). */
  name: string
  /** Human-readable label for UI display. */
  label: string
  /** Zod-compatible type. */
  type: VariableType
  /** The original hardcoded value recorded. */
  defaultValue: string
  /** Why this was identified as a variable. */
  reason: string
  /** Which event index this came from. */
  eventIndex: number
  /** Confidence score 0-1 that this should be a variable. */
  confidence: number
  /** Contextual hint (e.g., preceding label, element accessible_name). */
  contextHint?: string
}

/** Supported variable types for schema generation. */
export type VariableType =
  | 'string'
  | 'number'
  | 'date'
  | 'email'
  | 'url'
  | 'boolean'
  | 'enum'

/** Schema field definition (Zod-compatible). */
export interface SchemaField {
  /** Field name (camelCase). */
  name: string
  /** Zod type string (e.g., "z.string()", "z.number()"). */
  zodType: string
  /** Human-readable description. */
  description: string
  /** Default value (from recording). */
  defaultValue: string | number | boolean
  /** Whether this field is required (default: true). */
  required: boolean
}

/** Generated input schema for the workflow. */
export interface GeneratedSchema {
  /** The detected variables. */
  variables: DetectedVariable[]
  /** The Zod schema fields. */
  fields: SchemaField[]
  /** Complete Zod schema source code string. */
  schemaSource: string
  /** The rewritten workflow script with variable references. */
  rewrittenScript?: string
}

/** Configuration for the variable abstraction engine. */
export interface VariableAbstractionOptions {
  /** Minimum confidence threshold for auto-detecting variables (default: 0.6). */
  minConfidence?: number
  /** Whether to use Claude API for smart variable detection (default: false for offline). */
  useAI?: boolean
  /** Custom AI analyzer (injected for testing/flexibility). */
  aiAnalyzer?: AIVariableAnalyzer
  /** Maximum number of variables to extract (default: 10). */
  maxVariables?: number
}

/** Interface for AI-powered variable analysis. */
export interface AIVariableAnalyzer {
  /**
   * Analyze actions and return detected variables.
   * This would call Claude API with context about the actions.
   */
  analyzeActions(
    actions: readonly RawActionEvent[],
    context: AnalysisContext,
  ): Promise<DetectedVariable[]>
}

/** Context provided to the AI analyzer. */
export interface AnalysisContext {
  /** Task description (if available). */
  taskDescription?: string
  /** Window context at start of recording. */
  startWindow?: WindowContext
  /** All unique window contexts encountered. */
  windows: WindowContext[]
}

// ─── Variable Detection Heuristics ───────────────────────────────────────────

/** Pattern-based variable type detectors. */
const TYPE_PATTERNS: Array<{
  type: VariableType
  pattern: RegExp
  nameHint: string
  label: string
}> = [
  {
    type: 'date',
    pattern: /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
    nameHint: 'date',
    label: 'Date',
  },
  {
    type: 'date',
    pattern: /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,
    nameHint: 'date',
    label: 'Date',
  },
  {
    type: 'email',
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    nameHint: 'email',
    label: 'Email Address',
  },
  {
    type: 'url',
    pattern: /^https?:\/\/.+/,
    nameHint: 'url',
    label: 'URL',
  },
  {
    type: 'number',
    pattern: /^\d+(\.\d+)?$/,
    nameHint: 'quantity',
    label: 'Quantity',
  },
  {
    type: 'number',
    pattern: /^[$€¥£]\d+(\.\d+)?$/,
    nameHint: 'amount',
    label: 'Amount',
  },
]

/** Context-based variable detection — certain element roles suggest variables. */
const CONTEXT_INDICATORS: Array<{
  roles: string[]
  confidence: number
  nameHint: string
}> = [
  {
    roles: ['Edit', 'TextBox', 'TextField', 'SearchBox'],
    confidence: 0.8,
    nameHint: 'input',
  },
  {
    roles: ['ComboBox', 'DropDown', 'Select'],
    confidence: 0.7,
    nameHint: 'selection',
  },
  { roles: ['SpinButton', 'Slider'], confidence: 0.75, nameHint: 'value' },
]

/** Common label keywords that suggest variable content. */
const LABEL_KEYWORDS: Record<string, { nameHint: string; type: VariableType }> =
  {
    search: { nameHint: 'searchQuery', type: 'string' },
    keyword: { nameHint: 'keyword', type: 'string' },
    name: { nameHint: 'name', type: 'string' },
    username: { nameHint: 'username', type: 'string' },
    password: { nameHint: 'password', type: 'string' },
    email: { nameHint: 'email', type: 'email' },
    date: { nameHint: 'date', type: 'date' },
    phone: { nameHint: 'phoneNumber', type: 'string' },
    address: { nameHint: 'address', type: 'string' },
    amount: { nameHint: 'amount', type: 'number' },
    price: { nameHint: 'price', type: 'number' },
    quantity: { nameHint: 'quantity', type: 'number' },
    url: { nameHint: 'url', type: 'url' },
    file: { nameHint: 'filePath', type: 'string' },
    path: { nameHint: 'path', type: 'string' },
    title: { nameHint: 'title', type: 'string' },
    description: { nameHint: 'description', type: 'string' },
    comment: { nameHint: 'comment', type: 'string' },
    message: { nameHint: 'message', type: 'string' },
  }

// ─── Core Detection Logic ─────────────────────────────────────────────────────

/**
 * Detect potential variables in a sequence of recorded actions.
 * Uses heuristic pattern matching + element context analysis.
 */
export function detectVariables(
  events: readonly RawActionEvent[],
  options: VariableAbstractionOptions = {},
): DetectedVariable[] {
  const minConfidence = options.minConfidence ?? 0.6
  const maxVariables = options.maxVariables ?? 10
  const candidates: DetectedVariable[] = []
  const usedNames = new Set<string>()

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!
    if (event.action !== 'type' || !event.text) continue

    const text = event.text
    if (text.length < 2) continue // Skip single characters

    const detected = analyzeValue(text, event, i, usedNames)
    if (detected && detected.confidence >= minConfidence) {
      candidates.push(detected)
      usedNames.add(detected.name)
    }
  }

  // Sort by confidence (highest first) and limit
  candidates.sort((a, b) => b.confidence - a.confidence)
  return candidates.slice(0, maxVariables)
}

/**
 * Analyze a single typed value to determine if it's a variable.
 */
function analyzeValue(
  text: string,
  event: RawActionEvent,
  eventIndex: number,
  usedNames: Set<string>,
): DetectedVariable | null {
  let bestType: VariableType = 'string'
  let bestConfidence = 0
  let bestReason = ''
  let nameHint = 'input'

  // Check type patterns
  for (const { type, pattern, nameHint: hint, label } of TYPE_PATTERNS) {
    if (pattern.test(text)) {
      bestType = type
      bestConfidence = 0.85
      bestReason = `Matched ${label} pattern`
      nameHint = hint
      break
    }
  }

  // Check element context
  const elementRole = event.element_context?.role
  if (elementRole) {
    for (const { roles, confidence, nameHint: hint } of CONTEXT_INDICATORS) {
      if (
        roles.some(r => elementRole.toLowerCase().includes(r.toLowerCase()))
      ) {
        if (confidence > bestConfidence) {
          bestConfidence = confidence
          bestReason = `Element role "${elementRole}" suggests variable input`
          nameHint = hint
        }
        break
      }
    }
  }

  // Check accessible_name / label keywords
  const label = event.element_context?.accessible_name ?? ''
  if (label) {
    const labelLower = label.toLowerCase()
    for (const [keyword, { nameHint: hint, type }] of Object.entries(
      LABEL_KEYWORDS,
    )) {
      if (labelLower.includes(keyword)) {
        if (bestConfidence < 0.75) {
          bestType = type
          bestConfidence = 0.75
          bestReason = `Label "${label}" contains keyword "${keyword}"`
          nameHint = hint
        }
        break
      }
    }
  }

  // Heuristic: longer text is more likely to be a variable
  if (text.length > 5 && bestConfidence < 0.5) {
    bestConfidence = 0.5 + Math.min(text.length / 100, 0.2)
    bestReason = 'Non-trivial text length suggests user-specific content'
  }

  // Heuristic: text that looks like a proper noun or specific value
  if (/^[A-Z][a-z]/.test(text) && bestConfidence < 0.6) {
    bestConfidence = 0.6
    bestReason = 'Capitalized text suggests a proper noun/specific value'
  }

  if (bestConfidence < 0.3) return null

  // Generate unique name
  const baseName = buildVariableName(nameHint, label, eventIndex)
  const name = ensureUniqueName(baseName, usedNames)

  return {
    name,
    label: label || buildLabel(nameHint, eventIndex),
    type: bestType,
    defaultValue: text,
    reason: bestReason,
    eventIndex,
    confidence: bestConfidence,
    contextHint: label || elementRole || undefined,
  }
}

/**
 * Build a semantic variable name from available context.
 */
function buildVariableName(
  nameHint: string,
  label: string,
  _index: number,
): string {
  if (label) {
    // Derive from accessible_name: "Search keyword" → "searchKeyword"
    const words = label
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
    if (words.length > 0 && words.length <= 4) {
      return toCamelCase(words)
    }
  }
  return nameHint
}

/**
 * Build a human-readable label for the variable.
 */
function buildLabel(nameHint: string, _index: number): string {
  return nameHint
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

/**
 * Ensure a variable name is unique.
 */
function ensureUniqueName(base: string, usedNames: Set<string>): string {
  if (!usedNames.has(base)) return base
  let counter = 2
  while (usedNames.has(`${base}${counter}`)) counter++
  return `${base}${counter}`
}

/**
 * Convert words to camelCase.
 */
function toCamelCase(words: string[]): string {
  return words
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('')
}

// ─── Schema Generation ────────────────────────────────────────────────────────

/**
 * Generate a Zod schema from detected variables.
 * Output format is compatible with workflow-engine's workflowInputSchema pattern.
 */
export function generateSchema(variables: DetectedVariable[]): GeneratedSchema {
  const fields: SchemaField[] = variables.map(v => ({
    name: v.name,
    zodType: buildZodType(v.type, v.defaultValue),
    description: v.label || v.reason,
    defaultValue: coerceDefaultValue(v.defaultValue, v.type),
    required: true,
  }))

  const schemaSource = buildSchemaSource(fields)

  return {
    variables,
    fields,
    schemaSource,
  }
}

/**
 * Build the Zod type string for a variable type.
 */
function buildZodType(type: VariableType, defaultValue: string): string {
  switch (type) {
    case 'string':
      return `z.string().default(${JSON.stringify(defaultValue)})`
    case 'number':
      return `z.number().default(${parseFloat(defaultValue.replace(/[^0-9.]/g, '')) || 0})`
    case 'date':
      return `z.string().describe("Date format: YYYY-MM-DD").default(${JSON.stringify(defaultValue)})`
    case 'email':
      return `z.string().email().default(${JSON.stringify(defaultValue)})`
    case 'url':
      return `z.string().url().default(${JSON.stringify(defaultValue)})`
    case 'boolean':
      return `z.boolean().default(${defaultValue === 'true'})`
    case 'enum':
      return `z.string().default(${JSON.stringify(defaultValue)})`
  }
}

/**
 * Coerce default value to the appropriate runtime type.
 */
function coerceDefaultValue(
  value: string,
  type: VariableType,
): string | number | boolean {
  switch (type) {
    case 'number':
      return parseFloat(value.replace(/[^0-9.-]/g, '')) || 0
    case 'boolean':
      return value === 'true'
    default:
      return value
  }
}

/**
 * Build the complete Zod schema source code string.
 * Compatible with workflow-engine/src/tool/schema.ts pattern (z.object).
 */
function buildSchemaSource(fields: SchemaField[]): string {
  if (fields.length === 0) return 'z.object({})'

  const fieldLines = fields.map(f => {
    const desc = f.description
      ? `.describe(${JSON.stringify(f.description)})`
      : ''
    return `  ${f.name}: ${f.zodType}${desc}`
  })

  return `z.object({\n${fieldLines.join(',\n')}\n})`
}

// ─── Workflow Script Rewriting ────────────────────────────────────────────────

/**
 * Rewrite a workflow script to replace hardcoded values with variable references.
 * Replaces `text: "hardcoded"` with `text: args.variableName` patterns.
 */
export function rewriteWorkflowScript(
  script: string,
  variables: DetectedVariable[],
): string {
  let rewritten = script

  for (const variable of variables) {
    // Replace the hardcoded value with an args reference
    const escapedValue = escapeRegex(variable.defaultValue)
    const pattern = new RegExp(`(text:\\s*)(["'\`])${escapedValue}\\2`, 'g')
    rewritten = rewritten.replace(pattern, `$1args.${variable.name}`)

    // Also handle JSON-style strings in agent() calls
    const jsonPattern = new RegExp(`"text":\\s*"${escapedValue}"`, 'g')
    rewritten = rewritten.replace(jsonPattern, `"text": args.${variable.name}`)
  }

  return rewritten
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────

/**
 * VariableAbstractionEngine — Complete pipeline from events to parameterized schema.
 *
 * Usage:
 * ```ts
 * const engine = new VariableAbstractionEngine()
 * const result = await engine.analyze(events, workflowScript)
 * // result.schema.schemaSource → Zod schema code
 * // result.rewrittenScript → Script with args.X references
 * ```
 */
export class VariableAbstractionEngine {
  private _options: Required<Omit<VariableAbstractionOptions, 'aiAnalyzer'>> & {
    aiAnalyzer?: AIVariableAnalyzer
  }

  constructor(options: VariableAbstractionOptions = {}) {
    this._options = {
      minConfidence: options.minConfidence ?? 0.6,
      useAI: options.useAI ?? false,
      maxVariables: options.maxVariables ?? 10,
      aiAnalyzer: options.aiAnalyzer,
    }
  }

  /**
   * Analyze recorded events and generate a parameterized schema.
   * If useAI is enabled and an aiAnalyzer is provided, uses AI for smarter detection.
   * Otherwise falls back to heuristic-only detection.
   */
  async analyze(
    events: readonly RawActionEvent[],
    workflowScript?: string,
  ): Promise<{ schema: GeneratedSchema; rewrittenScript?: string }> {
    let variables: DetectedVariable[]

    if (this._options.useAI && this._options.aiAnalyzer) {
      // AI-enhanced detection
      const context = this._buildContext(events)
      const aiVariables = await this._options.aiAnalyzer.analyzeActions(
        events,
        context,
      )

      // Merge with heuristic results (AI takes priority)
      const heuristicVariables = detectVariables(events, this._options)
      variables = this._mergeDetections(aiVariables, heuristicVariables)
    } else {
      // Heuristic-only detection
      variables = detectVariables(events, this._options)
    }

    const schema = generateSchema(variables)

    let rewrittenScript: string | undefined
    if (workflowScript && variables.length > 0) {
      rewrittenScript = rewriteWorkflowScript(workflowScript, variables)
      schema.rewrittenScript = rewrittenScript
    }

    return { schema, rewrittenScript }
  }

  /**
   * Build analysis context from events.
   */
  private _buildContext(events: readonly RawActionEvent[]): AnalysisContext {
    const windows: WindowContext[] = []
    const seen = new Set<string>()

    for (const event of events) {
      if (event.window_context) {
        const key = `${event.window_context.app_name}|${event.window_context.window_title}`
        if (!seen.has(key)) {
          windows.push(event.window_context)
          seen.add(key)
        }
      }
    }

    return {
      startWindow: events[0]?.window_context,
      windows,
    }
  }

  /**
   * Merge AI and heuristic detections, preferring AI results.
   */
  private _mergeDetections(
    aiVars: DetectedVariable[],
    heuristicVars: DetectedVariable[],
  ): DetectedVariable[] {
    const merged = [...aiVars]
    const aiIndices = new Set(aiVars.map(v => v.eventIndex))

    // Add heuristic detections that weren't caught by AI
    for (const hv of heuristicVars) {
      if (!aiIndices.has(hv.eventIndex)) {
        merged.push(hv)
      }
    }

    merged.sort((a, b) => b.confidence - a.confidence)
    return merged.slice(0, this._options.maxVariables)
  }
}
