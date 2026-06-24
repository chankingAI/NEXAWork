/**
 * NexaWork Recorded-Skill Helpers (N27)
 * =====================================
 * Pure, dependency-free types + helpers shared by the recorded-skill manager
 * (main process), the IPC layer and the renderer RecordedSkillPanel. Keeping
 * variable detection, Zod-schema generation, step descriptions, SKILL.md /
 * workflow.js rendering and success-rate maths here means they can be unit
 * tested under `bun test` without Electron, and the renderer reuses the exact
 * same formatting the backend computes.
 *
 * The semantics mirror the recorder package so the desktop surface stays
 * faithful to the generators it ultimately drives:
 *   {@link ../../../@ant/computer-use-recorder/src/variableAbstraction} —
 *     detectVariables / generateSchema / rewriteWorkflowScript
 *   {@link ../../../@ant/computer-use-recorder/src/skillGenerator} —
 *     generateSkill (SKILL.md + workflow.js + recording.json)
 *
 * No Electron / fs / native dependencies live here on purpose.
 */

import type {
  RecordedAction,
  RecordingFile,
} from '../main/backend/recorder-manager'

// ─── Variable types ───────────────────────────────────────────────────────────

/** Zod-compatible variable type for the dynamic parameter form. */
export type SkillVariableType =
  | 'string'
  | 'number'
  | 'date'
  | 'email'
  | 'url'
  | 'boolean'

/** A detected / editable skill parameter (mirrors DetectedVariable). */
export interface SkillVariable {
  /** Semantic name used in the workflow script (`args.<name>`). */
  name: string
  /** Human-readable label for the form field. */
  label: string
  type: SkillVariableType
  /** Original recorded value used as the form default. */
  defaultValue: string
  /** Whether the field must be filled before execution. */
  required: boolean
  /** Why this value was identified as a variable. */
  reason?: string
  /** 0–1 confidence the value should be parameterized. */
  confidence?: number
  /** Index of the recorded step this variable came from. */
  stepIndex: number
}

// ─── Step types ─────────────────────────────────────────────────────────────

/** Coarse step category, used for icons + execution pacing. */
export type SkillStepType =
  | 'click'
  | 'type'
  | 'key'
  | 'scroll'
  | 'move'
  | 'drag'
  | 'wait'
  | 'other'

/** A single, editable skill step derived from a recorded action. */
export interface SkillStep {
  /** Stable id so reorder/edit survives index shuffling. */
  id: string
  /** Raw action verb (left_click, type, key, scroll, …) or 'wait'. */
  action: string
  /** Coarse category for icons + pacing. */
  type: SkillStepType
  /** Human-readable description shown in the steps list. */
  description: string
  /** Original payload (typed text, key name, …). */
  detail?: string
  /** Dwell time in ms for an explicit wait step. */
  waitMs?: number
}

// ─── Execution history ────────────────────────────────────────────────────────

/** One recorded run of a skill (drives history + success-rate stats). */
export interface SkillExecutionRecord {
  id: string
  startedAt: number
  finishedAt: number
  durationMs: number
  success: boolean
  /** Parameter values supplied for the run. */
  params: Record<string, string>
  error?: string
}

// ─── Skill ─────────────────────────────────────────────────────────────────

/** Provenance of the skill. */
export type SkillSource = 'recorded' | 'manual'

/** A fully-loaded recorded skill (persisted as `<id>.json`). */
export interface RecordedSkill {
  id: string
  name: string
  description: string
  /** Emoji / short glyph shown in the list. */
  icon: string
  tags: string[]
  /** When the skill should be triggered/suggested (SKILL.md `when_to_use`). */
  whenToUse?: string
  source: SkillSource
  /** Recording the skill was generated from, if any. */
  recordingId?: string
  steps: SkillStep[]
  variables: SkillVariable[]
  executions: SkillExecutionRecord[]
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
}

/** Lightweight skill metadata for the list view. */
export interface SkillSummary {
  id: string
  name: string
  description: string
  icon: string
  tags: string[]
  stepCount: number
  variableCount: number
  executionCount: number
  /** Success rate in [0, 1]; 0 when never executed. */
  successRate: number
  lastUsedAt?: number
  updatedAt: number
}

/** Detected variables + derived steps for the generate-from-recording dialog. */
export interface RecordingAnalysis {
  recordingId: string
  steps: SkillStep[]
  variables: SkillVariable[]
}

/** Default glyph for a freshly generated skill. */
export const DEFAULT_SKILL_ICON = '✨'

/** Base per-step pacing (ms) used to estimate execution time. */
export const SKILL_STEP_BASE_MS = 600

/** Default dwell for an inserted wait step. */
export const DEFAULT_WAIT_MS = 1000

// ─── Step mapping + description ─────────────────────────────────────────────

/** Map a raw recorded action verb to a coarse step category. */
export function mapActionType(action: string): SkillStepType {
  const a = action.toLowerCase()
  if (a === 'wait') return 'wait'
  if (a.includes('drag')) return 'drag'
  if (a.includes('click')) return 'click'
  if (a.includes('type') || a.includes('input')) return 'type'
  if (a.includes('key') || a.includes('press')) return 'key'
  if (a.includes('scroll')) return 'scroll'
  if (a.includes('move')) return 'move'
  return 'other'
}

/** A short, readable description for a skill step. */
export function describeSkillStep(step: SkillStep): string {
  if (step.type === 'wait') {
    return `等待 ${step.waitMs ?? DEFAULT_WAIT_MS}ms`
  }
  const detail = step.detail?.trim()
  if (detail) return `${step.action} · ${detail}`
  return step.action
}

/** Estimate total execution time (ms) from the steps + base pacing. */
export function estimateExecutionTime(
  steps: SkillStep[],
  baseStepMs: number = SKILL_STEP_BASE_MS,
): number {
  return steps.reduce((total, step) => {
    if (step.type === 'wait') return total + (step.waitMs ?? DEFAULT_WAIT_MS)
    return total + Math.max(0, baseStepMs)
  }, 0)
}

/** Success rate in [0, 1] from a skill's execution history (0 when empty). */
export function computeSuccessRate(executions: SkillExecutionRecord[]): number {
  if (executions.length === 0) return 0
  const ok = executions.filter(e => e.success).length
  return ok / executions.length
}

// ─── Variable detection (mirrors variableAbstraction heuristics) ─────────────

interface TypePattern {
  type: SkillVariableType
  pattern: RegExp
  nameHint: string
  label: string
}

const TYPE_PATTERNS: TypePattern[] = [
  {
    type: 'date',
    pattern: /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
    nameHint: 'date',
    label: '日期',
  },
  {
    type: 'date',
    pattern: /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,
    nameHint: 'date',
    label: '日期',
  },
  {
    type: 'email',
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    nameHint: 'email',
    label: '邮箱',
  },
  {
    type: 'url',
    pattern: /^https?:\/\/.+/,
    nameHint: 'url',
    label: '链接',
  },
  {
    type: 'number',
    pattern: /^\d+(\.\d+)?$/,
    nameHint: 'quantity',
    label: '数量',
  },
  {
    type: 'number',
    pattern: /^[$€¥£]\d+(\.\d+)?$/,
    nameHint: 'amount',
    label: '金额',
  },
]

/** Options for {@link detectSkillVariables}. */
export interface DetectVariablesOptions {
  /** Minimum confidence to keep a candidate (default 0.5). */
  minConfidence?: number
  /** Maximum number of variables to return (default 10). */
  maxVariables?: number
}

/**
 * Detect parameterizable values among recorded actions. Mirrors the recorder's
 * heuristic engine: scans `type`-style actions and scores their payloads by
 * pattern, length and capitalization.
 */
export function detectSkillVariables(
  events: readonly RecordedAction[],
  options: DetectVariablesOptions = {},
): SkillVariable[] {
  const minConfidence = options.minConfidence ?? 0.5
  const maxVariables = options.maxVariables ?? 10
  const used = new Set<string>()
  const candidates: SkillVariable[] = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (!event) continue
    if (mapActionType(event.action) !== 'type') continue
    const text = event.detail?.trim()
    if (!text || text.length < 2) continue
    // Never parameterize masked secrets.
    if (/^\*+$/.test(text)) continue

    const detected = analyzeValue(text, i, used)
    if (detected && (detected.confidence ?? 0) >= minConfidence) {
      candidates.push(detected)
      used.add(detected.name)
    }
  }

  candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  return candidates.slice(0, maxVariables)
}

function analyzeValue(
  text: string,
  stepIndex: number,
  used: Set<string>,
): SkillVariable | null {
  let type: SkillVariableType = 'string'
  let confidence = 0
  let reason = ''
  let nameHint = 'input'
  let label = '输入值'

  for (const tp of TYPE_PATTERNS) {
    if (tp.pattern.test(text)) {
      type = tp.type
      confidence = 0.85
      reason = `匹配${tp.label}格式`
      nameHint = tp.nameHint
      label = tp.label
      break
    }
  }

  if (confidence < 0.5 && text.length > 5) {
    confidence = 0.5 + Math.min(text.length / 100, 0.2)
    reason = '文本长度较长，可能是用户自定义内容'
  }

  if (confidence < 0.6 && /^[A-Z][a-z]/.test(text)) {
    confidence = 0.6
    reason = '首字母大写，可能是专有名词/具体值'
  }

  if (confidence < 0.3) return null

  const name = ensureUniqueName(nameHint, used)
  return {
    name,
    label,
    type,
    defaultValue: text,
    required: true,
    reason,
    confidence,
    stepIndex,
  }
}

function ensureUniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let counter = 2
  while (used.has(`${base}${counter}`)) counter++
  return `${base}${counter}`
}

// ─── Zod schema generation (mirrors generateSchema/buildSchemaSource) ─────────

/** Build the Zod type expression for a single variable. */
export function buildZodType(variable: SkillVariable): string {
  const def = variable.defaultValue
  switch (variable.type) {
    case 'number':
      return `z.number().default(${parseFloat(def.replace(/[^0-9.]/g, '')) || 0})`
    case 'date':
      return `z.string().describe("日期格式: YYYY-MM-DD").default(${JSON.stringify(def)})`
    case 'email':
      return `z.string().email().default(${JSON.stringify(def)})`
    case 'url':
      return `z.string().url().default(${JSON.stringify(def)})`
    case 'boolean':
      return `z.boolean().default(${def === 'true'})`
    default:
      return `z.string().default(${JSON.stringify(def)})`
  }
}

/** Complete Zod schema source for a skill's variables (`z.object({...})`). */
export function buildSchemaSource(variables: SkillVariable[]): string {
  if (variables.length === 0) return 'z.object({})'
  const lines = variables.map(v => {
    const desc = v.label ? `.describe(${JSON.stringify(v.label)})` : ''
    return `  ${v.name}: ${buildZodType(v)}${desc}`
  })
  return `z.object({\n${lines.join(',\n')}\n})`
}

// ─── Parameter coercion + validation (drives the dynamic form) ────────────────

/** Coerce a raw form string to the variable's runtime type. */
export function coerceVariableValue(
  value: string,
  type: SkillVariableType,
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

/** Result of validating a parameter form against a skill's variables. */
export interface ParamValidationResult {
  valid: boolean
  /** Per-field error message, keyed by variable name. */
  errors: Record<string, string>
  /** Coerced values for the valid run (string form, ready for the script). */
  values: Record<string, string>
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const URL_RE = /^https?:\/\/.+/
const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/

/** Validate + normalize a parameter form for a skill's variables. */
export function validateSkillParams(
  variables: SkillVariable[],
  input: Record<string, string>,
): ParamValidationResult {
  const errors: Record<string, string> = {}
  const values: Record<string, string> = {}

  for (const v of variables) {
    const raw = (input[v.name] ?? v.defaultValue ?? '').trim()
    if (!raw) {
      if (v.required) errors[v.name] = '必填项'
      values[v.name] = ''
      continue
    }
    switch (v.type) {
      case 'number':
        if (Number.isNaN(Number(raw))) errors[v.name] = '请输入数字'
        break
      case 'email':
        if (!EMAIL_RE.test(raw)) errors[v.name] = '邮箱格式不正确'
        break
      case 'url':
        if (!URL_RE.test(raw)) errors[v.name] = '链接需以 http(s):// 开头'
        break
      case 'date':
        if (!DATE_RE.test(raw)) errors[v.name] = '日期格式: YYYY-MM-DD'
        break
      default:
        break
    }
    values[v.name] = raw
  }

  return { valid: Object.keys(errors).length === 0, errors, values }
}

// ─── Step operations (drag-reorder / delete / edit / insert wait) ─────────────

/** Move a step from one index to another, returning a new array. */
export function reorderSteps(
  steps: SkillStep[],
  fromIndex: number,
  toIndex: number,
): SkillStep[] {
  if (
    fromIndex < 0 ||
    fromIndex >= steps.length ||
    toIndex < 0 ||
    toIndex >= steps.length ||
    fromIndex === toIndex
  ) {
    return steps.slice()
  }
  const next = steps.slice()
  const [moved] = next.splice(fromIndex, 1)
  if (moved) next.splice(toIndex, 0, moved)
  return next
}

/** Remove the step with the given id, returning a new array. */
export function removeStep(steps: SkillStep[], stepId: string): SkillStep[] {
  return steps.filter(s => s.id !== stepId)
}

/** Apply a partial update to the step with the given id. */
export function updateStep(
  steps: SkillStep[],
  stepId: string,
  patch: Partial<Pick<SkillStep, 'detail' | 'description' | 'waitMs'>>,
): SkillStep[] {
  return steps.map(s => {
    if (s.id !== stepId) return s
    const next: SkillStep = { ...s, ...patch }
    if (patch.description === undefined)
      next.description = describeSkillStep(next)
    return next
  })
}

/** Insert an explicit wait step after the given index. */
export function insertWaitStep(
  steps: SkillStep[],
  afterIndex: number,
  waitMs: number,
  makeId: () => string,
): SkillStep[] {
  const wait: SkillStep = {
    id: makeId(),
    action: 'wait',
    type: 'wait',
    waitMs: Math.max(0, Math.round(waitMs)),
    description: `等待 ${Math.max(0, Math.round(waitMs))}ms`,
  }
  const next = steps.slice()
  const at = Math.min(Math.max(afterIndex + 1, 0), next.length)
  next.splice(at, 0, wait)
  return next
}

// ─── Recording → steps ───────────────────────────────────────────────────────

/** Build editable skill steps from recorded actions. */
export function buildSkillSteps(
  events: readonly RecordedAction[],
  makeId: (index: number) => string,
): SkillStep[] {
  return events.map((event, index) => {
    const type = mapActionType(event.action)
    const step: SkillStep = {
      id: makeId(index),
      action: event.action,
      type,
      detail: event.detail,
      description: '',
    }
    step.description = describeSkillStep(step)
    return step
  })
}

// ─── Summary derivation ───────────────────────────────────────────────────────

/** Derive the lightweight list summary from a full skill. */
export function toSkillSummary(skill: RecordedSkill): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
    tags: skill.tags,
    stepCount: skill.steps.length,
    variableCount: skill.variables.length,
    executionCount: skill.executions.length,
    successRate: computeSuccessRate(skill.executions),
    lastUsedAt: skill.lastUsedAt,
    updatedAt: skill.updatedAt,
  }
}

// ─── SKILL.md + workflow.js rendering (mirrors skillGenerator) ────────────────

/** Sanitize a skill name into a directory-safe slug. */
export function sanitizeSkillName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'recorded-skill'
}

/** Render SKILL.md content for a skill (YAML frontmatter + steps + usage). */
export function generateSkillMd(skill: RecordedSkill): string {
  const lines: string[] = []
  lines.push('---')
  lines.push(`name: ${skill.name}`)
  lines.push(`description: ${skill.description}`)
  if (skill.whenToUse) lines.push(`when_to_use: ${skill.whenToUse}`)
  if (skill.tags.length) {
    lines.push(`tags: [${skill.tags.map(t => `"${t}"`).join(', ')}]`)
  }
  lines.push(`source: ${skill.source}`)
  lines.push(`recorded_at: ${new Date(skill.createdAt).toISOString()}`)
  lines.push(`total_steps: ${skill.steps.length}`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${skill.name}`)
  lines.push('')
  lines.push(skill.description)
  lines.push('')

  if (skill.variables.length) {
    lines.push('## Parameters')
    lines.push('')
    for (const v of skill.variables) {
      lines.push(
        `- \`${v.name}\` (${v.type}) — ${v.label}，默认值: ${v.defaultValue}`,
      )
    }
    lines.push('')
  }

  lines.push('## Steps')
  lines.push('')
  const shown = Math.min(skill.steps.length, 20)
  for (let i = 0; i < shown; i++) {
    const step = skill.steps[i]
    if (step) lines.push(`${i + 1}. ${step.description}`)
  }
  if (skill.steps.length > 20) {
    lines.push(`... 以及另外 ${skill.steps.length - 20} 步`)
  }
  lines.push('')
  lines.push('## Usage')
  lines.push('')
  lines.push(
    '该技能由用户录制自动生成，可通过工作流引擎直接回放，或由 AI 适配后使用。',
  )
  lines.push('')
  lines.push('### Replay')
  lines.push('```')
  lines.push(`claude replay --skill ${sanitizeSkillName(skill.name)}`)
  lines.push('```')
  return lines.join('\n')
}

/**
 * Render a workflow.js script for a skill. Type steps whose value matches a
 * detected variable are emitted as `args.<name>` references (mirrors
 * rewriteWorkflowScript), the rest inline their recorded payload.
 */
export function generateWorkflowScript(skill: RecordedSkill): string {
  const byStepIndex = new Map<number, SkillVariable>()
  skill.variables.forEach(v => byStepIndex.set(v.stepIndex, v))

  const lines: string[] = []
  lines.push('// Auto-generated workflow — NexaWork recorded skill')
  lines.push(`// name: ${skill.name}`)
  lines.push('export const schema = ' + buildSchemaSource(skill.variables))
  lines.push('')
  lines.push('export async function run(agent, args = {}) {')
  skill.steps.forEach((step, index) => {
    if (step.type === 'wait') {
      lines.push(`  await agent.wait(${step.waitMs ?? DEFAULT_WAIT_MS})`)
      return
    }
    if (step.type === 'type') {
      const variable = byStepIndex.get(index)
      if (variable) {
        lines.push(`  await agent.type(args.${variable.name})`)
      } else {
        lines.push(`  await agent.type(${JSON.stringify(step.detail ?? '')})`)
      }
      return
    }
    const detail = step.detail ? `, ${JSON.stringify(step.detail)}` : ''
    lines.push(`  await agent.perform(${JSON.stringify(step.action)}${detail})`)
  })
  lines.push('}')
  return lines.join('\n')
}

// ─── Safe loading from disk ───────────────────────────────────────────────────

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStepType(value: unknown): SkillStepType {
  const types: SkillStepType[] = [
    'click',
    'type',
    'key',
    'scroll',
    'move',
    'drag',
    'wait',
    'other',
  ]
  return types.includes(value as SkillStepType)
    ? (value as SkillStepType)
    : 'other'
}

function asVariableType(value: unknown): SkillVariableType {
  const types: SkillVariableType[] = [
    'string',
    'number',
    'date',
    'email',
    'url',
    'boolean',
  ]
  return types.includes(value as SkillVariableType)
    ? (value as SkillVariableType)
    : 'string'
}

/** Best-effort coercion of an untyped JSON blob into a {@link RecordedSkill}. */
export function coerceRecordedSkill(raw: unknown): RecordedSkill | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) return null

  const steps: SkillStep[] = Array.isArray(o.steps)
    ? o.steps.map((s, i) => {
        const so = (s ?? {}) as Record<string, unknown>
        const step: SkillStep = {
          id: asString(so.id, `step_${i}`),
          action: asString(so.action, 'other'),
          type: asStepType(so.type),
          detail: typeof so.detail === 'string' ? so.detail : undefined,
          description: asString(so.description),
          waitMs: typeof so.waitMs === 'number' ? so.waitMs : undefined,
        }
        if (!step.description) step.description = describeSkillStep(step)
        return step
      })
    : []

  const variables: SkillVariable[] = Array.isArray(o.variables)
    ? o.variables.map((v, i) => {
        const vo = (v ?? {}) as Record<string, unknown>
        return {
          name: asString(vo.name, `var${i}`),
          label: asString(vo.label, asString(vo.name, `var${i}`)),
          type: asVariableType(vo.type),
          defaultValue: asString(vo.defaultValue),
          required: vo.required !== false,
          reason: typeof vo.reason === 'string' ? vo.reason : undefined,
          confidence:
            typeof vo.confidence === 'number' ? vo.confidence : undefined,
          stepIndex: asNumber(vo.stepIndex, 0),
        }
      })
    : []

  const executions: SkillExecutionRecord[] = Array.isArray(o.executions)
    ? o.executions.map((e, i) => {
        const eo = (e ?? {}) as Record<string, unknown>
        const params: Record<string, string> = {}
        if (eo.params && typeof eo.params === 'object') {
          for (const [k, val] of Object.entries(
            eo.params as Record<string, unknown>,
          )) {
            params[k] = asString(val)
          }
        }
        return {
          id: asString(eo.id, `exec_${i}`),
          startedAt: asNumber(eo.startedAt),
          finishedAt: asNumber(eo.finishedAt),
          durationMs: asNumber(eo.durationMs),
          success: eo.success === true,
          params,
          error: typeof eo.error === 'string' ? eo.error : undefined,
        }
      })
    : []

  const createdAt = asNumber(o.createdAt, Date.now())
  return {
    id: o.id,
    name: asString(o.name, '未命名技能'),
    description: asString(o.description),
    icon: asString(o.icon, DEFAULT_SKILL_ICON),
    tags: Array.isArray(o.tags)
      ? o.tags.filter(t => typeof t === 'string')
      : [],
    whenToUse: typeof o.whenToUse === 'string' ? o.whenToUse : undefined,
    source: o.source === 'manual' ? 'manual' : 'recorded',
    recordingId: typeof o.recordingId === 'string' ? o.recordingId : undefined,
    steps,
    variables,
    executions,
    createdAt,
    updatedAt: asNumber(o.updatedAt, createdAt),
    lastUsedAt: typeof o.lastUsedAt === 'number' ? o.lastUsedAt : undefined,
  }
}

// ─── Execution → replay recording ─────────────────────────────────────────────

/**
 * Build a replay-ready {@link RecordingFile} from a skill + parameter values.
 * Type steps bound to a variable receive the supplied value; wait steps are
 * dropped (the replay manager paces steps itself). This is what bridges N27
 * "execute" into the N26 replay engine.
 */
export function buildExecutionRecording(
  skill: RecordedSkill,
  params: Record<string, string>,
  config: RecordingFile['config'],
  now: number,
): RecordingFile {
  const byStepIndex = new Map<number, SkillVariable>()
  skill.variables.forEach(v => byStepIndex.set(v.stepIndex, v))

  const events: RecordedAction[] = []
  skill.steps.forEach((step, index) => {
    if (step.type === 'wait') return
    let detail = step.detail
    const variable = byStepIndex.get(index)
    if (variable) {
      detail = params[variable.name] ?? variable.defaultValue
    }
    events.push({ action: step.action, timestamp: now, detail })
  })

  return {
    id: skill.id,
    startTime: now,
    endTime: now,
    durationMs: estimateExecutionTime(skill.steps),
    eventCount: events.length,
    taskDescription: skill.name,
    config,
    events,
  }
}
