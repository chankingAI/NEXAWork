import { describe, expect, test } from 'bun:test'
import { ReplayEngine } from '../replayEngine.js'
import type {
  ActionExecutor,
  ExecutionResult,
  ReplayProgress,
} from '../replayEngine.js'
import type { RawActionEvent, RecordingSession } from '../types.js'

function makeEvent(
  overrides: Partial<RawActionEvent> & { action: RawActionEvent['action'] },
): RawActionEvent {
  return {
    timestamp: Date.now(),
    screenshot_before: null,
    screenshot_after: null,
    window_context: { app_name: 'Chrome', window_title: 'Test' },
    ...overrides,
  }
}

function makeSession(events: RawActionEvent[]): RecordingSession {
  return {
    id: 'test-session',
    startTime: 1000,
    endTime: 9000,
    status: 'stopped',
    events,
    metadata: {
      platform: 'darwin',
      screen_width: 1920,
      screen_height: 1080,
    },
  }
}

class MockExecutor implements ActionExecutor {
  calls: Array<{
    action: string
    coordinate?: [number, number]
    text?: string
  }> = []
  failOnStep: number = -1
  screenshots: string[] = []

  async execute(action: {
    action: string
    coordinate?: [number, number]
    text?: string
  }): Promise<ExecutionResult> {
    this.calls.push(action)
    if (this.calls.length - 1 === this.failOnStep) {
      return { success: false, error: 'Simulated failure' }
    }
    return { success: true }
  }

  async screenshot(): Promise<string> {
    return 'mock-screenshot-base64'
  }
}

describe('ReplayEngine', () => {
  test('replays all events in order', async () => {
    const executor = new MockExecutor()
    const engine = new ReplayEngine(executor, {
      delayBetweenActions: 0,
      speedMultiplier: 10000,
    })

    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'hello', timestamp: 2000 }),
      makeEvent({ action: 'key', text: 'Return', timestamp: 3000 }),
    ]

    const result = await engine.replayEvents(events)

    expect(result.status).toBe('completed')
    expect(result.stepsCompleted).toBe(3)
    expect(result.totalSteps).toBe(3)
    expect(result.errors).toHaveLength(0)
    expect(executor.calls).toHaveLength(3)
    expect(executor.calls[0]!.action).toBe('left_click')
    expect(executor.calls[0]!.coordinate).toEqual([100, 200])
    expect(executor.calls[1]!.action).toBe('type')
    expect(executor.calls[1]!.text).toBe('hello')
    expect(executor.calls[2]!.action).toBe('key')
    expect(executor.calls[2]!.text).toBe('Return')
  })

  test('records errors on failure', async () => {
    const executor = new MockExecutor()
    executor.failOnStep = 1
    const engine = new ReplayEngine(executor, {
      delayBetweenActions: 0,
      speedMultiplier: 10000,
    })

    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'fail', timestamp: 2000 }),
      makeEvent({ action: 'key', text: 'Return', timestamp: 3000 }),
    ]

    const result = await engine.replayEvents(events)

    expect(result.status).toBe('failed')
    expect(result.stepsCompleted).toBe(2) // step 0 and 2 succeeded
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.step).toBe(1)
    expect(result.errors[0]!.error).toBe('Simulated failure')
  })

  test('reports progress via callback', async () => {
    const executor = new MockExecutor()
    const engine = new ReplayEngine(executor, {
      delayBetweenActions: 0,
      speedMultiplier: 10000,
    })

    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [50, 50],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'hi', timestamp: 2000 }),
    ]

    const progressUpdates: ReplayProgress[] = []
    await engine.replayEvents(events, p => progressUpdates.push(p))

    // Each event should generate 2 progress reports: executing + completed
    expect(progressUpdates).toHaveLength(4)
    expect(progressUpdates[0]!.status).toBe('executing')
    expect(progressUpdates[0]!.currentStep).toBe(0)
    expect(progressUpdates[1]!.status).toBe('completed')
    expect(progressUpdates[2]!.status).toBe('executing')
    expect(progressUpdates[2]!.currentStep).toBe(1)
    expect(progressUpdates[3]!.status).toBe('completed')
  })

  test('respects abort signal', async () => {
    const executor = new MockExecutor()
    const controller = new AbortController()
    const engine = new ReplayEngine(executor, {
      delayBetweenActions: 0,
      signal: controller.signal,
    })

    // Abort immediately
    controller.abort()

    const events: RawActionEvent[] = [
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
    ]

    const result = await engine.replayEvents(events)
    expect(result.status).toBe('aborted')
    expect(executor.calls).toHaveLength(0)
  })

  test('replay full session', async () => {
    const executor = new MockExecutor()
    const engine = new ReplayEngine(executor, {
      delayBetweenActions: 0,
      speedMultiplier: 10000,
    })

    const session = makeSession([
      makeEvent({
        action: 'left_click',
        coordinate: [100, 200],
        timestamp: 1000,
      }),
      makeEvent({ action: 'type', text: 'test', timestamp: 2000 }),
    ])

    const result = await engine.replay(session)
    expect(result.status).toBe('completed')
    expect(result.stepsCompleted).toBe(2)
  })

  test('toDispatchable converts RawActionEvent correctly', () => {
    const executor = new MockExecutor()
    const engine = new ReplayEngine(executor)

    const event = makeEvent({
      action: 'scroll',
      coordinate: [500, 300],
      scroll_direction: 'down',
      scroll_amount: 5,
      timestamp: 1000,
    })

    const dispatchable = engine.toDispatchable(event)
    expect(dispatchable.action).toBe('scroll')
    expect(dispatchable.coordinate).toEqual([500, 300])
    expect(dispatchable.scroll_direction).toBe('down')
    expect(dispatchable.scroll_amount).toBe(5)
    // Should not include recording-specific fields
    expect('timestamp' in dispatchable).toBe(false)
    expect('screenshot_before' in dispatchable).toBe(false)
    expect('window_context' in dispatchable).toBe(false)
  })

  test('toDispatchable handles drag events', () => {
    const executor = new MockExecutor()
    const engine = new ReplayEngine(executor)

    const event = makeEvent({
      action: 'left_click_drag',
      start_coordinate: [10, 10],
      coordinate: [200, 200],
      timestamp: 1000,
    })

    const dispatchable = engine.toDispatchable(event)
    expect(dispatchable.action).toBe('left_click_drag')
    expect(dispatchable.start_coordinate).toEqual([10, 10])
    expect(dispatchable.coordinate).toEqual([200, 200])
  })

  test('empty events array completes successfully', async () => {
    const executor = new MockExecutor()
    const engine = new ReplayEngine(executor, {
      delayBetweenActions: 0,
      speedMultiplier: 10000,
    })

    const result = await engine.replayEvents([])
    expect(result.status).toBe('completed')
    expect(result.stepsCompleted).toBe(0)
    expect(result.totalSteps).toBe(0)
  })
})
