/**
 * Scheduler (N18) — unit tests
 * Deterministic via injected executor + explicit `now`. Covers due detection,
 * tick execution, run recording, schedule advancement, completion of one-shots,
 * expiry past validTo, and runNow.
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { Database } from '../main/backend/database'
import { Scheduler, type AutomationExecutor } from '../main/backend/scheduler'
import { computeNextRun, serializeSchedule } from '../shared/schedule'
import type { AutomationInfo } from '../shared/ipc-channels'

const NOW = new Date('2026-06-23T09:00:00.000Z')

function seedAutomation(
  db: Database,
  over: Partial<AutomationInfo> = {},
): AutomationInfo {
  const cron =
    over.cron ?? serializeSchedule({ type: 'interval', every: 1, unit: 'hour' })
  return db.insertAutomation({
    id: over.id ?? 'a1',
    name: 'Test',
    prompt: 'p',
    cron,
    workspace: '',
    status: 'active',
    createdAt: NOW.toISOString(),
    // Default: due exactly at NOW.
    nextRun: over.nextRun ?? NOW.toISOString(),
    ...over,
  })
}

function makeScheduler(
  db: Database,
  executor: AutomationExecutor,
  onChange?: () => void,
): Scheduler {
  return new Scheduler(db, { executor, onChange })
}

describe('Scheduler.isDue', () => {
  let db: Database
  beforeEach(() => {
    db = new Database(null)
  })

  test('not due when paused', () => {
    const a = seedAutomation(db, { status: 'paused' })
    const s = makeScheduler(db, async () => ({ output: 'ok' }))
    expect(s.isDue(a, NOW)).toBe(false)
  })
  test('not due when nextRun in the future', () => {
    const a = seedAutomation(db, { nextRun: '2026-06-23T10:00:00.000Z' })
    const s = makeScheduler(db, async () => ({ output: 'ok' }))
    expect(s.isDue(a, NOW)).toBe(false)
  })
  test('due when nextRun <= now and active', () => {
    const a = seedAutomation(db)
    const s = makeScheduler(db, async () => ({ output: 'ok' }))
    expect(s.isDue(a, NOW)).toBe(true)
  })
  test('not due when outside valid range', () => {
    const a = seedAutomation(db, { validFrom: '2026-06-24T00:00:00.000Z' })
    const s = makeScheduler(db, async () => ({ output: 'ok' }))
    expect(s.isDue(a, NOW)).toBe(false)
  })
})

describe('Scheduler.tick', () => {
  let db: Database
  beforeEach(() => {
    db = new Database(null)
  })

  test('executes due automation, records a success run, advances nextRun', async () => {
    seedAutomation(db)
    let calls = 0
    const s = makeScheduler(db, async () => {
      calls++
      return { output: 'done' }
    })
    const executed = await s.tick(NOW)
    expect(executed).toEqual(['a1'])
    expect(calls).toBe(1)

    const runs = db.listRuns('a1')
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('success')

    const after = db.getAutomation('a1')!
    expect(after.lastRunStatus).toBe('success')
    expect(after.status).toBe('active')
    // Next run advanced by one hour.
    const expected = computeNextRun(
      { type: 'interval', every: 1, unit: 'hour' },
      NOW,
    )
    expect(after.nextRun).toBe(expected!.toISOString())
  })

  test('records failure when executor throws', async () => {
    seedAutomation(db)
    const s = makeScheduler(db, async () => {
      throw new Error('boom')
    })
    await s.tick(NOW)
    const runs = db.listRuns('a1')
    expect(runs[0].status).toBe('failure')
    expect(runs[0].error).toBe('boom')
    expect(db.getAutomation('a1')!.lastRunStatus).toBe('failure')
  })

  test('records failure when executor returns an error', async () => {
    seedAutomation(db)
    const s = makeScheduler(db, async () => ({ error: 'nope' }))
    await s.tick(NOW)
    expect(db.listRuns('a1')[0].status).toBe('failure')
  })

  test('one-shot automation becomes completed after running', async () => {
    seedAutomation(db, {
      cron: serializeSchedule({ type: 'once', at: NOW.toISOString() }),
    })
    const s = makeScheduler(db, async () => ({ output: 'ok' }))
    await s.tick(NOW)
    const after = db.getAutomation('a1')!
    expect(after.status).toBe('completed')
    expect(after.nextRun).toBeUndefined()
  })

  test('does not run non-due automations', async () => {
    seedAutomation(db, { nextRun: '2026-06-23T23:00:00.000Z' })
    let calls = 0
    const s = makeScheduler(db, async () => {
      calls++
      return {}
    })
    const executed = await s.tick(NOW)
    expect(executed).toEqual([])
    expect(calls).toBe(0)
  })

  test('fires onChange callback during execution', async () => {
    seedAutomation(db)
    let changes = 0
    const s = makeScheduler(
      db,
      async () => ({ output: 'ok' }),
      () => {
        changes++
      },
    )
    await s.tick(NOW)
    // running insert + completion update.
    expect(changes).toBeGreaterThanOrEqual(2)
  })
})

describe('Scheduler.runNow', () => {
  let db: Database
  beforeEach(() => {
    db = new Database(null)
  })

  test('runs immediately ignoring schedule timing', async () => {
    seedAutomation(db, { nextRun: '2026-06-30T00:00:00.000Z' })
    const s = makeScheduler(db, async () => ({ output: 'forced' }))
    const run = await s.runNow('a1', NOW)
    expect(run?.status).toBe('success')
    expect(db.listRuns('a1')).toHaveLength(1)
  })

  test('returns null for unknown id', async () => {
    const s = makeScheduler(db, async () => ({ output: 'x' }))
    expect(await s.runNow('missing', NOW)).toBeNull()
  })
})
