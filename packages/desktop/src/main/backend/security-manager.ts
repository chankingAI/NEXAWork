/**
 * NexaWork Security Manager (N32)
 * ================================
 * Owns the security-center state: the security policy (sandbox / data security
 * / system-level tools / built-in runtimes / experimental features) and the
 * durable audit log. The policy is persisted through the project `Database`
 * (the documented SQLite stand-in) so it survives restarts, and every
 * policy change / sandbox interception is appended to the audit log.
 *
 * Following the N28–N31 managers, the persistence layer (`Database`) and the
 * runtime-version probe (`RuntimeProbe`, a thin `execFile` wrapper) are both
 * injectable, so unit tests run against an in-memory DB with a fake probe and
 * never touch Electron. All pure policy/audit logic lives in
 * `../../shared/security-center`, reused verbatim by the renderer.
 *
 * Per the N32 integration constraint this manager is the bridge between the
 * permissions system and the sandbox runtime: `gate()` turns the sandbox
 * policy into a permission-flow decision, and `recordToolDecision()` funnels
 * permission outcomes into the audit log.
 */
import { execFile } from 'child_process'
import {
  type AuditCategory,
  type AuditDecision,
  type AuditLogEntry,
  cloneConfig,
  DEFAULT_SECURITY_CONFIG,
  gateDecision,
  mergeSecurityConfig,
  normalizeSecurityConfig,
  type SecurityConfig,
  type SecurityConfigPatch,
  serializeAuditLog,
  toolCategory,
} from '../../shared/security-center'
import { type Database, getDatabase } from './database'

/** Probe a runtime's version string, or null when it is unavailable. */
export type RuntimeProbe = (
  command: string,
  args: string[],
) => Promise<string | null>

export interface SecurityManagerOptions {
  /** Persistence layer (defaults to the shared singleton Database). */
  db?: Database
  /** Injectable runtime-version probe (defaults to a real `execFile`). */
  probe?: RuntimeProbe
  /** Probe + cache built-in runtime versions on init (default true). */
  probeRuntimes?: boolean
}

type ChangeListener = () => void

/** Default probe: run `<command> --version` and return the first line. */
function defaultProbe(command: string, args: string[]): Promise<string | null> {
  return new Promise(resolve => {
    execFile(command, args, { timeout: 4000 }, (err, stdout, stderr) => {
      if (err) {
        resolve(null)
        return
      }
      const out = (stdout || stderr || '').trim()
      resolve(out ? out.split('\n')[0] : null)
    })
  })
}

/** Extract a dotted version (e.g. `3.11.4`) from a `--version` line. */
export function extractVersion(raw: string | null): string | undefined {
  if (!raw) return undefined
  const match = raw.match(/(\d+\.\d+(?:\.\d+)?)/)
  return match ? match[1] : undefined
}

export class SecurityManager {
  private readonly db: Database
  private readonly probe: RuntimeProbe
  private readonly shouldProbe: boolean
  private config: SecurityConfig
  private readonly changeListeners = new Set<ChangeListener>()
  private idCounter = 0

  constructor(opts: SecurityManagerOptions = {}) {
    this.db = opts.db ?? getDatabase()
    this.probe = opts.probe ?? defaultProbe
    this.shouldProbe = opts.probeRuntimes ?? true
    const stored = this.db.getSecurityConfig()
    this.config = stored
      ? normalizeSecurityConfig(stored)
      : cloneConfig(DEFAULT_SECURITY_CONFIG)
    if (!stored) this.db.setSecurityConfig(this.config)
    if (this.shouldProbe) void this.refreshRuntimeVersions()
  }

  // ─── Config ───────────────────────────────────────────────────

  getConfig(): SecurityConfig {
    return cloneConfig(this.config)
  }

  /**
   * Merge a partial patch into the policy, persist it, record an audit entry
   * describing the change, and notify listeners.
   */
  updateConfig(patch: SecurityConfigPatch): SecurityConfig {
    const previous = this.config
    this.config = mergeSecurityConfig(previous, patch)
    this.db.setSecurityConfig(this.config)
    this.recordPolicyChange(previous, this.config, patch)
    this.emitChange()
    return cloneConfig(this.config)
  }

  // ─── Sandbox gate (permissions bridge) ────────────────────────

  /**
   * Sandbox decision for a tool, mapped onto the permission flow:
   *  - `true`  → unguarded category; the tool may bypass the prompt.
   *  - `null`  → guarded category (or unknown tool); use the normal flow.
   */
  gate(tool: string): boolean | null {
    const decision = gateDecision(this.config, tool)
    return decision === 'allow' ? true : null
  }

  /**
   * Record the outcome of a tool permission decision into the audit log, when
   * the tool maps onto a sandbox category. Returns the entry, or null when the
   * tool is not security-relevant.
   */
  recordToolDecision(
    tool: string,
    allowed: boolean,
    detail: string,
    riskLevel: AuditLogEntry['riskLevel'],
  ): AuditLogEntry | null {
    const category = toolCategory(tool)
    if (!category) return null
    return this.appendAudit({
      category,
      action: tool,
      decision: allowed ? 'allow' : 'deny',
      detail,
      riskLevel,
    })
  }

  // ─── Audit log ────────────────────────────────────────────────

  /** Append an audit entry (id + timestamp are assigned here). */
  appendAudit(input: {
    category: AuditCategory
    action: string
    decision: AuditDecision
    detail: string
    riskLevel?: AuditLogEntry['riskLevel']
  }): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.nextId(),
      timestamp: new Date().toISOString(),
      category: input.category,
      action: input.action,
      decision: input.decision,
      detail: input.detail,
      riskLevel: input.riskLevel ?? 'LOW',
    }
    this.db.appendAuditLog(entry)
    this.emitChange()
    return entry
  }

  listAudit(limit?: number): AuditLogEntry[] {
    return this.db.listAuditLog(limit)
  }

  clearAudit(): void {
    this.db.clearAuditLog()
    this.emitChange()
  }

  /** Serialize the full audit log to a JSON export document. */
  exportAudit(now: Date = new Date()): string {
    return serializeAuditLog(this.db.listAuditLog(), now)
  }

  // ─── Runtime version probing ──────────────────────────────────

  /** Probe Python / Node versions and cache them into the policy. */
  async refreshRuntimeVersions(): Promise<void> {
    const [py, node] = await Promise.all([
      this.probe('python3', ['--version']),
      this.probe('node', ['--version']),
    ])
    const python = extractVersion(py)
    const nodeVersion = extractVersion(node)
    if (!python && !nodeVersion) return
    this.config = mergeSecurityConfig(this.config, {
      runtimes: {
        ...(python
          ? { python: { ...this.config.runtimes.python, version: python } }
          : {}),
        ...(nodeVersion
          ? { node: { ...this.config.runtimes.node, version: nodeVersion } }
          : {}),
      },
    })
    this.db.setSecurityConfig(this.config)
    this.emitChange()
  }

  // ─── Change events ────────────────────────────────────────────

  onChanged(listener: ChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) listener()
  }

  dispose(): void {
    this.changeListeners.clear()
  }

  /** Test hook: reset policy to defaults and clear the audit log. */
  reset(): void {
    this.config = cloneConfig(DEFAULT_SECURITY_CONFIG)
    this.db.setSecurityConfig(this.config)
    this.db.clearAuditLog()
    this.idCounter = 0
  }

  // ─── Internals ────────────────────────────────────────────────

  private nextId(): string {
    this.idCounter += 1
    return `audit-${Date.now().toString(36)}-${this.idCounter}`
  }

  private recordPolicyChange(
    previous: SecurityConfig,
    next: SecurityConfig,
    patch: SecurityConfigPatch,
  ): void {
    const changes = describePolicyChanges(previous, next)
    if (changes.length === 0) return
    const category: AuditCategory = patch.runtimes
      ? 'runtime'
      : patch.dataSecurity
        ? 'data'
        : 'policy'
    this.appendAudit({
      category,
      action: 'policy:update',
      decision: 'intercept',
      detail: changes.join('; '),
      riskLevel: 'LOW',
    })
  }
}

/** Human-readable diff of two policies (used for the audit detail). */
export function describePolicyChanges(
  previous: SecurityConfig,
  next: SecurityConfig,
): string[] {
  const out: string[] = []
  const boolFields: Array<[string, boolean, boolean]> = [
    ['sandbox', previous.sandbox.enabled, next.sandbox.enabled],
    ['sandbox.file', previous.sandbox.fileSecurity, next.sandbox.fileSecurity],
    [
      'sandbox.command',
      previous.sandbox.commandSecurity,
      next.sandbox.commandSecurity,
    ],
    [
      'sandbox.network',
      previous.sandbox.networkSecurity,
      next.sandbox.networkSecurity,
    ],
    ['data.gateway', previous.dataSecurity.gateway, next.dataSecurity.gateway],
    [
      'data.encryption',
      previous.dataSecurity.encryption,
      next.dataSecurity.encryption,
    ],
    ['runtimes', previous.runtimes.enabled, next.runtimes.enabled],
    [
      'runtimes.python',
      previous.runtimes.python.enabled,
      next.runtimes.python.enabled,
    ],
    [
      'runtimes.node',
      previous.runtimes.node.enabled,
      next.runtimes.node.enabled,
    ],
    [
      'runtimes.gitBash',
      previous.runtimes.gitBash.enabled,
      next.runtimes.gitBash.enabled,
    ],
    [
      'experimental.versionManagement',
      previous.experimental.versionManagement,
      next.experimental.versionManagement,
    ],
    [
      'experimental.deleteProtection',
      previous.experimental.deleteProtection,
      next.experimental.deleteProtection,
    ],
  ]
  for (const [name, before, after] of boolFields) {
    if (before !== after) out.push(`${name}=${after ? 'on' : 'off'}`)
  }
  if (previous.systemTools !== next.systemTools) {
    out.push(`systemTools=${next.systemTools}`)
  }
  return out
}

// ─── Singleton management ─────────────────────────────────────
let instance: SecurityManager | null = null

/** Initialize the singleton security manager. */
export function initSecurityManager(
  opts: SecurityManagerOptions = {},
): SecurityManager {
  instance?.dispose()
  instance = new SecurityManager(opts)
  return instance
}

/** Get the singleton, initializing a default one on first use. */
export function getSecurityManager(): SecurityManager {
  if (!instance) instance = new SecurityManager()
  return instance
}
