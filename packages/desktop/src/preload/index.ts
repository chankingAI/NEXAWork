import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { StreamEvent } from '../shared/ipc-channels'

/**
 * NexaWork Preload API
 * Exposes type-safe IPC methods to the Renderer via contextBridge
 */
const nexaworkAPI = {
  // Chat
  chat: {
    send: (input: { sessionId: string; message: string; model?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, input),
    stop: (input: { sessionId: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, input),
    history: (input: { sessionId: string; limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY, input),
    onStreamEvent: (callback: (event: StreamEvent) => void) => {
      const handler = (_: unknown, data: StreamEvent) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_TOKEN, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_TOKEN, handler)
      }
    },
  },

  // Session
  session: {
    create: (input: { title?: string; scene?: string; model?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE, input),
    list: (input?: { limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST, input ?? {}),
    delete: (input: { id: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, input),
  },

  // Model
  model: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST),
  },

  // Settings
  settings: {
    get: (key?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key }),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value }),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  },

  // App info
  app: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
    platform: () => ipcRenderer.invoke(IPC_CHANNELS.APP_PLATFORM),
  },
}

contextBridge.exposeInMainWorld('nexawork', nexaworkAPI)

export type NexaWorkAPI = typeof nexaworkAPI
