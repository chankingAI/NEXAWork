/**
 * NexaWork Security Center — shared pure helpers (N32)
 * =====================================================
 * Zero-dependency, side-effect-free logic for the security center:
 *  - the security policy model (sandbox / data security / system tools /
 *    built-in runtimes / experimental features) and its deep-merge patcher,
 *  - the sandbox "policy gate" that decides whether a tool category is guarded,
 *    bypassed, or left to the normal permission flow,
 *  - the audit-log model with filtering, summary and JSON export serialization.
 *
 * Everything here runs identically in the main process, the renderer and under
 * `bun test`; all disk / IPC / permission wiring lives in the SecurityManager
 * and the IPC handlers.
 *
 * The N33–N35 sub-pages extend this model: `SecurityConfig.rules` carries the
 * file / command / network rule lists (evaluated in `../shared/security-rules`),
 * each runtime tracks an install `status` (N34), and the audit filter gains a
 * time range + free-text search plus a CSV export format (N35).
 */
import {
  cloneRules,
  DEFAULT_SECURITY_RULES,
  normalizeRules,
  type SecurityRules,
} from './security-rules'

// ─── Policy model ─────────────────────────────────────────────

/** How system-level tools (outside the sandbox) may be used. */
export type SystemToolsMode = 'disabled' | 'readonly' | 'full'

export const SYSTEM_TOOLS_MODES: readonly SystemToolsMode[] = [
  'disabled',
  'readonly',
  'full',
] as const

/** Sandbox security: a master switch gating three sub-policies. */
export interface SandboxPolicy {
  /** Master switch — when off, the whole sandbox is disabled. */
  enabled: boolean
  /** Guard filesystem-mutating tools. */
  fileSecurity: boolean
  /** Guard command-execution tools. */
  commandSecurity: boolean
  /** Guard network-reaching tools. */
  networkSecurity: boolean
}

/** Data security: security gateway + transport encryption. */
export interface DataSecurityState {
  gateway: boolean
  encryption: boolean
}

/** Identifies a built-in runtime managed on the N34 sub-page. */
export type RuntimeId = 'python' | 'node' | 'gitBash'

export const RUNTIME_IDS: readonly RuntimeId[] = [
  'python',
  'node',
  'gitBash',
] as const

/** Install lifecycle of a built-in runtime (N34). */
export type RuntimeInstallStatus =
  | 'installed'
  | 'not-installed'
  | 'installing'
  | 'uninstalling'

/** A built-in runtime toggle with an optional detected version + install state. */
export interface RuntimeState {
  enabled: boolean
  version?: string
  /** Whether the runtime is currently provisioned (N34). */
  installed: boolean
  /** Install-lifecycle status (N34). */
  status: RuntimeInstallStatus
}

/** Built-in runtimes: a master switch + per-runtime toggles. */
export interface RuntimeConfig {
  enabled: boolean
  python: RuntimeState
  node: RuntimeState
  gitBash: RuntimeState
}

/** Experimental features. */
export interface ExperimentalFeatures {
  /** Track file versions on write. */
  versionManagement: boolean
  /** Route deletions through a recycle bin instead of unlinking. */
  deleteProtection: boolean
}

/** The complete security configuration persisted by the SecurityManager. */
export interface SecurityConfig {
  sandbox: SandboxPolicy
  dataSecurity: DataSecurityState
  systemTools: SystemToolsMode
  runtimes: RuntimeConfig
  experimental: ExperimentalFeatures
  /** File / command / network rule lists (N33). */
  rules: SecurityRules
}

/** Default policy: sandbox fully on, encryption on, system tools read-only. */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  sandbox: {
    enabled: true,
    fileSecurity: true,
    commandSecurity: true,
    networkSecurity: true,
  },
  dataSecurity: { gateway: true, encryption: true },
  systemTools: 'readonly',
  runtimes: {
    enabled: true,
    python: { enabled: true, installed: true, status: 'installed' },
    node: { enabled: true, installed: true, status: 'installed' },
    gitBash: { enabled: true, installed: true, status: 'installed' },
  },
  experimental: { versionManagement: false, deleteProtection: true },
  rules: DEFAULT_SECURITY_RULES,
}

/** A partial, nested patch accepted by `mergeSecurityConfig`. */
export interface SecurityConfigPatch {
  sandbox?: Partial<SandboxPolicy>
  dataSecurity?: Partial<DataSecurityState>
  systemTools?: SystemToolsMode
  runtimes?: {
    enabled?: boolean
    python?: Partial<RuntimeState>
    node?: Partial<RuntimeState>
    gitBash?: Partial<RuntimeState>
  }
  experimental?: Partial<ExperimentalFeatures>
  rules?: Partial<SecurityRules>
}

export function isValidSystemToolsMode(
  value: unknown,
): value is SystemToolsMode {
  return value === 'disabled' || value === 'readonly' || value === 'full'
}

/**
 * Deep-merge a partial patch into a base config, returning a new object.
 * Unknown / invalid `systemTools` values are ignored (the base is kept).
 */
export function mergeSecurityConfig(
  base: SecurityConfig,
  patch: SecurityConfigPatch | null | undefined,
): SecurityConfig {
  if (!patch) return cloneConfig(base)
  return {
    sandbox: { ...base.sandbox, ...patch.sandbox },
    dataSecurity: { ...base.dataSecurity, ...patch.dataSecurity },
    systemTools: isValidSystemToolsMode(patch.systemTools)
      ? patch.systemTools
      : base.systemTools,
    runtimes: {
      enabled: patch.runtimes?.enabled ?? base.runtimes.enabled,
      python: { ...base.runtimes.python, ...patch.runtimes?.python },
      node: { ...base.runtimes.node, ...patch.runtimes?.node },
      gitBash: { ...base.runtimes.gitBash, ...patch.runtimes?.gitBash },
    },
    experimental: { ...base.experimental, ...patch.experimental },
    rules: patch.rules
      ? normalizeRules({ ...base.rules, ...patch.rules })
      : cloneRules(base.rules),
  }
}

/** Structured clone of a config (no shared references). */
export function cloneConfig(config: SecurityConfig): SecurityConfig {
  return {
    sandbox: { ...config.sandbox },
    dataSecurity: { ...config.dataSecurity },
    systemTools: config.systemTools,
    runtimes: {
      enabled: config.runtimes.enabled,
      python: { ...config.runtimes.python },
      node: { ...config.runtimes.node },
      gitBash: { ...config.runtimes.gitBash },
    },
    experimental: { ...config.experimental },
    rules: cloneRules(config.rules),
  }
}

/**
 * Coerce an arbitrary (possibly partially-shaped or legacy) value into a valid
 * SecurityConfig, filling any missing field from the defaults. Used when
 * loading persisted config that may predate newer fields.
 */
export function normalizeSecurityConfig(value: unknown): SecurityConfig {
  if (!value || typeof value !== 'object') {
    return cloneConfig(DEFAULT_SECURITY_CONFIG)
  }
  return mergeSecurityConfig(
    DEFAULT_SECURITY_CONFIG,
    value as SecurityConfigPatch,
  )
}

// ─── Sandbox policy gate ──────────────────────────────────────

/** Sets of tool names, by the sandbox category they belong to. */
const FILE_TOOLS = new Set(['FileWriteTool', 'FileEditTool'])
const COMMAND_TOOLS = new Set(['BashTool', 'PowerShellTool', 'REPLTool'])
const NETWORK_TOOLS = new Set(['WebFetchTool', 'WebSearchTool', 'MCPTool'])

/** The audit categories a security event can belong to. */
export type AuditCategory =
  | 'file'
  | 'command'
  | 'network'
  | 'policy'
  | 'runtime'
  | 'data'

/** Map a tool name onto the sandbox category it touches, or null. */
export function toolCategory(tool: string): AuditCategory | null {
  if (FILE_TOOLS.has(tool)) return 'file'
  if (COMMAND_TOOLS.has(tool)) return 'command'
  if (NETWORK_TOOLS.has(tool)) return 'network'
  return null
}

/**
 * Pull the rule target (path / command / URL) out of a tool's input payload,
 * so the N33 rules can be evaluated against the concrete operation. Returns an
 * empty string when no recognisable target is present.
 */
export function extractToolTarget(
  category: 'file' | 'command' | 'network',
  input: unknown,
): string {
  if (!input || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = obj[key]
      if (typeof value === 'string' && value.length > 0) return value
    }
    return ''
  }
  if (category === 'file')
    return pick('file_path', 'path', 'filePath', 'target')
  if (category === 'command') return pick('command', 'cmd', 'script', 'input')
  return pick('url', 'href', 'endpoint', 'target')
}

/** Per-category effective state (a sub-policy is active only with master on). */
export function effectiveSandbox(p: SandboxPolicy): {
  fileSecurity: boolean
  commandSecurity: boolean
  networkSecurity: boolean
} {
  return {
    fileSecurity: p.enabled && p.fileSecurity,
    commandSecurity: p.enabled && p.commandSecurity,
    networkSecurity: p.enabled && p.networkSecurity,
  }
}

/**
 * Sandbox decision for a tool:
 *  - 'guard' — the category is protected; defer to the normal permission flow.
 *  - 'allow' — the category is unguarded (sub-policy off, or sandbox off);
 *    the tool may bypass the permission prompt.
 *  - null     — the tool is not a sandbox-relevant category; no opinion.
 */
export function gateDecision(
  config: SecurityConfig,
  tool: string,
): 'guard' | 'allow' | null {
  const category = toolCategory(tool)
  if (!category) return null
  if (!config.sandbox.enabled) return 'allow'
  const eff = effectiveSandbox(config.sandbox)
  const guarded =
    category === 'file'
      ? eff.fileSecurity
      : category === 'command'
        ? eff.commandSecurity
        : eff.networkSecurity
  return guarded ? 'guard' : 'allow'
}

// ─── Audit log ────────────────────────────────────────────────

export type AuditDecision = 'allow' | 'deny' | 'intercept'

/** A single recorded security event, persisted to the audit store. */
export interface AuditLogEntry {
  id: string
  timestamp: string
  category: AuditCategory
  action: string
  decision: AuditDecision
  detail: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
}

/** Tone colors for audit decisions (used by the badge in the renderer). */
export const AUDIT_DECISION_COLOR: Record<AuditDecision, string> = {
  allow: '#34C759',
  deny: '#FF3B30',
  intercept: '#FF9500',
}

export interface AuditFilter {
  category?: AuditCategory | 'all'
  decision?: AuditDecision | 'all'
  /** Inclusive lower bound (ISO timestamp); entries before are excluded (N35). */
  from?: string
  /** Inclusive upper bound (ISO timestamp); entries after are excluded (N35). */
  to?: string
  /** Free-text search across action + detail, case-insensitive (N35). */
  search?: string
}

/** Parse an ISO timestamp into epoch ms, or null when unparseable. */
function parseTime(value: string | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Filter audit entries by category, decision, time range and free-text search
 * ('all' / undefined = no filter for that dimension) — N35.
 */
export function filterAuditLog(
  entries: AuditLogEntry[],
  filter: AuditFilter = {},
): AuditLogEntry[] {
  const { category = 'all', decision = 'all' } = filter
  const from = parseTime(filter.from)
  const to = parseTime(filter.to)
  const search = filter.search?.trim().toLowerCase() ?? ''
  return entries.filter(e => {
    if (category !== 'all' && e.category !== category) return false
    if (decision !== 'all' && e.decision !== decision) return false
    if (from !== null || to !== null) {
      const ts = new Date(e.timestamp).getTime()
      if (!Number.isNaN(ts)) {
        if (from !== null && ts < from) return false
        if (to !== null && ts > to) return false
      }
    }
    if (search) {
      const haystack = `${e.action} ${e.detail}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

/** Aggregate decision counts for the audit summary badges. */
export function summarizeAudit(entries: AuditLogEntry[]): {
  total: number
  allowed: number
  denied: number
  intercepted: number
} {
  let allowed = 0
  let denied = 0
  let intercepted = 0
  for (const e of entries) {
    if (e.decision === 'allow') allowed++
    else if (e.decision === 'deny') denied++
    else intercepted++
  }
  return { total: entries.length, allowed, denied, intercepted }
}

/** Serialize the audit log to a stable, pretty-printed JSON document. */
export function serializeAuditLog(
  entries: AuditLogEntry[],
  now: Date = new Date(),
): string {
  return `${JSON.stringify(
    {
      kind: 'nexawork-audit-log',
      version: 1,
      exportedAt: now.toISOString(),
      count: entries.length,
      entries,
    },
    null,
    2,
  )}\n`
}

/** Supported audit export formats (N35). */
export type AuditExportFormat = 'json' | 'csv'

export const AUDIT_EXPORT_FORMATS: readonly AuditExportFormat[] = [
  'json',
  'csv',
] as const

export function isAuditExportFormat(
  value: unknown,
): value is AuditExportFormat {
  return value === 'json' || value === 'csv'
}

/** Escape a CSV field per RFC 4180 (quote when it contains ,"\n). */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Serialize the audit log to a CSV document with a header row (N35). */
export function serializeAuditCsv(entries: AuditLogEntry[]): string {
  const header = [
    'id',
    'timestamp',
    'category',
    'action',
    'decision',
    'riskLevel',
    'detail',
  ]
  const rows = entries.map(e =>
    [e.id, e.timestamp, e.category, e.action, e.decision, e.riskLevel, e.detail]
      .map(csvField)
      .join(','),
  )
  return `${[header.join(','), ...rows].join('\r\n')}\r\n`
}

/** Serialize the audit log in the requested format (N35). */
export function serializeAudit(
  entries: AuditLogEntry[],
  format: AuditExportFormat = 'json',
  now: Date = new Date(),
): string {
  return format === 'csv'
    ? serializeAuditCsv(entries)
    : serializeAuditLog(entries, now)
}

/** Build a timestamped export filename, e.g. `nexawork-audit-20260624-0550.json`. */
export function auditExportFilename(
  format: AuditExportFormat = 'json',
  now: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `nexawork-audit-${stamp}.${format}`
}
