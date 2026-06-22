/**
 * Integration test: Record → Merge → Build Workflow → Generate Skill → Replay
 *
 * Tests the full pipeline from raw events through to replay execution.
 */
import { describe, expect, test } from 'bun:test'
import { mergeEvents } from '../eventMerger.js'
import { buildWorkflowScript } from '../workflowBuilder.js'
import { generateSkill } from '../skillGenerator.js'
import { ReplayEngine } from '../replayEngine.js'
import type { ActionExecutor, ExecutionResult } from '../replayEngine.js'
import type { RawActionEvent, RecordingSession } from '../types.js'

/** Simulates a realistic user session: open site, search, click result, copy text */
function createRealisticSession(): RecordingSession {
  const baseTime = 1719066000000
  const events: RawActionEvent[] = [
    // Click on address bar
    {
      action: 'left_click',
      coordinate: [500, 35],
      timestamp: baseTime + 1000,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
      element_context: {
        accessible_name: 'Address bar',
        role: 'Edit',
        selector: '#omnibox',
      },
    },
    // Type URL (individual keys that should be merged)
    {
      action: 'type',
      text: 'e',
      timestamp: baseTime + 2000,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'x',
      timestamp: baseTime + 2050,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'a',
      timestamp: baseTime + 2100,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'm',
      timestamp: baseTime + 2150,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'p',
      timestamp: baseTime + 2200,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'l',
      timestamp: baseTime + 2250,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'e',
      timestamp: baseTime + 2300,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: '.',
      timestamp: baseTime + 2350,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'c',
      timestamp: baseTime + 2400,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'o',
      timestamp: baseTime + 2450,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    {
      action: 'type',
      text: 'm',
      timestamp: baseTime + 2500,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    // Press Enter to navigate
    {
      action: 'key',
      text: 'Return',
      timestamp: baseTime + 3000,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'New Tab',
        url: 'chrome://newtab',
      },
    },
    // Page loads, click on a link
    {
      action: 'left_click',
      coordinate: [300, 450],
      timestamp: baseTime + 5000,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'Example Domain',
        url: 'https://example.com',
      },
      element_context: {
        accessible_name: 'More information...',
        role: 'Link',
        selector: 'a[href]',
      },
    },
    // Scroll down
    {
      action: 'scroll',
      coordinate: [500, 400],
      scroll_direction: 'down',
      scroll_amount: 1,
      timestamp: baseTime + 6000,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'IANA',
        url: 'https://www.iana.org/help/example-domains',
      },
    },
    {
      action: 'scroll',
      coordinate: [500, 400],
      scroll_direction: 'down',
      scroll_amount: 1,
      timestamp: baseTime + 6050,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'IANA',
        url: 'https://www.iana.org/help/example-domains',
      },
    },
    {
      action: 'scroll',
      coordinate: [500, 400],
      scroll_direction: 'down',
      scroll_amount: 1,
      timestamp: baseTime + 6100,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'IANA',
        url: 'https://www.iana.org/help/example-domains',
      },
    },
    // Select text with keyboard shortcut
    {
      action: 'key',
      text: 'ctrl+a',
      timestamp: baseTime + 7000,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'IANA',
        url: 'https://www.iana.org/help/example-domains',
      },
    },
    // Copy
    {
      action: 'key',
      text: 'ctrl+c',
      timestamp: baseTime + 7500,
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'IANA',
        url: 'https://www.iana.org/help/example-domains',
      },
    },
  ]

  return {
    id: 'integration-test-session',
    startTime: baseTime,
    endTime: baseTime + 8000,
    status: 'stopped',
    events,
    metadata: {
      platform: 'darwin',
      screen_width: 2560,
      screen_height: 1440,
      task_description: 'Navigate to example.com and copy page content',
      scale_factor: 2,
    },
  }
}

class TrackingExecutor implements ActionExecutor {
  executedActions: Array<{
    action: string
    text?: string
    coordinate?: [number, number]
  }> = []

  async execute(action: {
    action: string
    coordinate?: [number, number]
    text?: string
  }): Promise<ExecutionResult> {
    this.executedActions.push(action)
    return { success: true }
  }

  async screenshot(): Promise<string> {
    return 'mock-base64'
  }
}

describe('Integration: Full Record→Merge→Build→Generate→Replay Pipeline', () => {
  const session = createRealisticSession()

  test('Step 1: Event merging reduces event count', () => {
    const merged = mergeEvents(session.events, {
      typeGapMs: 300,
      scrollGapMs: 200,
    })

    // 11 type events should merge into 1
    // 3 scroll events should merge into 1
    // Remaining: 1 click + 1 merged_type + 1 key(Return) + 1 click + 1 merged_scroll + 2 key
    expect(merged.length).toBeLessThan(session.events.length)

    // Verify type merge happened
    const typeEvents = merged.filter(e => e.action === 'type')
    expect(typeEvents).toHaveLength(1)
    expect(typeEvents[0]!.text).toBe('example.com')

    // Verify scroll merge happened
    const scrollEvents = merged.filter(e => e.action === 'scroll')
    expect(scrollEvents).toHaveLength(1)
    expect(scrollEvents[0]!.scroll_amount).toBe(3)
  })

  test('Step 2: Workflow script is parseable format', () => {
    const merged = mergeEvents(session.events, {
      typeGapMs: 300,
      scrollGapMs: 200,
    })
    const script = buildWorkflowScript(merged, {
      name: 'browse-example',
      description: 'Navigate to example.com and copy content',
      whenToUse: 'When copying content from example.com',
    })

    // Must contain meta export
    expect(script).toContain('export const meta =')
    expect(script).toContain('"name": "browse-example"')

    // Must contain agent calls
    expect(script).toContain('await agent(')

    // Must not contain forbidden constructs
    expect(script).not.toMatch(/^\s*import\b/m)
    // Only export const meta is allowed
    const bodyAfterMeta = script.slice(script.indexOf('phase('))
    expect(bodyAfterMeta).not.toMatch(/^\s*export\b/m)
  })

  test('Step 3: Skill generation produces complete skill package', () => {
    const skill = generateSkill(session, {
      name: 'browse-and-copy',
      description: 'Navigate to example.com and copy page content',
      whenToUse: 'When user needs content from example.com',
      tags: ['browser', 'copy', 'example'],
      mergeOptions: { typeGapMs: 300, scrollGapMs: 200 },
    })

    // Check directory path
    expect(skill.dirPath).toBe('.claude/skills/browse-and-copy')

    // Check SKILL.md
    expect(skill.files['SKILL.md']).toContain('name: browse-and-copy')
    expect(skill.files['SKILL.md']).toContain('source: recorded')
    expect(skill.files['SKILL.md']).toContain('## Steps')

    // Check workflow.js
    expect(skill.files['workflow.js']).toContain('export const meta =')
    expect(skill.files['workflow.js']).toContain('await agent(')

    // Check recording.json
    const recording = JSON.parse(skill.files['recording.json']!)
    expect(recording.sessionId).toBe('integration-test-session')
    expect(recording.metadata.platform).toBe('darwin')
    expect(recording.events.length).toBeGreaterThan(0)

    // Verify merged events are stored
    expect(skill.mergedEvents.length).toBeLessThan(session.events.length)
  })

  test('Step 4: Replay engine can execute merged events', async () => {
    const merged = mergeEvents(session.events, {
      typeGapMs: 300,
      scrollGapMs: 200,
    })
    const executor = new TrackingExecutor()
    const engine = new ReplayEngine(executor, {
      delayBetweenActions: 0,
      speedMultiplier: 10000,
    })

    const result = await engine.replayEvents(merged)

    expect(result.status).toBe('completed')
    expect(result.stepsCompleted).toBe(merged.length)
    expect(result.errors).toHaveLength(0)

    // Verify action sequence is correct
    expect(executor.executedActions[0]!.action).toBe('left_click')
    expect(executor.executedActions[0]!.coordinate).toEqual([500, 35])

    // Find the type action
    const typeAction = executor.executedActions.find(a => a.action === 'type')
    expect(typeAction).toBeDefined()
    expect(typeAction!.text).toBe('example.com')

    // Verify all actions were dispatched
    expect(executor.executedActions.length).toBe(merged.length)
  })

  test('Step 5: Full end-to-end pipeline maintains data integrity', () => {
    // Generate skill
    const skill = generateSkill(session, {
      name: 'e2e-test',
      description: 'End to end test',
      mergeOptions: { typeGapMs: 300, scrollGapMs: 200 },
    })

    // Parse the recording.json back
    const recording = JSON.parse(skill.files['recording.json']!)

    // Verify events can be replayed from the stored recording
    const storedEvents = recording.events as RawActionEvent[]
    expect(storedEvents.length).toBe(skill.mergedEvents.length)

    // Each stored event should have the correct structure
    for (const event of storedEvents) {
      expect(event.action).toBeDefined()
      expect(event.timestamp).toBeGreaterThan(0)
      expect(event.window_context).toBeDefined()
      expect(event.screenshot_before).toBeNull()
      expect(event.screenshot_after).toBeNull()
    }
  })
})
