/**
 * CDP-based browser action recorder.
 *
 * Captures user interactions in Chrome via CDP protocol events.
 * Uses Runtime.evaluate to inject document-level event listeners for
 * capturing clicks, inputs, scrolls, and key presses — since CDP Input
 * domain does not provide passive listening.
 *
 * Reference: browser-use/browser_use/browser/watchdogs/recording_watchdog.py
 */

import type {
  ElementContext,
  Platform,
  RawActionEvent,
  RecordableAction,
  RecorderEvent,
  RecorderStartOptions,
  RecorderStopResult,
  RecordingSession,
  ScrollDirection,
  WindowContext,
} from './types.js'

// ─── CDP Communication Interface ──────────────────────────────────────────────

/**
 * Minimal CDP client interface that the recorder needs.
 * The host must provide an implementation that connects to the browser's
 * DevTools Protocol endpoint (e.g. ws://localhost:9222).
 */
export interface CdpClient {
  /** Send a CDP method call and return the result. */
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  /** Register a listener for a CDP event. Returns an unsubscribe function. */
  on(event: string, handler: (params: unknown) => void): () => void
}

/**
 * Screenshot provider interface. The host adapter supplies this —
 * typically backed by computer-use-mcp's existing screenshot mechanism.
 */
export interface ScreenshotProvider {
  /** Capture the current screen and return base64-encoded PNG. */
  capture(): Promise<string>
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface InjectedEvent {
  type: 'click' | 'dblclick' | 'input' | 'scroll' | 'keydown' | 'keyup'
  timestamp: number
  x: number
  y: number
  button?: number
  key?: string
  code?: string
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  value?: string
  scrollX?: number
  scrollY?: number
  deltaX?: number
  deltaY?: number
  target?: {
    tagName?: string
    id?: string
    className?: string
    ariaLabel?: string
    role?: string
    selector?: string
    textContent?: string
  }
}

// ─── CDP Recorder ─────────────────────────────────────────────────────────────

export interface CdpRecorderOptions {
  /** CDP client for communicating with Chrome. */
  cdpClient: CdpClient
  /** Provider for capturing screenshots. */
  screenshotProvider: ScreenshotProvider
  /** Platform the recording is happening on. */
  platform: Platform
  /** Screen dimensions. */
  screenWidth: number
  screenHeight: number
  /** Whether to capture screenshots with events (default: true). */
  captureScreenshots?: boolean
  /** Minimum interval (ms) between screenshot captures (default: 500). */
  screenshotIntervalMs?: number
}

export class CdpRecorder {
  private cdp: CdpClient
  private screenshotProvider: ScreenshotProvider
  private session: RecordingSession | null = null
  private unsubscribers: Array<() => void> = []
  private listeners: Array<(event: RecorderEvent) => void> = []
  private captureScreenshots: boolean
  private screenshotIntervalMs: number
  private lastScreenshotTime = 0
  private platform: Platform
  private screenWidth: number
  private screenHeight: number
  private pendingKeys: Array<{ key: string; timestamp: number }> = []
  private keyFlushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: CdpRecorderOptions) {
    this.cdp = opts.cdpClient
    this.screenshotProvider = opts.screenshotProvider
    this.platform = opts.platform
    this.screenWidth = opts.screenWidth
    this.screenHeight = opts.screenHeight
    this.captureScreenshots = opts.captureScreenshots ?? true
    this.screenshotIntervalMs = opts.screenshotIntervalMs ?? 500
  }

  /** Subscribe to recorder events. Returns unsubscribe function. */
  on(handler: (event: RecorderEvent) => void): () => void {
    this.listeners.push(handler)
    return () => {
      const idx = this.listeners.indexOf(handler)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  /** Start recording user actions. */
  async start(options?: RecorderStartOptions): Promise<string> {
    if (this.session?.status === 'recording') {
      throw new Error('Recording already in progress')
    }

    const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.session = {
      id: sessionId,
      startTime: Date.now(),
      endTime: 0,
      status: 'recording',
      events: [],
      metadata: {
        platform: this.platform,
        screen_width: this.screenWidth,
        screen_height: this.screenHeight,
        task_description: options?.taskDescription,
      },
    }

    if (options?.captureScreenshots !== undefined) {
      this.captureScreenshots = options.captureScreenshots
    }
    if (options?.screenshotIntervalMs !== undefined) {
      this.screenshotIntervalMs = options.screenshotIntervalMs
    }

    await this.injectEventListeners()
    await this.setupCdpListeners()

    this.emit({ type: 'started', sessionId })
    return sessionId
  }

  /** Stop recording and return the completed session. */
  async stop(outputPath: string): Promise<RecorderStopResult> {
    if (!this.session) {
      throw new Error('No recording in progress')
    }

    this.flushPendingKeys()
    this.cleanup()

    this.session.endTime = Date.now()
    this.session.status = 'stopped'

    const result: RecorderStopResult = {
      session: { ...this.session },
      outputPath,
    }

    this.emit({ type: 'stopped', session: this.session })
    return result
  }

  /** Pause recording (events are ignored until resumed). */
  pause(): void {
    if (this.session?.status === 'recording') {
      this.session.status = 'paused'
      this.emit({ type: 'paused' })
    }
  }

  /** Resume a paused recording. */
  resume(): void {
    if (this.session?.status === 'paused') {
      this.session.status = 'recording'
      this.emit({ type: 'resumed' })
    }
  }

  /** Get the current session (or null if not recording). */
  getSession(): RecordingSession | null {
    return this.session
  }

  // ─── Private: CDP Setup ───────────────────────────────────────────────

  /**
   * Inject document-level event listeners into the page via Runtime.evaluate.
   * This captures user interactions that CDP Input domain cannot passively observe.
   */
  private async injectEventListeners(): Promise<void> {
    const injectionScript = `
      (function() {
        if (window.__cuRecorderInjected) return;
        window.__cuRecorderInjected = true;
        window.__cuRecorderEvents = [];

        function getSelector(el) {
          if (!el || !el.tagName) return '';
          if (el.id) return '#' + el.id;
          if (el.className && typeof el.className === 'string') {
            var cls = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
            if (cls) return el.tagName.toLowerCase() + '.' + cls;
          }
          return el.tagName.toLowerCase();
        }

        function getTargetInfo(el) {
          if (!el) return {};
          return {
            tagName: el.tagName ? el.tagName.toLowerCase() : '',
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className : '',
            ariaLabel: el.getAttribute ? (el.getAttribute('aria-label') || '') : '',
            role: el.getAttribute ? (el.getAttribute('role') || '') : '',
            selector: getSelector(el),
            textContent: (el.textContent || '').slice(0, 50)
          };
        }

        function pushEvent(evt) {
          window.__cuRecorderEvents.push(evt);
          if (window.__cuRecorderEvents.length > 1000) {
            window.__cuRecorderEvents.shift();
          }
        }

        document.addEventListener('click', function(e) {
          pushEvent({
            type: 'click', timestamp: Date.now(),
            x: e.clientX, y: e.clientY, button: e.button,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
            target: getTargetInfo(e.target)
          });
        }, true);

        document.addEventListener('dblclick', function(e) {
          pushEvent({
            type: 'dblclick', timestamp: Date.now(),
            x: e.clientX, y: e.clientY, button: e.button,
            target: getTargetInfo(e.target)
          });
        }, true);

        document.addEventListener('input', function(e) {
          pushEvent({
            type: 'input', timestamp: Date.now(),
            x: 0, y: 0,
            value: e.target && e.target.value ? e.target.value.slice(-100) : '',
            target: getTargetInfo(e.target)
          });
        }, true);

        document.addEventListener('scroll', function(e) {
          pushEvent({
            type: 'scroll', timestamp: Date.now(),
            x: 0, y: 0,
            scrollX: window.scrollX, scrollY: window.scrollY,
            deltaX: 0, deltaY: 0,
            target: getTargetInfo(e.target)
          });
        }, true);

        document.addEventListener('keydown', function(e) {
          pushEvent({
            type: 'keydown', timestamp: Date.now(),
            x: 0, y: 0,
            key: e.key, code: e.code,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
            target: getTargetInfo(e.target)
          });
        }, true);
      })();
    `
    await this.cdp.send('Runtime.evaluate', {
      expression: injectionScript,
      awaitPromise: false,
    })
  }

  /** Set up CDP domain listeners for navigation and frame events. */
  private async setupCdpListeners(): Promise<void> {
    // Enable Page domain for navigation events
    await this.cdp.send('Page.enable')

    // Listen for frame navigations
    const unsubNav = this.cdp.on('Page.frameNavigated', (params: unknown) => {
      if (this.session?.status !== 'recording') return
      const p = params as { frame?: { url?: string } }
      if (p.frame?.url) {
        this.recordNavigationEvent(p.frame.url)
      }
    })
    this.unsubscribers.push(unsubNav)

    // Start polling injected events
    this.startEventPolling()
  }

  /** Poll injected events from the page at regular intervals. */
  private startEventPolling(): void {
    const pollInterval = setInterval(async () => {
      if (!this.session || this.session.status !== 'recording') return
      await this.pollInjectedEvents()
    }, 100)

    this.unsubscribers.push(() => clearInterval(pollInterval))
  }

  /** Retrieve and process events captured by injected listeners. */
  private async pollInjectedEvents(): Promise<void> {
    try {
      const result = (await this.cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            var events = window.__cuRecorderEvents || [];
            window.__cuRecorderEvents = [];
            return JSON.stringify(events);
          })()
        `,
        returnByValue: true,
      })) as { result?: { value?: string } }

      const jsonStr = result?.result?.value
      if (!jsonStr) return

      const events = JSON.parse(jsonStr) as InjectedEvent[]
      for (const evt of events) {
        await this.processInjectedEvent(evt)
      }
    } catch {
      // Page might have navigated, silently handle
    }
  }

  // ─── Private: Event Processing ────────────────────────────────────────

  private async processInjectedEvent(evt: InjectedEvent): Promise<void> {
    if (this.session?.status !== 'recording') return

    switch (evt.type) {
      case 'click':
        await this.recordClickEvent(evt)
        break
      case 'dblclick':
        await this.recordDoubleClickEvent(evt)
        break
      case 'input':
        await this.recordInputEvent(evt)
        break
      case 'scroll':
        await this.recordScrollEvent(evt)
        break
      case 'keydown':
        this.bufferKeyEvent(evt)
        break
    }
  }

  private async recordClickEvent(evt: InjectedEvent): Promise<void> {
    this.flushPendingKeys()

    const action: RecordableAction =
      evt.button === 2
        ? 'right_click'
        : evt.button === 1
          ? 'middle_click'
          : 'left_click'

    const rawEvent = await this.buildRawEvent(action, evt.timestamp, {
      coordinate: [evt.x, evt.y] as [number, number],
      text: this.buildModifierText(evt),
    })
    this.addEvent(rawEvent)
  }

  private async recordDoubleClickEvent(evt: InjectedEvent): Promise<void> {
    this.flushPendingKeys()

    // Remove the last single click if it was within 300ms (it's part of this double click)
    const lastEvent = this.session?.events[this.session.events.length - 1]
    if (
      lastEvent?.action === 'left_click' &&
      evt.timestamp - lastEvent.timestamp < 300
    ) {
      this.session!.events.pop()
    }

    const rawEvent = await this.buildRawEvent('double_click', evt.timestamp, {
      coordinate: [evt.x, evt.y] as [number, number],
    })
    this.addEvent(rawEvent)
  }

  private async recordInputEvent(evt: InjectedEvent): Promise<void> {
    // Input events are handled via key buffering; this captures paste/autofill
    if (evt.value && !this.pendingKeys.length) {
      const rawEvent = await this.buildRawEvent('type', evt.timestamp, {
        text: evt.value,
      })
      rawEvent.element_context = this.extractElementContext(evt)
      this.addEvent(rawEvent)
    }
  }

  private async recordScrollEvent(evt: InjectedEvent): Promise<void> {
    this.flushPendingKeys()

    // Debounce scrolls: merge with previous scroll if within 200ms
    const lastEvent = this.session?.events[this.session.events.length - 1]
    if (
      lastEvent?.action === 'scroll' &&
      evt.timestamp - lastEvent.timestamp < 200
    ) {
      // Update the existing scroll event's amount
      lastEvent.scroll_amount = (lastEvent.scroll_amount ?? 1) + 1
      lastEvent.timestamp = evt.timestamp
      return
    }

    const direction: ScrollDirection =
      (evt.deltaY ?? 0) > 0
        ? 'down'
        : (evt.deltaY ?? 0) < 0
          ? 'up'
          : (evt.deltaX ?? 0) > 0
            ? 'right'
            : 'left'

    const rawEvent = await this.buildRawEvent('scroll', evt.timestamp, {
      coordinate: [evt.x || 0, evt.y || 0] as [number, number],
      scroll_direction: direction,
      scroll_amount: 3,
    })
    this.addEvent(rawEvent)
  }

  private bufferKeyEvent(evt: InjectedEvent): void {
    if (!evt.key) return

    // Modifier-only keys are ignored in the buffer
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(evt.key)) return

    // If it's a key combo (ctrl/alt/meta + key), flush and emit immediately
    if (evt.ctrlKey || evt.altKey || evt.metaKey) {
      this.flushPendingKeys()
      const chord = this.buildKeyChord(evt)
      void this.emitKeyAction(chord, evt.timestamp)
      return
    }

    // Special keys flush immediately
    const specialKeys = [
      'Enter',
      'Escape',
      'Tab',
      'Backspace',
      'Delete',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'F6',
      'F7',
      'F8',
      'F9',
      'F10',
      'F11',
      'F12',
    ]
    if (specialKeys.includes(evt.key)) {
      this.flushPendingKeys()
      const keyName = evt.key === 'Enter' ? 'Return' : evt.key
      void this.emitKeyAction(keyName, evt.timestamp)
      return
    }

    // Regular character key — buffer for merging into type event
    this.pendingKeys.push({ key: evt.key, timestamp: evt.timestamp })

    // Set flush timer
    if (this.keyFlushTimer) clearTimeout(this.keyFlushTimer)
    this.keyFlushTimer = setTimeout(() => this.flushPendingKeys(), 300)
  }

  private flushPendingKeys(): void {
    if (this.keyFlushTimer) {
      clearTimeout(this.keyFlushTimer)
      this.keyFlushTimer = null
    }
    if (this.pendingKeys.length === 0) return

    const text = this.pendingKeys.map(k => k.key).join('')
    const timestamp = this.pendingKeys[0]!.timestamp

    void this.emitTypeAction(text, timestamp)
    this.pendingKeys = []
  }

  private async emitKeyAction(
    keyText: string,
    timestamp: number,
  ): Promise<void> {
    const rawEvent = await this.buildRawEvent('key', timestamp, {
      text: keyText,
    })
    this.addEvent(rawEvent)
  }

  private async emitTypeAction(text: string, timestamp: number): Promise<void> {
    const rawEvent = await this.buildRawEvent('type', timestamp, {
      text,
    })
    this.addEvent(rawEvent)
  }

  private recordNavigationEvent(url: string): void {
    // Navigation is recorded as metadata on the window context
    // We don't emit a separate action for it — it's captured in window_context.url
    if (this.session?.status === 'recording') {
      const lastEvent = this.session.events[this.session.events.length - 1]
      if (lastEvent) {
        lastEvent.window_context.url = url
      }
    }
  }

  // ─── Private: Event Building ──────────────────────────────────────────

  private async buildRawEvent(
    action: RecordableAction,
    timestamp: number,
    params: Partial<RawActionEvent>,
  ): Promise<RawActionEvent> {
    const screenshotBefore = await this.maybeCapture(timestamp)

    const windowContext: WindowContext = {
      app_name: 'Google Chrome',
      window_title: await this.getPageTitle(),
      url: await this.getPageUrl(),
    }

    return {
      action,
      timestamp,
      screenshot_before: screenshotBefore,
      screenshot_after: null,
      window_context: windowContext,
      ...params,
    } as RawActionEvent
  }

  private async maybeCapture(timestamp: number): Promise<string | null> {
    if (!this.captureScreenshots) return null
    if (timestamp - this.lastScreenshotTime < this.screenshotIntervalMs) {
      return null
    }
    try {
      this.lastScreenshotTime = timestamp
      return await this.screenshotProvider.capture()
    } catch {
      return null
    }
  }

  private async getPageTitle(): Promise<string> {
    try {
      const result = (await this.cdp.send('Runtime.evaluate', {
        expression: 'document.title',
        returnByValue: true,
      })) as { result?: { value?: string } }
      return result?.result?.value ?? ''
    } catch {
      return ''
    }
  }

  private async getPageUrl(): Promise<string> {
    try {
      const result = (await this.cdp.send('Runtime.evaluate', {
        expression: 'window.location.href',
        returnByValue: true,
      })) as { result?: { value?: string } }
      return result?.result?.value ?? ''
    } catch {
      return ''
    }
  }

  private extractElementContext(
    evt: InjectedEvent,
  ): ElementContext | undefined {
    if (!evt.target) return undefined
    const t = evt.target
    return {
      accessible_name: t.ariaLabel || t.textContent || undefined,
      role: t.role || undefined,
      selector: t.selector || undefined,
    }
  }

  private buildModifierText(evt: InjectedEvent): string | undefined {
    const mods: string[] = []
    if (evt.ctrlKey) mods.push('ctrl')
    if (evt.shiftKey) mods.push('shift')
    if (evt.altKey) mods.push('alt')
    if (evt.metaKey) mods.push('meta')
    return mods.length > 0 ? mods.join('+') : undefined
  }

  private buildKeyChord(evt: InjectedEvent): string {
    const parts: string[] = []
    if (evt.ctrlKey) parts.push('ctrl')
    if (evt.altKey) parts.push('alt')
    if (evt.shiftKey) parts.push('shift')
    if (evt.metaKey) parts.push('meta')
    if (evt.key) parts.push(evt.key.toLowerCase())
    return parts.join('+')
  }

  // ─── Private: Helpers ─────────────────────────────────────────────────

  private addEvent(event: RawActionEvent): void {
    if (!this.session || this.session.status !== 'recording') return
    this.session.events.push(event)
    this.emit({ type: 'event_captured', event })
  }

  private emit(event: RecorderEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private cleanup(): void {
    for (const unsub of this.unsubscribers) {
      unsub()
    }
    this.unsubscribers = []
    if (this.keyFlushTimer) {
      clearTimeout(this.keyFlushTimer)
      this.keyFlushTimer = null
    }
  }
}
