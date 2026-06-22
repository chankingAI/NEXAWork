import { describe, expect, test } from 'bun:test'
import { buildWorkflowScript } from '../workflowBuilder.js'
import type { RawActionEvent } from '../types.js'

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

describe('buildWorkflowScript', () => {
  test('generates valid meta export', () => {
    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'test-workflow',
      description: 'A test workflow',
    })

    expect(script).toContain('export const meta =')
    expect(script).toContain('"name": "test-workflow"')
    expect(script).toContain('"description": "A test workflow"')
  })

  test('generates agent() calls for each event', () => {
    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'hello', timestamp: 2000 }),
      makeEvent({ action: 'key', text: 'Return', timestamp: 3000 }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'input-flow',
      description: 'Type and submit',
    })

    expect(script).toContain('await agent(')
    // Should have 3 agent calls (one per event)
    const agentCalls = script.match(/await agent\(/g)
    expect(agentCalls).toHaveLength(3)
  })

  test('direct strategy includes coordinates in prompt', () => {
    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [150, 250],
        timestamp: 1000,
      }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'click-test',
      description: 'Click test',
      promptStrategy: 'direct',
    })

    expect(script).toContain('150')
    expect(script).toContain('250')
    expect(script).toContain('left_click')
  })

  test('semantic strategy includes descriptions', () => {
    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [150, 250],
        timestamp: 1000,
        element_context: {
          accessible_name: 'Submit Button',
          selector: '#submit',
        },
      }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'semantic-test',
      description: 'Semantic test',
      promptStrategy: 'semantic',
    })

    expect(script).toContain('Submit Button')
  })

  test('includes phase() calls for multi-domain workflows', () => {
    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
        window_context: {
          app_name: 'Chrome',
          window_title: 'Page 1',
          url: 'https://foo.com',
        },
      }),
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 2000,
        window_context: {
          app_name: 'Chrome',
          window_title: 'Page 2',
          url: 'https://bar.com',
        },
      }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'multi-site',
      description: 'Multi site workflow',
    })

    expect(script).toContain('phase(')
  })

  test('includes whenToUse in meta if provided', () => {
    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'test',
      description: 'Test',
      whenToUse: 'When submitting forms',
    })

    expect(script).toContain('"whenToUse": "When submitting forms"')
  })

  test('includes label in agent call options', () => {
    const events: RawActionEvent[] = [
      makeEvent({ action: 'type', text: 'search query', timestamp: 1000 }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'search',
      description: 'Search',
    })

    expect(script).toContain('label:')
  })

  test('script does not contain import/export default (parseScript compatible)', () => {
    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'hello', timestamp: 2000 }),
    ]
    const script = buildWorkflowScript(events, {
      name: 'test',
      description: 'Test',
    })

    // The body (after meta) should not have import or extra exports
    const bodyStart = script.indexOf('phase(')
    if (bodyStart >= 0) {
      const body = script.slice(bodyStart)
      expect(body).not.toMatch(/^\s*import\b/m)
      expect(body).not.toMatch(/^\s*export\b/m)
    }
  })
})
