/**
 * Replay Engine — Deterministically re-executes recorded actions.
 *
 * Supports two replay modes:
 * 1. Direct: Replays exact coordinates/text without AI (fastest, fragile to UI changes)
 * 2. Adaptive: Uses element context to re-locate targets (resilient, slightly slower)
 *
 * The engine outputs actions in the same format as BATCH_ACTION_ITEM_SCHEMA
 * so they can be dispatched directly via computer-use-mcp's dispatchAction.
 *
 * Reference: packages/@ant/computer-use-mcp/src/toolCalls.ts — dispatchAction interface
 * Reference: OpenAdapt/legacy/openadapt/strategies/ — replay strategy patterns
 */

import type { RawActionEvent, RecordingSession } from './types.js'
import type { VisualMatcherOptions } from './visualMatcher.js'
import { VisualMatcher } from './visualMatcher.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single action to be dispatched (matches BATCH_ACTION_ITEM_SCHEMA format). */
export interface DispatchableAction {
  action: string
  coordinate?: [number, number]
  start_coordinate?: [number, number]
  text?: string
  scroll_direction?: string
  scroll_amount?: number
  duration?: number
  repeat?: number
}

/** Interface for executing actions on the host system. */
export interface ActionExecutor {
  /** Execute a single action (same interface as dispatchAction). */
  execute(action: DispatchableAction): Promise<ExecutionResult>
  /** Take a screenshot for verification. */
  screenshot(): Promise<string>
}

export interface ExecutionResult {
  success: boolean
  error?: string
  screenshot?: string
}

/** Replay mode configuration. */
export type ReplayMode = 'direct' | 'adaptive'

export interface ReplayOptions {
  /** Replay mode (default: 'direct'). */
  mode?: ReplayMode
  /** Delay between actions in ms (default: 100). */
  delayBetweenActions?: number
  /** Whether to verify each step with a screenshot (default: false). */
  verifySteps?: boolean
  /** Maximum retries for a failed action in adaptive mode (default: 2). */
  maxRetries?: number
  /** Abort signal to cancel replay. */
  signal?: AbortSignal
  /** Speed multiplier (1.0 = recorded speed, 0.5 = half speed, 2.0 = double speed). */
  speedMultiplier?: number
  /** Visual matcher options for adaptive mode (Level 1-4 fallback chain). */
  visualMatcher?: VisualMatcherOptions
}

/** Progress callback during replay. */
export type ReplayProgressCallback = (progress: ReplayProgress) => void

export interface ReplayProgress {
  /** Current step index (0-based). */
  currentStep: number
  /** Total number of steps. */
  totalSteps: number
  /** Status of the current step. */
  status: 'executing' | 'completed' | 'failed' | 'retrying' | 'skipped'
  /** Description of the current action. */
  description: string
  /** Error message if status is 'failed'. */
  error?: string
}

export interface ReplayResult {
  /** Overall replay status. */
  status: 'completed' | 'failed' | 'aborted'
  /** Number of steps successfully executed. */
  stepsCompleted: number
  /** Total steps in the recording. */
  totalSteps: number
  /** Errors encountered during replay. */
  errors: Array<{ step: number; action: string; error: string }>
  /** Duration of replay in milliseconds. */
  durationMs: number
}

// ─── Replay Engine ────────────────────────────────────────────────────────────

export class ReplayEngine {
  private executor: ActionExecutor
  private options: Required<Omit<ReplayOptions, 'signal' | 'visualMatcher'>> & {
    signal?: AbortSignal
    visualMatcher?: VisualMatcherOptions
  }
  private _visualMatcher: VisualMatcher | null = null

  constructor(executor: ActionExecutor, options?: ReplayOptions) {
    this.executor = executor
    this.options = {
      mode: options?.mode ?? 'direct',
      delayBetweenActions: options?.delayBetweenActions ?? 100,
      verifySteps: options?.verifySteps ?? false,
      maxRetries: options?.maxRetries ?? 2,
      speedMultiplier: options?.speedMultiplier ?? 1.0,
      signal: options?.signal,
      visualMatcher: options?.visualMatcher,
    }

    // Initialize visual matcher for adaptive mode
    if (this.options.mode === 'adaptive') {
      this._visualMatcher = new VisualMatcher(this.options.visualMatcher)
    }
  }

  /** Access the visual matcher (available in adaptive mode). */
  get visualMatcher(): VisualMatcher | null {
    return this._visualMatcher
  }

  /**
   * Replay a recorded session.
   */
  async replay(
    session: RecordingSession,
    onProgress?: ReplayProgressCallback,
  ): Promise<ReplayResult> {
    return this.replayEvents(session.events, onProgress)
  }

  /**
   * Replay a specific subset of events.
   */
  async replayEvents(
    events: readonly RawActionEvent[],
    onProgress?: ReplayProgressCallback,
  ): Promise<ReplayResult> {
    const startTime = Date.now()
    const errors: Array<{ step: number; action: string; error: string }> = []
    let stepsCompleted = 0

    for (let i = 0; i < events.length; i++) {
      if (this.options.signal?.aborted) {
        return {
          status: 'aborted',
          stepsCompleted,
          totalSteps: events.length,
          errors,
          durationMs: Date.now() - startTime,
        }
      }

      const event = events[i]!
      const dispatchable = this.toDispatchable(event)

      onProgress?.({
        currentStep: i,
        totalSteps: events.length,
        status: 'executing',
        description: `${event.action}${event.text ? `: ${event.text.slice(0, 30)}` : ''}`,
      })

      const result = await this.executeWithRetry(dispatchable, i, event)

      if (result.success) {
        stepsCompleted++
        onProgress?.({
          currentStep: i,
          totalSteps: events.length,
          status: 'completed',
          description: `${event.action} completed`,
        })
      } else {
        errors.push({
          step: i,
          action: event.action,
          error: result.error ?? 'Unknown error',
        })
        onProgress?.({
          currentStep: i,
          totalSteps: events.length,
          status: 'failed',
          description: `${event.action} failed`,
          error: result.error,
        })
      }

      // Apply inter-action delay
      await this.applyDelay(events, i)
    }

    return {
      status: errors.length === 0 ? 'completed' : 'failed',
      stepsCompleted,
      totalSteps: events.length,
      errors,
      durationMs: Date.now() - startTime,
    }
  }

  /**
   * Convert a RawActionEvent to a BATCH_ACTION_ITEM_SCHEMA-compatible object.
   */
  toDispatchable(event: RawActionEvent): DispatchableAction {
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

  private async executeWithRetry(
    action: DispatchableAction,
    stepIndex: number,
    originalEvent: RawActionEvent,
  ): Promise<ExecutionResult> {
    let lastError: string | undefined
    const maxAttempts =
      this.options.mode === 'adaptive' ? this.options.maxRetries + 1 : 1

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const actionToExecute =
        attempt > 0 && this.options.mode === 'adaptive'
          ? await this.adaptAction(action, originalEvent)
          : action

      const result = await this.executor.execute(actionToExecute)
      if (result.success) return result
      lastError = result.error

      // In adaptive mode, verify and potentially adjust
      if (this.options.mode === 'adaptive' && attempt < maxAttempts - 1) {
        await this.delay(200)
      }
    }

    return { success: false, error: lastError }
  }

  /**
   * Adapt an action based on the cascading visual matcher strategy chain.
   *
   * Priority (from VisualMatcher):
   *   Level 1: Accessibility (accessible_name + role)
   *   Level 2: Relative coordinates (proportional positioning)
   *   Level 3: Visual template matching (screenshot comparison)
   *   Level 4: Claude Vision (LLM-based grounding)
   */
  private async adaptAction(
    _action: DispatchableAction,
    originalEvent: RawActionEvent,
  ): Promise<DispatchableAction> {
    if (this._visualMatcher) {
      const result = await this._visualMatcher.locate({
        event: originalEvent,
        originalCoordinate: _action.coordinate,
        elementContext: originalEvent.element_context,
        windowContext: originalEvent.window_context,
        recordedScreenshot: originalEvent.screenshot_before ?? undefined,
      })

      if (result.found && result.coordinate) {
        return { ..._action, coordinate: result.coordinate }
      }
    }

    // Legacy fallback: use bounding_box center directly
    const ctx = originalEvent.element_context
    if (ctx?.bounding_box) {
      const [x1, y1, x2, y2] = ctx.bounding_box
      const centerX = Math.round((x1 + x2) / 2)
      const centerY = Math.round((y1 + y2) / 2)
      return { ..._action, coordinate: [centerX, centerY] }
    }

    return { ..._action }
  }

  private async applyDelay(
    events: readonly RawActionEvent[],
    currentIndex: number,
  ): Promise<void> {
    if (currentIndex >= events.length - 1) return

    const currentEvent = events[currentIndex]!
    const nextEvent = events[currentIndex + 1]!

    // Calculate delay based on recorded timing and speed multiplier
    const recordedGap = nextEvent.timestamp - currentEvent.timestamp
    const baseDelay = Math.max(
      this.options.delayBetweenActions,
      recordedGap / this.options.speedMultiplier,
    )

    // Cap the delay at 5 seconds (handles long pauses in recordings)
    const cappedDelay = Math.min(baseDelay, 5000)
    await this.delay(cappedDelay)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
