import { describe, expect, test, beforeEach } from 'bun:test'
import {
  OperationMemoryStore,
  extractPatterns,
  sequenceSimilarity,
} from '../operationMemory.js'
import type { RawActionEvent } from '../types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  action: string,
  overrides: Partial<RawActionEvent> = {},
): RawActionEvent {
  return {
    action: action as any,
    timestamp: Date.now(),
    screenshot_before: null,
    screenshot_after: null,
    window_context: { app_name: 'Chrome', window_title: 'Test Page' },
    ...overrides,
  }
}

function makeEvents(actions: string[]): RawActionEvent[] {
  return actions.map(a => makeEvent(a))
}

// ─── extractPatterns Tests ────────────────────────────────────────────────────

describe('extractPatterns', () => {
  test('extracts patterns from event sequence', () => {
    const events = makeEvents(['left_click', 'type', 'left_click'])
    const patterns = extractPatterns(events)
    expect(patterns.length).toBeGreaterThan(0)
    // Should have 2-element and 3-element subsequences
    expect(patterns.some(p => p.sequence.length === 2)).toBe(true)
    expect(patterns.some(p => p.sequence.length === 3)).toBe(true)
  })

  test('returns empty for too-short sequence', () => {
    const events = makeEvents(['left_click'])
    const patterns = extractPatterns(events, 2)
    expect(patterns.length).toBe(0)
  })

  test('includes context from window_context', () => {
    const events = makeEvents(['left_click', 'type'])
    const patterns = extractPatterns(events)
    expect(patterns[0]!.context).not.toBeNull()
    expect(patterns[0]!.context!.appName).toBe('Chrome')
  })

  test('respects maxSequenceLength', () => {
    const events = makeEvents(['a', 'b', 'c', 'd', 'e', 'f'])
    const patterns = extractPatterns(events, 2, 3)
    expect(patterns.every(p => p.sequence.length <= 3)).toBe(true)
  })
})

// ─── sequenceSimilarity Tests ─────────────────────────────────────────────────

describe('sequenceSimilarity', () => {
  test('identical sequences return 1', () => {
    expect(sequenceSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1)
  })

  test('empty sequences return 1', () => {
    expect(sequenceSimilarity([], [])).toBe(1)
  })

  test('one empty returns 0', () => {
    expect(sequenceSimilarity(['a'], [])).toBe(0)
    expect(sequenceSimilarity([], ['a'])).toBe(0)
  })

  test('partially matching sequences', () => {
    const sim = sequenceSimilarity(['a', 'b', 'c'], ['a', 'x', 'c'])
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })

  test('completely different sequences return low similarity', () => {
    const sim = sequenceSimilarity(['a', 'b', 'c'], ['x', 'y', 'z'])
    expect(sim).toBe(0)
  })

  test('subsequence matching', () => {
    const sim = sequenceSimilarity(['a', 'b', 'c', 'd'], ['b', 'c'])
    expect(sim).toBeGreaterThan(0)
  })
})

// ─── OperationMemoryStore Tests ───────────────────────────────────────────────

describe('OperationMemoryStore', () => {
  let store: OperationMemoryStore

  beforeEach(() => {
    store = new OperationMemoryStore({ rootDir: '/tmp/test-memory' })
  })

  test('initial state', () => {
    expect(store.size).toBe(0)
    expect(store.isLoaded).toBe(false)
    expect(store.entries).toEqual([])
  })

  // ─── Pattern Recording ────────────────────────────────────────────────

  describe('recordPattern', () => {
    test('records new pattern from events', () => {
      const events = makeEvents(['left_click', 'type', 'left_click'])
      const patterns = store.recordPattern(events)
      expect(patterns.length).toBeGreaterThan(0)
      expect(store.size).toBeGreaterThan(0)
    })

    test('increments occurrences for same pattern', () => {
      const events = makeEvents(['left_click', 'type'])
      store.recordPattern(events)
      store.recordPattern(events)
      const patterns = store.searchPatterns(['left_click', 'type'])
      expect(patterns.some(p => p.occurrences >= 2)).toBe(true)
    })

    test('stores project ID', () => {
      const events = makeEvents(['left_click', 'type'])
      store.recordPattern(events, 'project-123')
      const entries = store.search({ projectId: 'project-123' })
      expect(entries.length).toBeGreaterThan(0)
    })
  })

  // ─── Skill Usage Recording ────────────────────────────────────────────

  describe('recordSkillUsage', () => {
    test('records new skill usage', () => {
      const record = store.recordSkillUsage('export-report', {
        success: true,
        durationMs: 2500,
        params: { format: 'xlsx' },
      })
      expect(record.skillId).toBe('export-report')
      expect(record.totalExecutions).toBe(1)
      expect(record.successCount).toBe(1)
      expect(record.avgDurationMs).toBe(2500)
    })

    test('accumulates usage over multiple calls', () => {
      store.recordSkillUsage('search', { success: true, durationMs: 100 })
      store.recordSkillUsage('search', { success: true, durationMs: 200 })
      store.recordSkillUsage('search', { success: false, durationMs: 300 })

      const record = store.getSkillUsage('search')!
      expect(record.totalExecutions).toBe(3)
      expect(record.successCount).toBe(2)
      expect(record.failureCount).toBe(1)
    })

    test('stores recent params', () => {
      store.recordSkillUsage('search', {
        success: true,
        params: { q: 'laptop' },
      })
      store.recordSkillUsage('search', {
        success: true,
        params: { q: 'phone' },
      })

      const record = store.getSkillUsage('search')!
      expect(record.recentParams.length).toBe(2)
      expect(record.recentParams[0]).toEqual({ q: 'laptop' })
    })

    test('limits recent params count', () => {
      for (let i = 0; i < 10; i++) {
        store.recordSkillUsage('s', { success: true, params: { i } })
      }
      const record = store.getSkillUsage('s')!
      expect(record.recentParams.length).toBeLessThanOrEqual(5)
    })
  })

  // ─── Parameter Value Memory ───────────────────────────────────────────

  describe('recordParamValue', () => {
    test('records a new parameter value', () => {
      const entry = store.recordParamValue(
        'searchQuery',
        'laptop',
        'search-skill',
      )
      expect(entry.paramName).toBe('searchQuery')
      expect(entry.value).toBe('laptop')
      expect(entry.frequency).toBe(1)
    })

    test('increments frequency for repeated values', () => {
      store.recordParamValue('keyword', 'test')
      store.recordParamValue('keyword', 'test')
      store.recordParamValue('keyword', 'test')

      const values = store.getFrequentParamValues('keyword')
      expect(values[0]!.frequency).toBe(3)
    })

    test('getFrequentParamValues returns sorted by frequency', () => {
      store.recordParamValue('q', 'rare')
      store.recordParamValue('q', 'common')
      store.recordParamValue('q', 'common')
      store.recordParamValue('q', 'common')
      store.recordParamValue('q', 'medium')
      store.recordParamValue('q', 'medium')

      const values = store.getFrequentParamValues('q', 3)
      expect(values[0]!.value).toBe('common')
      expect(values[1]!.value).toBe('medium')
      expect(values[2]!.value).toBe('rare')
    })
  })

  // ─── Temporal Pattern ─────────────────────────────────────────────────

  describe('recordTemporalUsage', () => {
    test('records temporal pattern', () => {
      const timestamp = new Date('2024-06-15T09:30:00Z')
      const pattern = store.recordTemporalUsage('morning-report', timestamp)
      expect(pattern.hourOfDay).toBe(9)
      expect(pattern.dayOfWeek).toBe(6) // Saturday
      expect(pattern.commonSkills).toContain('morning-report')
    })

    test('accumulates count for same time slot', () => {
      const t1 = new Date('2024-06-10T14:00:00Z')
      const t2 = new Date('2024-06-17T14:30:00Z') // Same hour, same day of week
      store.recordTemporalUsage('skill-a', t1)
      store.recordTemporalUsage('skill-b', t2)

      const entries = store.search({ type: 'temporal' })
      const patterns = entries.map(e => e.data) as any[]
      const match = patterns.find(
        (p: any) => p.hourOfDay === 14 && p.dayOfWeek === 1,
      )
      expect(match).toBeDefined()
      expect(match.count).toBe(2)
    })
  })

  // ─── Search / Query ───────────────────────────────────────────────────

  describe('search', () => {
    beforeEach(() => {
      store.recordPattern(makeEvents(['left_click', 'type']))
      store.recordSkillUsage('search', { success: true })
      store.recordParamValue('q', 'test')
    })

    test('filters by type', () => {
      const patterns = store.search({ type: 'pattern' })
      expect(patterns.every(e => e.type === 'pattern')).toBe(true)

      const skills = store.search({ type: 'skill_usage' })
      expect(skills.every(e => e.type === 'skill_usage')).toBe(true)
    })

    test('filters by tags', () => {
      const results = store.search({ tags: ['search'] })
      expect(results.length).toBeGreaterThan(0)
    })

    test('text search', () => {
      const results = store.search({ textSearch: 'search' })
      expect(results.length).toBeGreaterThan(0)
    })

    test('respects limit', () => {
      for (let i = 0; i < 20; i++) {
        store.recordParamValue(`param${i}`, `val${i}`)
      }
      const results = store.search({ limit: 5 })
      expect(results.length).toBe(5)
    })
  })

  describe('searchPatterns', () => {
    test('finds similar patterns', () => {
      store.recordPattern(makeEvents(['left_click', 'type', 'left_click']))
      const matches = store.searchPatterns(['left_click', 'type', 'left_click'])
      expect(matches.length).toBeGreaterThan(0)
    })

    test('respects minSimilarity', () => {
      store.recordPattern(makeEvents(['left_click', 'type']))
      const matches = store.searchPatterns(['scroll', 'key'], 0.9)
      expect(matches.length).toBe(0)
    })
  })

  // ─── Skill Ranking ────────────────────────────────────────────────────

  describe('getTopSkills', () => {
    test('returns skills sorted by execution count', () => {
      store.recordSkillUsage('rare', { success: true })
      store.recordSkillUsage('common', { success: true })
      store.recordSkillUsage('common', { success: true })
      store.recordSkillUsage('common', { success: true })
      store.recordSkillUsage('medium', { success: true })
      store.recordSkillUsage('medium', { success: true })

      const top = store.getTopSkills(3)
      expect(top[0]!.skillId).toBe('common')
      expect(top[1]!.skillId).toBe('medium')
      expect(top[2]!.skillId).toBe('rare')
    })
  })

  // ─── Delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    test('deletes entry by ID', () => {
      store.recordSkillUsage('to-delete', { success: true })
      const entries = store.search({ type: 'skill_usage' })
      const id = entries[0]!.id
      expect(store.delete(id)).toBe(true)
      expect(store.search({ type: 'skill_usage' }).length).toBe(0)
    })

    test('returns false for non-existent ID', () => {
      expect(store.delete('nonexistent')).toBe(false)
    })
  })

  describe('clear', () => {
    test('removes all entries', () => {
      store.recordSkillUsage('a', { success: true })
      store.recordParamValue('b', 'c')
      expect(store.size).toBeGreaterThan(0)
      store.clear()
      expect(store.size).toBe(0)
    })
  })

  // ─── Instinct Integration ─────────────────────────────────────────────

  describe('getPromotablePatterns', () => {
    test('returns patterns above confidence and occurrence thresholds', () => {
      const events = makeEvents(['left_click', 'type', 'left_click'])
      // Record same pattern many times to boost confidence
      for (let i = 0; i < 10; i++) {
        store.recordPattern(events)
      }

      const promotable = store.getPromotablePatterns(0.5, 3)
      expect(promotable.length).toBeGreaterThan(0)
      expect(promotable.every(p => p.occurrences >= 3)).toBe(true)
    })

    test('filters out low-confidence patterns', () => {
      store.recordPattern(makeEvents(['scroll', 'key'])) // Single occurrence
      const promotable = store.getPromotablePatterns(0.8, 5)
      expect(promotable.length).toBe(0)
    })
  })

  describe('updatePatternSuccess', () => {
    test('updates success rate on success', () => {
      const events = makeEvents(['left_click', 'type'])
      store.recordPattern(events)
      const entries = store.search({ type: 'pattern' })
      const id = entries[0]!.id

      store.updatePatternSuccess(id, true)
      const patterns = store.search({ type: 'pattern' })
      const updated = patterns[0]!.data as any
      expect(updated.confidence).toBeGreaterThan(0.3)
    })

    test('decreases confidence on failure', () => {
      const events = makeEvents(['left_click', 'type'])
      store.recordPattern(events)
      const entries = store.search({ type: 'pattern' })
      const id = entries[0]!.id
      const beforeConf = (entries[0]!.data as any).confidence

      store.updatePatternSuccess(id, false)
      const after = store.search({ type: 'pattern' })
      expect((after[0]!.data as any).confidence).toBeLessThan(beforeConf)
    })
  })

  // ─── Persistence ──────────────────────────────────────────────────────

  describe('load/save', () => {
    test('load creates store in loaded state', async () => {
      const tmpStore = new OperationMemoryStore({
        rootDir: '/tmp/test-mem-' + Date.now(),
      })
      await tmpStore.load()
      expect(tmpStore.isLoaded).toBe(true)
      expect(tmpStore.size).toBe(0)
    })

    test('save and reload preserves data', async () => {
      const dir = '/tmp/test-mem-persist-' + Date.now()
      const store1 = new OperationMemoryStore({ rootDir: dir })
      await store1.load()
      store1.recordSkillUsage('test-skill', { success: true, durationMs: 100 })
      await store1.save()

      const store2 = new OperationMemoryStore({ rootDir: dir })
      await store2.load()
      expect(store2.size).toBe(1)
      const usage = store2.getSkillUsage('test-skill')
      expect(usage).not.toBeNull()
      expect(usage!.totalExecutions).toBe(1)
    })
  })
})
