/**
 * NexaWork IPC Channel Definitions
 * Type-safe communication between Main and Renderer processes
 * 63-method centralized handler registry (Codex pattern)
 */

import type {
  EditorPersistState,
  GitChange,
  GitDiffData,
  LineRange,
} from './editor'
import type { ReplayReport, ReplayStatus } from './replay'
import type { TerminalSessionInfo } from './terminal'
import type { FileEntry, FileNodeKind } from './file-tree'
import type { GitBranchInfo, GitFileState, ParsedFileDiff } from './git-panel'
import type {
  AuditLogEntry,
  SecurityConfig,
  SecurityConfigPatch,
} from './security-center'
import type {
  RecordingAnalysis,
  RecordedSkill,
  SkillSummary,
  SkillVariable,
} from './skill'

export type {
  ReplayReport,
  ReplayStatus,
  ReplayStep,
  ReplayStepStatus,
  ReplayState,
  ReplaySpeed,
} from './replay'

export type {
  RecordedSkill,
  SkillSummary,
  SkillStep,
  SkillStepType,
  SkillVariable,
  SkillVariableType,
  SkillExecutionRecord,
  SkillSource,
  RecordingAnalysis,
} from './skill'

export type {
  EditorConfig,
  EditorTab,
  EditorPersistState,
  GitChange,
  GitChangeStatus,
  GitDiffData,
  LineRange,
} from './editor'

export type {
  TerminalSessionInfo,
  TerminalShellKind,
  ResolvedShell,
} from './terminal'

export type { FileEntry, FileNodeKind, FileIconCategory } from './file-tree'

export type {
  GitBranch,
  GitBranchInfo,
  GitFileState,
  GitStatusTone,
  DiffHunk,
  ParsedFileDiff,
} from './git-panel'

export type {
  SecurityConfig,
  SecurityConfigPatch,
  SandboxPolicy,
  DataSecurityState,
  RuntimeConfig,
  RuntimeState,
  ExperimentalFeatures,
  SystemToolsMode,
  AuditLogEntry,
  AuditCategory,
  AuditDecision,
  AuditFilter,
} from './security-center'

export const IPC_CHANNELS = {
  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_STOP: 'chat:stop',
  CHAT_HISTORY: 'chat:history',
  CHAT_REGENERATE: 'chat:regenerate',
  CHAT_STREAM_TOKEN: 'chat:stream:token',
  CHAT_STREAM_END: 'chat:stream:end',

  // Session
  SESSION_CREATE: 'session:create',
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',
  SESSION_SEARCH: 'session:search',

  // Model
  MODEL_LIST: 'model:list',
  MODEL_SET: 'model:set',
  MODEL_TEST: 'model:test',
  MODEL_CONFIGURE: 'model:configure',
  MODEL_SET_API_KEY: 'model:apiKey:set', // N22
  MODEL_DELETE_API_KEY: 'model:apiKey:delete', // N22
  MODEL_API_KEY_STATUS: 'model:apiKey:status', // N22

  // Expert
  EXPERT_LIST: 'expert:list',
  EXPERT_GET: 'expert:get',
  EXPERT_SUMMON: 'expert:summon',
  EXPERT_CREATE: 'expert:create',
  EXPERT_RECENT: 'expert:recent',

  // Skill
  SKILL_LIST: 'skill:list',
  SKILL_INSTALL: 'skill:install',
  SKILL_TOGGLE: 'skill:toggle',
  SKILL_EXECUTE: 'skill:execute',
  SKILL_DELETE: 'skill:delete',

  // Automation
  AUTOMATION_LIST: 'automation:list',
  AUTOMATION_CREATE: 'automation:create',
  AUTOMATION_UPDATE: 'automation:update',
  AUTOMATION_DELETE: 'automation:delete',
  AUTOMATION_HISTORY: 'automation:history',
  AUTOMATION_PAUSE: 'automation:pause',
  AUTOMATION_RESUME: 'automation:resume',
  AUTOMATION_RUN_NOW: 'automation:runNow',
  AUTOMATION_CHANGED: 'automation:changed', // push: main → renderer

  // Project
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_TEMPLATES: 'project:templates',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',
  SETTINGS_CHANGED: 'settings:changed', // push: main → renderer

  // Memory (N22)
  MEMORY_LIST: 'memory:list',
  MEMORY_ADD: 'memory:add',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_CLEAR: 'memory:clear',
  MEMORY_CHANGED: 'memory:changed', // push: main → renderer

  // Data management (N23)
  DATA_STATS: 'data:stats',
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  DATA_CLEAR_SESSIONS: 'data:clearSessions',
  DATA_CLEAR_CACHE: 'data:clearCache',
  DATA_RESET_SETTINGS: 'data:resetSettings',
  DATA_BACKUP: 'data:backup',
  DATA_RESTORE: 'data:restore',
  DATA_CHANGED: 'data:changed', // push: main → renderer

  // Recording (N24)
  RECORD_START: 'record:start',
  RECORD_STOP: 'record:stop',
  RECORD_PAUSE: 'record:pause',
  RECORD_RESUME: 'record:resume',
  RECORD_STATUS: 'record:status',
  RECORD_DISCARD: 'record:discard',
  RECORD_GET_CONFIG: 'record:getConfig', // N25
  RECORD_SET_CONFIG: 'record:setConfig', // N25
  RECORD_LIST: 'record:list', // N26
  RECORD_CHANGED: 'record:changed', // push: main → renderer

  // Replay (N26)
  REPLAY_LOAD: 'replay:load',
  REPLAY_PLAY: 'replay:play',
  REPLAY_PAUSE: 'replay:pause',
  REPLAY_STEP: 'replay:step',
  REPLAY_STOP: 'replay:stop',
  REPLAY_SET_SPEED: 'replay:setSpeed',
  REPLAY_STATUS: 'replay:status',
  REPLAY_REPORT: 'replay:report',
  REPLAY_CHANGED: 'replay:changed', // push: main → renderer
  REPLAY_DONE: 'replay:done', // push: main → renderer (report ready)

  // Recorded-skill management (N27)
  SKILL_RECORDED_LIST: 'skill:recorded:list',
  SKILL_RECORDED_GET: 'skill:recorded:get',
  SKILL_RECORDED_ANALYZE: 'skill:recorded:analyze',
  SKILL_RECORDED_CREATE: 'skill:recorded:create',
  SKILL_RECORDED_UPDATE: 'skill:recorded:update',
  SKILL_RECORDED_REORDER: 'skill:recorded:reorder',
  SKILL_RECORDED_UPDATE_STEP: 'skill:recorded:updateStep',
  SKILL_RECORDED_REMOVE_STEP: 'skill:recorded:removeStep',
  SKILL_RECORDED_ADD_WAIT: 'skill:recorded:addWait',
  SKILL_RECORDED_DUPLICATE: 'skill:recorded:duplicate',
  SKILL_RECORDED_DELETE: 'skill:recorded:delete',
  SKILL_RECORDED_EXECUTE: 'skill:recorded:execute',
  SKILL_RECORDED_RECORD_EXEC: 'skill:recorded:recordExec',
  SKILL_RECORDED_EXPORT: 'skill:recorded:export',
  SKILL_RECORDED_CHANGED: 'skill:recorded:changed', // push: main → renderer

  // Code editor (N28)
  EDITOR_READ_FILE: 'editor:readFile',
  EDITOR_WRITE_FILE: 'editor:writeFile',
  EDITOR_STAT_FILE: 'editor:statFile',
  EDITOR_LOAD_STATE: 'editor:loadState',
  EDITOR_SAVE_STATE: 'editor:saveState',
  EDITOR_GIT_CHANGES: 'editor:gitChanges',
  EDITOR_GIT_DIFF: 'editor:gitDiff',
  EDITOR_OPEN_FILE: 'editor:openFile', // push: main → renderer (AI-driven open)

  // Terminal (N29)
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_LIST: 'terminal:list',
  TERMINAL_DATA: 'terminal:data', // push: main → renderer (PTY stdout)
  TERMINAL_EXIT: 'terminal:exit', // push: main → renderer (PTY exit)
  TERMINAL_AI_COMMAND: 'terminal:aiCommand', // push: AI shell command echo

  // File browser (N30)
  FILE_ROOT: 'file:root',
  FILE_LIST: 'file:list',
  FILE_CREATE: 'file:create',
  FILE_RENAME: 'file:rename',
  FILE_MOVE: 'file:move',
  FILE_DELETE: 'file:delete',
  FILE_SEARCH: 'file:search',
  FILE_CHANGED: 'file:changed', // push: main → renderer (fs watch)

  // Git panel + diff (N31)
  GIT_STATUS: 'git:status',
  GIT_BRANCHES: 'git:branches',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_STAGE_ALL: 'git:stageAll',
  GIT_UNSTAGE_ALL: 'git:unstageAll',
  GIT_DISCARD: 'git:discard',
  GIT_STAGE_HUNK: 'git:stageHunk',
  GIT_UNSTAGE_HUNK: 'git:unstageHunk',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_COMMIT_PUSH: 'git:commitPush',
  GIT_CREATE_BRANCH: 'git:createBranch',
  GIT_CHECKOUT: 'git:checkout',
  GIT_MERGE: 'git:merge',
  GIT_DIFF: 'git:diff',
  GIT_DIFF_HUNKS: 'git:diffHunks',
  GIT_CHANGED: 'git:changed', // push: main → renderer (fs watch on .git + tree)

  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',

  // Security center (N32)
  SECURITY_GET_CONFIG: 'security:getConfig',
  SECURITY_UPDATE_CONFIG: 'security:updateConfig',
  SECURITY_AUDIT_LIST: 'security:audit:list',
  SECURITY_AUDIT_CLEAR: 'security:audit:clear',
  SECURITY_AUDIT_EXPORT: 'security:audit:export',
  SECURITY_CHANGED: 'security:changed', // push: main → renderer (policy/audit)

  // Permission (N17)
  PERMISSION_GET_MODE: 'permission:getMode',
  PERMISSION_SET_MODE: 'permission:setMode',
  PERMISSION_REQUEST: 'permission:request',
  PERMISSION_RESPOND: 'permission:respond',
  PERMISSION_LOG_LIST: 'permission:log:list',
  PERMISSION_LOG_CLEAR: 'permission:log:clear',

  // App
  APP_VERSION: 'app:version',
  APP_PLATFORM: 'app:platform',
} as const

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/**
 * Unified IPC Error Format
 */
export interface IPCError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * IPC Result wrapper (Success | Error)
 */
export type IPCResult<T> =
  | { success: true; data: T }
  | { success: false; error: IPCError }

/**
 * IPC Request/Response type mapping
 */
export interface IPCRequestMap {
  // Chat
  [IPC_CHANNELS.CHAT_SEND]: {
    input: { sessionId: string; message: string; model?: string }
    output: { messageId: string; content: string }
  }
  [IPC_CHANNELS.CHAT_STREAM]: {
    input: { sessionId: string; message: string; model?: string }
    output: { streamId: string }
  }
  [IPC_CHANNELS.CHAT_STOP]: {
    input: { sessionId: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.CHAT_HISTORY]: {
    input: { sessionId: string; limit?: number; before?: string }
    output: { messages: ChatMessage[]; hasMore: boolean }
  }
  [IPC_CHANNELS.CHAT_REGENERATE]: {
    input: { sessionId: string; messageId: string }
    output: { messageId: string; content: string }
  }

  // Session
  [IPC_CHANNELS.SESSION_CREATE]: {
    input: { title?: string; scene?: string; model?: string }
    output: { id: string; title: string; createdAt: string }
  }
  [IPC_CHANNELS.SESSION_LIST]: {
    input: { limit?: number; offset?: number }
    output: { sessions: SessionInfo[]; total: number }
  }
  [IPC_CHANNELS.SESSION_GET]: {
    input: { id: string }
    output: SessionInfo
  }
  [IPC_CHANNELS.SESSION_UPDATE]: {
    input: { id: string; title?: string; scene?: string; model?: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.SESSION_DELETE]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.SESSION_SEARCH]: {
    input: { query: string; limit?: number }
    output: { sessions: SessionInfo[] }
  }

  // Model
  [IPC_CHANNELS.MODEL_LIST]: {
    input: Record<string, never>
    output: { models: ModelInfo[] }
  }
  [IPC_CHANNELS.MODEL_SET]: {
    input: { modelId: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.MODEL_TEST]: {
    input: { modelId: string }
    output: { latency: number; available: boolean }
  }
  [IPC_CHANNELS.MODEL_CONFIGURE]: {
    input: { modelId: string; config: ModelConfig }
    output: { success: boolean }
  }
  [IPC_CHANNELS.MODEL_SET_API_KEY]: {
    input: { provider: string; apiKey: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.MODEL_DELETE_API_KEY]: {
    input: { provider: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.MODEL_API_KEY_STATUS]: {
    input: Record<string, never>
    output: {
      configured: Record<string, boolean>
      encryptionAvailable: boolean
    }
  }

  // Expert
  [IPC_CHANNELS.EXPERT_LIST]: {
    input: { category?: string }
    output: { experts: ExpertInfo[] }
  }
  [IPC_CHANNELS.EXPERT_GET]: {
    input: { id: string }
    output: ExpertInfo
  }
  [IPC_CHANNELS.EXPERT_SUMMON]: {
    input: { expertId: string; sessionId: string }
    output: { success: boolean; greeting: string }
  }
  [IPC_CHANNELS.EXPERT_CREATE]: {
    input: {
      name: string
      description: string
      systemPrompt: string
      avatar?: string
    }
    output: { id: string }
  }
  [IPC_CHANNELS.EXPERT_RECENT]: {
    input: { limit?: number }
    output: { experts: ExpertInfo[] }
  }

  // Skill
  [IPC_CHANNELS.SKILL_LIST]: {
    input: { category?: string; installed?: boolean }
    output: { skills: SkillInfo[] }
  }
  [IPC_CHANNELS.SKILL_INSTALL]: {
    input: { skillId: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.SKILL_TOGGLE]: {
    input: { skillId: string; enabled: boolean }
    output: { success: boolean }
  }
  [IPC_CHANNELS.SKILL_EXECUTE]: {
    input: { skillId: string; params?: Record<string, unknown> }
    output: { result: string }
  }
  [IPC_CHANNELS.SKILL_DELETE]: {
    input: { skillId: string }
    output: { success: boolean }
  }

  // Automation
  [IPC_CHANNELS.AUTOMATION_LIST]: {
    input: { status?: 'active' | 'paused' | 'completed' }
    output: { automations: AutomationInfo[] }
  }
  [IPC_CHANNELS.AUTOMATION_CREATE]: {
    input: AutomationCreateInput
    output: { id: string }
  }
  [IPC_CHANNELS.AUTOMATION_UPDATE]: {
    input: { id: string; updates: Partial<AutomationCreateInput> }
    output: { success: boolean }
  }
  [IPC_CHANNELS.AUTOMATION_DELETE]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.AUTOMATION_HISTORY]: {
    input: { id: string; limit?: number }
    output: { runs: AutomationRun[] }
  }
  [IPC_CHANNELS.AUTOMATION_PAUSE]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.AUTOMATION_RESUME]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.AUTOMATION_RUN_NOW]: {
    input: { id: string }
    output: { run: AutomationRun }
  }

  // Project
  [IPC_CHANNELS.PROJECT_LIST]: {
    input: { query?: string }
    output: { projects: ProjectInfo[] }
  }
  [IPC_CHANNELS.PROJECT_GET]: {
    input: { id: string }
    output: ProjectInfo
  }
  [IPC_CHANNELS.PROJECT_CREATE]: {
    input: ProjectCreateInput
    output: { id: string; project: ProjectInfo }
  }
  [IPC_CHANNELS.PROJECT_UPDATE]: {
    input: { id: string; name?: string; description?: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.PROJECT_DELETE]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.PROJECT_TEMPLATES]: {
    input: Record<string, never>
    output: { templates: ProjectTemplate[] }
  }

  // Settings
  [IPC_CHANNELS.SETTINGS_GET]: {
    input: { key?: string }
    output: Record<string, unknown>
  }
  [IPC_CHANNELS.SETTINGS_SET]: {
    input: { key: string; value: unknown }
    output: { success: boolean }
  }
  [IPC_CHANNELS.SETTINGS_RESET]: {
    input: { key?: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.SETTINGS_CHANGED]: {
    input: Record<string, never>
    output: Record<string, unknown>
  }

  // Memory (N22)
  [IPC_CHANNELS.MEMORY_LIST]: {
    input: Record<string, never>
    output: { entries: MemoryEntry[]; total: number }
  }
  [IPC_CHANNELS.MEMORY_ADD]: {
    input: { content: string; category?: string }
    output: { entry: MemoryEntry }
  }
  [IPC_CHANNELS.MEMORY_DELETE]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.MEMORY_CLEAR]: {
    input: Record<string, never>
    output: { success: boolean }
  }
  [IPC_CHANNELS.MEMORY_CHANGED]: {
    input: Record<string, never>
    output: Record<string, never>
  }

  // Data management (N23)
  [IPC_CHANNELS.DATA_STATS]: {
    input: Record<string, never>
    output: DataStats
  }
  [IPC_CHANNELS.DATA_EXPORT]: {
    input: {
      scope: ExportScope
      format: ExportFormat
      startDate?: string
      endDate?: string
      sessionIds?: string[]
    }
    output: {
      content: string
      format: ExportFormat
      filename: string
      byteLength: number
    }
  }
  [IPC_CHANNELS.DATA_IMPORT]: {
    input: { content: string; strategy?: ConflictStrategy }
    output: { stats: ImportStats }
  }
  [IPC_CHANNELS.DATA_CLEAR_SESSIONS]: {
    input: Record<string, never>
    output: { success: boolean; cleared: number }
  }
  [IPC_CHANNELS.DATA_CLEAR_CACHE]: {
    input: Record<string, never>
    output: { success: boolean }
  }
  [IPC_CHANNELS.DATA_RESET_SETTINGS]: {
    input: Record<string, never>
    output: { success: boolean }
  }
  [IPC_CHANNELS.DATA_BACKUP]: {
    input: Record<string, never>
    output: { content: string; filename: string; byteLength: number }
  }
  [IPC_CHANNELS.DATA_RESTORE]: {
    input: { content: string }
    output: { success: boolean; stats: DataStats }
  }
  [IPC_CHANNELS.DATA_CHANGED]: {
    input: Record<string, never>
    output: Record<string, never>
  }

  // Recording (N24)
  [IPC_CHANNELS.RECORD_START]: {
    input: { taskDescription?: string }
    output: RecorderStatus
  }
  [IPC_CHANNELS.RECORD_STOP]: {
    input: Record<string, never>
    output: RecordStopResult
  }
  [IPC_CHANNELS.RECORD_PAUSE]: {
    input: Record<string, never>
    output: RecorderStatus
  }
  [IPC_CHANNELS.RECORD_RESUME]: {
    input: Record<string, never>
    output: RecorderStatus
  }
  [IPC_CHANNELS.RECORD_STATUS]: {
    input: Record<string, never>
    output: RecorderStatus
  }
  [IPC_CHANNELS.RECORD_DISCARD]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.RECORD_GET_CONFIG]: {
    input: Record<string, never>
    output: RecordingConfig
  }
  [IPC_CHANNELS.RECORD_SET_CONFIG]: {
    input: Partial<RecordingConfig>
    output: RecordingConfig
  }
  [IPC_CHANNELS.RECORD_LIST]: {
    input: Record<string, never>
    output: { recordings: RecordingSummary[] }
  }
  [IPC_CHANNELS.RECORD_CHANGED]: {
    input: Record<string, never>
    output: RecorderStatus
  }

  // Replay (N26)
  [IPC_CHANNELS.REPLAY_LOAD]: {
    input: { recordingId: string }
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_PLAY]: {
    input: Record<string, never>
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_PAUSE]: {
    input: Record<string, never>
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_STEP]: {
    input: Record<string, never>
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_STOP]: {
    input: Record<string, never>
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_SET_SPEED]: {
    input: { speed: number }
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_STATUS]: {
    input: Record<string, never>
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_REPORT]: {
    input: Record<string, never>
    output: { report: ReplayReport | null }
  }
  [IPC_CHANNELS.REPLAY_CHANGED]: {
    input: Record<string, never>
    output: ReplayStatus
  }
  [IPC_CHANNELS.REPLAY_DONE]: {
    input: Record<string, never>
    output: ReplayReport
  }

  // Recorded-skill management (N27)
  [IPC_CHANNELS.SKILL_RECORDED_LIST]: {
    input: Record<string, never>
    output: { skills: SkillSummary[] }
  }
  [IPC_CHANNELS.SKILL_RECORDED_GET]: {
    input: { id: string }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_ANALYZE]: {
    input: { recordingId: string }
    output: { analysis: RecordingAnalysis | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_CREATE]: {
    input: {
      recordingId: string
      name: string
      description?: string
      icon?: string
      tags?: string[]
      whenToUse?: string
      variables?: SkillVariable[]
    }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_UPDATE]: {
    input: {
      id: string
      name?: string
      description?: string
      icon?: string
      tags?: string[]
      whenToUse?: string
      variables?: SkillVariable[]
    }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_REORDER]: {
    input: { id: string; fromIndex: number; toIndex: number }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_UPDATE_STEP]: {
    input: {
      id: string
      stepId: string
      detail?: string
      description?: string
      waitMs?: number
    }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_REMOVE_STEP]: {
    input: { id: string; stepId: string }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_ADD_WAIT]: {
    input: { id: string; afterIndex: number; waitMs?: number }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_DUPLICATE]: {
    input: { id: string }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_DELETE]: {
    input: { id: string }
    output: { ok: boolean }
  }
  [IPC_CHANNELS.SKILL_RECORDED_EXECUTE]: {
    input: { id: string; params: Record<string, string> }
    output: ReplayStatus
  }
  [IPC_CHANNELS.SKILL_RECORDED_RECORD_EXEC]: {
    input: {
      id: string
      startedAt: number
      finishedAt: number
      durationMs: number
      success: boolean
      params: Record<string, string>
      error?: string
    }
    output: { skill: RecordedSkill | null }
  }
  [IPC_CHANNELS.SKILL_RECORDED_EXPORT]: {
    input: { id: string }
    output: { fileName: string; content: string } | null
  }
  [IPC_CHANNELS.SKILL_RECORDED_CHANGED]: {
    input: Record<string, never>
    output: { skills: SkillSummary[] }
  }

  // File browser (N30)
  [IPC_CHANNELS.FILE_ROOT]: {
    input: Record<string, never>
    output: { root: string }
  }
  [IPC_CHANNELS.FILE_LIST]: {
    input: {
      path: string
      offset?: number
      limit?: number
      respectGitignore?: boolean
    }
    output: {
      path: string
      root: string
      entries: FileEntry[]
      hasMore: boolean
      total: number
    }
  }
  [IPC_CHANNELS.FILE_CREATE]: {
    input: { path: string; kind: FileNodeKind }
    output: { path: string; success: boolean }
  }
  [IPC_CHANNELS.FILE_RENAME]: {
    input: { path: string; newPath: string }
    output: { path: string; success: boolean }
  }
  [IPC_CHANNELS.FILE_MOVE]: {
    input: { path: string; targetDir: string }
    output: { path: string; success: boolean }
  }
  [IPC_CHANNELS.FILE_DELETE]: {
    input: { path: string }
    output: { path: string; success: boolean }
  }
  [IPC_CHANNELS.FILE_SEARCH]: {
    input: { query: string; root?: string; limit?: number }
    output: { matches: FileEntry[] }
  }
  [IPC_CHANNELS.FILE_CHANGED]: {
    input: Record<string, never>
    output: { dir: string }
  }

  // Git panel + diff (N31)
  [IPC_CHANNELS.GIT_STATUS]: {
    input: Record<string, never>
    output: {
      repoRoot: string | null
      branch: string | null
      files: GitFileState[]
      ahead: number
      behind: number
    }
  }
  [IPC_CHANNELS.GIT_BRANCHES]: {
    input: Record<string, never>
    output: GitBranchInfo
  }
  [IPC_CHANNELS.GIT_STAGE]: {
    input: { paths: string[] }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_UNSTAGE]: {
    input: { paths: string[] }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_STAGE_ALL]: {
    input: Record<string, never>
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_UNSTAGE_ALL]: {
    input: Record<string, never>
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_DISCARD]: {
    input: { path: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_STAGE_HUNK]: {
    input: { patch: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_UNSTAGE_HUNK]: {
    input: { patch: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_COMMIT]: {
    input: { message: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_PUSH]: {
    input: Record<string, never>
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_PULL]: {
    input: Record<string, never>
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_COMMIT_PUSH]: {
    input: { message: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_CREATE_BRANCH]: {
    input: { name: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_CHECKOUT]: {
    input: { name: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_MERGE]: {
    input: { name: string }
    output: { success: boolean; message?: string }
  }
  [IPC_CHANNELS.GIT_DIFF]: {
    input: { path: string; staged?: boolean }
    output: GitDiffData | null
  }
  [IPC_CHANNELS.GIT_DIFF_HUNKS]: {
    input: { path: string; staged?: boolean }
    output: ParsedFileDiff
  }
  [IPC_CHANNELS.GIT_CHANGED]: {
    input: Record<string, never>
    output: Record<string, never>
  }

  // Code editor (N28)
  [IPC_CHANNELS.EDITOR_READ_FILE]: {
    input: { path: string }
    output: {
      path: string
      content: string
      language: string
      tooLarge: boolean
      binary: boolean
      mtime: number
    }
  }
  [IPC_CHANNELS.EDITOR_WRITE_FILE]: {
    input: { path: string; content: string }
    output: { path: string; success: boolean; mtime: number }
  }
  [IPC_CHANNELS.EDITOR_STAT_FILE]: {
    input: { path: string }
    output: {
      exists: boolean
      isFile: boolean
      isDirectory: boolean
      size: number
      mtime: number
    }
  }
  [IPC_CHANNELS.EDITOR_LOAD_STATE]: {
    input: Record<string, never>
    output: EditorPersistState
  }
  [IPC_CHANNELS.EDITOR_SAVE_STATE]: {
    input: EditorPersistState
    output: EditorPersistState
  }
  [IPC_CHANNELS.EDITOR_GIT_CHANGES]: {
    input: { cwd?: string }
    output: { repoRoot: string | null; changes: GitChange[] }
  }
  [IPC_CHANNELS.EDITOR_GIT_DIFF]: {
    input: { path: string; cwd?: string }
    output: GitDiffData | null
  }
  [IPC_CHANNELS.EDITOR_OPEN_FILE]: {
    input: Record<string, never>
    output: { path: string; highlightRanges?: LineRange[] }
  }

  // Terminal (N29)
  [IPC_CHANNELS.TERMINAL_CREATE]: {
    input: {
      shell?: string
      cwd?: string
      cols?: number
      rows?: number
      title?: string
    }
    output: TerminalSessionInfo
  }
  [IPC_CHANNELS.TERMINAL_WRITE]: {
    input: { id: string; data: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.TERMINAL_RESIZE]: {
    input: { id: string; cols: number; rows: number }
    output: { success: boolean }
  }
  [IPC_CHANNELS.TERMINAL_KILL]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.TERMINAL_LIST]: {
    input: Record<string, never>
    output: { sessions: TerminalSessionInfo[] }
  }
  [IPC_CHANNELS.TERMINAL_DATA]: {
    input: Record<string, never>
    output: { id: string; data: string }
  }
  [IPC_CHANNELS.TERMINAL_EXIT]: {
    input: Record<string, never>
    output: { id: string; exitCode: number }
  }
  [IPC_CHANNELS.TERMINAL_AI_COMMAND]: {
    input: Record<string, never>
    output: { command: string; cwd?: string }
  }

  // Window
  [IPC_CHANNELS.WINDOW_MINIMIZE]: {
    input: Record<string, never>
    output: undefined
  }
  [IPC_CHANNELS.WINDOW_MAXIMIZE]: {
    input: Record<string, never>
    output: undefined
  }
  [IPC_CHANNELS.WINDOW_CLOSE]: {
    input: Record<string, never>
    output: undefined
  }
  [IPC_CHANNELS.WINDOW_IS_MAXIMIZED]: {
    input: Record<string, never>
    output: boolean
  }

  // Security center (N32)
  [IPC_CHANNELS.SECURITY_GET_CONFIG]: {
    input: Record<string, never>
    output: SecurityConfig
  }
  [IPC_CHANNELS.SECURITY_UPDATE_CONFIG]: {
    input: { patch: SecurityConfigPatch }
    output: { success: boolean; config: SecurityConfig }
  }
  [IPC_CHANNELS.SECURITY_AUDIT_LIST]: {
    input: { limit?: number }
    output: { entries: AuditLogEntry[] }
  }
  [IPC_CHANNELS.SECURITY_AUDIT_CLEAR]: {
    input: Record<string, never>
    output: { success: boolean }
  }
  [IPC_CHANNELS.SECURITY_AUDIT_EXPORT]: {
    input: Record<string, never>
    output: { content: string; filename: string; byteLength: number }
  }
  [IPC_CHANNELS.SECURITY_CHANGED]: {
    input: Record<string, never>
    output: Record<string, never>
  }

  // Permission (N17)
  [IPC_CHANNELS.PERMISSION_GET_MODE]: {
    input: Record<string, never>
    output: { mode: DesktopPermissionMode; bypassAvailable: boolean }
  }
  [IPC_CHANNELS.PERMISSION_SET_MODE]: {
    input: { mode: DesktopPermissionMode }
    output: { success: boolean; mode: DesktopPermissionMode }
  }
  [IPC_CHANNELS.PERMISSION_RESPOND]: {
    input: {
      requestId: string
      decision: PermissionDecisionAction
      scope: PermissionScope
    }
    output: { success: boolean }
  }
  [IPC_CHANNELS.PERMISSION_LOG_LIST]: {
    input: { limit?: number }
    output: { entries: PermissionLogEntry[] }
  }
  [IPC_CHANNELS.PERMISSION_LOG_CLEAR]: {
    input: Record<string, never>
    output: { success: boolean }
  }

  // App
  [IPC_CHANNELS.APP_VERSION]: {
    input: Record<string, never>
    output: string
  }
  [IPC_CHANNELS.APP_PLATFORM]: {
    input: Record<string, never>
    output: string
  }
}

// --- Domain Types ---

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  toolCalls?: ToolCallInfo[]
  createdAt: string
}

export interface ToolCallInfo {
  name: string
  input: Record<string, unknown>
  output?: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface SessionInfo {
  id: string
  title: string
  scene: string
  model: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  capability: 'high' | 'medium' | 'low'
  maxTokens: number
  available: boolean
}

export interface ModelConfig {
  temperature?: number
  maxTokens?: number
  topP?: number
  systemPrompt?: string
}

export interface ExpertInfo {
  id: string
  name: string
  description: string
  avatar: string
  category: string
  systemPrompt: string
  tags: string[]
}

export interface SkillInfo {
  id: string
  name: string
  description: string
  category: string
  installed: boolean
  enabled: boolean
  version: string
}

/** A single operation-memory record (N22 memory settings). */
export interface MemoryEntry {
  id: string
  content: string
  category: string
  createdAt: string
}

// --- Permission Types (N17) ---

/**
 * Desktop-level permission mode shown in the toolbar selector.
 * Maps to backend PermissionMode: 'default' -> 'default', 'full' -> 'bypassPermissions'.
 */
export type DesktopPermissionMode = 'default' | 'full'

/** Risk level mirrored from backend src/types/permissions.ts RiskLevel. */
export type PermissionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

/** User decision for a tool permission prompt. */
export type PermissionDecisionAction = 'allow' | 'deny'

/** Scope of an allow decision. */
export type PermissionScope = 'once' | 'session'

/**
 * A pending permission request emitted from Main to Renderer when a tool
 * needs approval (PERMISSION_REQUEST event payload).
 */
export interface PermissionRequest {
  requestId: string
  tool: string
  description: string
  affectedScope: string
  riskLevel: PermissionRiskLevel
  input: Record<string, unknown>
}

/**
 * A single recorded permission decision (shown in the security center log).
 */
export interface PermissionLogEntry {
  id: string
  tool: string
  inputSummary: string
  mode: DesktopPermissionMode
  decision: PermissionDecisionAction
  scope: PermissionScope | 'auto'
  riskLevel: PermissionRiskLevel
  timestamp: string
}

export interface AutomationInfo {
  id: string
  name: string
  prompt: string
  /** Serialized schedule (see schedule.ts: serializeSchedule). */
  cron: string
  workspace: string
  status: 'active' | 'paused' | 'completed'
  /** ISO date the automation becomes active (inclusive). */
  validFrom?: string
  /** ISO date the automation stops running (inclusive). */
  validTo?: string
  lastRun?: string
  /** Result of the most recent run, for the completed list label. */
  lastRunStatus?: 'success' | 'failure'
  nextRun?: string
  connector?: string
  createdAt?: string
}

export interface AutomationCreateInput {
  name: string
  prompt: string
  cron: string
  workspace: string
  startDate?: string
  endDate?: string
  connector?: string
}

export interface AutomationRun {
  id: string
  automationId: string
  status: 'success' | 'failure' | 'running'
  startedAt: string
  completedAt?: string
  output?: string
  error?: string
}

export interface ProjectInfo {
  id: string
  name: string
  description: string
  /** Template id used to seed the project, or 'blank'. */
  template: string
  /** Associated local directory (git repo root) if any. */
  path: string
  icon?: string
  color?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectCreateInput {
  name: string
  description?: string
  template?: string
  path?: string
  icon?: string
  color?: string
  /** Run `git init` in the target directory after creation. */
  initGit?: boolean
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  icon: string
  color: string
  /** Default prompts/checklist seeded into the project. */
  presets: string[]
}

// --- Data management (N23) ---

/** Export scope offered in the data-management tab. */
export type ExportScope = 'all' | 'dateRange' | 'sessions'
/** Serialization formats offered in the export UI. */
export type ExportFormat = 'json' | 'markdown'
/** How id collisions are resolved on import. */
export type ConflictStrategy = 'skip' | 'overwrite'

/** Aggregate counts + on-disk footprint shown in the statistics cards. */
export interface DataStats {
  sessionCount: number
  messageCount: number
  skillCount: number
  automationCount: number
  projectCount: number
  memoryCount: number
  /** Approximate footprint: byte length of the full serialized bundle. */
  diskUsageBytes: number
}

/** Per-collection result counts from an import. */
export interface ImportStats {
  importedSessions: number
  importedMessages: number
  importedSkills: number
  skippedSessions: number
  skippedSkills: number
}

// --- Recording (N24) ---

/** Lifecycle state of the recorder, surfaced to the record button + status bar. */
export type RecordingState = 'idle' | 'recording' | 'paused'

/** Live recorder snapshot pushed each tick and returned by control calls. */
export interface RecorderStatus {
  sessionId: string | null
  state: RecordingState
  /** Number of captured action events so far. */
  eventCount: number
  /** Active recording time in ms (paused spans excluded). */
  elapsedMs: number
}

/** Lightweight recording metadata for list views (N26 replay / N27 skills). */
export interface RecordingSummary {
  id: string
  startTime: number
  endTime: number
  durationMs: number
  eventCount: number
  taskDescription?: string
}

/** Outcome returned when a recording stops; drives the completion dialog. */
export interface RecordStopResult {
  id: string
  durationMs: number
  eventCount: number
  /** Path the recording JSON was written to, or null when not persisted. */
  outputPath: string | null
}

// --- Recording configuration (N25) ---

/** Which recorder backend captures the session. */
export type RecordMode = 'cdp' | 'desktop' | 'hybrid'

/** How often screenshots are captured during a recording. */
export type ScreenshotFrequency = 'on-action' | 'every-3s' | 'every-5s'

/**
 * Pre-recording configuration chosen in the RecordConfigPanel (N25). Persisted
 * across sessions and applied when the next recording starts.
 */
export interface RecordingConfig {
  /** Recorder backend: browser (CDP), desktop, or both. */
  mode: RecordMode
  /** Screenshot cadence. */
  screenshotFrequency: ScreenshotFrequency
  /** Auto-mask password-field input so secrets never reach disk. */
  maskPasswords: boolean
  /** App/window titles to record; empty means capture everything. */
  windowFilter: string[]
  /** Whether to record fine-grained mouse_move events (mouse trail). */
  captureMouseTrail: boolean
  /** Advanced: enable UI Automation element identification. */
  elementCapture: boolean
  /** Advanced: merge consecutive keystrokes / scroll into single steps. */
  mergeOperations: boolean
  /** Advanced: auto-stop threshold in ms; 0 disables the limit. */
  maxDurationMs: number
}

// --- Stream Events ---

export interface StreamTokenEvent {
  type: 'token'
  data: string
}

export interface StreamToolStartEvent {
  type: 'tool_start'
  data: { name: string; input: Record<string, unknown> }
}

export interface StreamToolResultEvent {
  type: 'tool_result'
  data: { name: string; output: string }
}

export interface StreamDoneEvent {
  type: 'done'
  data: { messageId: string; totalTokens: number }
}

export interface StreamErrorEvent {
  type: 'error'
  data: IPCError
}

export type StreamEvent =
  | StreamTokenEvent
  | StreamToolStartEvent
  | StreamToolResultEvent
  | StreamDoneEvent
  | StreamErrorEvent

// --- Helper Types ---

/**
 * Extract input type for a given channel
 */
export type IPCInput<C extends keyof IPCRequestMap> = IPCRequestMap[C]['input']

/**
 * Extract output type for a given channel
 */
export type IPCOutput<C extends keyof IPCRequestMap> =
  IPCRequestMap[C]['output']
