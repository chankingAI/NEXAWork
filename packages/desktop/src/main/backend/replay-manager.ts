/**
 * NexaWork Replay Manager (N26)
 * =============================
 * Process-side controller behind the ReplayPanel. It loads a persisted
 * recording, drives its steps forward (play / pause / stop / single-step) at a
 * selectable speed, tracks per-step status (incl. self-heal recovery) and
 * builds a quality report when the run finishes.
 *
 * Like the recorder manager it keeps zero native dependencies and runs
 * identically under `bun test`: timing is driven by an injectable clock and a
 * {@link ReplayExecutor} the IPC layer (or a test) supplies. In production the
 * executor bridges to the AdaptiveReplayEngine in
 * {@link ../../../@ant/computer-use-recorder}; the default executor here marks
 * every step successful so the UI is fully exercised without native input.
 */
import type { RecordedAction, RecordingFile } from './recorder-manager'
import {
  computeProgress,
  computeQualityScore,
  coerceReplaySpeed,
  DEFAULT_REPLAY_SPEED,
  DEFAULT_STEP_DELAY_MS,
  describeAction,
  estimateRemainingMs,
  IDLE_REPLAY_STATUS,
  type ReplayReport,
  type ReplaySpeed,
  type ReplayState,
  type ReplayStatus,
  type ReplayStep,
  type ReplayStepReport,
  type ReplayStepStatus,
  stepDelayForSpeed,
} from '../../shared/replay'

/** What an executor reports back for a single replayed step. */
export interface ReplayExecutorOutcome {
  result: Extract<
    ReplayStepStatus,
    'success' | 'recovered' | 'failed' | 'skipped'
  >
  /** Self-heal strategy applied (only meaningful for 'recovered'). */
  recoveryStrategy?: string
  /** Error description (only meaningful for 'failed'). */
  error?: string
  /** Retry attempts the executor needed. */
  retries?: number
  /** Override the recorded duration for this step (ms). */
  durationMs?: number
}

/** Bridges a replay step to the real action dispatcher / recovery engine. */
export type ReplayExecutor = (
  step: ReplayStep,
  event: RecordedAction,
  index: number,
) => ReplayExecutorOutcome

export interface ReplayManagerOptions {
  /** Injectable clock (ms since epoch) for deterministic timing in tests. */
  now?: () => number
  /** Stable id factory (tests override for determinism). */
  generateId?: () => string
  /** Step executor; defaults to marking every step a success. */
  executor?: ReplayExecutor
  /** Base per-step pacing in ms before speed scaling (default 600). */
  baseStepDelayMs?: number
}

/** The terminal states a finished/aborted run can settle into. */
const TERMINAL_STATES: ReadonlySet<ReplayState> = new Set([
  'completed',
  'failed',
  'aborted',
])

const defaultExecutor: ReplayExecutor = () => ({ result: 'success' })

export class ReplayManager {
  private readonly now: () => number
  private readonly generateId: () => string
  private readonly executor: ReplayExecutor
  private readonly baseStepDelayMs: number

  private state: ReplayState = 'idle'
  private sessionId: string | null = null
  private recordingId: string | null = null
  private recordingLabel: string | null = null
  private speed: ReplaySpeed = DEFAULT_REPLAY_SPEED
  private steps: ReplayStep[] = []
  private events: RecordedAction[] = []
  private currentStep = -1
  /** Index of the next step to execute. */
  private cursor = 0
  /** Wall-clock at which the next auto-step is due (while playing). */
  private nextDueAt = 0
  /** Active replay time accumulated before the current running span. */
  private accumulatedMs = 0
  /** Wall-clock the current running span started, or 0 when not playing. */
  private spanStart = 0
  private observedDurations: number[] = []
  private report: ReplayReport | null = null

  constructor(options: ReplayManagerOptions = {}) {
    this.now = options.now ?? Date.now
    this.generateId =
      options.generateId ??
      (() => `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    this.executor = options.executor ?? defaultExecutor
    this.baseStepDelayMs = options.baseStepDelayMs ?? DEFAULT_STEP_DELAY_MS
  }

  /** Load a recording, resetting any prior run. Leaves the replay paused-ready. */
  load(file: RecordingFile): ReplayStatus {
    this.sessionId = this.generateId()
    this.recordingId = file.id
    this.recordingLabel = file.taskDescription?.trim() || null
    this.events = [...file.events]
    this.steps = file.events.map((e, index) => ({
      index,
      action: e.action,
      description: describeAction(e.action, e.detail),
      status: 'pending' as ReplayStepStatus,
      durationMs: 0,
      retries: 0,
    }))
    this.state = 'idle'
    this.currentStep = -1
    this.cursor = 0
    this.accumulatedMs = 0
    this.spanStart = 0
    this.nextDueAt = 0
    this.observedDurations = []
    this.report = null
    return this.getStatus()
  }

  /** Begin or resume continuous playback. */
  play(): ReplayStatus {
    if (!this.recordingId) throw new Error('No recording loaded')
    if (TERMINAL_STATES.has(this.state)) return this.getStatus()
    if (this.cursor >= this.steps.length) {
      this.finalize('completed')
      return this.getStatus()
    }
    if (this.state !== 'playing') {
      this.state = 'playing'
      this.spanStart = this.now()
      // First step fires on the next tick.
      this.nextDueAt = this.now()
    }
    return this.getStatus()
  }

  /** Pause continuous playback; freezes the timer. No-op unless playing. */
  pause(): ReplayStatus {
    if (this.state === 'playing') {
      this.accumulatedMs += this.now() - this.spanStart
      this.spanStart = 0
      this.state = 'paused'
    }
    return this.getStatus()
  }

  /** Change the playback speed; takes effect from the next step. */
  setSpeed(input: number): ReplayStatus {
    this.speed = coerceReplaySpeed(input)
    if (this.state === 'playing') {
      this.nextDueAt =
        this.now() + stepDelayForSpeed(this.baseStepDelayMs, this.speed)
    }
    return this.getStatus()
  }

  /**
   * Execute exactly one step then settle into a paused state. Used by the
   * "single-step" control. Finalizes the run when the last step is reached.
   */
  step(): ReplayStatus {
    if (!this.recordingId) throw new Error('No recording loaded')
    if (TERMINAL_STATES.has(this.state)) return this.getStatus()
    // Account for any in-flight span so elapsed time stays accurate.
    if (this.state === 'playing') {
      this.accumulatedMs += this.now() - this.spanStart
      this.spanStart = 0
    }
    this.executeNext()
    if (this.cursor >= this.steps.length) {
      this.finalize(this.deriveTerminalState())
    } else {
      this.state = 'paused'
    }
    return this.getStatus()
  }

  /**
   * Advance playback if a step is due. Called by the IPC ticker on an interval.
   * Returns true when a step executed or the run finished (so callers know to
   * broadcast). No-op unless actively playing.
   */
  tick(): boolean {
    if (this.state !== 'playing') return false
    if (this.now() < this.nextDueAt) return false
    this.executeNext()
    if (this.cursor >= this.steps.length) {
      this.finalize(this.deriveTerminalState())
    } else {
      this.nextDueAt =
        this.now() + stepDelayForSpeed(this.baseStepDelayMs, this.speed)
    }
    return true
  }

  /** Stop the run, mark remaining steps skipped, and build an aborted report. */
  stop(): ReplayStatus {
    if (!this.recordingId || TERMINAL_STATES.has(this.state)) {
      return this.getStatus()
    }
    if (this.state === 'playing') {
      this.accumulatedMs += this.now() - this.spanStart
      this.spanStart = 0
    }
    for (let i = this.cursor; i < this.steps.length; i++) {
      this.steps[i].status = 'skipped'
    }
    this.cursor = this.steps.length
    this.finalize('aborted')
    return this.getStatus()
  }

  /** True while a run is active (playing or paused). */
  isActive(): boolean {
    return this.state === 'playing' || this.state === 'paused'
  }

  /** The most recent completion report, or null. */
  getReport(): ReplayReport | null {
    return this.report ? structuredClone(this.report) : null
  }

  /** Live status snapshot (pushed on each tick + on demand). */
  getStatus(): ReplayStatus {
    if (!this.recordingId) {
      return { ...IDLE_REPLAY_STATUS }
    }
    const completed = this.steps.filter(
      s => s.status !== 'pending' && s.status !== 'executing',
    ).length
    const last = this.currentStep >= 0 ? this.steps[this.currentStep] : null
    const recovering = this.state === 'playing' && last?.status === 'recovered'
    return {
      sessionId: this.sessionId,
      recordingId: this.recordingId,
      recordingLabel: this.recordingLabel,
      state: this.state,
      speed: this.speed,
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      progress: computeProgress(completed, this.steps.length),
      elapsedMs: this.elapsed(),
      estimatedRemainingMs: estimateRemainingMs(
        completed,
        this.steps.length,
        this.observedDurations,
        stepDelayForSpeed(this.baseStepDelayMs, this.speed),
      ),
      recovering,
      recoveryStrategy: recovering ? last?.recoveryStrategy : undefined,
      steps: this.steps.map(s => ({ ...s })),
    }
  }

  /** Run the executor for the step at the cursor and advance it. */
  private executeNext(): void {
    const index = this.cursor
    if (index >= this.steps.length) return
    const step = this.steps[index]
    this.currentStep = index
    step.status = 'executing'
    const outcome = this.executor(step, this.events[index], index)
    step.status = outcome.result
    step.retries = Math.max(0, outcome.retries ?? 0)
    step.recoveryStrategy =
      outcome.result === 'recovered' ? outcome.recoveryStrategy : undefined
    step.error = outcome.result === 'failed' ? outcome.error : undefined
    const duration = Math.max(
      0,
      outcome.durationMs ?? stepDelayForSpeed(this.baseStepDelayMs, this.speed),
    )
    step.durationMs = duration
    this.observedDurations.push(duration)
    this.cursor = index + 1
  }

  /** Decide whether a finished run completed cleanly or with failures. */
  private deriveTerminalState(): Extract<ReplayState, 'completed' | 'failed'> {
    const failed = this.steps.some(s => s.status === 'failed')
    return failed ? 'failed' : 'completed'
  }

  /** Build the report, freeze the timer, and settle into a terminal state. */
  private finalize(state: ReplayState): void {
    if (this.state === 'playing') {
      this.accumulatedMs += this.now() - this.spanStart
      this.spanStart = 0
    }
    this.state = state
    this.report = this.buildReport(state)
  }

  private buildReport(state: ReplayState): ReplayReport {
    const stepReports: ReplayStepReport[] = this.steps.map(s => ({
      index: s.index,
      action: s.action,
      status: s.status,
      durationMs: s.durationMs,
      retries: s.retries,
      recoveryStrategy: s.recoveryStrategy,
      error: s.error,
    }))
    const successCount = this.steps.filter(s => s.status === 'success').length
    const recoveredCount = this.steps.filter(
      s => s.status === 'recovered',
    ).length
    const failedCount = this.steps.filter(s => s.status === 'failed').length
    const skippedCount = this.steps.filter(s => s.status === 'skipped').length
    const executedCount = successCount + recoveredCount + failedCount
    const totalSteps = this.steps.length
    const totalDurationMs = this.observedDurations.reduce(
      (sum, d) => sum + d,
      0,
    )
    const avgStepDurationMs =
      this.observedDurations.length > 0
        ? Math.round(totalDurationMs / this.observedDurations.length)
        : 0

    let reportStatus: ReplayReport['status']
    if (state === 'aborted') {
      reportStatus = 'aborted'
    } else if (failedCount === 0) {
      reportStatus = 'completed'
    } else if (successCount + recoveredCount > 0) {
      reportStatus = 'partial'
    } else {
      reportStatus = 'failed'
    }

    return {
      recordingId: this.recordingId ?? '',
      status: reportStatus,
      totalSteps,
      successCount,
      recoveredCount,
      failedCount,
      skippedCount,
      qualityScore: computeQualityScore({
        successCount,
        recoveredCount,
        skippedCount,
        executedCount,
        totalSteps,
      }),
      totalDurationMs,
      avgStepDurationMs,
      steps: stepReports,
      completedAt: new Date(this.now()).toISOString(),
    }
  }

  private elapsed(): number {
    return this.state === 'playing'
      ? this.accumulatedMs + (this.now() - this.spanStart)
      : this.accumulatedMs
  }
}

// ─── Singleton management ─────────────────────────────────────
let instance: ReplayManager | null = null

/** Initialize the singleton replay manager. */
export function initReplayManager(
  options: ReplayManagerOptions = {},
): ReplayManager {
  instance = new ReplayManager(options)
  return instance
}

/** Get the singleton manager, creating a default one on first use. */
export function getReplayManager(): ReplayManager {
  if (!instance) instance = new ReplayManager()
  return instance
}
