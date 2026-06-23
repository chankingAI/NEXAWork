/**
 * NexaWork Operation Memory Store (N22)
 * =====================================
 * Persistence layer for the operationMemory system: durable, deletable records
 * of what the assistant has learned/done, surfaced in the 记忆 (Memory) settings
 * tab. Mirrors {@link ./database.ts}: a single atomically-written JSON document
 * keeps zero native dependencies and runs identically under `bun test`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'

/** A single operation-memory record shown in the memory list. */
export interface MemoryEntry {
  id: string
  /** Human-readable memory content. */
  content: string
  /** Coarse grouping (e.g. 'preference', 'fact', 'operation'). */
  category: string
  /** ISO timestamp the memory was captured. */
  createdAt: string
}

interface MemorySchema {
  version: number
  entries: MemoryEntry[]
}

const EMPTY_SCHEMA: MemorySchema = { version: 1, entries: [] }

export class MemoryStore {
  private data: MemorySchema
  /** Absolute path of the JSON file, or null for in-memory (tests). */
  private readonly filePath: string | null

  constructor(filePath: string | null = null) {
    this.filePath = filePath
    this.data = this.load()
  }

  // ── Persistence ──
  private load(): MemorySchema {
    if (!this.filePath || !existsSync(this.filePath)) {
      return structuredClone(EMPTY_SCHEMA)
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<MemorySchema>
      return {
        version: parsed.version ?? 1,
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      }
    } catch {
      return structuredClone(EMPTY_SCHEMA)
    }
  }

  private persist(): void {
    if (!this.filePath) return
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }

  // ── Reads ──
  /** All entries, newest first. */
  list(): MemoryEntry[] {
    return [...this.data.entries].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
  }

  count(): number {
    return this.data.entries.length
  }

  // ── Writes ──
  add(input: { content: string; category?: string }): MemoryEntry {
    const entry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: input.content,
      category: input.category ?? 'general',
      createdAt: new Date().toISOString(),
    }
    this.data.entries.push(entry)
    this.persist()
    return entry
  }

  /** Delete a single entry by id. Returns true when something was removed. */
  delete(id: string): boolean {
    const before = this.data.entries.length
    this.data.entries = this.data.entries.filter(e => e.id !== id)
    const changed = this.data.entries.length !== before
    if (changed) this.persist()
    return changed
  }

  /** Remove every memory entry. */
  clear(): void {
    this.data.entries = []
    this.persist()
  }

  /**
   * Drop entries older than `retentionDays`. Returns the number pruned so the
   * caller can react (e.g. broadcast a refresh).
   */
  prune(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const before = this.data.entries.length
    this.data.entries = this.data.entries.filter(
      e => new Date(e.createdAt).getTime() >= cutoff,
    )
    const pruned = before - this.data.entries.length
    if (pruned > 0) this.persist()
    return pruned
  }
}

// ─── Singleton management ─────────────────────────────────────
let instance: MemoryStore | null = null

/** Initialize the singleton memory store. Pass null for in-memory (tests). */
export function initMemoryStore(filePath: string | null): MemoryStore {
  instance = new MemoryStore(filePath)
  return instance
}

/** Get the singleton store, initializing an in-memory one on first use. */
export function getMemoryStore(): MemoryStore {
  if (!instance) instance = new MemoryStore(null)
  return instance
}
