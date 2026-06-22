/**
 * NexaWork IPC Channel Definitions
 * Type-safe communication between Main and Renderer processes
 */

export const IPC_CHANNELS = {
  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_STOP: 'chat:stop',
  CHAT_HISTORY: 'chat:history',
  CHAT_STREAM_TOKEN: 'chat:stream:token',

  // Session
  SESSION_CREATE: 'session:create',
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',

  // Model
  MODEL_LIST: 'model:list',
  MODEL_SET: 'model:set',
  MODEL_TEST: 'model:test',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

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
 * IPC Request/Response type mapping
 */
export interface IPCRequestMap {
  [IPC_CHANNELS.CHAT_SEND]: {
    input: { sessionId: string; message: string; model?: string }
    output: { messageId: string; content: string }
  }
  [IPC_CHANNELS.CHAT_STOP]: {
    input: { sessionId: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.CHAT_HISTORY]: {
    input: { sessionId: string; limit?: number }
    output: { messages: ChatMessage[]; hasMore: boolean }
  }
  [IPC_CHANNELS.SESSION_CREATE]: {
    input: { title?: string; scene?: string; model?: string }
    output: { id: string; title: string; createdAt: string }
  }
  [IPC_CHANNELS.SESSION_LIST]: {
    input: { limit?: number }
    output: { sessions: SessionInfo[] }
  }
  [IPC_CHANNELS.SESSION_DELETE]: {
    input: { id: string }
    output: { success: boolean }
  }
  [IPC_CHANNELS.MODEL_LIST]: {
    input: Record<string, never>
    output: { models: ModelInfo[] }
  }
  [IPC_CHANNELS.SETTINGS_GET]: {
    input: { key?: string }
    output: Record<string, unknown>
  }
  [IPC_CHANNELS.SETTINGS_SET]: {
    input: { key: string; value: unknown }
    output: { success: boolean }
  }
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
  [IPC_CHANNELS.APP_VERSION]: {
    input: Record<string, never>
    output: string
  }
  [IPC_CHANNELS.APP_PLATFORM]: {
    input: Record<string, never>
    output: string
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface SessionInfo {
  id: string
  title: string
  scene: string
  model: string
  createdAt: string
  updatedAt: string
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  capability: 'high' | 'medium' | 'low'
  available: boolean
}

/**
 * Stream event types pushed from Main to Renderer
 */
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
  data: { totalTokens: number }
}

export interface StreamErrorEvent {
  type: 'error'
  data: { code: string; message: string }
}

export type StreamEvent =
  | StreamTokenEvent
  | StreamToolStartEvent
  | StreamToolResultEvent
  | StreamDoneEvent
  | StreamErrorEvent
