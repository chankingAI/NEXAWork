/**
 * NexaWork Settings Store (N21)
 * =============================
 * A small, dependency-free persistence layer for user settings. Mirrors the
 * approach used by {@link ./database.ts}: a single atomically-written JSON
 * document (`settings.json`) gives real on-disk persistence with zero native
 * dependencies and runs identically under `bun test`.
 *
 * Settings are stored as a flat key/value map so dotted keys (e.g.
 * `apiKeys.anthropic`) keep working alongside the typed {@link AppSettings}
 * fields. Reset restores the provided defaults.
 *
 * Durability: writes go to a temp file and are atomically renamed into place.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'

export class SettingsStore {
  private data: Record<string, unknown>
  private readonly defaults: Record<string, unknown>
  /** Absolute path of the JSON file, or null for in-memory (tests). */
  private readonly filePath: string | null

  constructor(
    filePath: string | null = null,
    defaults: Record<string, unknown> = {},
  ) {
    this.filePath = filePath
    this.defaults = structuredClone(defaults)
    this.data = this.load()
  }

  // ── Persistence ──
  private load(): Record<string, unknown> {
    const base = structuredClone(this.defaults)
    if (!this.filePath || !existsSync(this.filePath)) return base
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return { ...base, ...parsed }
    } catch {
      // Corrupt file → start from defaults rather than crash the app.
      return base
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
  /** Snapshot of all settings (defaults merged with persisted overrides). */
  all(): Record<string, unknown> {
    return { ...this.data }
  }

  get(key: string): unknown {
    return this.data[key]
  }

  // ── Writes ──
  set(key: string, value: unknown): void {
    this.data[key] = value
    this.persist()
  }

  /** Apply a batch of updates in a single persist. */
  setMany(updates: Record<string, unknown>): void {
    Object.assign(this.data, updates)
    this.persist()
  }

  /**
   * Reset a single key (or everything when no key is given) back to its
   * default. Keys without a default are removed entirely.
   */
  reset(key?: string): void {
    if (key) {
      if (key in this.defaults) {
        this.data[key] = structuredClone(this.defaults[key])
      } else {
        delete this.data[key]
      }
    } else {
      this.data = structuredClone(this.defaults)
    }
    this.persist()
  }
}

// ─── Singleton management ─────────────────────────────────────
let instance: SettingsStore | null = null

/** Initialize the singleton settings store. Pass null for in-memory (tests). */
export function initSettingsStore(
  filePath: string | null,
  defaults: Record<string, unknown> = {},
): SettingsStore {
  instance = new SettingsStore(filePath, defaults)
  return instance
}

/** Get the singleton store, initializing an in-memory one on first use. */
export function getSettingsStore(): SettingsStore {
  if (!instance) instance = new SettingsStore(null, {})
  return instance
}
