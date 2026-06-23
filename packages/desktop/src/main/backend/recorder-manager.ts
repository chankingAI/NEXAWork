/**
 * NexaWork Recorder Manager (N24)
 * ===============================
 * Drives the operation-recording lifecycle behind the record button + status
 * bar. It owns a single recording session (start → pause/resume → stop),
 * tracks the active recording duration (paused spans excluded) and the captured
 * event count, and persists the finished session to a local JSON file.
 *
 * The captured actions mirror {@link ../../../@ant/computer-use-recorder} event
 * shapes: a real CDP/desktop recorder feeds {@link recordAction} as the user
 * interacts; this manager is the process-side controller the IPC layer calls.
 * It keeps zero native dependencies and runs identically under `bun test` by
 * accepting an injectable clock and a nullable output directory (in-memory).
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type {
  RecorderStatus,
  RecordingState,
  RecordStopResult,
} from '../../shared/ipc-channels'

/** A single captured action; a thin, serializable subset of RawActionEvent. */
export interface RecordedAction {
  action: string
  timestamp: number
  detail?: string
}

/** The persisted shape written to `<dir>/<id>.json` when a recording stops. */
export interface RecordingFile {
  id: string
  startTime: number
  endTime: number
  durationMs: number
  eventCount: number
  taskDescription?: string
  events: RecordedAction[]
}

export interface RecorderManagerOptions {
  /** Directory recordings are written to, or null for in-memory (tests). */
  dir?: string | null
  /** Injectable clock (ms since epoch) for deterministic timing in tests. */
  now?: () => number
  /** Stable id factory (tests override for determinism). */
  generateId?: () => string
}

const IDLE_STATUS: RecorderStatus = {
  sessionId: null,
  state: 'idle',
  eventCount: 0,
  elapsedMs: 0,
}

export class RecorderManager {
  private readonly dir: string | null
  private readonly now: () => number
  private readonly generateId: () => string

  private state: RecordingState = 'idle'
  private sessionId: string | null = null
  private startTime = 0
  private taskDescription: string | undefined
  private events: RecordedAction[] = []
  /** Active recording time accumulated before the current running span. */
  private accumulatedMs = 0
  /** Wall-clock timestamp the current running span started, or 0 when paused. */
  private spanStart = 0
  /** Last finished recording, retained so the renderer can act on it. */
  private lastResult: RecordStopResult | null = null

  constructor(options: RecorderManagerOptions = {}) {
    this.dir = options.dir ?? null
    this.now = options.now ?? Date.now
    this.generateId =
      options.generateId ??
      (() => `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  }

  /** Begin a new recording. Throws if one is already active. */
  start(input: { taskDescription?: string } = {}): RecorderStatus {
    if (this.state !== 'idle') {
      throw new Error('Recording already in progress')
    }
    const ts = this.now()
    this.sessionId = this.generateId()
    this.state = 'recording'
    this.startTime = ts
    this.taskDescription = input.taskDescription?.trim() || undefined
    this.events = []
    this.accumulatedMs = 0
    this.spanStart = ts
    return this.getStatus()
  }

  /** Pause the active recording; freezes the timer. No-op unless recording. */
  pause(): RecorderStatus {
    if (this.state === 'recording') {
      this.accumulatedMs += this.now() - this.spanStart
      this.spanStart = 0
      this.state = 'paused'
    }
    return this.getStatus()
  }

  /** Resume a paused recording; restarts the timer. No-op unless paused. */
  resume(): RecorderStatus {
    if (this.state === 'paused') {
      this.spanStart = this.now()
      this.state = 'recording'
    }
    return this.getStatus()
  }

  /**
   * Append a captured action. Counted only while actively recording, so events
   * arriving during a paused span (or after stop) are ignored.
   */
  recordAction(action: string, detail?: string): void {
    if (this.state !== 'recording') return
    this.events.push({ action, timestamp: this.now(), detail })
  }

  /** Stop the active recording, persist it, and reset to idle. */
  stop(): RecordStopResult {
    if (this.state === 'idle' || !this.sessionId) {
      throw new Error('No recording in progress')
    }
    const endTime = this.now()
    const durationMs =
      this.state === 'recording'
        ? this.accumulatedMs + (endTime - this.spanStart)
        : this.accumulatedMs
    const file: RecordingFile = {
      id: this.sessionId,
      startTime: this.startTime,
      endTime,
      durationMs,
      eventCount: this.events.length,
      taskDescription: this.taskDescription,
      events: this.events,
    }
    const outputPath = this.persist(file)
    const result: RecordStopResult = {
      id: file.id,
      durationMs,
      eventCount: file.eventCount,
      outputPath,
    }
    this.lastResult = result
    this.reset()
    return result
  }

  /** Delete a persisted recording by id (used by the "discard" action). */
  discard(id: string): boolean {
    if (this.lastResult?.id === id) this.lastResult = null
    if (!this.dir) return true
    const path = join(this.dir, `${id}.json`)
    if (!existsSync(path)) return false
    rmSync(path)
    return true
  }

  /** Current live status snapshot (sent on each push tick + on demand). */
  getStatus(): RecorderStatus {
    if (this.state === 'idle' || !this.sessionId) {
      return { ...IDLE_STATUS }
    }
    const elapsedMs =
      this.state === 'recording'
        ? this.accumulatedMs + (this.now() - this.spanStart)
        : this.accumulatedMs
    return {
      sessionId: this.sessionId,
      state: this.state,
      eventCount: this.events.length,
      elapsedMs,
    }
  }

  /** True while a recording is active (recording or paused). */
  isActive(): boolean {
    return this.state !== 'idle'
  }

  /** The most recently stopped recording, or null. */
  getLastResult(): RecordStopResult | null {
    return this.lastResult ? { ...this.lastResult } : null
  }

  private persist(file: RecordingFile): string | null {
    if (!this.dir) return null
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    const path = join(this.dir, `${file.id}.json`)
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf-8')
    // rename is atomic on the same filesystem; clean up the temp on failure.
    try {
      renameSync(tmp, path)
    } catch {
      if (existsSync(tmp)) rmSync(tmp)
      return null
    }
    return path
  }

  private reset(): void {
    this.state = 'idle'
    this.sessionId = null
    this.startTime = 0
    this.taskDescription = undefined
    this.events = []
    this.accumulatedMs = 0
    this.spanStart = 0
  }
}

// ─── Singleton management ─────────────────────────────────────
let instance: RecorderManager | null = null

/** Initialize the singleton recorder manager. Pass null dir for in-memory. */
export function initRecorderManager(
  options: RecorderManagerOptions = {},
): RecorderManager {
  instance = new RecorderManager(options)
  return instance
}

/** Get the singleton manager, creating an in-memory one on first use. */
export function getRecorderManager(): RecorderManager {
  if (!instance) instance = new RecorderManager()
  return instance
}
