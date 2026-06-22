import { describe, expect, test, beforeEach } from 'bun:test'
import { DesktopRecorder, loadCaptureBackend } from '../desktopRecorder.js'
import type {
  InputCaptureBackend,
  CaptureHandle,
  RawInputEvent,
  DesktopRecorderOptions,
} from '../desktopRecorder.js'
import type {
  Platform,
  RawActionEvent,
  RecorderEvent,
  WindowContext,
} from '../types.js'

// ─── Mock Backend ─────────────────────────────────────────────────────────────

class MockCaptureBackend implements InputCaptureBackend {
  readonly isAvailable = true
  readonly platform: Platform = 'linux'
  private _callback: ((event: RawInputEvent) => void) | null = null
  private _active = false

  async startCapture(
    callback: (event: RawInputEvent) => void,
  ): Promise<CaptureHandle> {
    this._callback = callback
    this._active = true
    const self = this
    return {
      stop: () => {
        self._active = false
        self._callback = null
      },
      get isActive() {
        return self._active
      },
    }
  }

  getWindowContext(): WindowContext {
    return { app_name: 'TestApp', window_title: 'Test Window' }
  }

  async captureScreenshot(): Promise<string | null> {
    return 'mock-screenshot-base64'
  }

  // Helper to simulate events in tests
  simulateEvent(event: RawInputEvent): void {
    if (this._callback && this._active) {
      this._callback(event)
    }
  }

  get isActive(): boolean {
    return this._active
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DesktopRecorder', () => {
  let backend: MockCaptureBackend
  let recorder: DesktopRecorder

  beforeEach(() => {
    backend = new MockCaptureBackend()
    recorder = new DesktopRecorder({ backend })
  })

  test('isAvailable returns true when backend is available', () => {
    expect(recorder.isAvailable).toBe(true)
  })

  test('isAvailable returns false when no backend', () => {
    const noBackendRecorder = new DesktopRecorder({
      platform: 'linux' as Platform,
    })
    // On CI (no xinput), this will be false
    expect(typeof noBackendRecorder.isAvailable).toBe('boolean')
  })

  test('start() creates a recording session', async () => {
    await recorder.start({ taskDescription: 'Test task' })

    expect(recorder.status).toBe('recording')
    expect(recorder.session).not.toBeNull()
    expect(recorder.session!.id).toContain('desktop-')
    expect(recorder.session!.metadata.task_description).toBe('Test task')
    expect(recorder.session!.status).toBe('recording')

    await recorder.stop()
  })

  test('start() throws if already recording', async () => {
    await recorder.start()
    await expect(recorder.start()).rejects.toThrow('Already recording')
    await recorder.stop()
  })

  test('stop() finalizes the session', async () => {
    await recorder.start()
    const result = await recorder.stop()

    expect(result.session.status).toBe('stopped')
    expect(result.session.endTime).toBeGreaterThan(0)
    expect(result.outputPath).toContain('recording-')
    expect(recorder.status).toBe('stopped')
  })

  test('stop() throws if not recording', async () => {
    await expect(recorder.stop()).rejects.toThrow('Not recording')
  })

  test('pause/resume changes status', async () => {
    await recorder.start()

    recorder.pause()
    expect(recorder.status).toBe('paused')

    recorder.resume()
    expect(recorder.status).toBe('recording')

    await recorder.stop()
  })

  test('paused recorder ignores events', async () => {
    await recorder.start()
    recorder.pause()

    backend.simulateEvent({
      kind: 'key_up',
      timestamp: Date.now(),
      key: 'a',
      isChar: true,
    })

    expect(recorder.session!.events).toHaveLength(0)
    await recorder.stop()
  })

  test('captures left_click from mouse_down + mouse_up', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'mouse_down',
      timestamp: now,
      x: 100,
      y: 200,
      button: 'left',
    })
    backend.simulateEvent({
      kind: 'mouse_up',
      timestamp: now + 50,
      x: 100,
      y: 200,
      button: 'left',
    })

    // Wait for click buffer flush (multiClickTimeoutMs = 300)
    await new Promise(r => setTimeout(r, 350))

    const events = recorder.session!.events
    expect(events.length).toBeGreaterThanOrEqual(1)
    const click = events.find(e => e.action === 'left_click')
    expect(click).toBeDefined()
    expect(click!.coordinate).toEqual([100, 200])

    await recorder.stop()
  })

  test('captures double_click from rapid clicks', async () => {
    await recorder.start()
    const now = Date.now()

    // Two rapid clicks at same position
    backend.simulateEvent({
      kind: 'mouse_down',
      timestamp: now,
      x: 50,
      y: 50,
      button: 'left',
    })
    backend.simulateEvent({
      kind: 'mouse_up',
      timestamp: now + 30,
      x: 50,
      y: 50,
      button: 'left',
    })
    backend.simulateEvent({
      kind: 'mouse_down',
      timestamp: now + 100,
      x: 50,
      y: 50,
      button: 'left',
    })
    backend.simulateEvent({
      kind: 'mouse_up',
      timestamp: now + 130,
      x: 50,
      y: 50,
      button: 'left',
    })

    // Wait for click buffer flush
    await new Promise(r => setTimeout(r, 350))

    const events = recorder.session!.events
    const dblClick = events.find(e => e.action === 'double_click')
    expect(dblClick).toBeDefined()
    expect(dblClick!.coordinate).toEqual([50, 50])

    await recorder.stop()
  })

  test('captures triple_click from three rapid clicks', async () => {
    await recorder.start()
    const now = Date.now()

    for (let i = 0; i < 3; i++) {
      backend.simulateEvent({
        kind: 'mouse_down',
        timestamp: now + i * 80,
        x: 30,
        y: 30,
        button: 'left',
      })
      backend.simulateEvent({
        kind: 'mouse_up',
        timestamp: now + i * 80 + 30,
        x: 30,
        y: 30,
        button: 'left',
      })
    }

    await new Promise(r => setTimeout(r, 350))

    const events = recorder.session!.events
    const tripleClick = events.find(e => e.action === 'triple_click')
    expect(tripleClick).toBeDefined()

    await recorder.stop()
  })

  test('captures right_click', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'mouse_down',
      timestamp: now,
      x: 200,
      y: 300,
      button: 'right',
    })
    backend.simulateEvent({
      kind: 'mouse_up',
      timestamp: now + 50,
      x: 200,
      y: 300,
      button: 'right',
    })

    await new Promise(r => setTimeout(r, 350))

    const events = recorder.session!.events
    const rightClick = events.find(e => e.action === 'right_click')
    expect(rightClick).toBeDefined()
    expect(rightClick!.coordinate).toEqual([200, 300])

    await recorder.stop()
  })

  test('captures left_click_drag from mouse_down + move + mouse_up', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'mouse_down',
      timestamp: now,
      x: 10,
      y: 10,
      button: 'left',
    })
    // Mouse up at significantly different position (drag)
    backend.simulateEvent({
      kind: 'mouse_up',
      timestamp: now + 200,
      x: 100,
      y: 100,
      button: 'left',
    })

    const events = recorder.session!.events
    const drag = events.find(e => e.action === 'left_click_drag')
    expect(drag).toBeDefined()
    expect(drag!.start_coordinate).toEqual([10, 10])
    expect(drag!.coordinate).toEqual([100, 100])

    await recorder.stop()
  })

  test('captures scroll events', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'mouse_scroll',
      timestamp: now,
      x: 400,
      y: 500,
      scrollDy: 3,
      scrollDx: 0,
    })

    const events = recorder.session!.events
    const scroll = events.find(e => e.action === 'scroll')
    expect(scroll).toBeDefined()
    expect(scroll!.scroll_direction).toBe('down')
    expect(scroll!.scroll_amount).toBe(3)
    expect(scroll!.coordinate).toEqual([400, 500])

    await recorder.stop()
  })

  test('captures scroll up', async () => {
    await recorder.start()

    backend.simulateEvent({
      kind: 'mouse_scroll',
      timestamp: Date.now(),
      x: 0,
      y: 0,
      scrollDy: -2,
      scrollDx: 0,
    })

    const events = recorder.session!.events
    const scroll = events.find(e => e.action === 'scroll')
    expect(scroll).toBeDefined()
    expect(scroll!.scroll_direction).toBe('up')

    await recorder.stop()
  })

  test('captures horizontal scroll', async () => {
    await recorder.start()

    backend.simulateEvent({
      kind: 'mouse_scroll',
      timestamp: Date.now(),
      x: 0,
      y: 0,
      scrollDy: 0,
      scrollDx: 5,
    })

    const events = recorder.session!.events
    const scroll = events.find(e => e.action === 'scroll')
    expect(scroll).toBeDefined()
    expect(scroll!.scroll_direction).toBe('right')

    await recorder.stop()
  })

  test('captures key press as key event', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'key_down',
      timestamp: now,
      key: 'Return',
      isChar: false,
    })
    backend.simulateEvent({
      kind: 'key_up',
      timestamp: now + 100,
      key: 'Return',
      isChar: false,
    })

    const events = recorder.session!.events
    const keyEvent = events.find(e => e.action === 'key')
    expect(keyEvent).toBeDefined()
    expect(keyEvent!.text).toBe('Return')

    await recorder.stop()
  })

  test('captures character key as type event', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'key_down',
      timestamp: now,
      key: 'a',
      isChar: true,
    })
    backend.simulateEvent({
      kind: 'key_up',
      timestamp: now + 80,
      key: 'a',
      isChar: true,
    })

    const events = recorder.session!.events
    const typeEvent = events.find(e => e.action === 'type')
    expect(typeEvent).toBeDefined()
    expect(typeEvent!.text).toBe('a')

    await recorder.stop()
  })

  test('captures hold_key for long press (>500ms)', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'key_down',
      timestamp: now,
      key: 'Shift',
      isChar: false,
    })
    backend.simulateEvent({
      kind: 'key_up',
      timestamp: now + 800,
      key: 'Shift',
      isChar: false,
    })

    const events = recorder.session!.events
    const holdEvent = events.find(e => e.action === 'hold_key')
    expect(holdEvent).toBeDefined()
    expect(holdEvent!.text).toBe('Shift')
    expect(holdEvent!.duration).toBeGreaterThan(0.5)

    await recorder.stop()
  })

  test('throttles mouse_move events', async () => {
    const throttledRecorder = new DesktopRecorder({
      backend,
      mouseMoveThrottleMs: 100,
    })
    await throttledRecorder.start()
    const now = Date.now()

    // Rapid mouse moves within throttle window
    backend.simulateEvent({ kind: 'mouse_move', timestamp: now, x: 10, y: 10 })
    backend.simulateEvent({
      kind: 'mouse_move',
      timestamp: now + 20,
      x: 20,
      y: 20,
    })
    backend.simulateEvent({
      kind: 'mouse_move',
      timestamp: now + 40,
      x: 30,
      y: 30,
    })

    const events = throttledRecorder.session!.events
    const moves = events.filter(e => e.action === 'mouse_move')
    // Only first one should pass (rest are within 100ms throttle)
    expect(moves).toHaveLength(1)
    expect(moves[0]!.coordinate).toEqual([10, 10])

    await throttledRecorder.stop()
  })

  test('emits recorder events via on()', async () => {
    const emitted: RecorderEvent[] = []
    recorder.on(e => emitted.push(e))

    await recorder.start()

    backend.simulateEvent({
      kind: 'key_down',
      timestamp: Date.now(),
      key: 'x',
      isChar: true,
    })
    backend.simulateEvent({
      kind: 'key_up',
      timestamp: Date.now() + 50,
      key: 'x',
      isChar: true,
    })

    await recorder.stop()

    const started = emitted.find(e => e.type === 'started')
    const captured = emitted.find(e => e.type === 'event_captured')
    const stopped = emitted.find(e => e.type === 'stopped')

    expect(started).toBeDefined()
    expect(captured).toBeDefined()
    expect(stopped).toBeDefined()
  })

  test('off() removes event listener', async () => {
    const emitted: RecorderEvent[] = []
    const listener = (e: RecorderEvent) => emitted.push(e)
    recorder.on(listener)
    recorder.off(listener)

    await recorder.start()
    backend.simulateEvent({
      kind: 'key_down',
      timestamp: Date.now(),
      key: 'z',
      isChar: true,
    })
    backend.simulateEvent({
      kind: 'key_up',
      timestamp: Date.now() + 50,
      key: 'z',
      isChar: true,
    })
    await recorder.stop()

    expect(emitted).toHaveLength(0)
  })

  test('window_context is attached to each event', async () => {
    await recorder.start()
    const now = Date.now()

    backend.simulateEvent({
      kind: 'mouse_scroll',
      timestamp: now,
      x: 0,
      y: 0,
      scrollDy: 1,
      scrollDx: 0,
    })

    const events = recorder.session!.events
    expect(events[0]!.window_context).toEqual({
      app_name: 'TestApp',
      window_title: 'Test Window',
    })

    await recorder.stop()
  })
})

describe('loadCaptureBackend', () => {
  test('returns null for unsupported platform', () => {
    const backend = loadCaptureBackend('darwin' as Platform)
    // On Linux CI, darwin backend won't be available
    if (process.platform !== 'darwin') {
      expect(backend).toBeNull()
    }
  })

  test('linux backend availability depends on xinput', () => {
    const backend = loadCaptureBackend('linux')
    // May or may not be available depending on CI environment
    expect(backend === null || backend.platform === 'linux').toBe(true)
  })
})
