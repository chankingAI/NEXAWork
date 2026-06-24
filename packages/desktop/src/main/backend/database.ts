/**
 * NexaWork Persistent Database
 * ============================
 * A small, dependency-free persistence layer used by the main process to durably
 * store automations, automation runs, and projects across app restarts.
 *
 * Why JSON-file-backed instead of native SQLite:
 *  - The Electron main process runs on Electron's bundled Node runtime, where
 *    `bun:sqlite` is unavailable and `better-sqlite3` requires a fragile native
 *    rebuild against the Electron ABI. A single atomically-written JSON document
 *    gives real on-disk persistence with zero native dependencies and runs
 *    identically under `bun test`.
 *  - The public API is table-oriented (insert/update/delete/all/find) so a
 *    SQLite-backed implementation can be swapped in later without touching
 *    call sites.
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
import type {
  AutomationInfo,
  AutomationRun,
  ProjectInfo,
} from '../../shared/ipc-channels'
import type {
  AuditLogEntry,
  SecurityConfig,
} from '../../shared/security-center'

interface DBSchema {
  version: number
  automations: AutomationInfo[]
  automationRuns: AutomationRun[]
  projects: ProjectInfo[]
  /** N32 security center: the persisted policy (null until first write). */
  securityConfig: SecurityConfig | null
  /** N32 security center: the durable audit log ("SQLite" stand-in). */
  auditLog: AuditLogEntry[]
}

const EMPTY_SCHEMA: DBSchema = {
  version: 1,
  automations: [],
  automationRuns: [],
  projects: [],
  securityConfig: null,
  auditLog: [],
}

/** Cap the audit log so the JSON document stays bounded. */
const MAX_AUDIT_ENTRIES = 1000

export class Database {
  private data: DBSchema
  /** Absolute path of the JSON file, or null for in-memory (tests). */
  private readonly filePath: string | null

  constructor(filePath: string | null = null) {
    this.filePath = filePath
    this.data = this.load()
  }

  // ── Persistence ──
  private load(): DBSchema {
    if (!this.filePath || !existsSync(this.filePath)) {
      return structuredClone(EMPTY_SCHEMA)
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<DBSchema>
      return {
        version: parsed.version ?? 1,
        automations: parsed.automations ?? [],
        automationRuns: parsed.automationRuns ?? [],
        projects: parsed.projects ?? [],
        securityConfig: parsed.securityConfig ?? null,
        auditLog: parsed.auditLog ?? [],
      }
    } catch {
      // Corrupt file → start clean rather than crash the app.
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

  // ── Automations ──
  listAutomations(status?: AutomationInfo['status']): AutomationInfo[] {
    const all = [...this.data.automations].sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    )
    return status ? all.filter(a => a.status === status) : all
  }

  getAutomation(id: string): AutomationInfo | null {
    return this.data.automations.find(a => a.id === id) ?? null
  }

  insertAutomation(automation: AutomationInfo): AutomationInfo {
    this.data.automations.push(automation)
    this.persist()
    return automation
  }

  updateAutomation(
    id: string,
    updates: Partial<AutomationInfo>,
  ): AutomationInfo | null {
    const idx = this.data.automations.findIndex(a => a.id === id)
    if (idx === -1) return null
    const merged = { ...this.data.automations[idx], ...updates, id }
    this.data.automations[idx] = merged
    this.persist()
    return merged
  }

  deleteAutomation(id: string): boolean {
    const before = this.data.automations.length
    this.data.automations = this.data.automations.filter(a => a.id !== id)
    this.data.automationRuns = this.data.automationRuns.filter(
      r => r.automationId !== id,
    )
    const changed = this.data.automations.length !== before
    if (changed) this.persist()
    return changed
  }

  // ── Automation Runs ──
  insertRun(run: AutomationRun): AutomationRun {
    this.data.automationRuns.push(run)
    this.persist()
    return run
  }

  updateRun(id: string, updates: Partial<AutomationRun>): AutomationRun | null {
    const idx = this.data.automationRuns.findIndex(r => r.id === id)
    if (idx === -1) return null
    const merged = { ...this.data.automationRuns[idx], ...updates, id }
    this.data.automationRuns[idx] = merged
    this.persist()
    return merged
  }

  listRuns(automationId: string, limit = 20): AutomationRun[] {
    return this.data.automationRuns
      .filter(r => r.automationId === automationId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
  }

  // ── Projects ──
  listProjects(query?: string): ProjectInfo[] {
    let all = [...this.data.projects].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    if (query && query.trim()) {
      const q = query.toLowerCase()
      all = all.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    }
    return all
  }

  getProject(id: string): ProjectInfo | null {
    return this.data.projects.find(p => p.id === id) ?? null
  }

  insertProject(project: ProjectInfo): ProjectInfo {
    this.data.projects.push(project)
    this.persist()
    return project
  }

  updateProject(id: string, updates: Partial<ProjectInfo>): ProjectInfo | null {
    const idx = this.data.projects.findIndex(p => p.id === id)
    if (idx === -1) return null
    const merged = { ...this.data.projects[idx], ...updates, id }
    this.data.projects[idx] = merged
    this.persist()
    return merged
  }

  deleteProject(id: string): boolean {
    const before = this.data.projects.length
    this.data.projects = this.data.projects.filter(p => p.id !== id)
    const changed = this.data.projects.length !== before
    if (changed) this.persist()
    return changed
  }

  // ── Security center (N32) ──
  getSecurityConfig(): SecurityConfig | null {
    return this.data.securityConfig
  }

  setSecurityConfig(config: SecurityConfig): SecurityConfig {
    this.data.securityConfig = config
    this.persist()
    return config
  }

  /** Newest-first audit entries, optionally limited. */
  listAuditLog(limit?: number): AuditLogEntry[] {
    const entries = [...this.data.auditLog].reverse()
    return limit ? entries.slice(0, limit) : entries
  }

  appendAuditLog(entry: AuditLogEntry): AuditLogEntry {
    this.data.auditLog.push(entry)
    if (this.data.auditLog.length > MAX_AUDIT_ENTRIES) {
      this.data.auditLog.splice(
        0,
        this.data.auditLog.length - MAX_AUDIT_ENTRIES,
      )
    }
    this.persist()
    return entry
  }

  clearAuditLog(): void {
    if (this.data.auditLog.length === 0) return
    this.data.auditLog = []
    this.persist()
  }

  // ── Bulk export / restore (N23 data management) ──
  /** Snapshot every table for export/backup. */
  exportData(): {
    automations: AutomationInfo[]
    automationRuns: AutomationRun[]
    projects: ProjectInfo[]
  } {
    return {
      automations: [...this.data.automations],
      automationRuns: [...this.data.automationRuns],
      projects: [...this.data.projects],
    }
  }

  /** Replace every table at once (lossless restore). */
  replaceData(data: {
    automations?: AutomationInfo[]
    automationRuns?: AutomationRun[]
    projects?: ProjectInfo[]
  }): void {
    this.data = {
      version: this.data.version,
      automations: data.automations ?? [],
      automationRuns: data.automationRuns ?? [],
      projects: data.projects ?? [],
      // Security policy + audit log are out of N23's scope; preserve them
      // across a data-management restore.
      securityConfig: this.data.securityConfig,
      auditLog: this.data.auditLog,
    }
    this.persist()
  }

  // ── Maintenance (tests) ──
  reset(): void {
    this.data = structuredClone(EMPTY_SCHEMA)
    this.persist()
  }
}

// ─── Singleton management ─────────────────────────────────────
let instance: Database | null = null

/** Initialize the singleton DB. Pass a file path in production, null in tests. */
export function initDatabase(filePath: string | null): Database {
  instance = new Database(filePath)
  return instance
}

/** Get the singleton DB, initializing an in-memory one on first use. */
export function getDatabase(): Database {
  if (!instance) instance = new Database(null)
  return instance
}
