/**
 * NexaWork IPC Channel Definitions
 * Type-safe communication between Main and Renderer processes
 * 63-method centralized handler registry (Codex pattern)
 */

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

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',

  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',

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

export interface AutomationInfo {
  id: string
  name: string
  prompt: string
  cron: string
  workspace: string
  status: 'active' | 'paused' | 'completed'
  lastRun?: string
  nextRun?: string
}

export interface AutomationCreateInput {
  name: string
  prompt: string
  cron: string
  workspace: string
  startDate?: string
  endDate?: string
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
