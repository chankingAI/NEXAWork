/**
 * Recorded-skill subsystem tests (N27).
 *
 * Two Electron-free layers, both run under `bun test`:
 *  1. The pure helpers in `shared/skill` — action mapping, step descriptions,
 *     execution-time estimation, success rate, variable detection, Zod schema
 *     generation, parameter validation, step ops (reorder/remove/edit/wait),
 *     summary derivation, SKILL.md / workflow.js rendering and the
 *     execute→replay recording bridge.
 *  2. The `SkillManager` (in-memory, null dir) — create from a recording, edit
 *     metadata + steps, reorder, duplicate, delete, record executions and
 *     export, plus the analyze-recording pre-pass.
 */
import { describe, expect, test } from 'bun:test'
import {
  buildExecutionRecording,
  buildSchemaSource,
  buildSkillSteps,
  buildZodType,
  coerceRecordedSkill,
  coerceVariableValue,
  computeSuccessRate,
  describeSkillStep,
  detectSkillVariables,
  estimateExecutionTime,
  generateSkillMd,
  generateWorkflowScript,
  insertWaitStep,
  mapActionType,
  type RecordedSkill,
  removeStep,
  reorderSteps,
  sanitizeSkillName,
  type SkillStep,
  type SkillVariable,
  toSkillSummary,
  updateStep,
  validateSkillParams,
} from '../shared/skill'
import { SkillManager } from '../main/backend/skill-manager'
import type { RecordingFile } from '../main/backend/recorder-manager'
import { DEFAULT_RECORDING_CONFIG } from '../shared/recording-config'

// ─── Fixtures ─────────────────────────────────────────────────
function makeRecording(
  events: { action: string; detail?: string }[],
  id = 'rec_1',
): RecordingFile {
  return {
    id,
    startTime: 0,
    endTime: events.length * 100,
    durationMs: events.length * 100,
    eventCount: events.length,
    taskDescription: 'Demo task',
    config: DEFAULT_RECORDING_CONFIG,
    events: events.map((e, i) => ({
      action: e.action,
      timestamp: i * 100,
      detail: e.detail,
    })),
  }
}

function makeStep(partial: Partial<SkillStep> & { id: string }): SkillStep {
  return {
    action: 'left_click',
    type: 'click',
    description: 'click',
    ...partial,
  }
}

// ─── mapActionType ────────────────────────────────────────────
describe('mapActionType', () => {
  test('maps recorded verbs to coarse categories', () => {
    expect(mapActionType('left_click')).toBe('click')
    expect(mapActionType('double_click')).toBe('click')
    expect(mapActionType('type')).toBe('type')
    expect(mapActionType('input_text')).toBe('type')
    expect(mapActionType('key')).toBe('key')
    expect(mapActionType('keypress')).toBe('key')
    expect(mapActionType('scroll')).toBe('scroll')
    expect(mapActionType('mouse_move')).toBe('move')
    expect(mapActionType('drag')).toBe('drag')
    expect(mapActionType('wait')).toBe('wait')
    expect(mapActionType('whatever')).toBe('other')
  })
})

// ─── describeSkillStep ────────────────────────────────────────
describe('describeSkillStep', () => {
  test('describes a wait step with its dwell time', () => {
    expect(
      describeSkillStep(
        makeStep({ id: 'a', type: 'wait', action: 'wait', waitMs: 500 }),
      ),
    ).toBe('等待 500ms')
  })

  test('appends the detail when present and falls back otherwise', () => {
    expect(
      describeSkillStep(makeStep({ id: 'a', action: 'type', detail: 'hi' })),
    ).toBe('type · hi')
    expect(
      describeSkillStep(makeStep({ id: 'a', action: 'scroll', detail: '  ' })),
    ).toBe('scroll')
  })
})

// ─── estimateExecutionTime ────────────────────────────────────
describe('estimateExecutionTime', () => {
  test('sums base pacing for action steps plus wait dwell', () => {
    const steps = [
      makeStep({ id: 'a', type: 'click' }),
      makeStep({ id: 'b', type: 'type' }),
      makeStep({ id: 'c', type: 'wait', action: 'wait', waitMs: 1000 }),
    ]
    // 600 + 600 + 1000
    expect(estimateExecutionTime(steps)).toBe(2200)
  })

  test('is 0 for no steps', () => {
    expect(estimateExecutionTime([])).toBe(0)
  })
})

// ─── computeSuccessRate ───────────────────────────────────────
describe('computeSuccessRate', () => {
  test('is 0 with no executions', () => {
    expect(computeSuccessRate([])).toBe(0)
  })

  test('returns the success fraction', () => {
    const base = {
      id: 'x',
      startedAt: 0,
      finishedAt: 1,
      durationMs: 1,
      params: {},
    }
    expect(
      computeSuccessRate([
        { ...base, success: true },
        { ...base, success: false },
        { ...base, success: true },
        { ...base, success: true },
      ]),
    ).toBe(0.75)
  })
})

// ─── detectSkillVariables ─────────────────────────────────────
describe('detectSkillVariables', () => {
  test('detects an email-shaped typed value with high confidence', () => {
    const vars = detectSkillVariables(
      makeRecording([{ action: 'type', detail: 'a@b.com' }]).events,
    )
    expect(vars).toHaveLength(1)
    expect(vars[0].type).toBe('email')
    expect(vars[0].defaultValue).toBe('a@b.com')
    expect(vars[0].required).toBe(true)
    expect(vars[0].stepIndex).toBe(0)
  })

  test('detects date / url / number shapes', () => {
    const vars = detectSkillVariables(
      makeRecording([
        { action: 'type', detail: '2025-01-02' },
        { action: 'type', detail: 'https://example.com/page' },
        { action: 'type', detail: '42' },
      ]).events,
    )
    const byType = new Set(vars.map(v => v.type))
    expect(byType.has('date')).toBe(true)
    expect(byType.has('url')).toBe(true)
    expect(byType.has('number')).toBe(true)
  })

  test('never parameterizes masked secrets and ignores click steps', () => {
    const vars = detectSkillVariables(
      makeRecording([
        { action: 'type', detail: '****' },
        { action: 'left_click', detail: 'some long button label here' },
      ]).events,
    )
    expect(vars).toHaveLength(0)
  })

  test('assigns unique names to multiple same-hint candidates', () => {
    const vars = detectSkillVariables(
      makeRecording([
        { action: 'type', detail: 'a@b.com' },
        { action: 'type', detail: 'c@d.com' },
      ]).events,
    )
    expect(vars).toHaveLength(2)
    expect(new Set(vars.map(v => v.name)).size).toBe(2)
  })
})

// ─── buildZodType / buildSchemaSource ─────────────────────────
describe('Zod schema generation', () => {
  const variable = (over: Partial<SkillVariable>): SkillVariable => ({
    name: 'input',
    label: '输入值',
    type: 'string',
    defaultValue: '',
    required: true,
    stepIndex: 0,
    ...over,
  })

  test('builds a typed Zod expression per variable type', () => {
    expect(
      buildZodType(variable({ type: 'number', defaultValue: '42' })),
    ).toContain('z.number()')
    expect(
      buildZodType(variable({ type: 'email', defaultValue: 'a@b.com' })),
    ).toContain('.email()')
    expect(
      buildZodType(variable({ type: 'url', defaultValue: 'https://x.io' })),
    ).toContain('.url()')
    expect(
      buildZodType(variable({ type: 'boolean', defaultValue: 'true' })),
    ).toBe('z.boolean().default(true)')
  })

  test('renders an empty object for no variables', () => {
    expect(buildSchemaSource([])).toBe('z.object({})')
  })

  test('emits one keyed line per variable with a describe()', () => {
    const src = buildSchemaSource([
      variable({ name: 'email', type: 'email', defaultValue: 'a@b.com' }),
    ])
    expect(src).toContain('email: z.string().email()')
    expect(src).toContain('.describe("输入值")')
  })
})

// ─── coerceVariableValue ──────────────────────────────────────
describe('coerceVariableValue', () => {
  test('coerces numbers and booleans, passes strings through', () => {
    expect(coerceVariableValue('$1,234.50', 'number')).toBe(1234.5)
    expect(coerceVariableValue('true', 'boolean')).toBe(true)
    expect(coerceVariableValue('false', 'boolean')).toBe(false)
    expect(coerceVariableValue('hello', 'string')).toBe('hello')
  })
})

// ─── validateSkillParams ──────────────────────────────────────
describe('validateSkillParams', () => {
  const required = (over: Partial<SkillVariable>): SkillVariable => ({
    name: 'field',
    label: 'Field',
    type: 'string',
    defaultValue: '',
    required: true,
    stepIndex: 0,
    ...over,
  })

  test('flags missing required fields', () => {
    const result = validateSkillParams([required({ name: 'a' })], { a: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.a).toBeTruthy()
  })

  test('validates email / url / date / number shapes', () => {
    const vars = [
      required({ name: 'email', type: 'email' }),
      required({ name: 'url', type: 'url' }),
      required({ name: 'date', type: 'date' }),
      required({ name: 'num', type: 'number' }),
    ]
    const bad = validateSkillParams(vars, {
      email: 'nope',
      url: 'ftp://x',
      date: '01/02/2025',
      num: 'abc',
    })
    expect(bad.valid).toBe(false)
    expect(Object.keys(bad.errors).sort()).toEqual([
      'date',
      'email',
      'num',
      'url',
    ])

    const good = validateSkillParams(vars, {
      email: 'a@b.com',
      url: 'https://b.com',
      date: '2025-01-02',
      num: '12',
    })
    expect(good.valid).toBe(true)
    expect(good.values.num).toBe('12')
  })

  test('falls back to the default value when a field is blank', () => {
    const result = validateSkillParams(
      [required({ name: 'a', defaultValue: 'fallback' })],
      {},
    )
    expect(result.valid).toBe(true)
    expect(result.values.a).toBe('fallback')
  })
})

// ─── Step operations ──────────────────────────────────────────
describe('step operations', () => {
  const steps = [
    makeStep({ id: 'a' }),
    makeStep({ id: 'b' }),
    makeStep({ id: 'c' }),
  ]

  test('reorderSteps moves an item and leaves the source untouched', () => {
    const next = reorderSteps(steps, 0, 2)
    expect(next.map(s => s.id)).toEqual(['b', 'c', 'a'])
    expect(steps.map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  test('reorderSteps is a no-op for out-of-range / equal indices', () => {
    expect(reorderSteps(steps, 0, 0).map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(reorderSteps(steps, -1, 2).map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(reorderSteps(steps, 0, 9).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  test('removeStep drops the matching id', () => {
    expect(removeStep(steps, 'b').map(s => s.id)).toEqual(['a', 'c'])
  })

  test('updateStep edits a field and re-derives the description', () => {
    const next = updateStep(
      [makeStep({ id: 'a', action: 'type', detail: 'old' })],
      'a',
      {
        detail: 'new',
      },
    )
    expect(next[0].detail).toBe('new')
    expect(next[0].description).toBe('type · new')
  })

  test('insertWaitStep inserts after the index with a clamped dwell', () => {
    let n = 0
    const next = insertWaitStep(steps, 0, 250.6, () => `wait_${n++}`)
    expect(next.map(s => s.id)).toEqual(['a', 'wait_0', 'b', 'c'])
    expect(next[1].type).toBe('wait')
    expect(next[1].waitMs).toBe(251)
  })
})

// ─── buildSkillSteps + toSkillSummary ─────────────────────────
describe('buildSkillSteps + toSkillSummary', () => {
  test('builds one described step per recorded event', () => {
    const steps = buildSkillSteps(
      makeRecording([
        { action: 'type', detail: 'hi' },
        { action: 'left_click' },
      ]).events,
      i => `s${i}`,
    )
    expect(steps).toHaveLength(2)
    expect(steps[0].id).toBe('s0')
    expect(steps[0].description).toBe('type · hi')
    expect(steps[1].type).toBe('click')
  })

  test('derives counts + success rate for the list summary', () => {
    const skill = makeSkill({
      steps: [makeStep({ id: 'a' })],
      variables: [],
      executions: [
        {
          id: 'e',
          startedAt: 0,
          finishedAt: 1,
          durationMs: 1,
          success: true,
          params: {},
        },
      ],
    })
    const summary = toSkillSummary(skill)
    expect(summary.stepCount).toBe(1)
    expect(summary.executionCount).toBe(1)
    expect(summary.successRate).toBe(1)
  })
})

// ─── SKILL.md + workflow.js + bridge ──────────────────────────
function makeSkill(over: Partial<RecordedSkill> = {}): RecordedSkill {
  return {
    id: 'skill_1',
    name: '订单录入',
    description: 'demo',
    icon: '✨',
    tags: ['order'],
    source: 'recorded',
    recordingId: 'rec_1',
    steps: [],
    variables: [],
    executions: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  }
}

describe('generateSkillMd', () => {
  test('renders frontmatter, parameters and steps', () => {
    const md = generateSkillMd(
      makeSkill({
        whenToUse: 'when ordering',
        steps: [
          makeStep({
            id: 'a',
            action: 'type',
            detail: 'x',
            description: 'type · x',
          }),
        ],
        variables: [
          {
            name: 'qty',
            label: '数量',
            type: 'number',
            defaultValue: '1',
            required: true,
            stepIndex: 0,
          },
        ],
      }),
    )
    expect(md).toContain('name: 订单录入')
    expect(md).toContain('when_to_use: when ordering')
    expect(md).toContain('## Parameters')
    expect(md).toContain('`qty` (number)')
    expect(md).toContain('1. type · x')
  })
})

describe('generateWorkflowScript', () => {
  test('binds type steps to args and inlines the rest', () => {
    const script = generateWorkflowScript(
      makeSkill({
        steps: [
          makeStep({
            id: 'a',
            action: 'type',
            type: 'type',
            detail: 'a@b.com',
          }),
          makeStep({ id: 'b', action: 'left_click', type: 'click' }),
          makeStep({ id: 'c', action: 'wait', type: 'wait', waitMs: 500 }),
        ],
        variables: [
          {
            name: 'email',
            label: '邮箱',
            type: 'email',
            defaultValue: 'a@b.com',
            required: true,
            stepIndex: 0,
          },
        ],
      }),
    )
    expect(script).toContain('export const schema = z.object({')
    expect(script).toContain('await agent.type(args.email)')
    expect(script).toContain('await agent.perform("left_click")')
    expect(script).toContain('await agent.wait(500)')
  })
})

describe('sanitizeSkillName', () => {
  test('slugifies and falls back when empty', () => {
    expect(sanitizeSkillName('Order Entry 订单')).toBe('order-entry')
    expect(sanitizeSkillName('订单')).toBe('recorded-skill')
  })
})

describe('buildExecutionRecording', () => {
  test('substitutes variable values and drops wait steps', () => {
    const recording = buildExecutionRecording(
      makeSkill({
        steps: [
          makeStep({
            id: 'a',
            action: 'type',
            type: 'type',
            detail: 'a@b.com',
          }),
          makeStep({ id: 'b', action: 'wait', type: 'wait', waitMs: 500 }),
          makeStep({ id: 'c', action: 'left_click', type: 'click' }),
        ],
        variables: [
          {
            name: 'email',
            label: '邮箱',
            type: 'email',
            defaultValue: 'a@b.com',
            required: true,
            stepIndex: 0,
          },
        ],
      }),
      { email: 'live@x.com' },
      DEFAULT_RECORDING_CONFIG,
      123,
    )
    expect(recording.events).toHaveLength(2)
    expect(recording.events[0].detail).toBe('live@x.com')
    expect(recording.events[1].action).toBe('left_click')
  })
})

describe('coerceRecordedSkill', () => {
  test('rejects non-objects / missing id', () => {
    expect(coerceRecordedSkill(null)).toBeNull()
    expect(coerceRecordedSkill({})).toBeNull()
  })

  test('fills defaults and re-derives missing step descriptions', () => {
    const skill = coerceRecordedSkill({
      id: 'x',
      steps: [{ id: 's0', action: 'type', type: 'type', detail: 'hi' }],
    })
    expect(skill).not.toBeNull()
    expect(skill?.icon).toBe('✨')
    expect(skill?.source).toBe('recorded')
    expect(skill?.steps[0].description).toBe('type · hi')
  })
})

// ─── SkillManager (in-memory) ─────────────────────────────────
describe('SkillManager.createFromRecording', () => {
  test('builds a skill with steps + auto-detected variables', () => {
    let n = 0
    const m = new SkillManager({
      dir: null,
      now: () => 1000,
      generateId: () => `id_${n++}`,
    })
    const skill = m.createFromRecording(
      makeRecording([
        { action: 'type', detail: 'a@b.com' },
        { action: 'left_click' },
      ]),
      { recordingId: 'rec_1', name: '邮件登录' },
    )
    expect(skill.name).toBe('邮件登录')
    expect(skill.steps).toHaveLength(2)
    expect(skill.variables).toHaveLength(1)
    expect(skill.variables[0].type).toBe('email')
    expect(m.list()).toHaveLength(1)
  })

  test('honors caller-confirmed variables over auto-detection', () => {
    const m = new SkillManager({ dir: null })
    const skill = m.createFromRecording(
      makeRecording([{ action: 'type', detail: 'a@b.com' }]),
      {
        recordingId: 'rec_1',
        name: 'x',
        variables: [],
      },
    )
    expect(skill.variables).toHaveLength(0)
  })
})

describe('SkillManager edit + reorder + steps', () => {
  function seed(): { m: SkillManager; id: string } {
    let n = 0
    const m = new SkillManager({
      dir: null,
      now: () => 1,
      generateId: () => `id_${n++}`,
    })
    const skill = m.createFromRecording(
      makeRecording([
        { action: 'left_click' },
        { action: 'type', detail: 'hi' },
      ]),
      { recordingId: 'rec_1', name: 'demo' },
    )
    return { m, id: skill.id }
  }

  test('update edits metadata', () => {
    const { m, id } = seed()
    const updated = m.update(id, {
      name: 'renamed',
      description: 'd',
      tags: ['t'],
    })
    expect(updated?.name).toBe('renamed')
    expect(updated?.tags).toEqual(['t'])
  })

  test('reorderSteps / removeStep / addWaitStep mutate the step list', () => {
    const { m, id } = seed()
    const before = m.get(id)!
    const reordered = m.reorderSteps(id, 0, 1)
    expect(reordered?.steps[1].id).toBe(before.steps[0].id)

    const withWait = m.addWaitStep(id, 0, 250)
    expect(
      withWait?.steps.some(s => s.type === 'wait' && s.waitMs === 250),
    ).toBe(true)

    const target = before.steps[0].id
    const removed = m.removeStep(id, target)
    expect(removed?.steps.some(s => s.id === target)).toBe(false)
  })

  test('updateStep edits a single step detail', () => {
    const { m, id } = seed()
    const typeStep = m.get(id)!.steps.find(s => s.type === 'type')!
    const updated = m.updateStep(id, typeStep.id, { detail: 'changed' })
    const next = updated?.steps.find(s => s.id === typeStep.id)
    expect(next?.detail).toBe('changed')
    expect(next?.description).toBe('type · changed')
  })

  test('returns null for an unknown skill id', () => {
    const { m } = seed()
    expect(m.update('nope', { name: 'x' })).toBeNull()
    expect(m.reorderSteps('nope', 0, 1)).toBeNull()
    expect(m.removeStep('nope', 'x')).toBeNull()
  })
})

describe('SkillManager duplicate / delete / executions / export', () => {
  function seed(): { m: SkillManager; id: string } {
    let n = 0
    const m = new SkillManager({
      dir: null,
      now: () => 1,
      generateId: () => `id_${n++}`,
    })
    const skill = m.createFromRecording(
      makeRecording([{ action: 'left_click' }]),
      {
        recordingId: 'rec_1',
        name: 'demo',
      },
    )
    return { m, id: skill.id }
  }

  test('duplicate clears history and renames the copy', () => {
    const { m, id } = seed()
    const copy = m.duplicate(id)
    expect(copy?.id).not.toBe(id)
    expect(copy?.name).toContain('副本')
    expect(copy?.executions).toHaveLength(0)
    expect(m.list()).toHaveLength(2)
  })

  test('delete removes the skill', () => {
    const { m, id } = seed()
    expect(m.delete(id)).toBe(true)
    expect(m.get(id)).toBeNull()
    expect(m.delete(id)).toBe(false)
  })

  test('recordExecution appends history, bumps lastUsedAt and success rate', () => {
    const { m, id } = seed()
    m.recordExecution(id, {
      startedAt: 0,
      finishedAt: 10,
      durationMs: 10,
      success: true,
      params: {},
    })
    m.recordExecution(id, {
      startedAt: 0,
      finishedAt: 20,
      durationMs: 20,
      success: false,
      params: {},
    })
    const skill = m.get(id)!
    expect(skill.executions).toHaveLength(2)
    expect(skill.lastUsedAt).toBe(20)
    expect(m.successRate(id)).toBe(0.5)
  })

  test('buildExecution produces a replay recording with substituted params', () => {
    let n = 0
    const m = new SkillManager({
      dir: null,
      now: () => 5,
      generateId: () => `id_${n++}`,
    })
    const skill = m.createFromRecording(
      makeRecording([{ action: 'type', detail: 'a@b.com' }]),
      {
        recordingId: 'rec_1',
        name: 'demo',
      },
    )
    const recording = m.buildExecution(skill.id, {
      [skill.variables[0].name]: 'live@x.com',
    })
    expect(recording?.events[0].detail).toBe('live@x.com')
    expect(m.buildExecution('nope', {})).toBeNull()
  })

  test('exportSkill yields a downloadable bundle', () => {
    const { m, id } = seed()
    const exported = m.exportSkill(id)
    expect(exported?.fileName).toContain('.skill.json')
    const bundle = JSON.parse(exported!.content)
    expect(bundle.skill.id).toBe(id)
    expect(typeof bundle['SKILL.md']).toBe('string')
    expect(typeof bundle['workflow.js']).toBe('string')
  })
})

describe('SkillManager.analyzeRecording', () => {
  test('returns steps + detected variables without persisting', () => {
    const m = new SkillManager({ dir: null })
    const analysis = m.analyzeRecording(
      makeRecording([
        { action: 'type', detail: 'a@b.com' },
        { action: 'left_click' },
      ]),
    )
    expect(analysis.recordingId).toBe('rec_1')
    expect(analysis.steps).toHaveLength(2)
    expect(analysis.variables).toHaveLength(1)
    expect(m.list()).toHaveLength(0)
  })
})

describe('SkillManager.list ordering', () => {
  test('sorts most-recently used / updated first', () => {
    let t = 100
    let n = 0
    const m = new SkillManager({
      dir: null,
      now: () => t,
      generateId: () => `id_${n++}`,
    })
    const a = m.createFromRecording(
      makeRecording([{ action: 'left_click' }], 'r1'),
      {
        recordingId: 'r1',
        name: 'A',
      },
    )
    t = 200
    const b = m.createFromRecording(
      makeRecording([{ action: 'left_click' }], 'r2'),
      {
        recordingId: 'r2',
        name: 'B',
      },
    )
    t = 300
    m.recordExecution(a.id, {
      startedAt: 0,
      finishedAt: 300,
      durationMs: 1,
      success: true,
      params: {},
    })
    const ids = m.list().map(s => s.id)
    expect(ids[0]).toBe(a.id)
    expect(ids[1]).toBe(b.id)
  })
})
