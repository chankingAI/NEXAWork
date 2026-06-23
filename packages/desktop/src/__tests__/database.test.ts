/**
 * Database layer (N18/N20) — unit tests
 * Covers automation CRUD, run history, project CRUD/search, and the file-backed
 * persistence round-trip (write → reopen).
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, rmSync, mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from '../main/backend/database'
import type { AutomationInfo, ProjectInfo } from '../shared/ipc-channels'

function makeAutomation(over: Partial<AutomationInfo> = {}): AutomationInfo {
  return {
    id: over.id ?? `auto-${Math.random().toString(36).slice(2)}`,
    name: 'Test',
    prompt: 'do something',
    cron: 'P|day|08:00',
    workspace: '/ws',
    status: 'active',
    createdAt: new Date().toISOString(),
    ...over,
  }
}

function makeProject(over: Partial<ProjectInfo> = {}): ProjectInfo {
  const now = new Date().toISOString()
  return {
    id: over.id ?? `proj-${Math.random().toString(36).slice(2)}`,
    name: 'Proj',
    description: 'desc',
    template: 'blank',
    path: '',
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe('Database — automations (in-memory)', () => {
  let db: Database
  beforeEach(() => {
    db = new Database(null)
  })

  test('insert + get + list', () => {
    const a = db.insertAutomation(makeAutomation({ id: 'a1' }))
    expect(db.getAutomation('a1')).toEqual(a)
    expect(db.listAutomations()).toHaveLength(1)
  })

  test('list filters by status', () => {
    db.insertAutomation(makeAutomation({ id: 'a1', status: 'active' }))
    db.insertAutomation(makeAutomation({ id: 'a2', status: 'completed' }))
    expect(db.listAutomations('active')).toHaveLength(1)
    expect(db.listAutomations('completed')).toHaveLength(1)
  })

  test('update merges fields and keeps id', () => {
    db.insertAutomation(makeAutomation({ id: 'a1', status: 'active' }))
    const updated = db.updateAutomation('a1', { status: 'paused' })
    expect(updated?.status).toBe('paused')
    expect(updated?.id).toBe('a1')
  })

  test('update missing → null', () => {
    expect(db.updateAutomation('nope', { status: 'paused' })).toBeNull()
  })

  test('delete removes automation and its runs', () => {
    db.insertAutomation(makeAutomation({ id: 'a1' }))
    db.insertRun({
      id: 'r1',
      automationId: 'a1',
      status: 'success',
      startedAt: new Date().toISOString(),
    })
    expect(db.deleteAutomation('a1')).toBe(true)
    expect(db.getAutomation('a1')).toBeNull()
    expect(db.listRuns('a1')).toHaveLength(0)
  })

  test('delete missing → false', () => {
    expect(db.deleteAutomation('nope')).toBe(false)
  })
})

describe('Database — runs', () => {
  let db: Database
  beforeEach(() => {
    db = new Database(null)
  })

  test('insert + list ordered by recency, limited', () => {
    db.insertRun({
      id: 'r1',
      automationId: 'a1',
      status: 'success',
      startedAt: '2026-06-23T08:00:00.000Z',
    })
    db.insertRun({
      id: 'r2',
      automationId: 'a1',
      status: 'failure',
      startedAt: '2026-06-23T09:00:00.000Z',
    })
    const runs = db.listRuns('a1')
    expect(runs[0].id).toBe('r2') // newest first
    expect(db.listRuns('a1', 1)).toHaveLength(1)
  })

  test('updateRun merges', () => {
    db.insertRun({
      id: 'r1',
      automationId: 'a1',
      status: 'running',
      startedAt: '2026-06-23T08:00:00.000Z',
    })
    const updated = db.updateRun('r1', { status: 'success', output: 'ok' })
    expect(updated?.status).toBe('success')
    expect(updated?.output).toBe('ok')
  })
})

describe('Database — projects', () => {
  let db: Database
  beforeEach(() => {
    db = new Database(null)
  })

  test('insert + get + delete', () => {
    db.insertProject(makeProject({ id: 'p1', name: 'Alpha' }))
    expect(db.getProject('p1')?.name).toBe('Alpha')
    expect(db.deleteProject('p1')).toBe(true)
    expect(db.getProject('p1')).toBeNull()
  })

  test('search by name/description', () => {
    db.insertProject(
      makeProject({ id: 'p1', name: 'Marketing plan', description: 'q4' }),
    )
    db.insertProject(
      makeProject({ id: 'p2', name: 'Bug board', description: 'tracking' }),
    )
    expect(db.listProjects('market')).toHaveLength(1)
    expect(db.listProjects('tracking')).toHaveLength(1)
    expect(db.listProjects('')).toHaveLength(2)
  })

  test('update merges name + keeps id', () => {
    db.insertProject(makeProject({ id: 'p1', name: 'Old' }))
    const updated = db.updateProject('p1', { name: 'New' })
    expect(updated?.name).toBe('New')
    expect(updated?.id).toBe('p1')
  })
})

describe('Database — file persistence', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexawork-db-'))
    file = join(dir, 'nexawork.db.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('writes to disk and reloads on reopen', () => {
    const db = new Database(file)
    db.insertAutomation(makeAutomation({ id: 'a1', name: 'Persisted' }))
    db.insertProject(makeProject({ id: 'p1', name: 'PersistedProj' }))
    expect(existsSync(file)).toBe(true)

    const reopened = new Database(file)
    expect(reopened.getAutomation('a1')?.name).toBe('Persisted')
    expect(reopened.getProject('p1')?.name).toBe('PersistedProj')
  })

  test('corrupt file starts clean instead of throwing', () => {
    const db = new Database(file)
    db.insertAutomation(makeAutomation({ id: 'a1' }))
    // Overwrite with garbage, then reopen.
    Bun.write(file, '{ not json')
    const reopened = new Database(file)
    expect(reopened.listAutomations()).toHaveLength(0)
  })
})
