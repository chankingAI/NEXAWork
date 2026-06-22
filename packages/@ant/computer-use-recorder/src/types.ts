/**
 * Core type definitions for the Computer Use Recorder package.
 *
 * Action types align with the BATCH_ACTION_ITEM_SCHEMA defined in
 * packages/@ant/computer-use-mcp/src/tools.ts so that recorded events
 * can be directly replayed via dispatchAction().
 */

// ─── Action Types (aligned with computer-use-mcp BATCH_ACTION_ITEM_SCHEMA) ───

/**
 * All action types supported for recording and replay.
 * Kept in sync with the `action.enum` in BATCH_ACTION_ITEM_SCHEMA.
 */
export type RecordableAction =
  | 'key'
  | 'type'
  | 'mouse_move'
  | 'left_click'
  | 'left_click_drag'
  | 'right_click'
  | 'middle_click'
  | 'double_click'
  | 'triple_click'
  | 'scroll'
  | 'hold_key'
  | 'screenshot'
  | 'cursor_position'
  | 'left_mouse_down'
  | 'left_mouse_up'
  | 'wait'

export type ScrollDirection = 'up' | 'down' | 'left' | 'right'

// ─── Window & Element Context ─────────────────────────────────────────────────

/** Context about the active window when an event was recorded. */
export interface WindowContext {
  /** Display name of the application (e.g. "Google Chrome", "Finder"). */
  app_name: string
  /** Title of the active window. */
  window_title: string
  /** Current URL if the active window is a browser tab. */
  url?: string
}

/** Accessibility / DOM information about the element being acted upon. */
export interface ElementContext {
  /** Accessible name (ARIA label, button text, etc.). */
  accessible_name?: string
  /** UI Automation role (Button, Edit, Link, etc.). */
  role?: string
  /** CSS selector or automation ID for precise re-targeting. */
  selector?: string
  /** Bounding box [x1, y1, x2, y2] in screen coordinates. */
  bounding_box?: [number, number, number, number]
}

// ─── Raw Action Event ─────────────────────────────────────────────────────────

/**
 * A single recorded user action. The shape is designed so that:
 * 1. It carries all parameters needed by dispatchAction() for replay.
 * 2. It carries additional context (timestamps, screenshots, window/element)
 *    for workflow building and verification.
 */
export interface RawActionEvent {
  /** The action type — same enum as BATCH_ACTION_ITEM_SCHEMA. */
  action: RecordableAction

  /**
   * (x, y) coordinate for click/move/scroll/drag-end actions.
   * Pixel coordinates relative to the screen or active window.
   */
  coordinate?: [number, number]

  /**
   * (x, y) drag start coordinate — only for left_click_drag.
   */
  start_coordinate?: [number, number]

  /** Text content for type/key/hold_key actions. */
  text?: string

  /** Scroll direction — only for scroll action. */
  scroll_direction?: ScrollDirection

  /** Scroll amount (clicks) — only for scroll action. */
  scroll_amount?: number

  /** Duration in seconds — for hold_key/wait actions. */
  duration?: number

  /** Key repeat count — for key action. */
  repeat?: number

  // ─── Recording metadata (not used by dispatchAction, used by builders) ───

  /** Unix timestamp in milliseconds when this event was captured. */
  timestamp: number

  /** Base64 screenshot taken just before this action (null if unavailable). */
  screenshot_before: string | null

  /** Base64 screenshot taken just after this action (null if unavailable). */
  screenshot_after: string | null

  /** Information about the active window at recording time. */
  window_context: WindowContext

  /** Information about the target element (when detectable). */
  element_context?: ElementContext
}

// ─── Recording Session ────────────────────────────────────────────────────────

/** Platform identifier. */
export type Platform = 'darwin' | 'win32' | 'linux'

/** Metadata about the recording environment. */
export interface RecordingMetadata {
  /** Operating system platform. */
  platform: Platform
  /** Screen width in pixels. */
  screen_width: number
  /** Screen height in pixels. */
  screen_height: number
  /** User-provided description of the task being recorded. */
  task_description?: string
  /** Device pixel ratio / scale factor. */
  scale_factor?: number
}

/** Recording session status. */
export type RecordingStatus = 'recording' | 'paused' | 'stopped' | 'error'

/**
 * A complete recording session containing all captured events and metadata.
 * This is the primary data structure persisted to disk after recording.
 */
export interface RecordingSession {
  /** Unique identifier for this recording session. */
  id: string
  /** Unix timestamp (ms) when recording started. */
  startTime: number
  /** Unix timestamp (ms) when recording stopped (0 if still recording). */
  endTime: number
  /** Current status of the recording. */
  status: RecordingStatus
  /** Ordered sequence of recorded events. */
  events: RawActionEvent[]
  /** Environment metadata captured at recording start. */
  metadata: RecordingMetadata
}

// ─── Recorder Control Interface ───────────────────────────────────────────────

/** Options for starting a new recording session. */
export interface RecorderStartOptions {
  /** Human-readable description of the task to record. */
  taskDescription?: string
  /** Whether to capture screenshots with each event (default: true). */
  captureScreenshots?: boolean
  /** Minimum interval (ms) between screenshot captures (default: 500). */
  screenshotIntervalMs?: number
}

/** Result returned when a recording is stopped. */
export interface RecorderStopResult {
  /** The completed recording session. */
  session: RecordingSession
  /** File path where the session was persisted. */
  outputPath: string
}

/** Events emitted by the recorder during operation. */
export type RecorderEvent =
  | { type: 'started'; sessionId: string }
  | { type: 'event_captured'; event: RawActionEvent }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'stopped'; session: RecordingSession }
  | { type: 'error'; error: string }
