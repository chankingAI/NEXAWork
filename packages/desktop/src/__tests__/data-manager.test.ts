/**
 * Data Manager (N23) — pure-function unit tests.
 * Covers statistics, scoped export, JSON/Markdown serialization, import
 * validation, and conflict-aware merge (skip / overwrite).
 */
import { describe, test, expect } from 'bun:test'
import {
  buildExportBundle,
  computeStats,
  DATA_BUNDLE_VERSION,
  DataValidationError,
  parseImport,
  planSessionImport,
  serializeBundle,
  type DataSnapshot,
} from '../main/backend/data-manager'
import { DEFAULT_SETTINGS } from '../shared/settings'
import type {
  ChatMessage,
  SessionInfo,
  SkillInfo,
} from '../shared/ipc-channels'

function session(id: string, createdAt: string, title = id): SessionInfo {
  return {
    id,
    title,
    scene: 'code',
    model: 'claude-sonnet',
    messageCount: 0,
    createdAt,
    updatedAt: createdAt,
  }
}

function message(id: string, content: string): ChatMessage {
  return { id, role: 'user', content, createdAt: '2025-01-01T00:00:00.000Z' }
}

function skill(id: string, name = id): SkillInfo {
  return {
    id,
    name,
    description: `${name} desc`,
    category: 'dev',
    installed: true,
    enabled: true,
    version: '1.0.0',
  }
}

function snapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    sessions: [],
    messagesBySession: {},
    skills: [],
    automations: [],
    automationRuns: [],
    projects: [],
    memory: [],
    settings: DEFAULT_SETTINGS,
    ...overrides,
  }
}

describe('computeStats', () => {
  test('counts collections and reports positive disk usage', () => {
    const snap = snapshot({
      sessions: [session('s1', '2025-01-01T00:00:00.000Z')],
      messagesBySession: { s1: [message('m1', 'hi'), message('m2', 'yo')] },
      skills: [skill('k1')],
    })
    const stats = computeStats(snap)
    expect(stats.sessionCount).toBe(1)
    expect(stats.messageCount).toBe(2)
    expect(stats.skillCount).toBe(1)
    expect(stats.diskUsageBytes).toBeGreaterThan(0)
  })

  test('empty snapshot yields zero counts', () => {
    const stats = computeStats(snapshot())
    expect(stats.sessionCount).toBe(0)
    expect(stats.messageCount).toBe(0)
    expect(stats.skillCount).toBe(0)
  })
})

describe('buildExportBundle', () => {
  const snap = snapshot({
    sessions: [
      session('s1', '2025-01-01T00:00:00.000Z'),
      session('s2', '2025-06-15T00:00:00.000Z'),
      session('s3', '2025-12-31T00:00:00.000Z'),
    ],
    messagesBySession: {
      s1: [message('m1', 'one')],
      s2: [message('m2', 'two')],
      s3: [message('m3', 'three')],
    },
    skills: [skill('k1')],
  })

  test('scope=all includes every collection + settings', () => {
    const bundle = buildExportBundle(snap, { scope: 'all' })
    expect(bundle.version).toBe(DATA_BUNDLE_VERSION)
    expect(bundle.sessions.length).toBe(3)
    expect(bundle.skills.length).toBe(1)
    expect(bundle.settings).not.toBeNull()
  })

  test('scope=sessions keeps only selected sessions + their messages', () => {
    const bundle = buildExportBundle(snap, {
      scope: 'sessions',
      sessionIds: ['s2'],
    })
    expect(bundle.sessions.map(s => s.id)).toEqual(['s2'])
    expect(Object.keys(bundle.messagesBySession)).toEqual(['s2'])
    expect(bundle.settings).toBeNull()
  })

  test('scope=dateRange filters sessions by createdAt (inclusive)', () => {
    const bundle = buildExportBundle(snap, {
      scope: 'dateRange',
      startDate: '2025-03-01',
      endDate: '2025-09-01',
    })
    expect(bundle.sessions.map(s => s.id)).toEqual(['s2'])
  })
})

describe('serializeBundle', () => {
  const bundle = buildExportBundle(
    snapshot({
      sessions: [session('s1', '2025-01-01T00:00:00.000Z', 'My Chat')],
      messagesBySession: { s1: [message('m1', 'hello there')] },
      skills: [skill('k1', 'Formatter')],
    }),
    { scope: 'all' },
  )

  test('json output is valid and round-trips', () => {
    const json = serializeBundle(bundle, 'json')
    const parsed = JSON.parse(json)
    expect(parsed.sessions[0].title).toBe('My Chat')
  })

  test('markdown output is human-readable', () => {
    const md = serializeBundle(bundle, 'markdown')
    expect(md).toContain('# NexaWork 数据导出')
    expect(md).toContain('## My Chat')
    expect(md).toContain('hello there')
    expect(md).toContain('Formatter')
  })
})

describe('parseImport', () => {
  test('throws on non-JSON content', () => {
    expect(() => parseImport('<<<not json')).toThrow(DataValidationError)
  })

  test('throws when neither sessions nor skills present', () => {
    expect(() => parseImport(JSON.stringify({ foo: 1 }))).toThrow(
      DataValidationError,
    )
  })

  test('accepts a minimal sessions-only bundle', () => {
    const bundle = parseImport(
      JSON.stringify({ sessions: [session('s1', '2025-01-01T00:00:00.000Z')] }),
    )
    expect(bundle.sessions.length).toBe(1)
    expect(bundle.skills.length).toBe(0)
  })
})

describe('planSessionImport', () => {
  const current = snapshot({
    sessions: [session('s1', '2025-01-01T00:00:00.000Z', 'existing')],
    messagesBySession: { s1: [message('m1', 'original')] },
    skills: [skill('k1', 'existing-skill')],
  })

  test('skip strategy keeps existing items, adds only new ones', () => {
    const bundle = buildExportBundle(
      snapshot({
        sessions: [
          session('s1', '2025-01-01T00:00:00.000Z', 'incoming-dup'),
          session('s2', '2025-02-01T00:00:00.000Z', 'incoming-new'),
        ],
        messagesBySession: {
          s1: [message('m9', 'should-not-apply')],
          s2: [message('m2', 'new-msg')],
        },
        skills: [skill('k1', 'dup'), skill('k2', 'new')],
      }),
      { scope: 'all' },
    )
    const plan = planSessionImport(current, bundle, 'skip')
    expect(plan.stats.importedSessions).toBe(1)
    expect(plan.stats.skippedSessions).toBe(1)
    expect(plan.stats.importedSkills).toBe(1)
    expect(plan.stats.skippedSkills).toBe(1)
    // existing conversation preserved
    expect(plan.messagesBySession.s1[0].content).toBe('original')
    expect(plan.messagesBySession.s2[0].content).toBe('new-msg')
  })

  test('overwrite strategy replaces existing items', () => {
    const bundle = buildExportBundle(
      snapshot({
        sessions: [session('s1', '2025-01-01T00:00:00.000Z', 'incoming-dup')],
        messagesBySession: { s1: [message('m9', 'replaced')] },
        skills: [skill('k1', 'dup')],
      }),
      { scope: 'all' },
    )
    const plan = planSessionImport(current, bundle, 'overwrite')
    expect(plan.stats.importedSessions).toBe(1)
    expect(plan.stats.skippedSessions).toBe(0)
    expect(plan.sessions.find(s => s.id === 's1')?.title).toBe('incoming-dup')
    expect(plan.messagesBySession.s1[0].content).toBe('replaced')
  })
})
