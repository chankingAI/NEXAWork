/**
 * Operation Memory Layer — Cross-session pattern memory for recorded operations.
 *
 * Records user operation patterns, skill usage statistics, frequently used
 * parameter values, and temporal patterns. Integrates with the existing
 * skill learning system (observationStore, instinctStore).
 *
 * Reference:
 * - src/services/skillLearning/observationStore.ts — appendObservation/readObservations
 * - src/services/skillLearning/instinctStore.ts — Instinct confidence/evidence model
 * - mem0/mem0/memory/main.py — add/search/update/delete interface pattern
 * - mem0/mem0/memory/storage.py — SQLite persistence model
 */

import type { RawActionEvent, WindowContext } from './types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A recorded operation pattern (sequence of actions that occur together). */
export interface OperationPattern {
  /** Unique pattern ID. */
  id: string
  /** Human-readable name for this pattern. */
  name: string
  /** Sequence of action types that form this pattern. */
  actionSequence: string[]
  /** Window contexts where this pattern typically occurs. */
  contexts: PatternContext[]
  /** How many times this pattern has been observed. */
  occurrences: number
  /** Success rate (0-1) when this pattern is replayed. */
  successRate: number
  /** Timestamp of first observation. */
  firstSeen: string
  /** Timestamp of most recent observation. */
  lastSeen: string
  /** Confidence score (0-1), grows with occurrences. */
  confidence: number
}

/** Context in which a pattern typically appears. */
export interface PatternContext {
  /** Application name. */
  appName: string
  /** Window title pattern (may contain wildcards). */
  windowTitlePattern?: string
  /** URL pattern (for browser contexts). */
  urlPattern?: string
}

/** Skill usage record. */
export interface SkillUsageRecord {
  /** Skill name/ID. */
  skillId: string
  /** Total times this skill was executed. */
  totalExecutions: number
  /** Successful executions. */
  successCount: number
  /** Failed executions. */
  failureCount: number
  /** Average execution duration in ms. */
  avgDurationMs: number
  /** Most recent parameter values used. */
  recentParams: Array<Record<string, unknown>>
  /** Maximum recent params to retain (default: 5). */
  maxRecentParams?: number
  /** First usage timestamp. */
  firstUsed: string
  /** Last usage timestamp. */
  lastUsed: string
}

/** Temporal pattern for operation timing. */
export interface TemporalPattern {
  /** Hour of day (0-23) when operations typically occur. */
  hourOfDay: number
  /** Day of week (0=Sunday, 6=Saturday). */
  dayOfWeek: number
  /** Skills/patterns commonly used at this time. */
  commonSkills: string[]
  /** Count of operations at this time slot. */
  count: number
}

/** Memory entry (the core storage unit). */
export interface MemoryEntry {
  /** Unique entry ID. */
  id: string
  /** Entry type. */
  type: 'pattern' | 'skill_usage' | 'param_value' | 'temporal'
  /** The data payload (depends on type). */
  data: OperationPattern | SkillUsageRecord | ParamValueEntry | TemporalPattern
  /** Tags for filtering. */
  tags: string[]
  /** Project ID (for scoping). */
  projectId?: string
  /** Created timestamp. */
  createdAt: string
  /** Updated timestamp. */
  updatedAt: string
}

/** Frequently used parameter value. */
export interface ParamValueEntry {
  /** Parameter name. */
  paramName: string
  /** The value. */
  value: string
  /** How many times this value was used. */
  frequency: number
  /** Context (which skill/pattern uses this). */
  skillId?: string
  /** Last used timestamp. */
  lastUsed: string
}

/** Search/filter criteria for memory retrieval. */
export interface MemoryQuery {
  /** Filter by entry type. */
  type?: MemoryEntry['type']
  /** Filter by tags. */
  tags?: string[]
  /** Filter by project ID. */
  projectId?: string
  /** Filter by time range (ISO timestamps). */
  after?: string
  before?: string
  /** Filter by application name. */
  appName?: string
  /** Text search in names/descriptions. */
  textSearch?: string
  /** Maximum results (default: 50). */
  limit?: number
}

/** Configuration for OperationMemoryStore. */
export interface OperationMemoryOptions {
  /** Root directory for storing memory data. */
  rootDir?: string
  /** Maximum patterns to retain (default: 200). */
  maxPatterns?: number
  /** Maximum skill usage records (default: 100). */
  maxSkillRecords?: number
  /** Maximum recent param values per parameter (default: 10). */
  maxRecentParamValues?: number
  /** Auto-save after N changes (default: 5). */
  autoSaveThreshold?: number
}

// ─── Pattern Detection ────────────────────────────────────────────────────────

/**
 * Extract action patterns from a sequence of events.
 * Groups actions that commonly appear together (co-occurrence).
 */
export function extractPatterns(
  events: readonly RawActionEvent[],
  minSequenceLength = 2,
  maxSequenceLength = 8,
): Array<{ sequence: string[]; context: PatternContext | null }> {
  const patterns: Array<{
    sequence: string[]
    context: PatternContext | null
  }> = []

  if (events.length < minSequenceLength) return patterns

  // Sliding window to extract subsequences
  for (
    let windowSize = minSequenceLength;
    windowSize <= Math.min(maxSequenceLength, events.length);
    windowSize++
  ) {
    for (let i = 0; i <= events.length - windowSize; i++) {
      const window = events.slice(i, i + windowSize)
      const sequence = window.map(e => e.action)

      // Build context from the first event's window_context
      const firstEvent = window[0]!
      const context: PatternContext | null = firstEvent.window_context
        ? {
            appName: firstEvent.window_context.app_name,
            windowTitlePattern: firstEvent.window_context.window_title,
          }
        : null

      patterns.push({ sequence, context })
    }
  }

  return patterns
}

/**
 * Compute similarity between two action sequences (Jaccard + order penalty).
 */
export function sequenceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0

  // Longest Common Subsequence ratio
  const lcsLen = lcs(a, b)
  const maxLen = Math.max(a.length, b.length)

  return lcsLen / maxLen
}

/**
 * Longest Common Subsequence length.
 */
function lcs(a: string[], b: string[]): number {
  const m = a.length
  const n = b.length
  // Use space-optimized 1D DP
  const prev = new Array<number>(n + 1).fill(0)
  const curr = new Array<number>(n + 1).fill(0)

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]! + 1
      } else {
        curr[j] = Math.max(prev[j]!, curr[j - 1]!)
      }
    }
    // Copy curr to prev
    for (let j = 0; j <= n; j++) prev[j] = curr[j]!
    curr.fill(0)
  }

  return prev[n]!
}

// ─── Operation Memory Store ───────────────────────────────────────────────────

/**
 * OperationMemoryStore — Persistent memory for operation patterns and skill usage.
 *
 * Follows mem0's add/search/update/delete interface pattern with local JSON storage.
 *
 * Usage:
 * ```ts
 * const store = new OperationMemoryStore({ rootDir: '/path/to/memory' })
 * await store.load()
 *
 * // Record a pattern
 * store.recordPattern(events)
 *
 * // Record skill usage
 * store.recordSkillUsage('my-skill', { success: true, durationMs: 1500, params: { q: 'test' } })
 *
 * // Search for similar patterns
 * const matches = store.searchPatterns(['left_click', 'type', 'left_click'])
 *
 * // Persist to disk
 * await store.save()
 * ```
 */
export class OperationMemoryStore {
  private _entries: MemoryEntry[] = []
  private _options: Required<OperationMemoryOptions>
  private _changeCount = 0
  private _loaded = false

  constructor(options: OperationMemoryOptions = {}) {
    this._options = {
      rootDir: options.rootDir ?? getDefaultMemoryRoot(),
      maxPatterns: options.maxPatterns ?? 200,
      maxSkillRecords: options.maxSkillRecords ?? 100,
      maxRecentParamValues: options.maxRecentParamValues ?? 10,
      autoSaveThreshold: options.autoSaveThreshold ?? 5,
    }
  }

  /** Whether the store has been loaded from disk. */
  get isLoaded(): boolean {
    return this._loaded
  }

  /** Total number of memory entries. */
  get size(): number {
    return this._entries.length
  }

  /** All entries (read-only). */
  get entries(): readonly MemoryEntry[] {
    return this._entries
  }

  /** Number of unsaved changes since last save(). */
  get pendingChanges(): number {
    return this._changeCount
  }

  // ─── Load / Save ─────────────────────────────────────────────────────────

  /**
   * Load memory from disk.
   * Creates the directory and file if they don't exist.
   */
  async load(): Promise<void> {
    const { readFile, mkdir } = await import('node:fs/promises')
    const { join } = await import('node:path')

    const dir = this._options.rootDir
    await mkdir(dir, { recursive: true })

    const filePath = join(dir, 'operation-memory.json')
    try {
      const content = await readFile(filePath, 'utf-8')
      const data = JSON.parse(content) as { entries: MemoryEntry[] }
      this._entries = data.entries ?? []
    } catch {
      // File doesn't exist or is corrupt — start fresh
      this._entries = []
    }

    this._loaded = true
  }

  /**
   * Save memory to disk.
   */
  async save(): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { join } = await import('node:path')

    const dir = this._options.rootDir
    await mkdir(dir, { recursive: true })

    const filePath = join(dir, 'operation-memory.json')
    const data = { entries: this._entries, updatedAt: new Date().toISOString() }
    await writeFile(filePath, JSON.stringify(data, null, 2))
    this._changeCount = 0
  }

  // ─── Pattern Recording ──────────────────────────────────────────────────

  /**
   * Record operation patterns from a sequence of events.
   * Merges with existing patterns (increments occurrence count).
   */
  recordPattern(
    events: readonly RawActionEvent[],
    projectId?: string,
  ): OperationPattern[] {
    const extracted = extractPatterns(events)
    const recorded: OperationPattern[] = []

    for (const { sequence, context } of extracted) {
      const existing = this._findSimilarPattern(sequence)

      if (existing) {
        // Update existing pattern
        existing.occurrences++
        existing.lastSeen = new Date().toISOString()
        existing.confidence = Math.min(1, existing.confidence + 0.05)
        if (
          context &&
          !existing.contexts.some(c => c.appName === context.appName)
        ) {
          existing.contexts.push(context)
        }
        recorded.push(existing)
      } else if (this._getPatternCount() < this._options.maxPatterns) {
        // Create new pattern
        const pattern: OperationPattern = {
          id: generateId(),
          name: buildPatternName(sequence),
          actionSequence: sequence,
          contexts: context ? [context] : [],
          occurrences: 1,
          successRate: 1.0,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          confidence: 0.3,
        }

        this._entries.push({
          id: pattern.id,
          type: 'pattern',
          data: pattern,
          tags: sequence,
          projectId,
          createdAt: pattern.firstSeen,
          updatedAt: pattern.lastSeen,
        })
        recorded.push(pattern)
      }
    }

    this._trackChange()
    return recorded
  }

  // ─── Skill Usage Recording ──────────────────────────────────────────────

  /**
   * Record a skill execution (success/failure/params).
   */
  recordSkillUsage(
    skillId: string,
    result: {
      success: boolean
      durationMs?: number
      params?: Record<string, unknown>
    },
  ): SkillUsageRecord {
    const existing = this._findSkillUsage(skillId)

    if (existing) {
      existing.totalExecutions++
      if (result.success) existing.successCount++
      else existing.failureCount++

      if (result.durationMs !== undefined) {
        const total = existing.avgDurationMs * (existing.totalExecutions - 1)
        existing.avgDurationMs = Math.round(
          (total + result.durationMs) / existing.totalExecutions,
        )
      }

      if (result.params) {
        existing.recentParams.push(result.params)
        const maxParams = existing.maxRecentParams ?? 5
        if (existing.recentParams.length > maxParams) {
          existing.recentParams = existing.recentParams.slice(-maxParams)
        }
      }

      existing.lastUsed = new Date().toISOString()
      this._trackChange()
      return existing
    }

    // New skill usage record
    const record: SkillUsageRecord = {
      skillId,
      totalExecutions: 1,
      successCount: result.success ? 1 : 0,
      failureCount: result.success ? 0 : 1,
      avgDurationMs: result.durationMs ?? 0,
      recentParams: result.params ? [result.params] : [],
      firstUsed: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    }

    this._entries.push({
      id: generateId(),
      type: 'skill_usage',
      data: record,
      tags: [skillId],
      createdAt: record.firstUsed,
      updatedAt: record.lastUsed,
    })

    this._trackChange()
    return record
  }

  // ─── Parameter Value Memory ─────────────────────────────────────────────

  /**
   * Record a frequently used parameter value.
   */
  recordParamValue(
    paramName: string,
    value: string,
    skillId?: string,
  ): ParamValueEntry {
    const existing = this._findParamValue(paramName, value)

    if (existing) {
      existing.frequency++
      existing.lastUsed = new Date().toISOString()
      this._trackChange()
      return existing
    }

    const entry: ParamValueEntry = {
      paramName,
      value,
      frequency: 1,
      skillId,
      lastUsed: new Date().toISOString(),
    }

    this._entries.push({
      id: generateId(),
      type: 'param_value',
      data: entry,
      tags: [paramName, ...(skillId ? [skillId] : [])],
      createdAt: entry.lastUsed,
      updatedAt: entry.lastUsed,
    })

    // Enforce max recent values per param
    this._pruneParamValues(paramName)
    this._trackChange()
    return entry
  }

  /**
   * Get the most frequently used values for a parameter.
   */
  getFrequentParamValues(paramName: string, limit = 5): ParamValueEntry[] {
    return this._entries
      .filter(
        e =>
          e.type === 'param_value' &&
          (e.data as ParamValueEntry).paramName === paramName,
      )
      .map(e => e.data as ParamValueEntry)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit)
  }

  // ─── Temporal Pattern ───────────────────────────────────────────────────

  /**
   * Record temporal usage pattern (when operations happen).
   */
  recordTemporalUsage(skillId: string, timestamp?: Date): TemporalPattern {
    const now = timestamp ?? new Date()
    const hourOfDay = now.getHours()
    const dayOfWeek = now.getDay()

    const existing = this._findTemporalPattern(hourOfDay, dayOfWeek)

    if (existing) {
      existing.count++
      if (!existing.commonSkills.includes(skillId)) {
        existing.commonSkills.push(skillId)
        // Keep only top 5 skills per time slot
        if (existing.commonSkills.length > 5) {
          existing.commonSkills = existing.commonSkills.slice(-5)
        }
      }
      this._trackChange()
      return existing
    }

    const pattern: TemporalPattern = {
      hourOfDay,
      dayOfWeek,
      commonSkills: [skillId],
      count: 1,
    }

    this._entries.push({
      id: generateId(),
      type: 'temporal',
      data: pattern,
      tags: [`hour:${hourOfDay}`, `day:${dayOfWeek}`],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })

    this._trackChange()
    return pattern
  }

  // ─── Search / Retrieval ─────────────────────────────────────────────────

  /**
   * Search patterns by action sequence similarity.
   */
  searchPatterns(
    actionSequence: string[],
    minSimilarity = 0.5,
  ): OperationPattern[] {
    const patterns = this._entries
      .filter(e => e.type === 'pattern')
      .map(e => e.data as OperationPattern)

    const scored = patterns
      .map(p => ({
        pattern: p,
        similarity: sequenceSimilarity(actionSequence, p.actionSequence),
      }))
      .filter(s => s.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)

    return scored.map(s => s.pattern)
  }

  /**
   * General-purpose memory query.
   */
  search(query: MemoryQuery): MemoryEntry[] {
    let results = [...this._entries]

    if (query.type) {
      results = results.filter(e => e.type === query.type)
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(e => query.tags!.some(t => e.tags.includes(t)))
    }

    if (query.projectId) {
      results = results.filter(e => e.projectId === query.projectId)
    }

    if (query.after) {
      const afterTime = new Date(query.after).getTime()
      results = results.filter(
        e => new Date(e.updatedAt).getTime() >= afterTime,
      )
    }

    if (query.before) {
      const beforeTime = new Date(query.before).getTime()
      results = results.filter(
        e => new Date(e.updatedAt).getTime() <= beforeTime,
      )
    }

    if (query.appName) {
      results = results.filter(e => {
        if (e.type === 'pattern') {
          return (e.data as OperationPattern).contexts.some(c =>
            c.appName.toLowerCase().includes(query.appName!.toLowerCase()),
          )
        }
        return false
      })
    }

    if (query.textSearch) {
      const searchLower = query.textSearch.toLowerCase()
      results = results.filter(e => {
        const name =
          ('name' in e.data ? (e.data as { name?: string }).name : '') ?? ''
        const skillId =
          ('skillId' in e.data
            ? (e.data as { skillId?: string }).skillId
            : '') ?? ''
        return (
          name.toLowerCase().includes(searchLower) ||
          skillId.toLowerCase().includes(searchLower) ||
          e.tags.some(t => t.toLowerCase().includes(searchLower))
        )
      })
    }

    const limit = query.limit ?? 50
    return results.slice(0, limit)
  }

  /**
   * Get skill usage statistics.
   */
  getSkillUsage(skillId: string): SkillUsageRecord | null {
    return this._findSkillUsage(skillId) ?? null
  }

  /**
   * Get all skill usage records sorted by frequency.
   */
  getTopSkills(limit = 10): SkillUsageRecord[] {
    return this._entries
      .filter(e => e.type === 'skill_usage')
      .map(e => e.data as SkillUsageRecord)
      .sort((a, b) => b.totalExecutions - a.totalExecutions)
      .slice(0, limit)
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  /**
   * Delete a memory entry by ID.
   */
  delete(id: string): boolean {
    const index = this._entries.findIndex(e => e.id === id)
    if (index === -1) return false
    this._entries.splice(index, 1)
    this._trackChange()
    return true
  }

  /**
   * Clear all entries (full reset).
   */
  clear(): void {
    this._entries = []
    this._changeCount = 0
  }

  // ─── Instinct Integration ──────────────────────────────────────────────

  /**
   * Convert high-confidence patterns to Instinct-compatible format.
   * Returns patterns that should be promoted to instincts.
   */
  getPromotablePatterns(
    minConfidence = 0.7,
    minOccurrences = 3,
  ): OperationPattern[] {
    return this._entries
      .filter(e => e.type === 'pattern')
      .map(e => e.data as OperationPattern)
      .filter(
        p => p.confidence >= minConfidence && p.occurrences >= minOccurrences,
      )
  }

  /**
   * Update a pattern's success rate after replay.
   */
  updatePatternSuccess(patternId: string, success: boolean): void {
    const entry = this._entries.find(
      e => e.id === patternId && e.type === 'pattern',
    )
    if (!entry) return

    const pattern = entry.data as OperationPattern
    const total = pattern.occurrences
    const currentSuccesses = Math.round(pattern.successRate * total)
    const newSuccesses = success ? currentSuccesses + 1 : currentSuccesses
    pattern.successRate = newSuccesses / (total + 1)
    pattern.confidence = Math.min(
      1,
      pattern.confidence + (success ? 0.05 : -0.1),
    )
    entry.updatedAt = new Date().toISOString()

    this._trackChange()
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private _findSimilarPattern(
    sequence: string[],
  ): OperationPattern | undefined {
    for (const entry of this._entries) {
      if (entry.type !== 'pattern') continue
      const pattern = entry.data as OperationPattern
      if (sequenceSimilarity(sequence, pattern.actionSequence) >= 0.9) {
        return pattern
      }
    }
    return undefined
  }

  private _findSkillUsage(skillId: string): SkillUsageRecord | undefined {
    for (const entry of this._entries) {
      if (entry.type !== 'skill_usage') continue
      const record = entry.data as SkillUsageRecord
      if (record.skillId === skillId) return record
    }
    return undefined
  }

  private _findParamValue(
    paramName: string,
    value: string,
  ): ParamValueEntry | undefined {
    for (const entry of this._entries) {
      if (entry.type !== 'param_value') continue
      const pv = entry.data as ParamValueEntry
      if (pv.paramName === paramName && pv.value === value) return pv
    }
    return undefined
  }

  private _findTemporalPattern(
    hour: number,
    day: number,
  ): TemporalPattern | undefined {
    for (const entry of this._entries) {
      if (entry.type !== 'temporal') continue
      const tp = entry.data as TemporalPattern
      if (tp.hourOfDay === hour && tp.dayOfWeek === day) return tp
    }
    return undefined
  }

  private _getPatternCount(): number {
    return this._entries.filter(e => e.type === 'pattern').length
  }

  private _pruneParamValues(paramName: string): void {
    const max = this._options.maxRecentParamValues
    const paramEntries = this._entries
      .filter(
        e =>
          e.type === 'param_value' &&
          (e.data as ParamValueEntry).paramName === paramName,
      )
      .sort(
        (a, b) =>
          (a.data as ParamValueEntry).frequency -
          (b.data as ParamValueEntry).frequency,
      )

    while (paramEntries.length > max) {
      const toRemove = paramEntries.shift()!
      const idx = this._entries.indexOf(toRemove)
      if (idx !== -1) this._entries.splice(idx, 1)
    }
  }

  private _trackChange(): void {
    this._changeCount++
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/** Generate a unique ID. */
function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return `mem_${id}`
}

/** Build a human-readable pattern name from action sequence. */
function buildPatternName(sequence: string[]): string {
  const unique = [...new Set(sequence)]
  if (unique.length <= 3) {
    return unique.join(' → ')
  }
  return `${unique[0]} → ... → ${unique[unique.length - 1]} (${sequence.length} steps)`
}

/** Get default memory root directory. */
function getDefaultMemoryRoot(): string {
  if (process.env.CLAUDE_SKILL_LEARNING_HOME) {
    return `${process.env.CLAUDE_SKILL_LEARNING_HOME}/operation-memory`
  }
  const home = process.env.HOME ?? process.cwd()
  return `${home}/.claude/skill-learning/operation-memory`
}
