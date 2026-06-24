/**
 * NexaWork Permission Manager (N17)
 *
 * Owns the desktop permission mode, session-scoped allow rules, the permission
 * decision round-trip with the renderer, and the permission log.
 *
 * Protocol is designed to map onto the backend `src/types/permissions.ts` system
 * (PermissionMode / PermissionBehavior / RiskLevel) so that, once the real
 * QueryEngine process is wired in, this manager can delegate to it without
 * changing the renderer-facing contract.
 */
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type {
  DesktopPermissionMode,
  PermissionDecisionAction,
  PermissionLogEntry,
  PermissionRequest,
  PermissionRiskLevel,
  PermissionScope,
} from '../../shared/ipc-channels'

/** Minimal window surface needed for the permission round-trip (eases testing). */
export interface PermissionWindow {
  isDestroyed(): boolean
  webContents: { send(channel: string, payload: unknown): void }
}

/** A tool invocation awaiting a permission decision. */
export interface ToolRequest {
  name: string
  input: Record<string, unknown>
}

/** Backend permission mode (mirrors src/types/permissions.ts PermissionMode subset). */
export type BackendPermissionMode = 'default' | 'bypassPermissions'

export const PERMISSION_TIMEOUT_MS = 60_000
const MAX_LOG_ENTRIES = 500

// ─── Pure Helpers (testable) ──────────────────────────────────

/** Map the desktop toolbar mode onto the backend PermissionMode. */
export function mapToBackendMode(
  mode: DesktopPermissionMode,
): BackendPermissionMode {
  return mode === 'full' ? 'bypassPermissions' : 'default'
}

/** Tools that perform irreversible / system-level operations. */
const HIGH_RISK_TOOLS = new Set([
  'BashTool',
  'PowerShellTool',
  'REPLTool',
  'FileWriteTool',
  'FileEditTool',
])

/** Tools that reach the network. */
const MEDIUM_RISK_TOOLS = new Set(['WebFetchTool', 'WebSearchTool', 'MCPTool'])

export interface ToolClassification {
  riskLevel: PermissionRiskLevel
  description: string
  affectedScope: string
}

/**
 * Classify a tool into a risk level with a human-readable description and the
 * scope it affects, used to populate the confirmation dialog.
 */
export function classifyTool(tool: ToolRequest): ToolClassification {
  if (HIGH_RISK_TOOLS.has(tool.name)) {
    const path =
      typeof tool.input.file_path === 'string'
        ? tool.input.file_path
        : undefined
    const command =
      typeof tool.input.command === 'string' ? tool.input.command : undefined
    return {
      riskLevel: 'HIGH',
      description: command
        ? `执行命令：${command}`
        : `修改文件系统：${tool.name}`,
      affectedScope: path ?? command ?? '本地系统',
    }
  }
  if (MEDIUM_RISK_TOOLS.has(tool.name)) {
    const url = typeof tool.input.url === 'string' ? tool.input.url : undefined
    return {
      riskLevel: 'MEDIUM',
      description: `联网访问：${tool.name}`,
      affectedScope: url ?? '网络',
    }
  }
  return {
    riskLevel: 'LOW',
    description: `只读操作：${tool.name}`,
    affectedScope: '沙箱内',
  }
}

/** Produce a short single-line summary of tool input for the log. */
export function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(input)) {
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    parts.push(`${key}=${str.length > 40 ? `${str.slice(0, 40)}…` : str}`)
    if (parts.length >= 3) break
  }
  return parts.join(' ')
}

// ─── Permission Manager ───────────────────────────────────────

interface PendingRequest {
  resolve: (allowed: boolean) => void
  timeout: ReturnType<typeof setTimeout>
  tool: ToolRequest
  riskLevel: PermissionRiskLevel
}

/**
 * Sandbox policy gate (N32). Given a tool name, returns `true` to auto-allow
 * (an unguarded sandbox category), or `null` to defer to the normal flow.
 */
export type PolicyGate = (tool: string) => boolean | null

/** Audit sink (N32): forwards every recorded decision to the security center. */
export type AuditSink = (info: {
  tool: string
  allowed: boolean
  detail: string
  riskLevel: PermissionRiskLevel
}) => void

export class PermissionManager {
  private mode: DesktopPermissionMode = 'default'
  private bypassAvailable: boolean
  private readonly sessionAllow = new Set<string>()
  private readonly pending = new Map<string, PendingRequest>()
  private readonly log: PermissionLogEntry[] = []
  private idCounter = 0
  private policyGate?: PolicyGate
  private auditSink?: AuditSink

  constructor(options?: { bypassAvailable?: boolean }) {
    // bypassPermissions is unavailable when running as root / inside a sandbox.
    this.bypassAvailable =
      options?.bypassAvailable ?? !isPrivilegedEnvironment()
  }

  getMode(): DesktopPermissionMode {
    return this.mode
  }

  isBypassAvailable(): boolean {
    return this.bypassAvailable
  }

  /** Wire the N32 sandbox policy gate (optional). */
  setPolicyGate(gate: PolicyGate | null): void {
    this.policyGate = gate ?? undefined
  }

  /** Wire the N32 audit sink so decisions reach the security center log. */
  setAuditSink(sink: AuditSink | null): void {
    this.auditSink = sink ?? undefined
  }

  /** Switch mode. 'full' is rejected when bypass is unavailable. */
  setMode(mode: DesktopPermissionMode): DesktopPermissionMode {
    if (mode === 'full' && !this.bypassAvailable) {
      this.mode = 'default'
    } else {
      this.mode = mode
    }
    // Session allow-rules are scoped to the current mode session.
    if (mode === 'default') this.sessionAllow.clear()
    return this.mode
  }

  getLog(limit?: number): PermissionLogEntry[] {
    const entries = [...this.log].reverse()
    return limit ? entries.slice(0, limit) : entries
  }

  clearLog(): void {
    this.log.length = 0
  }

  private nextId(): string {
    this.idCounter += 1
    return `perm-${Date.now().toString(36)}-${this.idCounter}`
  }

  private record(
    tool: ToolRequest,
    decision: PermissionDecisionAction,
    scope: PermissionScope | 'auto',
    riskLevel: PermissionRiskLevel,
  ): void {
    this.log.push({
      id: this.nextId(),
      tool: tool.name,
      inputSummary: summarizeInput(tool.input),
      mode: this.mode,
      decision,
      scope,
      riskLevel,
      timestamp: new Date().toISOString(),
    })
    if (this.log.length > MAX_LOG_ENTRIES) this.log.shift()
    this.auditSink?.({
      tool: tool.name,
      allowed: decision === 'allow',
      detail: summarizeInput(tool.input),
      riskLevel,
    })
  }

  /**
   * Request permission for a tool. Resolves true if allowed.
   * - 'full' mode auto-allows (bypassPermissions).
   * - session allow-rule auto-allows.
   * - otherwise prompts the renderer and waits for a response (60s → deny).
   */
  requestPermission(
    win: PermissionWindow | null,
    tool: ToolRequest,
  ): Promise<boolean> {
    const { riskLevel, description, affectedScope } = classifyTool(tool)

    // N32: an unguarded sandbox category bypasses the prompt entirely.
    if (this.policyGate?.(tool.name) === true) {
      this.record(tool, 'allow', 'auto', riskLevel)
      return Promise.resolve(true)
    }

    if (this.mode === 'full') {
      this.record(tool, 'allow', 'auto', riskLevel)
      return Promise.resolve(true)
    }

    if (this.sessionAllow.has(tool.name)) {
      this.record(tool, 'allow', 'session', riskLevel)
      return Promise.resolve(true)
    }

    if (!win || win.isDestroyed()) {
      this.record(tool, 'deny', 'auto', riskLevel)
      return Promise.resolve(false)
    }

    const requestId = this.nextId()
    const request: PermissionRequest = {
      requestId,
      tool: tool.name,
      description,
      affectedScope,
      riskLevel,
      input: tool.input,
    }

    return new Promise<boolean>(resolve => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        this.record(tool, 'deny', 'auto', riskLevel)
        resolve(false)
      }, PERMISSION_TIMEOUT_MS)

      this.pending.set(requestId, { resolve, timeout, tool, riskLevel })
      win.webContents.send(IPC_CHANNELS.PERMISSION_REQUEST, request)
    })
  }

  /** Resolve a pending request from a renderer response. */
  respond(
    requestId: string,
    decision: PermissionDecisionAction,
    scope: PermissionScope,
  ): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) return false

    clearTimeout(entry.timeout)
    this.pending.delete(requestId)

    if (decision === 'allow' && scope === 'session') {
      this.sessionAllow.add(entry.tool.name)
    }

    this.record(
      entry.tool,
      decision,
      decision === 'allow' ? scope : 'once',
      entry.riskLevel,
    )
    entry.resolve(decision === 'allow')
    return true
  }

  /** Test/reset hook. */
  reset(): void {
    for (const { timeout, resolve } of this.pending.values()) {
      clearTimeout(timeout)
      resolve(false)
    }
    this.pending.clear()
    this.sessionAllow.clear()
    this.log.length = 0
    this.mode = 'default'
    this.policyGate = undefined
    this.auditSink = undefined
  }
}

function isPrivilegedEnvironment(): boolean {
  const proc = globalThis.process as
    | { getuid?: () => number; env?: Record<string, string | undefined> }
    | undefined
  if (!proc) return false
  if (typeof proc.getuid === 'function' && proc.getuid() === 0) return true
  if (proc.env?.NEXAWORK_SANDBOX === '1') return true
  return false
}

/** Shared singleton used by the IPC handlers and the engine. */
export const permissionManager = new PermissionManager()
