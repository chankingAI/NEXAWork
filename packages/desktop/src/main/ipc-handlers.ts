import { ipcMain, BrowserWindow, app } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ChatMessage,
  SessionInfo,
  ModelInfo,
} from '../shared/ipc-channels'

/**
 * In-memory session store (will be replaced with SQLite in N10)
 */
const sessions: Map<string, SessionInfo> = new Map()
const messages: Map<string, ChatMessage[]> = new Map()

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function registerIPCHandlers(): void {
  // --- Window Controls ---
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isMaximized() ?? false
  })

  // --- App Info ---
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.APP_PLATFORM, () => {
    return process.platform
  })

  // --- Chat ---
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (
      _event,
      input: { sessionId: string; message: string; model?: string },
    ) => {
      const { sessionId, message } = input
      const id = generateId()
      const userMsg: ChatMessage = {
        id,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      }

      // Store user message
      if (!messages.has(sessionId)) {
        messages.set(sessionId, [])
      }
      messages.get(sessionId)!.push(userMsg)

      // Generate AI response placeholder (QueryEngine integration in N4)
      const assistantId = generateId()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content:
          'NexaWork AI is ready. QueryEngine integration pending (Prompt N4).',
        createdAt: new Date().toISOString(),
      }
      messages.get(sessionId)!.push(assistantMsg)

      return { messageId: assistantId, content: assistantMsg.content }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_STOP,
    async (_event, input: { sessionId: string }) => {
      void input
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_HISTORY,
    async (_event, input: { sessionId: string; limit?: number }) => {
      const { sessionId, limit = 50 } = input
      const allMessages = messages.get(sessionId) ?? []
      const sliced = allMessages.slice(-limit)
      return { messages: sliced, hasMore: allMessages.length > limit }
    },
  )

  // --- Sessions ---
  ipcMain.handle(
    IPC_CHANNELS.SESSION_CREATE,
    async (
      _event,
      input: { title?: string; scene?: string; model?: string },
    ) => {
      const id = generateId()
      const session: SessionInfo = {
        id,
        title: input.title ?? 'New Session',
        scene: input.scene ?? 'office',
        model: input.model ?? 'auto',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      sessions.set(id, session)
      messages.set(id, [])
      return { id, title: session.title, createdAt: session.createdAt }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_LIST,
    async (_event, input: { limit?: number }) => {
      const limit = input?.limit ?? 50
      const allSessions = Array.from(sessions.values())
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, limit)
      return { sessions: allSessions }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_DELETE,
    async (_event, input: { id: string }) => {
      sessions.delete(input.id)
      messages.delete(input.id)
      return { success: true }
    },
  )

  // --- Models ---
  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async () => {
    const models: ModelInfo[] = [
      {
        id: 'auto',
        name: 'Auto',
        provider: 'auto',
        capability: 'high',
        available: true,
      },
      {
        id: 'claude-sonnet',
        name: 'Claude Sonnet',
        provider: 'anthropic',
        capability: 'high',
        available: true,
      },
      {
        id: 'claude-haiku',
        name: 'Claude Haiku',
        provider: 'anthropic',
        capability: 'medium',
        available: true,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        capability: 'high',
        available: true,
      },
      {
        id: 'deepseek-v3',
        name: 'DeepSeek V3',
        provider: 'deepseek',
        capability: 'high',
        available: true,
      },
      {
        id: 'gemini-2.0',
        name: 'Gemini 2.0',
        provider: 'google',
        capability: 'medium',
        available: true,
      },
    ]
    return { models }
  })

  // --- Settings ---
  const settingsStore: Record<string, unknown> = {
    theme: 'light',
    language: 'zh-CN',
    fontSize: 14,
    sendKey: 'Enter',
  }

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (_event, input: { key?: string }) => {
      if (input?.key) {
        return { [input.key]: settingsStore[input.key] }
      }
      return { ...settingsStore }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (_event, input: { key: string; value: unknown }) => {
      settingsStore[input.key] = input.value
      return { success: true }
    },
  )
}
