import { describe, expect, test } from 'bun:test'
import { generateSkill } from '../skillGenerator.js'
import type { RawActionEvent, RecordingSession } from '../types.js'

function makeEvent(
  overrides: Partial<RawActionEvent> & { action: RawActionEvent['action'] },
): RawActionEvent {
  return {
    timestamp: Date.now(),
    screenshot_before: null,
    screenshot_after: null,
    window_context: {
      app_name: 'Chrome',
      window_title: 'Test',
      url: 'https://example.com',
    },
    ...overrides,
  }
}

function makeSession(events: RawActionEvent[]): RecordingSession {
  return {
    id: 'test-session-123',
    startTime: 1719066000000,
    endTime: 1719066060000,
    status: 'stopped',
    events,
    metadata: {
      platform: 'darwin',
      screen_width: 2560,
      screen_height: 1440,
      task_description: 'Test task',
    },
  }
}

describe('generateSkill', () => {
  test('generates correct directory path', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ])

    const result = generateSkill(session, {
      name: 'Login Flow',
      description: 'Logs into the application',
    })

    expect(result.dirPath).toBe('.claude/skills/login-flow')
  })

  test('generates all required files', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ])

    const result = generateSkill(session, {
      name: 'test-skill',
      description: 'A test skill',
    })

    expect(Object.keys(result.files)).toContain('SKILL.md')
    expect(Object.keys(result.files)).toContain('workflow.js')
    expect(Object.keys(result.files)).toContain('recording.json')
  })

  test('SKILL.md contains valid frontmatter', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ])

    const result = generateSkill(session, {
      name: 'export-data',
      description: 'Exports data from dashboard',
      whenToUse: 'When user needs to export reports',
      tags: ['export', 'dashboard'],
    })

    const md = result.files['SKILL.md']!
    expect(md).toContain('---')
    expect(md).toContain('name: export-data')
    expect(md).toContain('description: Exports data from dashboard')
    expect(md).toContain('when_to_use: When user needs to export reports')
    expect(md).toContain('tags: ["export", "dashboard"]')
    expect(md).toContain('source: recorded')
    expect(md).toContain('platform: darwin')
  })

  test('SKILL.md contains steps summary', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'search term', timestamp: 2000 }),
      makeEvent({ action: 'key', text: 'Return', timestamp: 3000 }),
    ])

    const result = generateSkill(session, {
      name: 'search',
      description: 'Search workflow',
    })

    const md = result.files['SKILL.md']!
    expect(md).toContain('## Steps')
    expect(md).toContain('1.')
    expect(md).toContain('2.')
    expect(md).toContain('3.')
  })

  test('workflow.js contains valid meta and agent calls', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'hello', timestamp: 2000 }),
    ])

    const result = generateSkill(session, {
      name: 'typing-skill',
      description: 'Types hello',
    })

    const wf = result.files['workflow.js']!
    expect(wf).toContain('export const meta =')
    expect(wf).toContain('"name": "typing-skill"')
    expect(wf).toContain('await agent(')
  })

  test('recording.json contains session data without screenshots', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
        screenshot_before: 'big-base64-data',
      }),
    ])

    const result = generateSkill(session, {
      name: 'test',
      description: 'Test',
    })

    const json = JSON.parse(result.files['recording.json']!)
    expect(json.sessionId).toBe('test-session-123')
    expect(json.metadata.platform).toBe('darwin')
    expect(json.events).toHaveLength(1)
    expect(json.events[0].screenshot_before).toBeNull()
    expect(json.events[0].action).toBe('left_click')
  })

  test('custom skillsBaseDir', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ])

    const result = generateSkill(session, {
      name: 'custom-skill',
      description: 'Custom',
      skillsBaseDir: 'custom/skills/path',
    })

    expect(result.dirPath).toBe('custom/skills/path/custom-skill')
  })

  test('sanitizes skill name for directory', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ])

    const result = generateSkill(session, {
      name: 'Export Data (v2) - Final!',
      description: 'Test',
    })

    expect(result.dirPath).toBe('.claude/skills/export-data-v2-final')
  })

  test('merges events before generating', () => {
    const session = makeSession([
      makeEvent({ action: 'type', text: 'h', timestamp: 1000 }),
      makeEvent({ action: 'type', text: 'i', timestamp: 1050 }),
      makeEvent({ action: 'type', text: '!', timestamp: 1100 }),
    ])

    const result = generateSkill(session, {
      name: 'typing',
      description: 'Types hi!',
      mergeOptions: { typeGapMs: 300 },
    })

    // Events should be merged
    expect(result.mergedEvents).toHaveLength(1)
    expect(result.mergedEvents[0]!.text).toBe('hi!')
  })

  test('exposes workflowScript on result', () => {
    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ])

    const result = generateSkill(session, {
      name: 'click',
      description: 'Click test',
    })

    expect(result.workflowScript).toContain('export const meta')
    expect(result.workflowScript).toContain('await agent(')
  })
})
