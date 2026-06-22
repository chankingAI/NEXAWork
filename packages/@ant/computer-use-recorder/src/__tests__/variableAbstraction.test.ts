import { describe, expect, test } from 'bun:test'
import {
  VariableAbstractionEngine,
  detectVariables,
  generateSchema,
  rewriteWorkflowScript,
} from '../variableAbstraction.js'
import type {
  DetectedVariable,
  AIVariableAnalyzer,
  AnalysisContext,
} from '../variableAbstraction.js'
import type { RawActionEvent } from '../types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTypeEvent(
  text: string,
  overrides: Partial<RawActionEvent> = {},
): RawActionEvent {
  return {
    action: 'type',
    text,
    timestamp: 1000,
    screenshot_before: null,
    screenshot_after: null,
    window_context: { app_name: 'Chrome', window_title: 'Test Page' },
    ...overrides,
  }
}

function makeClickEvent(
  overrides: Partial<RawActionEvent> = {},
): RawActionEvent {
  return {
    action: 'left_click',
    coordinate: [100, 200] as [number, number],
    timestamp: 1000,
    screenshot_before: null,
    screenshot_after: null,
    window_context: { app_name: 'Chrome', window_title: 'Test Page' },
    ...overrides,
  }
}

// ─── detectVariables Tests ────────────────────────────────────────────────────

describe('detectVariables', () => {
  test('detects date patterns', () => {
    const events = [makeTypeEvent('2024-03-15')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.type).toBe('date')
    expect(vars[0]!.defaultValue).toBe('2024-03-15')
  })

  test('detects email patterns', () => {
    const events = [makeTypeEvent('john@example.com')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.type).toBe('email')
  })

  test('detects URL patterns', () => {
    const events = [makeTypeEvent('https://example.com/page')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.type).toBe('url')
  })

  test('detects numeric patterns', () => {
    const events = [makeTypeEvent('42.5')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.type).toBe('number')
  })

  test('detects currency amounts', () => {
    const events = [makeTypeEvent('$199.99')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.type).toBe('number')
    expect(vars[0]!.name).toContain('amount')
  })

  test('uses element context role for detection', () => {
    const events = [
      makeTypeEvent('Hello world', {
        element_context: { role: 'Edit', accessible_name: 'Message' },
      }),
    ]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.confidence).toBeGreaterThanOrEqual(0.6)
  })

  test('uses accessible_name label keywords', () => {
    const events = [
      makeTypeEvent('laptop case', {
        element_context: { role: 'Edit', accessible_name: 'Search keyword' },
      }),
    ]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.name).toContain('search')
  })

  test('ignores single character inputs', () => {
    const events = [makeTypeEvent('x')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(0)
  })

  test('ignores non-type actions', () => {
    const events = [makeClickEvent()]
    const vars = detectVariables(events)
    expect(vars.length).toBe(0)
  })

  test('respects minConfidence threshold', () => {
    const events = [makeTypeEvent('ab')] // Short, low confidence
    const vars = detectVariables(events, { minConfidence: 0.9 })
    expect(vars.length).toBe(0)
  })

  test('respects maxVariables limit', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      makeTypeEvent(`user${i}@example.com`),
    )
    const vars = detectVariables(events, { maxVariables: 3 })
    expect(vars.length).toBe(3)
  })

  test('generates unique names for duplicate hints', () => {
    const events = [makeTypeEvent('2024-01-01'), makeTypeEvent('2024-12-31')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(2)
    expect(vars[0]!.name).not.toBe(vars[1]!.name)
  })

  test('detects capitalized proper nouns', () => {
    const events = [makeTypeEvent('John Smith')]
    const vars = detectVariables(events)
    expect(vars.length).toBe(1)
    expect(vars[0]!.confidence).toBeGreaterThanOrEqual(0.6)
  })

  test('detects longer strings as likely variables', () => {
    const events = [makeTypeEvent('The quick brown fox jumps over')]
    const vars = detectVariables(events, { minConfidence: 0.5 })
    expect(vars.length).toBe(1)
    expect(vars[0]!.type).toBe('string')
  })

  test('mixed event types only detects type events', () => {
    const events = [
      makeClickEvent(),
      makeTypeEvent('test@email.com'),
      makeClickEvent(),
      makeTypeEvent('2024-06-15'),
      makeClickEvent(),
    ]
    const vars = detectVariables(events)
    expect(vars.length).toBe(2)
    expect(vars.some(v => v.type === 'email')).toBe(true)
    expect(vars.some(v => v.type === 'date')).toBe(true)
  })
})

// ─── generateSchema Tests ─────────────────────────────────────────────────────

describe('generateSchema', () => {
  test('generates empty schema for no variables', () => {
    const result = generateSchema([])
    expect(result.fields.length).toBe(0)
    expect(result.schemaSource).toBe('z.object({})')
  })

  test('generates string field with default', () => {
    const vars: DetectedVariable[] = [
      {
        name: 'searchQuery',
        label: 'Search Query',
        type: 'string',
        defaultValue: 'laptop',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.9,
      },
    ]
    const result = generateSchema(vars)
    expect(result.fields.length).toBe(1)
    expect(result.fields[0]!.name).toBe('searchQuery')
    expect(result.fields[0]!.zodType).toContain('z.string()')
    expect(result.fields[0]!.zodType).toContain('"laptop"')
    expect(result.schemaSource).toContain('searchQuery')
  })

  test('generates number field', () => {
    const vars: DetectedVariable[] = [
      {
        name: 'quantity',
        label: 'Quantity',
        type: 'number',
        defaultValue: '42',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.8,
      },
    ]
    const result = generateSchema(vars)
    expect(result.fields[0]!.zodType).toContain('z.number()')
    expect(result.fields[0]!.zodType).toContain('42')
    expect(result.fields[0]!.defaultValue).toBe(42)
  })

  test('generates email field', () => {
    const vars: DetectedVariable[] = [
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        defaultValue: 'a@b.com',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.85,
      },
    ]
    const result = generateSchema(vars)
    expect(result.fields[0]!.zodType).toContain('.email()')
  })

  test('generates url field', () => {
    const vars: DetectedVariable[] = [
      {
        name: 'targetUrl',
        label: 'Target URL',
        type: 'url',
        defaultValue: 'https://example.com',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.85,
      },
    ]
    const result = generateSchema(vars)
    expect(result.fields[0]!.zodType).toContain('.url()')
  })

  test('generates multi-field schema', () => {
    const vars: DetectedVariable[] = [
      {
        name: 'username',
        label: 'Username',
        type: 'string',
        defaultValue: 'admin',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.8,
      },
      {
        name: 'amount',
        label: 'Amount',
        type: 'number',
        defaultValue: '$99.50',
        reason: 'test',
        eventIndex: 1,
        confidence: 0.85,
      },
    ]
    const result = generateSchema(vars)
    expect(result.fields.length).toBe(2)
    expect(result.schemaSource).toContain('username')
    expect(result.schemaSource).toContain('amount')
    expect(result.schemaSource).toContain('z.object({')
  })

  test('schema source includes .describe() for each field', () => {
    const vars: DetectedVariable[] = [
      {
        name: 'date',
        label: 'Delivery Date',
        type: 'date',
        defaultValue: '2024-01-01',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.9,
      },
    ]
    const result = generateSchema(vars)
    expect(result.schemaSource).toContain('.describe(')
    expect(result.schemaSource).toContain('Delivery Date')
  })
})

// ─── rewriteWorkflowScript Tests ──────────────────────────────────────────────

describe('rewriteWorkflowScript', () => {
  test('replaces hardcoded text with args reference', () => {
    const script = `agent("Type into search", { action: "type", text: "laptop" })`
    const vars: DetectedVariable[] = [
      {
        name: 'searchQuery',
        label: 'Search',
        type: 'string',
        defaultValue: 'laptop',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.9,
      },
    ]
    const result = rewriteWorkflowScript(script, vars)
    expect(result).toContain('args.searchQuery')
    expect(result).not.toContain('"laptop"')
  })

  test('replaces JSON-style text fields', () => {
    const script = `{"action": "type", "text": "hello@world.com"}`
    const vars: DetectedVariable[] = [
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        defaultValue: 'hello@world.com',
        reason: 'test',
        eventIndex: 0,
        confidence: 0.9,
      },
    ]
    const result = rewriteWorkflowScript(script, vars)
    expect(result).toContain('args.email')
  })

  test('handles multiple variables', () => {
    const script = `
agent("step1", { text: "admin" })
agent("step2", { text: "password123" })
`
    const vars: DetectedVariable[] = [
      {
        name: 'username',
        label: '',
        type: 'string',
        defaultValue: 'admin',
        reason: '',
        eventIndex: 0,
        confidence: 0.8,
      },
      {
        name: 'pass',
        label: '',
        type: 'string',
        defaultValue: 'password123',
        reason: '',
        eventIndex: 1,
        confidence: 0.8,
      },
    ]
    const result = rewriteWorkflowScript(script, vars)
    expect(result).toContain('args.username')
    expect(result).toContain('args.pass')
  })

  test('preserves non-matching text', () => {
    const script = `agent("click button", { action: "left_click" })`
    const vars: DetectedVariable[] = [
      {
        name: 'x',
        label: '',
        type: 'string',
        defaultValue: 'not-in-script',
        reason: '',
        eventIndex: 0,
        confidence: 0.9,
      },
    ]
    const result = rewriteWorkflowScript(script, vars)
    expect(result).toBe(script)
  })

  test('handles special regex characters in values', () => {
    const script = `agent("nav", { text: "https://example.com/path?q=1" })`
    const vars: DetectedVariable[] = [
      {
        name: 'url',
        label: '',
        type: 'url',
        defaultValue: 'https://example.com/path?q=1',
        reason: '',
        eventIndex: 0,
        confidence: 0.9,
      },
    ]
    const result = rewriteWorkflowScript(script, vars)
    expect(result).toContain('args.url')
  })
})

// ─── VariableAbstractionEngine Tests ──────────────────────────────────────────

describe('VariableAbstractionEngine', () => {
  test('analyze with heuristic-only mode', async () => {
    const engine = new VariableAbstractionEngine({ useAI: false })
    const events = [
      makeClickEvent(),
      makeTypeEvent('john@example.com', {
        element_context: { role: 'Edit', accessible_name: 'Email' },
      }),
      makeClickEvent(),
      makeTypeEvent('2024-06-20'),
    ]
    const { schema } = await engine.analyze(events)
    expect(schema.variables.length).toBe(2)
    expect(schema.fields.length).toBe(2)
    expect(schema.schemaSource).toContain('z.object({')
  })

  test('analyze with workflow script rewriting', async () => {
    const engine = new VariableAbstractionEngine()
    const events = [
      makeTypeEvent('laptop', {
        element_context: { role: 'SearchBox', accessible_name: 'Search' },
      }),
    ]
    const script = `agent("search", { action: "type", text: "laptop" })`
    const { schema, rewrittenScript } = await engine.analyze(events, script)
    expect(schema.variables.length).toBe(1)
    expect(rewrittenScript).toBeDefined()
    expect(rewrittenScript).toContain('args.')
  })

  test('analyze returns empty schema when no variables detected', async () => {
    const engine = new VariableAbstractionEngine({ minConfidence: 0.99 })
    const events = [makeClickEvent(), makeClickEvent()]
    const { schema } = await engine.analyze(events)
    expect(schema.variables.length).toBe(0)
    expect(schema.schemaSource).toBe('z.object({})')
  })

  test('analyze with AI analyzer', async () => {
    const mockAnalyzer: AIVariableAnalyzer = {
      async analyzeActions(
        _actions: readonly RawActionEvent[],
        _context: AnalysisContext,
      ): Promise<DetectedVariable[]> {
        return [
          {
            name: 'aiDetectedVar',
            label: 'AI Detected',
            type: 'string',
            defaultValue: 'test',
            reason: 'AI detected',
            eventIndex: 0,
            confidence: 0.95,
          },
        ]
      },
    }

    const engine = new VariableAbstractionEngine({
      useAI: true,
      aiAnalyzer: mockAnalyzer,
    })
    const events = [makeTypeEvent('test')]
    const { schema } = await engine.analyze(events)
    expect(schema.variables.some(v => v.name === 'aiDetectedVar')).toBe(true)
  })

  test('AI results merged with heuristic results', async () => {
    const mockAnalyzer: AIVariableAnalyzer = {
      async analyzeActions(): Promise<DetectedVariable[]> {
        return [
          {
            name: 'aiVar',
            label: 'AI',
            type: 'string',
            defaultValue: 'ai-value',
            reason: 'AI',
            eventIndex: 0,
            confidence: 0.95,
          },
        ]
      },
    }

    const engine = new VariableAbstractionEngine({
      useAI: true,
      aiAnalyzer: mockAnalyzer,
      minConfidence: 0.6,
    })
    const events = [
      makeTypeEvent('ai-value'), // Index 0 (AI will detect)
      makeTypeEvent('user@test.com'), // Index 1 (heuristic will detect)
    ]
    const { schema } = await engine.analyze(events)
    // Should have both AI detected (index 0) and heuristic detected (index 1)
    expect(schema.variables.length).toBe(2)
  })

  test('no script rewriting when no variables found', async () => {
    const engine = new VariableAbstractionEngine({ minConfidence: 0.99 })
    const events = [makeClickEvent()]
    const script = `agent("click", { action: "left_click" })`
    const { rewrittenScript } = await engine.analyze(events, script)
    expect(rewrittenScript).toBeUndefined()
  })
})
