import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  StreamEvent,
  ModelConfig,
  AutomationCreateInput,
  AutomationInfo,
  ProjectCreateInput,
  DesktopPermissionMode,
  PermissionDecisionAction,
  PermissionScope,
  PermissionRequest,
} from '../shared/ipc-channels'

/**
 * NexaWork Preload API
 * Type-safe IPC bridge exposed via contextBridge to Renderer
 * Supports: request-response, streaming, cancellation
 */
const nexaworkAPI = {
  // === Chat ===
  chat: {
    send: (input: { sessionId: string; message: string; model?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, input),

    stream: (input: { sessionId: string; message: string; model?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_STREAM, input),

    stop: (input: { sessionId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, input),

    history: (input: { sessionId: string; limit?: number; before?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY, input),

    regenerate: (input: { sessionId: string; messageId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_REGENERATE, input),

    onStreamEvent: (callback: (event: StreamEvent) => void) => {
      const handler = (_: unknown, data: StreamEvent) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_TOKEN, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_TOKEN, handler)
      }
    },
  },

  // === Session ===
  session: {
    create: (input: { title?: string; scene?: string; model?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE, input),

    list: (input?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST, input ?? {}),

    get: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET, input),

    update: (input: {
      id: string
      title?: string
      scene?: string
      model?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_UPDATE, input),

    delete: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, input),

    search: (input: { query: string; limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_SEARCH, input),
  },

  // === Model ===
  model: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST),

    set: (input: { modelId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODEL_SET, input),

    test: (input: { modelId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODEL_TEST, input),

    configure: (input: { modelId: string; config: ModelConfig }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODEL_CONFIGURE, input),
  },

  // === Expert ===
  expert: {
    list: (input?: { category?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPERT_LIST, input ?? {}),

    get: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPERT_GET, input),

    summon: (input: { expertId: string; sessionId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPERT_SUMMON, input),

    create: (input: {
      name: string
      description: string
      systemPrompt: string
      avatar?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.EXPERT_CREATE, input),

    recent: (input?: { limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPERT_RECENT, input ?? {}),
  },

  // === Skill ===
  skill: {
    list: (input?: { category?: string; installed?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST, input ?? {}),

    install: (input: { skillId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_INSTALL, input),

    toggle: (input: { skillId: string; enabled: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_TOGGLE, input),

    execute: (input: { skillId: string; params?: Record<string, unknown> }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_EXECUTE, input),

    delete: (input: { skillId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_DELETE, input),
  },

  // === Automation ===
  automation: {
    list: (input?: { status?: 'active' | 'paused' | 'completed' }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_LIST, input ?? {}),

    create: (input: AutomationCreateInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_CREATE, input),

    update: (input: { id: string; updates: Partial<AutomationInfo> }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_UPDATE, input),

    delete: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_DELETE, input),

    history: (input: { id: string; limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_HISTORY, input),

    pause: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_PAUSE, input),

    resume: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_RESUME, input),

    runNow: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTOMATION_RUN_NOW, input),

    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.AUTOMATION_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AUTOMATION_CHANGED, handler)
      }
    },
  },

  // === Project ===
  project: {
    list: (input?: { query?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST, input ?? {}),

    get: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, input),

    create: (input: ProjectCreateInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input),

    update: (input: { id: string; name?: string; description?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, input),

    delete: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, input),

    templates: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_TEMPLATES),
  },

  // === Settings ===
  settings: {
    get: (key?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key }),

    set: (key: string, value: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value }),

    reset: (key?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RESET, { key }),

    onChanged: (callback: (settings: Record<string, unknown>) => void) => {
      const handler = (_: unknown, data: Record<string, unknown>) =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, handler)
      }
    },
  },

  // === Window Controls ===
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  },

  // === Permission (N17) ===
  permission: {
    getMode: () => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_MODE),

    setMode: (input: { mode: DesktopPermissionMode }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_SET_MODE, input),

    respond: (input: {
      requestId: string
      decision: PermissionDecisionAction
      scope: PermissionScope
    }) => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_RESPOND, input),

    logList: (input?: { limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_LOG_LIST, input ?? {}),

    logClear: () => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_LOG_CLEAR),

    onRequest: (callback: (request: PermissionRequest) => void) => {
      const handler = (_: unknown, data: PermissionRequest) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.PERMISSION_REQUEST, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.PERMISSION_REQUEST, handler)
      }
    },
  },

  // === App Info ===
  app: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
    platform: () => ipcRenderer.invoke(IPC_CHANNELS.APP_PLATFORM),
  },
}

contextBridge.exposeInMainWorld('nexawork', nexaworkAPI)

export type NexaWorkAPI = typeof nexaworkAPI
