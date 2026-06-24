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
  ExportScope,
  ExportFormat,
  ConflictStrategy,
  RecorderStatus,
  RecordingConfig,
  RecordingSummary,
  ReplayReport,
  ReplayStatus,
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

    setApiKey: (input: { provider: string; apiKey: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODEL_SET_API_KEY, input),

    deleteApiKey: (input: { provider: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODEL_DELETE_API_KEY, input),

    apiKeyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_API_KEY_STATUS),
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

  // === Memory (N22) ===
  memory: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LIST),

    add: (input: { content: string; category?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MEMORY_ADD, input),

    delete: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE, input),

    clear: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CLEAR),

    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.MEMORY_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_CHANGED, handler)
      }
    },
  },

  // === Data management (N23) ===
  data: {
    stats: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_STATS),

    export: (input: {
      scope: ExportScope
      format: ExportFormat
      startDate?: string
      endDate?: string
      sessionIds?: string[]
    }) => ipcRenderer.invoke(IPC_CHANNELS.DATA_EXPORT, input),

    import: (input: { content: string; strategy?: ConflictStrategy }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_IMPORT, input),

    clearSessions: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_CLEAR_SESSIONS),

    clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_CLEAR_CACHE),

    resetSettings: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_RESET_SETTINGS),

    backup: () => ipcRenderer.invoke(IPC_CHANNELS.DATA_BACKUP),

    restore: (input: { content: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DATA_RESTORE, input),

    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.DATA_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.DATA_CHANGED, handler)
      }
    },
  },

  // === Recording (N24) ===
  record: {
    start: (input?: { taskDescription?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORD_START, input ?? {}),

    pause: () => ipcRenderer.invoke(IPC_CHANNELS.RECORD_PAUSE, {}),

    resume: () => ipcRenderer.invoke(IPC_CHANNELS.RECORD_RESUME, {}),

    stop: () => ipcRenderer.invoke(IPC_CHANNELS.RECORD_STOP, {}),

    status: () => ipcRenderer.invoke(IPC_CHANNELS.RECORD_STATUS, {}),

    discard: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORD_DISCARD, input),
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.RECORD_GET_CONFIG, {}),
    setConfig: (input: Partial<RecordingConfig>) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORD_SET_CONFIG, input),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.RECORD_LIST, {}),

    onChanged: (callback: (status: RecorderStatus) => void) => {
      const handler = (_: unknown, data: RecorderStatus) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.RECORD_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.RECORD_CHANGED, handler)
      }
    },
  },

  // === Replay (N26) ===
  replay: {
    load: (input: { recordingId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.REPLAY_LOAD, input),
    play: () => ipcRenderer.invoke(IPC_CHANNELS.REPLAY_PLAY, {}),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.REPLAY_PAUSE, {}),
    step: () => ipcRenderer.invoke(IPC_CHANNELS.REPLAY_STEP, {}),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.REPLAY_STOP, {}),
    setSpeed: (input: { speed: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.REPLAY_SET_SPEED, input),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.REPLAY_STATUS, {}),
    report: () => ipcRenderer.invoke(IPC_CHANNELS.REPLAY_REPORT, {}),

    onChanged: (callback: (status: ReplayStatus) => void) => {
      const handler = (_: unknown, data: ReplayStatus) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.REPLAY_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.REPLAY_CHANGED, handler)
      }
    },

    onDone: (callback: (report: ReplayReport) => void) => {
      const handler = (_: unknown, data: ReplayReport) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.REPLAY_DONE, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.REPLAY_DONE, handler)
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
