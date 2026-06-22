import { describe, expect, test, beforeEach } from 'bun:test'
import {
  AdaptiveReplayEngine,
  classifyFailure,
  createInMemoryJournal,
} from '../replayRecovery.js'
import type {
  FailureType,
  RecoveryOptions,
  StateAnalyzer,
  ReplayReport,
} from '../replayRecovery.js'
import type {
  ActionExecutor,
  DispatchableAction,
  ExecutionResult,
} from '../replayEngine.js'
import type { RawActionEvent } from '../types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  action: string,
  overrides: Partial<RawActionEvent> = {},
): RawActionEvent {
  return {
    action: action as any,
    timestamp: Date.now(),
    screenshot_before: null,
    screenshot_after: null,
    window_context: { app_name: 'Chrome', window_title: 'Test Page' },
    ...overrides,
  }
}

function createMockExecutor(
  behavior: (action: DispatchableAction) => ExecutionResult,
): ActionExecutor {
  return {
    execute: async action => behavior(action),
    screenshot: async () => 'mock-screenshot-base64',
  }
}

function alwaysSuccessExecutor(): ActionExecutor {
  return createMockExecutor(() => ({ success: true }))
}

function failThenSucceedExecutor(failCount: number): ActionExecutor {
  let attempts = 0
  return createMockExecutor(() => {
    attempts++
    if (attempts <= failCount) {
      return { success: false, error: 'Element not found' }
    }
    return { success: true }
  })
}

function alwaysFailExecutor(error = 'Element not found'): ActionExecutor {
  return createMockExecutor(() => ({ success: false, error }))
}

// ─── classifyFailure Tests ────────────────────────────────────────────────────

describe('classifyFailure', () => {
  const event = makeEvent('left_click')

  test('classifies element_not_found', () => {
    expect(classifyFailure('Element not found at coordinates', event)).toBe(
      'element_not_found',
    )
    expect(classifyFailure('No element at position', event)).toBe(
      'element_not_found',
    )
    expect(classifyFailure('Could not locate target', event)).toBe(
      'element_not_found',
    )
    expect(classifyFailure('target not found in DOM', event)).toBe(
      'element_not_found',
    )
  })

  test('classifies timeout', () => {
    expect(classifyFailure('Operation timed out', event)).toBe('timeout')
    expect(classifyFailure('Timeout waiting for element', event)).toBe(
      'timeout',
    )
    expect(classifyFailure('Deadline exceeded', event)).toBe('timeout')
  })

  test('classifies unexpected_dialog', () => {
    expect(classifyFailure('Unexpected dialog appeared', event)).toBe(
      'unexpected_dialog',
    )
    expect(classifyFailure('Modal popup blocking action', event)).toBe(
      'unexpected_dialog',
    )
    expect(classifyFailure('Alert box detected', event)).toBe(
      'unexpected_dialog',
    )
    expect(classifyFailure('Confirm dialog shown', event)).toBe(
      'unexpected_dialog',
    )
  })

  test('classifies wrong_state', () => {
    expect(classifyFailure('Wrong state for action', event)).toBe('wrong_state')
    expect(classifyFailure('Element is disabled', event)).toBe('wrong_state')
    expect(classifyFailure('Element not visible', event)).toBe('wrong_state')
    expect(classifyFailure('Page not ready', event)).toBe('wrong_state')
  })

  test('defaults to execution_error', () => {
    expect(classifyFailure('Unknown error occurred', event)).toBe(
      'execution_error',
    )
    expect(classifyFailure('Something went wrong', event)).toBe(
      'execution_error',
    )
  })
})

// ─── createInMemoryJournal Tests ──────────────────────────────────────────────

describe('createInMemoryJournal', () => {
  test('starts empty', () => {
    const journal = createInMemoryJournal()
    expect(journal.entries.length).toBe(0)
    expect(journal.lastSuccessIndex()).toBe(-1)
  })

  test('append adds entries', () => {
    const journal = createInMemoryJournal()
    journal.append({
      stepIndex: 0,
      action: { action: 'left_click' },
      result: 'success',
      timestamp: Date.now(),
      durationMs: 50,
    })
    expect(journal.entries.length).toBe(1)
  })

  test('lastSuccessIndex returns last successful step', () => {
    const journal = createInMemoryJournal()
    journal.append({
      stepIndex: 0,
      action: { action: 'left_click' },
      result: 'success',
      timestamp: Date.now(),
      durationMs: 10,
    })
    journal.append({
      stepIndex: 1,
      action: { action: 'type' },
      result: 'success',
      timestamp: Date.now(),
      durationMs: 10,
    })
    journal.append({
      stepIndex: 2,
      action: { action: 'left_click' },
      result: 'failed',
      timestamp: Date.now(),
      durationMs: 10,
    })
    expect(journal.lastSuccessIndex()).toBe(1)
  })

  test('lastSuccessIndex counts recovered as success', () => {
    const journal = createInMemoryJournal()
    journal.append({
      stepIndex: 0,
      action: { action: 'left_click' },
      result: 'recovered',
      timestamp: Date.now(),
      durationMs: 10,
    })
    journal.append({
      stepIndex: 1,
      action: { action: 'type' },
      result: 'failed',
      timestamp: Date.now(),
      durationMs: 10,
    })
    expect(journal.lastSuccessIndex()).toBe(0)
  })

  test('clear removes all entries', () => {
    const journal = createInMemoryJournal()
    journal.append({
      stepIndex: 0,
      action: { action: 'left_click' },
      result: 'success',
      timestamp: Date.now(),
      durationMs: 10,
    })
    journal.clear()
    expect(journal.entries.length).toBe(0)
  })
})

// ─── AdaptiveReplayEngine Tests ───────────────────────────────────────────────

describe('AdaptiveReplayEngine', () => {
  describe('successful replay', () => {
    test('replays all events successfully', async () => {
      const engine = new AdaptiveReplayEngine(alwaysSuccessExecutor())
      const events = [
        makeEvent('left_click', { coordinate: [100, 200] }),
        makeEvent('type', { text: 'hello' }),
        makeEvent('left_click', { coordinate: [300, 400] }),
      ]

      const report = await engine.replayWithRecovery(events)
      expect(report.status).toBe('completed')
      expect(report.successCount).toBe(3)
      expect(report.failedCount).toBe(0)
      expect(report.qualityScore).toBe(100)
    })

    test('records journal entries', async () => {
      const engine = new AdaptiveReplayEngine(alwaysSuccessExecutor())
      const events = [
        makeEvent('left_click'),
        makeEvent('type', { text: 'test' }),
      ]

      await engine.replayWithRecovery(events)
      expect(engine.journal.entries.length).toBe(2)
      expect(engine.journal.entries[0]!.result).toBe('success')
    })
  })

  describe('recovery from failures', () => {
    test('recovers from element_not_found with retry', async () => {
      const executor = failThenSucceedExecutor(2) // Fails twice then succeeds
      const engine = new AdaptiveReplayEngine(executor, {
        maxRetriesPerStep: 3,
      })
      const events = [makeEvent('left_click', { coordinate: [100, 200] })]

      const report = await engine.replayWithRecovery(events)
      // Should eventually succeed through recovery
      expect(
        report.successCount + report.recoveredCount + report.skippedCount,
      ).toBe(1)
    })

    test('skips on unrecoverable when configured', async () => {
      const engine = new AdaptiveReplayEngine(
        alwaysFailExecutor('Totally broken error'),
        { maxRetriesPerStep: 1, onUnrecoverable: 'skip' },
      )
      const events = [makeEvent('left_click')]

      const report = await engine.replayWithRecovery(events)
      expect(report.skippedCount).toBe(1)
      expect(report.status).toBe('partial')
    })

    test('aborts on unrecoverable when configured', async () => {
      const engine = new AdaptiveReplayEngine(
        alwaysFailExecutor('Element not found'),
        { maxRetriesPerStep: 1, onUnrecoverable: 'abort' },
      )
      const events = [
        makeEvent('left_click'),
        makeEvent('type', { text: 'should not run' }),
      ]

      const report = await engine.replayWithRecovery(events)
      expect(report.status).toBe('failed')
      expect(report.steps.length).toBe(1)
    })

    test('handles timeout recovery with extended wait', async () => {
      let attempts = 0
      const executor: ActionExecutor = {
        execute: async () => {
          attempts++
          if (attempts <= 2)
            return { success: false, error: 'Operation timed out' }
          return { success: true }
        },
        screenshot: async () => 'mock',
      }

      const engine = new AdaptiveReplayEngine(executor, {
        maxRetriesPerStep: 3,
        baseTimeout: 10, // Very short for tests
      })
      const events = [makeEvent('left_click')]

      const report = await engine.replayWithRecovery(events)
      expect(
        report.recoveredCount + report.successCount,
      ).toBeGreaterThanOrEqual(1)
    })

    test('handles dialog recovery by pressing Escape/Enter', async () => {
      let attempts = 0
      const executor: ActionExecutor = {
        execute: async action => {
          attempts++
          // First attempt fails with dialog error, subsequent (Escape/Enter + retry) succeed
          if (attempts === 1)
            return { success: false, error: 'Unexpected dialog appeared' }
          return { success: true }
        },
        screenshot: async () => 'mock',
      }

      const engine = new AdaptiveReplayEngine(executor, {
        maxRetriesPerStep: 3,
      })
      const events = [makeEvent('left_click')]

      const report = await engine.replayWithRecovery(events)
      expect(report.recoveredCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('resumeFromCheckpoint', () => {
    test('resumes from last successful step', async () => {
      let callCount = 0
      const executor: ActionExecutor = {
        execute: async () => {
          callCount++
          return { success: true }
        },
        screenshot: async () => 'mock',
      }

      const engine = new AdaptiveReplayEngine(executor)
      const events = [
        makeEvent('left_click'),
        makeEvent('type', { text: 'a' }),
        makeEvent('left_click'),
      ]

      // Simulate partial execution via journal
      engine.journal.append({
        stepIndex: 0,
        action: { action: 'left_click' },
        result: 'success',
        timestamp: Date.now(),
        durationMs: 10,
      })
      engine.journal.append({
        stepIndex: 1,
        action: { action: 'type' },
        result: 'success',
        timestamp: Date.now(),
        durationMs: 10,
      })

      callCount = 0
      const report = await engine.resumeFromCheckpoint(events)
      // Should only execute step 2 (index 2)
      expect(callCount).toBe(1)
      expect(report.successCount).toBe(1)
    })
  })

  describe('replay report', () => {
    test('generates complete report', async () => {
      const engine = new AdaptiveReplayEngine(alwaysSuccessExecutor())
      const events = [
        makeEvent('left_click'),
        makeEvent('type', { text: 'test' }),
        makeEvent('scroll', { scroll_direction: 'down' }),
      ]

      const report = await engine.replayWithRecovery(events, {
        sessionId: 'test-session',
      })
      expect(report.sessionId).toBe('test-session')
      expect(report.totalSteps).toBe(3)
      expect(report.successCount).toBe(3)
      expect(report.totalDurationMs).toBeGreaterThan(0)
      expect(report.avgStepDurationMs).toBeGreaterThanOrEqual(0)
      expect(report.qualityScore).toBe(100)
      expect(report.completedAt).toBeDefined()
      expect(report.steps.length).toBe(3)
    })

    test('quality score reflects failures', async () => {
      let callIndex = 0
      const executor: ActionExecutor = {
        execute: async () => {
          callIndex++
          if (callIndex <= 1) return { success: true }
          return { success: false, error: 'Totally broken error' }
        },
        screenshot: async () => 'mock',
      }

      const engine = new AdaptiveReplayEngine(executor, {
        maxRetriesPerStep: 0,
        onUnrecoverable: 'skip',
      })
      const events = [makeEvent('left_click'), makeEvent('type', { text: 'x' })]

      const report = await engine.replayWithRecovery(events)
      expect(report.qualityScore).toBeLessThan(100)
    })

    test('step reports include correct details', async () => {
      const engine = new AdaptiveReplayEngine(alwaysSuccessExecutor())
      const events = [makeEvent('left_click', { coordinate: [50, 60] })]

      const report = await engine.replayWithRecovery(events)
      expect(report.steps[0]!.action).toBe('left_click')
      expect(report.steps[0]!.status).toBe('success')
      expect(report.steps[0]!.retries).toBe(0)
      expect(report.steps[0]!.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('abort signal', () => {
    test('respects abort signal', async () => {
      const controller = new AbortController()
      controller.abort()

      const engine = new AdaptiveReplayEngine(alwaysSuccessExecutor())
      const events = [makeEvent('left_click'), makeEvent('type', { text: 'a' })]

      const report = await engine.replayWithRecovery(events, {
        signal: controller.signal,
      })
      expect(report.status).toBe('aborted')
      expect(report.steps.length).toBe(0)
    })
  })

  describe('AI state analyzer integration', () => {
    test('uses state analyzer for wrong_state recovery', async () => {
      let callCount = 0
      const executor: ActionExecutor = {
        execute: async () => {
          callCount++
          if (callCount === 1)
            return { success: false, error: 'Element is disabled' }
          return { success: true }
        },
        screenshot: async () => 'mock-screenshot',
      }

      const mockAnalyzer: StateAnalyzer = {
        analyzeState: async () => ({
          currentState: 'Button is disabled, need to enable',
          suggestedActions: [
            { action: 'left_click', coordinate: [10, 10] as [number, number] },
          ],
          confidence: 0.9,
        }),
        detectDialog: async () => ({ hasDialog: false }),
      }

      const engine = new AdaptiveReplayEngine(executor, {
        maxRetriesPerStep: 3,
        stateAnalyzer: mockAnalyzer,
      })
      const events = [makeEvent('left_click', { coordinate: [100, 200] })]

      const report = await engine.replayWithRecovery(events)
      expect(report.recoveredCount).toBeGreaterThanOrEqual(1)
    })

    test('uses state analyzer for dialog detection', async () => {
      let callCount = 0
      const executor: ActionExecutor = {
        execute: async () => {
          callCount++
          if (callCount === 1)
            return { success: false, error: 'Unexpected dialog appeared' }
          return { success: true }
        },
        screenshot: async () => 'mock-screenshot',
      }

      const mockAnalyzer: StateAnalyzer = {
        analyzeState: async () => ({
          currentState: '',
          suggestedActions: [],
          confidence: 0,
        }),
        detectDialog: async () => ({
          hasDialog: true,
          dialogType: 'alert' as const,
          dismissAction: { action: 'key', text: 'Return' },
        }),
      }

      const engine = new AdaptiveReplayEngine(executor, {
        maxRetriesPerStep: 3,
        stateAnalyzer: mockAnalyzer,
      })
      const events = [makeEvent('left_click')]

      const report = await engine.replayWithRecovery(events)
      expect(report.recoveredCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('progress callback', () => {
    test('calls onProgress for each step', async () => {
      const progressCalls: any[] = []
      const engine = new AdaptiveReplayEngine(alwaysSuccessExecutor())
      const events = [
        makeEvent('left_click'),
        makeEvent('type', { text: 'hi' }),
      ]

      await engine.replayWithRecovery(events, {
        onProgress: p => progressCalls.push(p),
      })

      // Should have at least 2 executing + 2 completed
      expect(progressCalls.length).toBeGreaterThanOrEqual(4)
      expect(progressCalls.some(p => p.status === 'executing')).toBe(true)
      expect(progressCalls.some(p => p.status === 'completed')).toBe(true)
    })
  })
})
