/**
 * NexaWork Data Manager (N23)
 * ===========================
 * Pure, dependency-free transforms backing the 数据管理 (Data Management) tab:
 * statistics, export (JSON / Markdown), validated import with conflict
 * handling, and full backup/restore bundles.
 *
 * Keeping these as pure functions over an in-memory {@link DataSnapshot} (rather
 * than reaching into the live stores) means they unit-test in isolation and the
 * IPC layer stays a thin adapter that gathers the snapshot and applies results.
 */
import type {
  AutomationInfo,
  AutomationRun,
  ChatMessage,
  ConflictStrategy,
  DataStats,
  ExportFormat,
  ExportScope,
  ImportStats,
  MemoryEntry,
  ProjectInfo,
  SessionInfo,
  SkillInfo,
} from '../../shared/ipc-channels'
import type { AppSettings } from '../../shared/settings'

export type {
  ConflictStrategy,
  DataStats,
  ExportFormat,
  ExportScope,
  ImportStats,
} from '../../shared/ipc-channels'

/** Bundle schema version, bumped on breaking changes to the export shape. */
export const DATA_BUNDLE_VERSION = 1

/** Live view of every persisted collection, assembled by the IPC layer. */
export interface DataSnapshot {
  sessions: SessionInfo[]
  /** Messages keyed by their owning session id. */
  messagesBySession: Record<string, ChatMessage[]>
  skills: SkillInfo[]
  automations: AutomationInfo[]
  automationRuns: AutomationRun[]
  projects: ProjectInfo[]
  memory: MemoryEntry[]
  settings: AppSettings
}

/** Options describing what to include in an export. */
export interface ExportOptions {
  scope: ExportScope
  /** Inclusive ISO start date for the `dateRange` scope. */
  startDate?: string
  /** Inclusive ISO end date for the `dateRange` scope. */
  endDate?: string
  /** Session ids for the `sessions` scope. */
  sessionIds?: string[]
}

/** A portable export/backup document. */
export interface DataBundle {
  version: number
  exportedAt: string
  scope: ExportScope
  sessions: SessionInfo[]
  messagesBySession: Record<string, ChatMessage[]>
  skills: SkillInfo[]
  automations: AutomationInfo[]
  automationRuns: AutomationRun[]
  projects: ProjectInfo[]
  memory: MemoryEntry[]
  /** Present only for full (`all`) exports / backups. */
  settings: AppSettings | null
}

/** Outcome of merging an incoming bundle into the current snapshot. */
export interface SessionImportPlan {
  /** Full merged session list to write back. */
  sessions: SessionInfo[]
  /** Full merged messages map to write back. */
  messagesBySession: Record<string, ChatMessage[]>
  /** Full merged skill list to write back. */
  skills: SkillInfo[]
  stats: ImportStats
}

/** Thrown when import/restore input fails validation. */
export class DataValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataValidationError'
  }
}

// ─── Statistics ───────────────────────────────────────────────
function countMessages(
  messagesBySession: Record<string, ChatMessage[]>,
): number {
  let total = 0
  for (const list of Object.values(messagesBySession)) total += list.length
  return total
}

/** Compute the statistics shown in the data-management cards. */
export function computeStats(snapshot: DataSnapshot): DataStats {
  const bundle = buildExportBundle(snapshot, { scope: 'all' })
  const diskUsageBytes = Buffer.byteLength(JSON.stringify(bundle), 'utf-8')
  return {
    sessionCount: snapshot.sessions.length,
    messageCount: countMessages(snapshot.messagesBySession),
    skillCount: snapshot.skills.length,
    automationCount: snapshot.automations.length,
    projectCount: snapshot.projects.length,
    memoryCount: snapshot.memory.length,
    diskUsageBytes,
  }
}

// ─── Export ───────────────────────────────────────────────────
function sessionInRange(
  session: SessionInfo,
  startDate?: string,
  endDate?: string,
): boolean {
  const ts = new Date(session.createdAt).getTime()
  if (Number.isNaN(ts)) return false
  if (startDate) {
    const start = new Date(startDate).getTime()
    if (Number.isFinite(start) && ts < start) return false
  }
  if (endDate) {
    const end = new Date(endDate).getTime()
    // Treat endDate as inclusive of the whole day.
    if (Number.isFinite(end) && ts > end + 24 * 60 * 60 * 1000 - 1) return false
  }
  return true
}

function pickMessages(
  messagesBySession: Record<string, ChatMessage[]>,
  sessionIds: string[],
): Record<string, ChatMessage[]> {
  const out: Record<string, ChatMessage[]> = {}
  for (const id of sessionIds) {
    if (messagesBySession[id]) out[id] = messagesBySession[id]
  }
  return out
}

/**
 * Build an export bundle for the requested scope. The `all` scope captures
 * every collection (used for backups); `dateRange` / `sessions` capture the
 * matching sessions plus their messages.
 */
export function buildExportBundle(
  snapshot: DataSnapshot,
  options: ExportOptions,
): DataBundle {
  const exportedAt = new Date().toISOString()
  const base = {
    version: DATA_BUNDLE_VERSION,
    exportedAt,
    scope: options.scope,
  }

  if (options.scope === 'all') {
    return {
      ...base,
      sessions: snapshot.sessions,
      messagesBySession: snapshot.messagesBySession,
      skills: snapshot.skills,
      automations: snapshot.automations,
      automationRuns: snapshot.automationRuns,
      projects: snapshot.projects,
      memory: snapshot.memory,
      settings: snapshot.settings,
    }
  }

  let sessions: SessionInfo[]
  if (options.scope === 'sessions') {
    const wanted = new Set(options.sessionIds ?? [])
    sessions = snapshot.sessions.filter(s => wanted.has(s.id))
  } else {
    sessions = snapshot.sessions.filter(s =>
      sessionInRange(s, options.startDate, options.endDate),
    )
  }
  const ids = sessions.map(s => s.id)
  return {
    ...base,
    sessions,
    messagesBySession: pickMessages(snapshot.messagesBySession, ids),
    skills: [],
    automations: [],
    automationRuns: [],
    projects: [],
    memory: [],
    settings: null,
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/\r?\n/g, '\n')
}

/** Serialize a bundle to the requested format. */
export function serializeBundle(
  bundle: DataBundle,
  format: ExportFormat,
): string {
  if (format === 'json') return JSON.stringify(bundle, null, 2)

  const lines: string[] = []
  lines.push('# NexaWork 数据导出')
  lines.push('')
  lines.push(`- 导出时间：${bundle.exportedAt}`)
  lines.push(`- 范围：${bundle.scope}`)
  lines.push(`- 会话数：${bundle.sessions.length}`)
  lines.push(`- 技能数：${bundle.skills.length}`)
  lines.push('')

  for (const session of bundle.sessions) {
    lines.push(`## ${session.title}`)
    lines.push('')
    lines.push(`- 场景：${session.scene}`)
    lines.push(`- 模型：${session.model}`)
    lines.push(`- 创建时间：${session.createdAt}`)
    lines.push('')
    const msgs = bundle.messagesBySession[session.id] ?? []
    for (const msg of msgs) {
      lines.push(`**${msg.role}**：${escapeMarkdown(msg.content)}`)
      lines.push('')
    }
  }

  if (bundle.skills.length > 0) {
    lines.push('## 技能')
    lines.push('')
    for (const skill of bundle.skills) {
      lines.push(
        `- **${skill.name}** (${skill.version}) — ${skill.description}`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Import (validation + conflict handling) ──────────────────
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse and validate raw import content into a {@link DataBundle}. Throws a
 * {@link DataValidationError} on malformed JSON or an unrecognized shape.
 */
export function parseImport(content: string): DataBundle {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new DataValidationError('无法解析文件：不是有效的 JSON')
  }
  if (!isObject(parsed)) {
    throw new DataValidationError('无效的数据格式：根节点必须是对象')
  }
  const sessions = parsed.sessions
  const skills = parsed.skills
  if (!Array.isArray(sessions) && !Array.isArray(skills)) {
    throw new DataValidationError('无效的数据格式：缺少 sessions 或 skills')
  }
  const messagesBySession = isObject(parsed.messagesBySession)
    ? (parsed.messagesBySession as Record<string, ChatMessage[]>)
    : {}

  return {
    version:
      typeof parsed.version === 'number' ? parsed.version : DATA_BUNDLE_VERSION,
    exportedAt:
      typeof parsed.exportedAt === 'string'
        ? parsed.exportedAt
        : new Date().toISOString(),
    scope: 'all',
    sessions: Array.isArray(sessions) ? (sessions as SessionInfo[]) : [],
    messagesBySession,
    skills: Array.isArray(skills) ? (skills as SkillInfo[]) : [],
    automations: Array.isArray(parsed.automations)
      ? (parsed.automations as AutomationInfo[])
      : [],
    automationRuns: Array.isArray(parsed.automationRuns)
      ? (parsed.automationRuns as AutomationRun[])
      : [],
    projects: Array.isArray(parsed.projects)
      ? (parsed.projects as ProjectInfo[])
      : [],
    memory: Array.isArray(parsed.memory)
      ? (parsed.memory as MemoryEntry[])
      : [],
    settings: isObject(parsed.settings)
      ? (parsed.settings as unknown as AppSettings)
      : null,
  }
}

interface MergeResult<T> {
  merged: T[]
  added: number
  skipped: number
}

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  strategy: ConflictStrategy,
): MergeResult<T> {
  const byId = new Map<string, T>(existing.map(item => [item.id, item]))
  let added = 0
  let skipped = 0
  for (const item of incoming) {
    if (!item || typeof item.id !== 'string') continue
    if (byId.has(item.id)) {
      if (strategy === 'overwrite') {
        byId.set(item.id, item)
        added++
      } else {
        skipped++
      }
    } else {
      byId.set(item.id, item)
      added++
    }
  }
  return { merged: [...byId.values()], added, skipped }
}

/**
 * Merge an incoming bundle's sessions / messages / skills into the current
 * snapshot, honoring the conflict strategy. Returns the full merged
 * collections so the caller can write them back atomically.
 */
export function planSessionImport(
  snapshot: DataSnapshot,
  bundle: DataBundle,
  strategy: ConflictStrategy = 'skip',
): SessionImportPlan {
  const sessionMerge = mergeById(snapshot.sessions, bundle.sessions, strategy)
  const skillMerge = mergeById(snapshot.skills, bundle.skills, strategy)

  const presentIds = new Set(sessionMerge.merged.map(s => s.id))
  const messagesBySession: Record<string, ChatMessage[]> = {
    ...snapshot.messagesBySession,
  }
  let importedMessages = 0
  for (const [sessionId, msgs] of Object.entries(bundle.messagesBySession)) {
    if (!presentIds.has(sessionId)) continue
    const existing = snapshot.messagesBySession[sessionId]
    // Only adopt imported messages for sessions that did not already exist,
    // matching the conflict strategy (skip keeps existing conversations).
    if (existing && strategy === 'skip') continue
    messagesBySession[sessionId] = msgs
    importedMessages += msgs.length
  }

  return {
    sessions: sessionMerge.merged,
    messagesBySession,
    skills: skillMerge.merged,
    stats: {
      importedSessions: sessionMerge.added,
      importedMessages,
      importedSkills: skillMerge.added,
      skippedSessions: sessionMerge.skipped,
      skippedSkills: skillMerge.skipped,
    },
  }
}
