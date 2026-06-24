/**
 * NexaWork Replay Helpers (N26)
 * =============================
 * Pure, dependency-free helpers + types shared by the replay manager (main
 * process), the IPC layer and the renderer ReplayPanel. Keeping the scoring,
 * pacing and step-description logic here means it can be unit-tested under
 * `bun test` without Electron, and the renderer can reuse the exact same
 * formatting the backend computes.
 *
 * The semantics mirror {@link ../../../@ant/computer-use-recorder/src/replayRecovery}
 * (StepReport / ReplayReport / recovery strategies) so the desktop surface stays
 * faithful to the AdaptiveReplayEngine it ultimately drives over IPC.
 */

/** Top-level replay lifecycle, surfaced to the panel controls + progress bar. */
export type ReplayState =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted'

/** Per-step status shown in the left-hand step list. */
export type ReplayStepStatus =
  | 'pending'
  | 'executing'
  | 'success'
  | 'recovered'
  | 'failed'
  | 'skipped'

/** Playback speed multipliers offered in the toolbar. */
export type ReplaySpeed = 0.5 | 1 | 2 | 5

/** The discrete speeds the UI exposes (0.5x / 1x / 2x / 5x). */
export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 2, 5] as const

/** Default speed when a replay is loaded. */
export const DEFAULT_REPLAY_SPEED: ReplaySpeed = 1

/** Base per-step pacing (ms) before the speed multiplier is applied. */
export const DEFAULT_STEP_DELAY_MS = 600

/** A single replay step, derived from one recorded action. */
export interface ReplayStep {
  /** 0-based position in the recording. */
  index: number
  /** Raw action type (click, type, scroll, …). */
  action: string
  /** Human-readable description shown in the list. */
  description: string
  /** Current execution status. */
  status: ReplayStepStatus
  /** Self-heal strategy applied when the step was recovered. */
  recoveryStrategy?: string
  /** Error message when the step failed. */
  error?: string
  /** How long the step took to execute, in ms. */
  durationMs: number
  /** Number of retries the executor needed. */
  retries: number
}

/** Live replay snapshot pushed each tick and returned by control calls. */
export interface ReplayStatus {
  /** Id of the active replay run, or null when nothing is loaded. */
  sessionId: string | null
  /** Id of the recording being replayed, or null. */
  recordingId: string | null
  /** Optional human label for the recording (task description). */
  recordingLabel: string | null
  state: ReplayState
  speed: ReplaySpeed
  /** Index of the step currently/last executed, or -1 before any run. */
  currentStep: number
  totalSteps: number
  /** Completed fraction in [0, 1]. */
  progress: number
  /** Active replay time in ms (paused spans excluded). */
  elapsedMs: number
  /** Estimated time left in ms based on observed step durations. */
  estimatedRemainingMs: number
  /** True while the latest step is being self-healed (orange banner). */
  recovering: boolean
  /** Strategy name shown alongside the recovering banner. */
  recoveryStrategy?: string
  /** Full step list (kept small; recordings are bounded). */
  steps: ReplayStep[]
}

/** Per-step detail in the completion report. */
export interface ReplayStepReport {
  index: number
  action: string
  status: ReplayStepStatus
  durationMs: number
  retries: number
  recoveryStrategy?: string
  error?: string
}

/** Overall replay quality report shown when a run finishes. */
export interface ReplayReport {
  recordingId: string
  status: 'completed' | 'partial' | 'failed' | 'aborted'
  totalSteps: number
  successCount: number
  recoveredCount: number
  failedCount: number
  skippedCount: number
  /** Quality score in [0, 100]. */
  qualityScore: number
  totalDurationMs: number
  avgStepDurationMs: number
  steps: ReplayStepReport[]
  /** ISO timestamp the report was produced. */
  completedAt: string
}

/** The idle status snapshot (nothing loaded). */
export const IDLE_REPLAY_STATUS: ReplayStatus = {
  sessionId: null,
  recordingId: null,
  recordingLabel: null,
  state: 'idle',
  speed: DEFAULT_REPLAY_SPEED,
  currentStep: -1,
  totalSteps: 0,
  progress: 0,
  elapsedMs: 0,
  estimatedRemainingMs: 0,
  recovering: false,
  steps: [],
}

/** Clamp any numeric input to the nearest supported speed (default 1x). */
export function coerceReplaySpeed(input: unknown): ReplaySpeed {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return DEFAULT_REPLAY_SPEED
  }
  return REPLAY_SPEEDS.find(s => s === input) ?? DEFAULT_REPLAY_SPEED
}

/** Completed fraction in [0, 1] given how many steps have finished. */
export function computeProgress(
  completedSteps: number,
  totalSteps: number,
): number {
  if (totalSteps <= 0) return 0
  const clamped = Math.max(0, Math.min(completedSteps, totalSteps))
  return clamped / totalSteps
}

/**
 * Estimate remaining time (ms) from the steps left and the average observed
 * duration of completed steps, falling back to the configured pacing.
 */
export function estimateRemainingMs(
  completedSteps: number,
  totalSteps: number,
  observedDurations: number[],
  fallbackStepMs: number,
): number {
  const remaining = Math.max(0, totalSteps - completedSteps)
  if (remaining === 0) return 0
  const avg =
    observedDurations.length > 0
      ? observedDurations.reduce((sum, d) => sum + d, 0) /
        observedDurations.length
      : fallbackStepMs
  return Math.round(remaining * Math.max(avg, 0))
}

/**
 * Quality score in [0, 100]. Mirrors the AdaptiveReplayEngine weighting:
 * success = full credit, recovery is lightly penalized, skips count little,
 * outright failures score zero. Partial runs are scaled by coverage.
 */
export function computeQualityScore(input: {
  successCount: number
  recoveredCount: number
  skippedCount: number
  executedCount: number
  totalSteps: number
}): number {
  const {
    successCount,
    recoveredCount,
    skippedCount,
    executedCount,
    totalSteps,
  } = input
  if (totalSteps <= 0) return 0
  const weighted = successCount * 100 + recoveredCount * 80 + skippedCount * 20
  const coverage = Math.min(executedCount, totalSteps) / totalSteps
  return Math.max(
    0,
    Math.min(100, Math.round((weighted / totalSteps) * coverage)),
  )
}

/** A short, readable description for a recorded action. */
export function describeAction(action: string, detail?: string): string {
  const trimmed = detail?.trim()
  if (trimmed) return `${action} · ${trimmed}`
  return action
}

/** Pacing for a single step in ms after the speed multiplier is applied. */
export function stepDelayForSpeed(
  baseStepDelayMs: number,
  speed: ReplaySpeed,
): number {
  if (speed <= 0) return baseStepDelayMs
  return Math.max(0, Math.round(baseStepDelayMs / speed))
}
