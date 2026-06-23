/**
 * NexaWork Automation Scheduler
 * =============================
 * Evaluates active automations on a fixed tick, executes the ones that are due,
 * records each run to the persistent DB, advances `nextRun`/`lastRun`, and marks
 * one-shot (or expired) automations as completed. A change callback lets the IPC
 * layer push live updates to the renderer so lists refresh in real time.
 *
 * The execution side-effect is injected (`executor`) and the clock is a
 * parameter on `tick`, so the whole scheduler is deterministic under test
 * without real timers or network access.
 */
import type { AutomationInfo, AutomationRun } from '../../shared/ipc-channels'
import type { Database } from './database'
import {
  computeNextRun,
  isWithinValidRange,
  parseSchedule,
} from '../../shared/schedule'

export type AutomationExecutor = (
  automation: AutomationInfo,
) => Promise<{ output?: string; error?: string }>

export interface SchedulerOptions {
  executor: AutomationExecutor
  onChange?: () => void
  /** Tick cadence in ms (production); ignored by manual `tick`. */
  intervalMs?: number
}

let runCounter = 0
function generateRunId(): string {
  return `run-${Date.now()}-${++runCounter}`
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = new Set<string>()

  constructor(
    private readonly db: Database,
    private readonly options: SchedulerOptions,
  ) {}

  start(): void {
    if (this.timer) return
    const interval = this.options.intervalMs ?? 30_000
    this.timer = setInterval(() => {
      void this.tick()
    }, interval)
    // Don't keep the event loop alive solely for the scheduler.
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      ;(this.timer as { unref: () => void }).unref()
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Whether `automation` should fire at `now`. */
  isDue(automation: AutomationInfo, now: Date): boolean {
    if (automation.status !== 'active') return false
    if (!automation.nextRun) return false
    if (new Date(automation.nextRun).getTime() > now.getTime()) return false
    return isWithinValidRange(automation.validFrom, automation.validTo, now)
  }

  /**
   * Evaluate all active automations and execute the due ones.
   * Returns the ids that were executed during this tick.
   */
  async tick(now: Date = new Date()): Promise<string[]> {
    const executed: string[] = []
    const active = this.db.listAutomations('active')
    for (const automation of active) {
      if (!this.isDue(automation, now)) continue
      if (this.running.has(automation.id)) continue
      await this.execute(automation, now)
      executed.push(automation.id)
    }
    return executed
  }

  /** Execute a single automation immediately, ignoring the schedule timing. */
  async runNow(
    id: string,
    now: Date = new Date(),
  ): Promise<AutomationRun | null> {
    const automation = this.db.getAutomation(id)
    if (!automation) return null
    return this.execute(automation, now)
  }

  private async execute(
    automation: AutomationInfo,
    now: Date,
  ): Promise<AutomationRun> {
    this.running.add(automation.id)
    const run: AutomationRun = {
      id: generateRunId(),
      automationId: automation.id,
      status: 'running',
      startedAt: now.toISOString(),
    }
    this.db.insertRun(run)
    this.emitChange()

    let result: { output?: string; error?: string }
    try {
      result = await this.options.executor(automation)
    } catch (err: unknown) {
      result = { error: err instanceof Error ? err.message : String(err) }
    }

    const completedAt = new Date().toISOString()
    const succeeded = !result.error
    this.db.updateRun(run.id, {
      status: succeeded ? 'success' : 'failure',
      completedAt,
      output: result.output,
      error: result.error,
    })

    // Advance schedule.
    const config = parseSchedule(automation.cron)
    const next = config ? computeNextRun(config, now) : null
    const expired =
      next != null &&
      !isWithinValidRange(automation.validFrom, automation.validTo, next)
    const isOnce = config?.type === 'once'
    const becomesCompleted = !next || isOnce || expired

    this.db.updateAutomation(automation.id, {
      lastRun: completedAt,
      lastRunStatus: succeeded ? 'success' : 'failure',
      nextRun: becomesCompleted ? undefined : next?.toISOString(),
      status: becomesCompleted ? 'completed' : 'active',
    })

    this.running.delete(automation.id)
    this.emitChange()

    return {
      ...run,
      status: succeeded ? 'success' : 'failure',
      completedAt,
      output: result.output,
      error: result.error,
    }
  }

  private emitChange(): void {
    this.options.onChange?.()
  }
}
