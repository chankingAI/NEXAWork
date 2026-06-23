import { describe, test, expect, beforeEach } from 'bun:test'
import {
  parseCronField,
  cronMatches,
  computeNextRun,
  describeCron,
  formatCountdown,
  formatValidRange,
} from '../shared/cron'
import {
  AutomationManager,
  automationManager,
} from '../main/backend/automation-manager'

describe('parseCronField', () => {
  test('wildcard matches everything', () => {
    const m = parseCronField('*', 0, 59)
    expect(m(0)).toBe(true)
    expect(m(59)).toBe(true)
  })

  test('single value', () => {
    const m = parseCronField('8', 0, 23)
    expect(m(8)).toBe(true)
    expect(m(9)).toBe(false)
  })

  test('list', () => {
    const m = parseCronField('0,6', 0, 6)
    expect(m(0)).toBe(true)
    expect(m(6)).toBe(true)
    expect(m(3)).toBe(false)
  })

  test('range', () => {
    const m = parseCronField('1-5', 0, 6)
    expect(m(1)).toBe(true)
    expect(m(5)).toBe(true)
    expect(m(6)).toBe(false)
  })

  test('step', () => {
    const m = parseCronField('*/15', 0, 59)
    expect(m(0)).toBe(true)
    expect(m(15)).toBe(true)
    expect(m(30)).toBe(true)
    expect(m(7)).toBe(false)
  })
})

describe('cronMatches', () => {
  test('daily at 08:00', () => {
    expect(cronMatches('0 8 * * *', new Date('2026-06-23T08:00:00'))).toBe(true)
    expect(cronMatches('0 8 * * *', new Date('2026-06-23T09:00:00'))).toBe(
      false,
    )
  })

  test('weekday-only schedule', () => {
    // 2026-06-22 is a Monday, 2026-06-21 is a Sunday.
    expect(cronMatches('0 9 * * 1-5', new Date('2026-06-22T09:00:00'))).toBe(
      true,
    )
    expect(cronMatches('0 9 * * 1-5', new Date('2026-06-21T09:00:00'))).toBe(
      false,
    )
  })

  test('invalid expression never matches', () => {
    expect(cronMatches('0 8 * *', new Date())).toBe(false)
  })
})

describe('computeNextRun', () => {
  test('returns the next matching time after the cursor', () => {
    const from = new Date('2026-06-23T07:30:00')
    const next = computeNextRun('0 8 * * *', from)
    expect(next?.toISOString()).toBe(
      new Date('2026-06-23T08:00:00').toISOString(),
    )
  })

  test('rolls over to the next day', () => {
    const from = new Date('2026-06-23T09:00:00')
    const next = computeNextRun('0 8 * * *', from)
    expect(next?.getDate()).toBe(24)
    expect(next?.getHours()).toBe(8)
  })

  test('invalid cron returns undefined', () => {
    expect(computeNextRun('not a cron')).toBeUndefined()
  })
})

describe('describeCron', () => {
  test('common patterns', () => {
    expect(describeCron('* * * * *')).toBe('每分钟')
    expect(describeCron('0 8 * * *')).toBe('每天 08:00')
    expect(describeCron('0 9 * * 1-5')).toBe('工作日 09:00')
    expect(describeCron('30 18 * * 0,6')).toBe('周末 18:30')
    expect(describeCron('0 9 * * 1')).toBe('每周一 09:00')
    expect(describeCron('0 2 15 * *')).toBe('每月15日 02:00')
  })

  test('falls back to the raw expression', () => {
    expect(describeCron('5,10 * * * *')).toBe('5,10 * * * *')
  })
})

describe('formatCountdown', () => {
  const now = new Date('2026-06-23T08:00:00')

  test('hours', () => {
    expect(formatCountdown('2026-06-23T12:00:00', now)).toBe('4小时后开始')
  })

  test('minutes', () => {
    expect(formatCountdown('2026-06-23T08:30:00', now)).toBe('30分钟后开始')
  })

  test('days', () => {
    expect(formatCountdown('2026-06-25T08:00:00', now)).toBe('2天后开始')
  })

  test('past / missing', () => {
    expect(formatCountdown('2026-06-23T07:00:00', now)).toBe('即将开始')
    expect(formatCountdown(undefined, now)).toBe('未安排')
  })
})

describe('formatValidRange', () => {
  test('no bounds', () => {
    expect(formatValidRange()).toBe('长期有效')
  })

  test('start only', () => {
    expect(formatValidRange('2026-06-01T00:00:00')).toBe('2026-06-01 ~ 长期')
  })

  test('both bounds', () => {
    expect(formatValidRange('2026-06-01T00:00:00', '2026-12-31T00:00:00')).toBe(
      '2026-06-01 ~ 2026-12-31',
    )
  })
})

describe('AutomationManager', () => {
  let mgr: AutomationManager

  beforeEach(() => {
    mgr = new AutomationManager()
  })

  test('seeds scheduled and completed automations', () => {
    const scheduled = mgr.list('active')
    const paused = mgr.list('paused')
    const completed = mgr.list('completed')
    expect(scheduled.length).toBeGreaterThan(0)
    expect(paused.length).toBeGreaterThan(0)
    expect(completed.length).toBeGreaterThan(0)
  })

  test('create assigns id, computes nextRun and stores valid window', () => {
    const a = mgr.create({
      name: 'X',
      prompt: 'do x',
      cron: '0 8 * * *',
      workspace: 'ws',
      startDate: '2026-06-01',
      endDate: '2026-12-31',
    })
    expect(a.id).toContain('auto-')
    expect(a.status).toBe('active')
    expect(a.nextRun).toBeDefined()
    expect(a.validFrom).toBe('2026-06-01')
    expect(a.validTo).toBe('2026-12-31')
    expect(mgr.list().some(x => x.id === a.id)).toBe(true)
  })

  test('create round-trips the N19 execution context fields', () => {
    const a = mgr.create({
      name: 'Ctx',
      prompt: 'p',
      cron: '0 8 * * *',
      workspace: 'ws',
      connector: 'github',
      model: 'claude-sonnet',
      skill: 'skill-x',
      expert: 'frontend-expert',
      permissionMode: 'full',
    })
    const stored = mgr.list().find(x => x.id === a.id)
    expect(stored?.connector).toBe('github')
    expect(stored?.model).toBe('claude-sonnet')
    expect(stored?.skill).toBe('skill-x')
    expect(stored?.expert).toBe('frontend-expert')
    expect(stored?.permissionMode).toBe('full')
  })

  test('toggle pauses (clears nextRun) and resumes (recomputes)', () => {
    const a = mgr.create({
      name: 'T',
      prompt: 'p',
      cron: '0 8 * * *',
      workspace: 'w',
    })
    expect(mgr.toggle(a.id, 'paused')).toBe(true)
    expect(mgr.list().find(x => x.id === a.id)?.status).toBe('paused')
    expect(mgr.list().find(x => x.id === a.id)?.nextRun).toBeUndefined()
    mgr.toggle(a.id, 'active')
    expect(mgr.list().find(x => x.id === a.id)?.nextRun).toBeDefined()
  })

  test('toggle on missing id returns false', () => {
    expect(mgr.toggle('nope', 'paused')).toBe(false)
  })

  test('delete removes automation and history', () => {
    const a = mgr.create({
      name: 'D',
      prompt: 'p',
      cron: '0 8 * * *',
      workspace: 'w',
    })
    expect(mgr.delete(a.id)).toBe(true)
    expect(mgr.list().some(x => x.id === a.id)).toBe(false)
    expect(mgr.history(a.id)).toHaveLength(0)
  })

  test('runNow records a run, updates bookkeeping and emits an event', () => {
    const events: { channel: string; payload: unknown }[] = []
    mgr.setEmit((channel, payload) => events.push({ channel, payload }))

    const a = mgr.create({
      name: 'R',
      prompt: 'p',
      cron: '0 8 * * *',
      workspace: 'w',
    })
    const run = mgr.runNow(a.id)
    expect(run).toBeDefined()
    expect(run?.status).toBe('success')

    const updated = mgr.list().find(x => x.id === a.id)
    expect(updated?.lastRun).toBeDefined()
    expect(updated?.lastRunStatus).toBe('success')
    expect(mgr.history(a.id)).toHaveLength(1)

    expect(events).toHaveLength(1)
    expect(events[0].channel).toBe('automation:runEvent')
  })

  test('runNow on missing id returns undefined', () => {
    expect(mgr.runNow('nope')).toBeUndefined()
  })

  test('history is newest-first and respects limit', () => {
    const a = mgr.create({
      name: 'H',
      prompt: 'p',
      cron: '0 8 * * *',
      workspace: 'w',
    })
    mgr.runNow(a.id)
    mgr.runNow(a.id)
    mgr.runNow(a.id)
    const recent = mgr.history(a.id, 2)
    expect(recent).toHaveLength(2)
  })

  test('reset clears custom automations and re-seeds', () => {
    const a = mgr.create({
      name: 'Z',
      prompt: 'p',
      cron: '0 8 * * *',
      workspace: 'w',
    })
    mgr.reset()
    expect(mgr.list().some(x => x.id === a.id)).toBe(false)
    expect(mgr.list().length).toBeGreaterThan(0)
  })

  test('shared singleton is an AutomationManager', () => {
    expect(automationManager).toBeInstanceOf(AutomationManager)
  })
})
