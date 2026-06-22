import { describe, expect, test, beforeEach } from 'bun:test'
import { ElementCaptureService, loadElementBackend } from '../elementCapture.js'
import type { ElementCaptureBackend, ElementQuery } from '../elementCapture.js'
import type { ElementContext, Platform } from '../types.js'

// ─── Mock Backend ─────────────────────────────────────────────────────────────

class MockElementBackend implements ElementCaptureBackend {
  readonly isAvailable = true
  readonly platform: Platform = 'linux'
  private _response: ElementContext | null = null
  private _delay = 0
  queryCount = 0

  setResponse(response: ElementContext | null): void {
    this._response = response
  }

  setDelay(ms: number): void {
    this._delay = ms
  }

  async queryElementAt(_query: ElementQuery): Promise<ElementContext | null> {
    this.queryCount++
    if (this._delay > 0) {
      await new Promise(r => setTimeout(r, this._delay))
    }
    return this._response
  }
}

class UnavailableBackend implements ElementCaptureBackend {
  readonly isAvailable = false
  readonly platform: Platform = 'linux'

  async queryElementAt(_query: ElementQuery): Promise<ElementContext | null> {
    return null
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ElementCaptureService', () => {
  let backend: MockElementBackend
  let service: ElementCaptureService

  beforeEach(() => {
    backend = new MockElementBackend()
    service = new ElementCaptureService({ backend })
  })

  test('isAvailable returns true when backend is available', () => {
    expect(service.isAvailable).toBe(true)
  })

  test('isAvailable returns false when backend is unavailable', () => {
    const unavailableService = new ElementCaptureService({
      backend: new UnavailableBackend(),
    })
    expect(unavailableService.isAvailable).toBe(false)
  })

  test('isAvailable returns false when disabled', () => {
    const disabledService = new ElementCaptureService({
      backend,
      enabled: false,
    })
    expect(disabledService.isAvailable).toBe(false)
  })

  test('captureAt returns element context for known element', async () => {
    backend.setResponse({
      accessible_name: 'Save',
      role: 'Button',
      bounding_box: [100, 200, 200, 240],
    })

    const result = await service.captureAt({ x: 150, y: 220 })
    expect(result).not.toBeNull()
    expect(result!.accessible_name).toBe('Save')
    expect(result!.role).toBe('Button')
    expect(result!.bounding_box).toEqual([100, 200, 200, 240])
  })

  test('captureAt returns null when element not found', async () => {
    backend.setResponse(null)
    const result = await service.captureAt({ x: 0, y: 0 })
    expect(result).toBeNull()
  })

  test('captureAt returns null when disabled', async () => {
    backend.setResponse({ accessible_name: 'Test', role: 'Button' })
    const disabledService = new ElementCaptureService({
      backend,
      enabled: false,
    })
    const result = await disabledService.captureAt({ x: 100, y: 100 })
    expect(result).toBeNull()
  })

  test('captureAt times out if backend is too slow', async () => {
    const slowService = new ElementCaptureService({ backend, timeoutMs: 50 })
    backend.setResponse({ accessible_name: 'SlowElement', role: 'Edit' })
    backend.setDelay(200) // Much longer than timeout

    const result = await slowService.captureAt({ x: 100, y: 100 })
    expect(result).toBeNull()
  })

  test('captureAt succeeds if backend responds within timeout', async () => {
    const fastService = new ElementCaptureService({ backend, timeoutMs: 500 })
    backend.setResponse({ accessible_name: 'FastElement', role: 'Link' })
    backend.setDelay(10) // Much shorter than timeout

    const result = await fastService.captureAt({ x: 100, y: 100 })
    expect(result).not.toBeNull()
    expect(result!.accessible_name).toBe('FastElement')
  })

  test('pendingQueries tracks in-flight queries', async () => {
    backend.setDelay(100)
    backend.setResponse({ accessible_name: 'Test' })

    expect(service.pendingQueries).toBe(0)

    // Start query but don't await
    const promise = service.captureAt({ x: 50, y: 50 })
    // Give the microtask queue a chance to run
    await new Promise(r => setTimeout(r, 10))
    expect(service.pendingQueries).toBe(1)

    await promise
    expect(service.pendingQueries).toBe(0)
  })

  test('enrichEvent adds element_context to event with coordinates', async () => {
    backend.setResponse({
      accessible_name: 'Submit',
      role: 'Button',
      bounding_box: [300, 400, 400, 440],
    })

    const event = {
      coordinate: [350, 420] as [number, number],
      element_context: undefined as ElementContext | undefined,
    }

    await service.enrichEvent(event)
    expect(event.element_context).toBeDefined()
    expect(event.element_context!.accessible_name).toBe('Submit')
    expect(event.element_context!.role).toBe('Button')
  })

  test('enrichEvent does nothing for events without coordinates', async () => {
    backend.setResponse({ accessible_name: 'Ignored' })

    const event = { element_context: undefined as ElementContext | undefined }
    await service.enrichEvent(event)
    expect(event.element_context).toBeUndefined()
  })

  test('enrichEvent does nothing when element not found', async () => {
    backend.setResponse(null)

    const event = {
      coordinate: [100, 100] as [number, number],
      element_context: undefined as ElementContext | undefined,
    }

    await service.enrichEvent(event)
    expect(event.element_context).toBeUndefined()
  })

  test('setEnabled toggles element capture at runtime', async () => {
    backend.setResponse({ accessible_name: 'Toggle', role: 'Button' })

    // Initially enabled
    let result = await service.captureAt({ x: 50, y: 50 })
    expect(result).not.toBeNull()

    // Disable
    service.setEnabled(false)
    result = await service.captureAt({ x: 50, y: 50 })
    expect(result).toBeNull()

    // Re-enable
    service.setEnabled(true)
    result = await service.captureAt({ x: 50, y: 50 })
    expect(result).not.toBeNull()
  })

  test('captureAt returns context with only selector', async () => {
    backend.setResponse({ selector: 'btnSave' })

    const result = await service.captureAt({ x: 100, y: 100 })
    expect(result).not.toBeNull()
    expect(result!.selector).toBe('btnSave')
    expect(result!.accessible_name).toBeUndefined()
  })

  test('captureAt returns context with all fields', async () => {
    backend.setResponse({
      accessible_name: 'Search',
      role: 'Edit',
      selector: 'searchBox1',
      bounding_box: [10, 20, 300, 50],
    })

    const result = await service.captureAt({ x: 150, y: 35 })
    expect(result).not.toBeNull()
    expect(result!.accessible_name).toBe('Search')
    expect(result!.role).toBe('Edit')
    expect(result!.selector).toBe('searchBox1')
    expect(result!.bounding_box).toEqual([10, 20, 300, 50])
  })

  test('multiple concurrent queries do not block each other', async () => {
    backend.setDelay(30)
    backend.setResponse({ accessible_name: 'Concurrent' })

    const results = await Promise.all([
      service.captureAt({ x: 10, y: 10 }),
      service.captureAt({ x: 20, y: 20 }),
      service.captureAt({ x: 30, y: 30 }),
    ])

    for (const r of results) {
      expect(r).not.toBeNull()
      expect(r!.accessible_name).toBe('Concurrent')
    }
    expect(backend.queryCount).toBe(3)
  })
})

describe('ElementCaptureService with DesktopRecorder integration', () => {
  test('DesktopRecorder has elementCapture property', async () => {
    const { DesktopRecorder } = await import('../desktopRecorder.js')
    const mockBackend: any = {
      isAvailable: true,
      platform: 'linux' as Platform,
      async startCapture(cb: any) {
        return {
          stop() {},
          get isActive() {
            return false
          },
        }
      },
      getWindowContext() {
        return { app_name: 'test', window_title: 'test' }
      },
      async captureScreenshot() {
        return null
      },
    }

    const recorder = new DesktopRecorder({
      backend: mockBackend,
      elementCapture: { enabled: true },
    })
    expect(recorder.elementCapture).not.toBeNull()
  })

  test('DesktopRecorder with elementCapture disabled', async () => {
    const { DesktopRecorder } = await import('../desktopRecorder.js')
    const mockBackend: any = {
      isAvailable: true,
      platform: 'linux' as Platform,
      async startCapture(cb: any) {
        return {
          stop() {},
          get isActive() {
            return false
          },
        }
      },
      getWindowContext() {
        return { app_name: 'test', window_title: 'test' }
      },
      async captureScreenshot() {
        return null
      },
    }

    const recorder = new DesktopRecorder({
      backend: mockBackend,
      elementCapture: false,
    })
    expect(recorder.elementCapture).toBeNull()
  })
})

describe('loadElementBackend', () => {
  test('returns null for unsupported platform on current machine', () => {
    // On Linux CI, darwin/win32 backends won't be available
    if (process.platform !== 'darwin') {
      const backend = loadElementBackend('darwin')
      expect(backend).toBeNull()
    }
    if (process.platform !== 'win32') {
      const backend = loadElementBackend('win32')
      expect(backend).toBeNull()
    }
  })

  test('linux backend availability depends on AT-SPI2', () => {
    const backend = loadElementBackend('linux')
    // May or may not be available depending on CI environment
    expect(backend === null || backend.platform === 'linux').toBe(true)
  })
})

describe('Adaptive replay with element_context', () => {
  test('adaptAction uses bounding_box center when available', async () => {
    const { ReplayEngine } = await import('../replayEngine.js')
    const mockExecutor = {
      async execute(action: any) {
        // First attempt fails, second uses element context
        if (action.coordinate[0] === 100)
          return { success: false, error: 'not found' }
        return { success: true }
      },
      async screenshot() {
        return ''
      },
    }

    const engine = new ReplayEngine(mockExecutor, {
      mode: 'adaptive',
      maxRetries: 1,
      delayBetweenActions: 0,
      speedMultiplier: 10000,
    })

    const events = [
      {
        action: 'left_click' as const,
        coordinate: [100, 100] as [number, number],
        timestamp: 1000,
        screenshot_before: null,
        screenshot_after: null,
        window_context: { app_name: 'test', window_title: 'test' },
        element_context: {
          accessible_name: 'Save',
          role: 'Button',
          bounding_box: [280, 380, 320, 420] as [
            number,
            number,
            number,
            number,
          ],
        },
      },
    ]

    const result = await engine.replayEvents(events)
    // Should succeed because adaptive mode recalculates from bounding_box center (300, 400)
    expect(result.status).toBe('completed')
    expect(result.stepsCompleted).toBe(1)
  })
})
