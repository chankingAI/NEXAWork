/**
 * NexaWork Automation Manager (N18)
 *
 * Owns scheduled automations, their run history, schedule computation and the
 * run-completion event stream pushed to the renderer.
 *
 * The protocol is shaped to map onto the backend Cron tools
 * (CronCreateTool / CronDeleteTool / CronListTool) and OperationMemory: once the
 * real QueryEngine process is wired in, `runNow` / `computeNextRun` delegate to
 * the cron scheduler while the renderer-facing contract stays unchanged. Run
 * records are kept in-memory here and will move to SQLite (see N10) without
 * touching this surface.
 */
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type {
  AutomationInfo,
  AutomationCreateInput,
  AutomationRun,
} from '../../shared/ipc-channels'
import { computeNextRun } from '../../shared/cron'

const MAX_RUNS_PER_AUTOMATION = 100
const ONE_HOUR_MS = 3_600_000

// ─── Automation Manager ───────────────────────────────────────

export type AutomationEmit = (channel: string, payload: unknown) => void

export class AutomationManager {
  private readonly automations = new Map<string, AutomationInfo>()
  private readonly runs = new Map<string, AutomationRun[]>()
  private emit: AutomationEmit | null = null
  private idCounter = 0

  constructor() {
    this.seed()
  }

  /** Wire the renderer event sink (BrowserWindow broadcast). */
  setEmit(emit: AutomationEmit | null): void {
    this.emit = emit
  }

  private nextId(prefix: string): string {
    this.idCounter += 1
    return `${prefix}-${Date.now().toString(36)}-${this.idCounter}`
  }

  list(status?: AutomationInfo['status']): AutomationInfo[] {
    const all = Array.from(this.automations.values())
    return status ? all.filter(a => a.status === status) : all
  }

  create(input: AutomationCreateInput): AutomationInfo {
    const id = `auto-${this.nextId('a')}`
    const next = computeNextRun(input.cron)
    const automation: AutomationInfo = {
      id,
      name: input.name,
      prompt: input.prompt,
      cron: input.cron,
      workspace: input.workspace,
      status: 'active',
      nextRun:
        next?.toISOString() ?? new Date(Date.now() + ONE_HOUR_MS).toISOString(),
      validFrom: input.startDate,
      validTo: input.endDate,
      connector: input.connector,
      model: input.model,
      skill: input.skill,
      expert: input.expert,
      permissionMode: input.permissionMode,
    }
    this.automations.set(id, automation)
    this.runs.set(id, [])
    return automation
  }

  update(id: string, updates: Partial<AutomationCreateInput>): boolean {
    const automation = this.automations.get(id)
    if (!automation) return false
    Object.assign(automation, updates)
    if (updates.cron) {
      automation.nextRun = computeNextRun(updates.cron)?.toISOString()
    }
    if (updates.startDate !== undefined)
      automation.validFrom = updates.startDate
    if (updates.endDate !== undefined) automation.validTo = updates.endDate
    return true
  }

  /** Pause or resume an automation; resuming recomputes the next run. */
  toggle(id: string, status: 'active' | 'paused'): boolean {
    const automation = this.automations.get(id)
    if (!automation) return false
    automation.status = status
    automation.nextRun =
      status === 'active'
        ? computeNextRun(automation.cron)?.toISOString()
        : undefined
    return true
  }

  delete(id: string): boolean {
    const existed = this.automations.delete(id)
    this.runs.delete(id)
    return existed
  }

  history(id: string, limit = 20): AutomationRun[] {
    return (this.runs.get(id) ?? []).slice(-limit).reverse()
  }

  /**
   * Execute an automation immediately, record the run, update bookkeeping and
   * broadcast a run event. Mirrors what the cron scheduler does on a real tick.
   */
  runNow(id: string): AutomationRun | undefined {
    const automation = this.automations.get(id)
    if (!automation) return undefined

    const startedAt = new Date().toISOString()
    const run: AutomationRun = {
      id: this.nextId('run'),
      automationId: id,
      status: 'success',
      startedAt,
      completedAt: new Date().toISOString(),
      output: `已执行：${automation.name}`,
    }
    const list = this.runs.get(id) ?? []
    list.push(run)
    if (list.length > MAX_RUNS_PER_AUTOMATION) list.shift()
    this.runs.set(id, list)

    automation.lastRun = run.completedAt
    automation.lastRunStatus = run.status === 'success' ? 'success' : 'failure'
    if (automation.status === 'active') {
      automation.nextRun = computeNextRun(automation.cron)?.toISOString()
    }

    this.emit?.(IPC_CHANNELS.AUTOMATION_RUN_EVENT, { automationId: id, run })
    return run
  }

  /** Test/reset hook — clears state and re-seeds demo data. */
  reset(): void {
    this.automations.clear()
    this.runs.clear()
    this.idCounter = 0
    this.seed()
  }

  /** Seed demonstrative automations (scheduled + completed). */
  private seed(): void {
    const now = Date.now()
    const iso = (ms: number) => new Date(ms).toISOString()

    const scheduled: AutomationInfo[] = [
      {
        id: 'auto-seed-daily-report',
        name: '每日销售报表',
        prompt: '汇总昨日销售数据并生成报表',
        cron: '0 8 * * *',
        workspace: '产品开发',
        status: 'active',
        nextRun: computeNextRun('0 8 * * *')?.toISOString(),
        validFrom: iso(now - 7 * 24 * ONE_HOUR_MS),
        lastRun: iso(now - 16 * ONE_HOUR_MS),
        lastRunStatus: 'success',
      },
      {
        id: 'auto-seed-weekly',
        name: '周报自动生成',
        prompt: '生成本周工作周报',
        cron: '0 9 * * 1',
        workspace: '市场营销',
        status: 'paused',
      },
    ]

    const completed: AutomationInfo[] = [
      {
        id: 'auto-seed-backup',
        name: '数据库备份',
        prompt: '执行数据库全量备份',
        cron: '0 2 * * *',
        workspace: '运维',
        status: 'completed',
        lastRun: iso(now - 3 * ONE_HOUR_MS),
        lastRunStatus: 'failure',
      },
      {
        id: 'auto-seed-translate',
        name: '文档翻译',
        prompt: '将技术文档翻译为英文',
        cron: '30 18 * * 5',
        workspace: '产品开发',
        status: 'completed',
        lastRun: iso(now - 26 * ONE_HOUR_MS),
        lastRunStatus: 'success',
      },
    ]

    for (const a of [...scheduled, ...completed]) {
      this.automations.set(a.id, a)
      this.runs.set(a.id, [
        {
          id: `${a.id}-run-1`,
          automationId: a.id,
          status: a.lastRunStatus === 'failure' ? 'failure' : 'success',
          startedAt: a.lastRun ?? iso(now),
          completedAt: a.lastRun ?? iso(now),
          output:
            a.lastRunStatus === 'failure' ? undefined : `已执行：${a.name}`,
          error: a.lastRunStatus === 'failure' ? '连接超时' : undefined,
        },
      ])
    }
  }
}

/** Shared singleton used by the IPC handlers. */
export const automationManager = new AutomationManager()
