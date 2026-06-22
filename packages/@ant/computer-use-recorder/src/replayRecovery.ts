/**
 * Adaptive Replay Recovery — Self-healing replay with automatic failure recovery.
 *
 * When replay encounters anomalies, this module:
 * 1. Classifies the failure type
 * 2. Applies the appropriate recovery strategy
 * 3. Resumes from the last successful checkpoint
 * 4. Generates a quality report for the replay session
 *
 * Reference:
 * - packages/workflow-engine/src/engine/journal.ts — Journal checkpoint mechanism
 * - packages/workflow-engine/src/engine/hooks.ts — agent() retry logic
 * - packages/workflow-engine/src/ports.ts — TaskRegistrar pendingAction (skip/retry)
 * - OpenAdapt/legacy/openadapt/strategies/stateful.py — Stateful replay
 */

import type { RawActionEvent } from './types.js'
import type {
  ActionExecutor,
  DispatchableAction,
  ExecutionResult,
  ReplayProgressCallback,
} from './replayEngine.js'
import type { VisualMatcherOptions } from './visualMatcher.js'
import { VisualMatcher } from './visualMatcher.js'

// ─── Failure Types ────────────────────────────────────────────────────────────

/** Classification of replay failures. */
export type FailureType =
  | 'element_not_found'
  | 'wrong_state'
  | 'timeout'
  | 'unexpected_dialog'
  | 'execution_error'

/** A detected verification failure. */
export interface VerificationFailure {
  /** Type of failure. */
  type: FailureType
  /** Step index where failure occurred. */
  stepIndex: number
  /** The action that failed. */
  action: DispatchableAction
  /** Original event for context. */
  originalEvent: RawActionEvent
  /** Error message from executor. */
  errorMessage: string
  /** Screenshot at failure time (if available). */
  screenshot?: string
}

// ─── Recovery Strategy ────────────────────────────────────────────────────────

/** Result of a recovery attempt. */
export interface RecoveryResult {
  /** Whether recovery was successful. */
  success: boolean
  /** Strategy that was applied. */
  strategy: string
  /** Modified action (if recovery produced one). */
  recoveredAction?: DispatchableAction
  /** Additional actions to execute before retrying (e.g., close dialog). */
  preActions?: DispatchableAction[]
  /** Reason if recovery failed. */
  reason?: string
}

/** Interface for analyzing screen state (injectable, for Claude Vision integration). */
export interface StateAnalyzer {
  /** Analyze a screenshot and describe current state. */
  analyzeState(
    screenshot: string,
    expectedState: string,
  ): Promise<StateAnalysisResult>
  /** Detect dialogs/popups in screenshot. */
  detectDialog(screenshot: string): Promise<DialogDetectionResult>
}

export interface StateAnalysisResult {
  /** Description of current state. */
  currentState: string
  /** Suggested recovery actions. */
  suggestedActions: DispatchableAction[]
  /** Confidence (0-1). */
  confidence: number
}

export interface DialogDetectionResult {
  /** Whether a dialog was detected. */
  hasDialog: boolean
  /** Dialog type (alert, confirm, prompt, custom). */
  dialogType?: 'alert' | 'confirm' | 'prompt' | 'custom'
  /** Suggested action to dismiss. */
  dismissAction?: DispatchableAction
}

// ─── Journal (Checkpoint) ─────────────────────────────────────────────────────

/** A checkpoint entry in the replay journal. */
export interface ReplayJournalEntry {
  /** Step index. */
  stepIndex: number
  /** Action executed. */
  action: DispatchableAction
  /** Execution result. */
  result: 'success' | 'recovered' | 'failed' | 'skipped'
  /** Recovery strategy used (if any). */
  recoveryStrategy?: string
  /** Timestamp. */
  timestamp: number
  /** Duration in ms. */
  durationMs: number
}

/** Replay journal for checkpoint/resume. */
export interface ReplayJournal {
  /** All entries. */
  entries: ReplayJournalEntry[]
  /** Get the last successful step index. */
  lastSuccessIndex(): number
  /** Append an entry. */
  append(entry: ReplayJournalEntry): void
  /** Clear journal (for new run). */
  clear(): void
}

// ─── Replay Report ────────────────────────────────────────────────────────────

/** Per-step execution detail. */
export interface StepReport {
  /** Step index. */
  stepIndex: number
  /** Action type. */
  action: string
  /** Status. */
  status: 'success' | 'recovered' | 'failed' | 'skipped'
  /** Execution duration ms. */
  durationMs: number
  /** Number of retry attempts. */
  retries: number
  /** Recovery strategy used. */
  recoveryStrategy?: string
  /** Error if failed. */
  error?: string
}

/** Overall replay quality report. */
export interface ReplayReport {
  /** Session ID. */
  sessionId: string
  /** Overall status. */
  status: 'completed' | 'partial' | 'failed' | 'aborted'
  /** Total steps. */
  totalSteps: number
  /** Steps that succeeded. */
  successCount: number
  /** Steps recovered. */
  recoveredCount: number
  /** Steps that failed. */
  failedCount: number
  /** Steps skipped. */
  skippedCount: number
  /** Quality score (0-100). */
  qualityScore: number
  /** Total duration ms. */
  totalDurationMs: number
  /** Average step duration ms. */
  avgStepDurationMs: number
  /** Per-step details. */
  steps: StepReport[]
  /** Timestamp. */
  completedAt: string
}

// ─── Recovery Options ─────────────────────────────────────────────────────────

export interface RecoveryOptions {
  /** Maximum total retries per step (default: 3). */
  maxRetriesPerStep?: number
  /** Timeout multiplier on retry (default: 1.5). */
  timeoutMultiplier?: number
  /** Base timeout for waiting (ms, default: 2000). */
  baseTimeout?: number
  /** Maximum timeout cap (ms, default: 10000). */
  maxTimeout?: number
  /** Whether to attempt page refresh on timeout (default: true). */
  allowRefresh?: boolean
  /** Whether to auto-dismiss detected dialogs (default: true). */
  autoDismissDialogs?: boolean
  /** Strategy for unrecoverable failures (default: 'skip'). */
  onUnrecoverable?: 'skip' | 'abort' | 'pause'
  /** Visual matcher for re-locating elements. */
  visualMatcher?: VisualMatcherOptions
  /** State analyzer for AI-powered recovery. */
  stateAnalyzer?: StateAnalyzer
}

// ─── Recovery Strategy Implementation ─────────────────────────────────────────

/**
 * Classify a failure based on the error message and context.
 */
export function classifyFailure(
  error: string,
  _event: RawActionEvent,
): FailureType {
  const errorLower = error.toLowerCase()

  if (
    errorLower.includes('element not found') ||
    errorLower.includes('no element') ||
    errorLower.includes('target not found') ||
    errorLower.includes('could not locate')
  ) {
    return 'element_not_found'
  }

  if (
    errorLower.includes('timeout') ||
    errorLower.includes('timed out') ||
    errorLower.includes('deadline exceeded')
  ) {
    return 'timeout'
  }

  if (
    errorLower.includes('dialog') ||
    errorLower.includes('popup') ||
    errorLower.includes('alert') ||
    errorLower.includes('modal') ||
    errorLower.includes('confirm')
  ) {
    return 'unexpected_dialog'
  }

  if (
    errorLower.includes('wrong state') ||
    errorLower.includes('unexpected state') ||
    errorLower.includes('not ready') ||
    errorLower.includes('disabled') ||
    errorLower.includes('not visible')
  ) {
    return 'wrong_state'
  }

  return 'execution_error'
}

/**
 * Apply recovery strategy based on failure type.
 */
export async function applyRecovery(
  failure: VerificationFailure,
  executor: ActionExecutor,
  options: Required<RecoveryOptions>,
  visualMatcher: VisualMatcher | null,
): Promise<RecoveryResult> {
  switch (failure.type) {
    case 'element_not_found':
      return recoverElementNotFound(failure, executor, visualMatcher)
    case 'timeout':
      return recoverTimeout(failure, executor, options)
    case 'unexpected_dialog':
      return recoverUnexpectedDialog(failure, executor, options)
    case 'wrong_state':
      return recoverWrongState(failure, executor, options)
    case 'execution_error':
      return {
        success: false,
        strategy: 'none',
        reason: 'Unrecoverable execution error',
      }
  }
}

/**
 * Recovery: element_not_found
 * Strategy chain: Visual Matcher → wait & retry → abort
 */
async function recoverElementNotFound(
  failure: VerificationFailure,
  executor: ActionExecutor,
  visualMatcher: VisualMatcher | null,
): Promise<RecoveryResult> {
  // Strategy 1: Use visual matcher to relocate element
  if (visualMatcher) {
    const result = await visualMatcher.locate({
      event: failure.originalEvent,
      originalCoordinate: failure.action.coordinate,
      elementContext: failure.originalEvent.element_context,
      windowContext: failure.originalEvent.window_context,
      recordedScreenshot: failure.originalEvent.screenshot_before ?? undefined,
    })

    if (result.found && result.coordinate) {
      return {
        success: true,
        strategy: 'visual_matcher',
        recoveredAction: { ...failure.action, coordinate: result.coordinate },
      }
    }
  }

  // Strategy 2: Wait briefly and take screenshot for verification
  await delay(1000)
  const screenshot = await executor.screenshot()
  if (screenshot) {
    // Element might have appeared after wait
    return {
      success: true,
      strategy: 'wait_and_retry',
      recoveredAction: failure.action,
    }
  }

  return {
    success: false,
    strategy: 'visual_matcher',
    reason: 'Element not locatable',
  }
}

/**
 * Recovery: timeout
 * Strategy chain: increase wait → refresh → abort
 */
async function recoverTimeout(
  failure: VerificationFailure,
  executor: ActionExecutor,
  options: Required<RecoveryOptions>,
): Promise<RecoveryResult> {
  // Strategy 1: Wait longer
  const extendedTimeout = Math.min(
    options.baseTimeout * options.timeoutMultiplier,
    options.maxTimeout,
  )
  await delay(extendedTimeout)

  // Try executing again — the element may have loaded
  const retryResult = await executor.execute(failure.action)
  if (retryResult.success) {
    return { success: true, strategy: 'extended_wait' }
  }

  // Strategy 2: Refresh the page (for browser context)
  if (options.allowRefresh) {
    const refreshAction: DispatchableAction = { action: 'key', text: 'F5' }
    await executor.execute(refreshAction)
    await delay(options.baseTimeout)

    return {
      success: true,
      strategy: 'refresh_and_retry',
      preActions: [refreshAction],
      recoveredAction: failure.action,
    }
  }

  return {
    success: false,
    strategy: 'extended_wait',
    reason: 'Timeout persists after retry',
  }
}

/**
 * Recovery: unexpected_dialog
 * Strategy: detect dialog type → dismiss → continue
 */
async function recoverUnexpectedDialog(
  failure: VerificationFailure,
  executor: ActionExecutor,
  options: Required<RecoveryOptions>,
): Promise<RecoveryResult> {
  if (!options.autoDismissDialogs) {
    return { success: false, strategy: 'none', reason: 'Auto-dismiss disabled' }
  }

  // Strategy: If we have a state analyzer, use it to detect dialog
  if (options.stateAnalyzer) {
    const screenshot = await executor.screenshot()
    if (screenshot) {
      const dialogResult = await options.stateAnalyzer.detectDialog(screenshot)
      if (dialogResult.hasDialog && dialogResult.dismissAction) {
        await executor.execute(dialogResult.dismissAction)
        await delay(300)
        return {
          success: true,
          strategy: 'ai_dialog_dismiss',
          preActions: [dialogResult.dismissAction],
          recoveredAction: failure.action,
        }
      }
    }
  }

  // Default: Try pressing Escape to dismiss
  const escapeAction: DispatchableAction = { action: 'key', text: 'Escape' }
  await executor.execute(escapeAction)
  await delay(500)

  // Try Enter for alert-type dialogs
  const enterAction: DispatchableAction = { action: 'key', text: 'Return' }
  await executor.execute(enterAction)
  await delay(300)

  return {
    success: true,
    strategy: 'dismiss_dialog',
    preActions: [escapeAction, enterAction],
    recoveredAction: failure.action,
  }
}

/**
 * Recovery: wrong_state
 * Strategy: AI analysis → generated fix actions → retry
 */
async function recoverWrongState(
  failure: VerificationFailure,
  executor: ActionExecutor,
  options: Required<RecoveryOptions>,
): Promise<RecoveryResult> {
  // Strategy 1: Use AI state analyzer
  if (options.stateAnalyzer) {
    const screenshot = await executor.screenshot()
    if (screenshot) {
      const analysis = await options.stateAnalyzer.analyzeState(
        screenshot,
        describeExpectedState(failure.originalEvent),
      )

      if (analysis.confidence > 0.6 && analysis.suggestedActions.length > 0) {
        // Execute suggested fix actions
        for (const fixAction of analysis.suggestedActions) {
          await executor.execute(fixAction)
          await delay(200)
        }

        return {
          success: true,
          strategy: 'ai_state_recovery',
          preActions: analysis.suggestedActions,
          recoveredAction: failure.action,
        }
      }
    }
  }

  // Strategy 2: Simple wait (state might transition)
  await delay(options.baseTimeout)
  return {
    success: true,
    strategy: 'wait_for_state',
    recoveredAction: failure.action,
  }
}

// ─── Adaptive Replay Engine ───────────────────────────────────────────────────

/**
 * AdaptiveReplayEngine — Self-healing replay with recovery and journaling.
 *
 * Extends the base ReplayEngine with:
 * - Failure classification and recovery
 * - Journal-based checkpointing (resume from last success)
 * - Quality reporting
 *
 * Usage:
 * ```ts
 * const engine = new AdaptiveReplayEngine(executor, {
 *   maxRetriesPerStep: 3,
 *   autoDismissDialogs: true,
 *   onUnrecoverable: 'skip',
 * })
 * const report = await engine.replayWithRecovery(session.events)
 * console.log(`Quality: ${report.qualityScore}/100`)
 * ```
 */
export class AdaptiveReplayEngine {
  private _executor: ActionExecutor
  private _options: Required<RecoveryOptions>
  private _journal: ReplayJournal
  private _visualMatcher: VisualMatcher | null = null

  constructor(executor: ActionExecutor, options: RecoveryOptions = {}) {
    this._executor = executor
    this._options = {
      maxRetriesPerStep: options.maxRetriesPerStep ?? 3,
      timeoutMultiplier: options.timeoutMultiplier ?? 1.5,
      baseTimeout: options.baseTimeout ?? 2000,
      maxTimeout: options.maxTimeout ?? 10000,
      allowRefresh: options.allowRefresh ?? true,
      autoDismissDialogs: options.autoDismissDialogs ?? true,
      onUnrecoverable: options.onUnrecoverable ?? 'skip',
      visualMatcher: options.visualMatcher ?? undefined,
      stateAnalyzer: options.stateAnalyzer ?? undefined,
    } as Required<RecoveryOptions>

    if (options.visualMatcher) {
      this._visualMatcher = new VisualMatcher(options.visualMatcher)
    }

    this._journal = createInMemoryJournal()
  }

  /** Access the replay journal. */
  get journal(): ReplayJournal {
    return this._journal
  }

  /** Access the visual matcher. */
  get visualMatcher(): VisualMatcher | null {
    return this._visualMatcher
  }

  /**
   * Replay events with self-healing recovery.
   */
  async replayWithRecovery(
    events: readonly RawActionEvent[],
    options?: {
      resumeFrom?: number
      sessionId?: string
      onProgress?: ReplayProgressCallback
      signal?: AbortSignal
    },
  ): Promise<ReplayReport> {
    const startTime = Date.now()
    const sessionId = options?.sessionId ?? `replay_${Date.now()}`
    const startIndex = options?.resumeFrom ?? 0
    const steps: StepReport[] = []

    for (let i = startIndex; i < events.length; i++) {
      if (options?.signal?.aborted) {
        return buildReport(
          sessionId,
          steps,
          events.length,
          startTime,
          'aborted',
        )
      }

      const event = events[i]!
      const dispatchable = toDispatchable(event)
      const stepStart = Date.now()

      options?.onProgress?.({
        currentStep: i,
        totalSteps: events.length,
        status: 'executing',
        description: `${event.action}${event.text ? `: ${event.text.slice(0, 30)}` : ''}`,
      })

      const stepResult = await this._executeStepWithRecovery(
        dispatchable,
        event,
        i,
      )

      const stepReport: StepReport = {
        stepIndex: i,
        action: event.action,
        status: stepResult.status,
        durationMs: Date.now() - stepStart,
        retries: stepResult.retries,
        recoveryStrategy: stepResult.recoveryStrategy,
        error: stepResult.error,
      }
      steps.push(stepReport)

      // Journal entry
      this._journal.append({
        stepIndex: i,
        action: dispatchable,
        result: stepResult.status,
        recoveryStrategy: stepResult.recoveryStrategy,
        timestamp: Date.now(),
        durationMs: stepReport.durationMs,
      })

      // Report progress
      options?.onProgress?.({
        currentStep: i,
        totalSteps: events.length,
        status:
          stepResult.status === 'success' || stepResult.status === 'recovered'
            ? 'completed'
            : stepResult.status === 'skipped'
              ? 'skipped'
              : 'failed',
        description: `${event.action} ${stepResult.status}`,
        error: stepResult.error,
      })

      // Handle unrecoverable failure
      if (
        stepResult.status === 'failed' &&
        this._options.onUnrecoverable === 'abort'
      ) {
        return buildReport(sessionId, steps, events.length, startTime, 'failed')
      }

      // Inter-step delay
      if (i < events.length - 1) {
        await delay(100)
      }
    }

    const finalStatus = steps.some(
      s => s.status === 'failed' || s.status === 'skipped',
    )
      ? 'partial'
      : 'completed'
    return buildReport(sessionId, steps, events.length, startTime, finalStatus)
  }

  /**
   * Resume from the last successful checkpoint.
   */
  async resumeFromCheckpoint(
    events: readonly RawActionEvent[],
    options?: {
      sessionId?: string
      onProgress?: ReplayProgressCallback
      signal?: AbortSignal
    },
  ): Promise<ReplayReport> {
    const resumeIndex = this._journal.lastSuccessIndex() + 1
    return this.replayWithRecovery(events, {
      ...options,
      resumeFrom: resumeIndex,
    })
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async _executeStepWithRecovery(
    action: DispatchableAction,
    event: RawActionEvent,
    stepIndex: number,
  ): Promise<{
    status: 'success' | 'recovered' | 'failed' | 'skipped'
    retries: number
    recoveryStrategy?: string
    error?: string
  }> {
    let currentAction = action
    let retries = 0

    // First attempt
    const firstResult = await this._executor.execute(currentAction)
    if (firstResult.success) {
      return { status: 'success', retries: 0 }
    }

    // Recovery loop
    while (retries < this._options.maxRetriesPerStep) {
      retries++
      const errorMsg = firstResult.error ?? 'Unknown error'
      const failureType = classifyFailure(errorMsg, event)

      const failure: VerificationFailure = {
        type: failureType,
        stepIndex,
        action: currentAction,
        originalEvent: event,
        errorMessage: errorMsg,
      }

      const recovery = await applyRecovery(
        failure,
        this._executor,
        this._options,
        this._visualMatcher,
      )

      if (recovery.success) {
        // Execute pre-actions if any
        if (recovery.preActions) {
          for (const preAction of recovery.preActions) {
            await this._executor.execute(preAction)
            await delay(200)
          }
        }

        // Retry with recovered action
        const recoveredAction = recovery.recoveredAction ?? currentAction
        const retryResult = await this._executor.execute(recoveredAction)

        if (retryResult.success) {
          return {
            status: 'recovered',
            retries,
            recoveryStrategy: recovery.strategy,
          }
        }

        currentAction = recoveredAction
      } else {
        // Recovery failed — try next attempt or give up
        if (retries >= this._options.maxRetriesPerStep) {
          break
        }
      }
    }

    // All recovery attempts exhausted
    if (this._options.onUnrecoverable === 'skip') {
      return { status: 'skipped', retries, error: firstResult.error }
    }

    return { status: 'failed', retries, error: firstResult.error }
  }
}

// ─── In-Memory Journal ────────────────────────────────────────────────────────

/** Create a simple in-memory journal. */
export function createInMemoryJournal(): ReplayJournal {
  const entries: ReplayJournalEntry[] = []

  return {
    entries,
    lastSuccessIndex(): number {
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]!
        if (entry.result === 'success' || entry.result === 'recovered') {
          return entry.stepIndex
        }
      }
      return -1
    },
    append(entry: ReplayJournalEntry): void {
      entries.push(entry)
    },
    clear(): void {
      entries.length = 0
    },
  }
}

// ─── Report Builder ───────────────────────────────────────────────────────────

function buildReport(
  sessionId: string,
  steps: StepReport[],
  totalSteps: number,
  startTime: number,
  status: ReplayReport['status'],
): ReplayReport {
  const successCount = steps.filter(s => s.status === 'success').length
  const recoveredCount = steps.filter(s => s.status === 'recovered').length
  const failedCount = steps.filter(s => s.status === 'failed').length
  const skippedCount = steps.filter(s => s.status === 'skipped').length
  const totalDurationMs = Date.now() - startTime
  const avgStepDurationMs =
    steps.length > 0
      ? Math.round(
          steps.reduce((sum, s) => sum + s.durationMs, 0) / steps.length,
        )
      : 0

  // Quality score: 100% = all success, recovery penalized slightly, failures heavily
  const qualityScore =
    totalSteps > 0
      ? Math.round(
          ((successCount * 100 + recoveredCount * 80 + skippedCount * 20) /
            totalSteps) *
            (steps.length / totalSteps),
        )
      : 0

  return {
    sessionId,
    status,
    totalSteps,
    successCount,
    recoveredCount,
    failedCount,
    skippedCount,
    qualityScore,
    totalDurationMs,
    avgStepDurationMs,
    steps,
    completedAt: new Date().toISOString(),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert RawActionEvent to DispatchableAction. */
function toDispatchable(event: RawActionEvent): DispatchableAction {
  const action: DispatchableAction = { action: event.action }
  if (event.coordinate) action.coordinate = event.coordinate
  if (event.start_coordinate) action.start_coordinate = event.start_coordinate
  if (event.text) action.text = event.text
  if (event.scroll_direction) action.scroll_direction = event.scroll_direction
  if (event.scroll_amount) action.scroll_amount = event.scroll_amount
  if (event.duration) action.duration = event.duration
  if (event.repeat) action.repeat = event.repeat
  return action
}

/** Describe expected state from event context. */
function describeExpectedState(event: RawActionEvent): string {
  const parts: string[] = []
  if (event.window_context) {
    parts.push(`App: ${event.window_context.app_name}`)
    parts.push(`Window: ${event.window_context.window_title}`)
  }
  if (event.element_context?.accessible_name) {
    parts.push(`Target element: "${event.element_context.accessible_name}"`)
  }
  if (event.element_context?.role) {
    parts.push(`Role: ${event.element_context.role}`)
  }
  parts.push(`Action: ${event.action}`)
  return parts.join(', ')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
