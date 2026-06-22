import { ipcMain, BrowserWindow, app } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ChatMessage,
  SessionInfo,
  ModelInfo,
  ExpertInfo,
  SkillInfo,
  AutomationInfo,
  AutomationRun,
  IPCError,
  StreamEvent,
} from '../shared/ipc-channels'

/**
 * NexaWork IPC Handler Registry
 * Centralized handler registration (Codex pattern: 63 methods)
 */

// In-memory stores (will be replaced with SQLite in N10)
const sessions: Map<string, SessionInfo> = new Map()
const messages: Map<string, ChatMessage[]> = new Map()
const experts: Map<string, ExpertInfo> = new Map()
const skills: Map<string, SkillInfo> = new Map()
const automations: Map<string, AutomationInfo> = new Map()
const automationRuns: Map<string, AutomationRun[]> = new Map()
let activeModel = 'auto'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createError(code: string, message: string): IPCError {
  return { code, message }
}

/**
 * Send stream event to renderer
 */
function emitStreamEvent(win: BrowserWindow | null, event: StreamEvent): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.CHAT_STREAM_TOKEN, event)
  }
}

/**
 * Simulate streaming response (will be replaced with QueryEngine in N4)
 */
async function simulateStream(
  win: BrowserWindow | null,
  sessionId: string,
  message: string,
): Promise<string> {
  const responseText = `Received: "${message}". NexaWork AI streaming ready. QueryEngine integration pending (Prompt N4).`
  const words = responseText.split(' ')
  const messageId = generateId()

  for (let i = 0; i < words.length; i++) {
    const token = (i === 0 ? '' : ' ') + words[i]
    emitStreamEvent(win, { type: 'token', data: token })
    await new Promise(resolve => setTimeout(resolve, 30))
  }

  emitStreamEvent(win, {
    type: 'done',
    data: { messageId, totalTokens: words.length },
  })

  // Store the complete message
  const assistantMsg: ChatMessage = {
    id: messageId,
    role: 'assistant',
    content: responseText,
    model: activeModel,
    createdAt: new Date().toISOString(),
  }
  if (!messages.has(sessionId)) {
    messages.set(sessionId, [])
  }
  messages.get(sessionId)!.push(assistantMsg)

  return messageId
}

// Seed default experts
function seedExperts(): void {
  const defaults: ExpertInfo[] = [
    {
      id: 'expert-code',
      name: 'Code Expert',
      description: 'Full-stack development specialist',
      avatar: '👨‍💻',
      category: 'development',
      systemPrompt: 'You are an expert full-stack developer.',
      tags: ['code', 'debug', 'architecture'],
    },
    {
      id: 'expert-data',
      name: 'Data Analyst',
      description: 'Data analysis and visualization expert',
      avatar: '📊',
      category: 'analytics',
      systemPrompt: 'You are a data analysis expert.',
      tags: ['data', 'sql', 'visualization'],
    },
    {
      id: 'expert-writer',
      name: 'Writer',
      description: 'Professional writing and editing',
      avatar: '✍️',
      category: 'content',
      systemPrompt: 'You are a professional writer.',
      tags: ['writing', 'editing', 'copywriting'],
    },
  ]
  for (const expert of defaults) {
    experts.set(expert.id, expert)
  }
}

// Seed default skills
function seedSkills(): void {
  const defaults: SkillInfo[] = [
    {
      id: 'skill-web-search',
      name: 'Web Search',
      description: 'Search the web for information',
      category: 'tools',
      installed: true,
      enabled: true,
      version: '1.0.0',
    },
    {
      id: 'skill-file-edit',
      name: 'File Edit',
      description: 'Read and edit files',
      category: 'tools',
      installed: true,
      enabled: true,
      version: '1.0.0',
    },
    {
      id: 'skill-code-run',
      name: 'Code Runner',
      description: 'Execute code in sandbox',
      category: 'development',
      installed: true,
      enabled: true,
      version: '1.0.0',
    },
  ]
  for (const skill of defaults) {
    skills.set(skill.id, skill)
  }
}

export function registerIPCHandlers(): void {
  // Clear state for idempotent re-registration (important for tests)
  sessions.clear()
  messages.clear()
  experts.clear()
  skills.clear()
  automations.clear()
  automationRuns.clear()
  activeModel = 'auto'

  seedExperts()
  seedSkills()

  // === Window Controls ===
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, event => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
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
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, event => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // === App Info ===
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.APP_PLATFORM, () => process.platform)

  // === Chat ===
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (
      _event,
      input: { sessionId: string; message: string; model?: string },
    ) => {
      const { sessionId, message } = input
      if (!sessionId)
        throw createError('INVALID_INPUT', 'sessionId is required')

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: message,
        model: input.model ?? activeModel,
        createdAt: new Date().toISOString(),
      }

      if (!messages.has(sessionId)) messages.set(sessionId, [])
      messages.get(sessionId)!.push(userMsg)

      const assistantId = generateId()
      const content = `NexaWork AI ready. QueryEngine integration pending (Prompt N4).`
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content,
        model: activeModel,
        createdAt: new Date().toISOString(),
      }
      messages.get(sessionId)!.push(assistantMsg)

      return { messageId: assistantId, content }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_STREAM,
    async (
      event,
      input: { sessionId: string; message: string; model?: string },
    ) => {
      const { sessionId, message } = input
      if (!sessionId)
        throw createError('INVALID_INPUT', 'sessionId is required')

      const streamId = generateId()
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: message,
        model: input.model ?? activeModel,
        createdAt: new Date().toISOString(),
      }

      if (!messages.has(sessionId)) messages.set(sessionId, [])
      messages.get(sessionId)!.push(userMsg)

      // Start streaming asynchronously
      const win = BrowserWindow.fromWebContents(event.sender)
      simulateStream(win, sessionId, message)

      return { streamId }
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
    async (
      _event,
      input: { sessionId: string; limit?: number; before?: string },
    ) => {
      const { sessionId, limit = 50 } = input
      const allMessages = messages.get(sessionId) ?? []
      const sliced = allMessages.slice(-limit)
      return { messages: sliced, hasMore: allMessages.length > limit }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_REGENERATE,
    async (_event, input: { sessionId: string; messageId: string }) => {
      const { sessionId } = input
      const newId = generateId()
      const content = 'Regenerated response. QueryEngine integration pending.'
      const msg: ChatMessage = {
        id: newId,
        role: 'assistant',
        content,
        model: activeModel,
        createdAt: new Date().toISOString(),
      }
      if (!messages.has(sessionId)) messages.set(sessionId, [])
      messages.get(sessionId)!.push(msg)
      return { messageId: newId, content }
    },
  )

  // === Sessions ===
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
        messageCount: 0,
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
    async (_event, input: { limit?: number; offset?: number }) => {
      const limit = input?.limit ?? 50
      const offset = input?.offset ?? 0
      const all = Array.from(sessions.values()).sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      return { sessions: all.slice(offset, offset + limit), total: all.length }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_GET,
    async (_event, input: { id: string }) => {
      const session = sessions.get(input.id)
      if (!session)
        throw createError('NOT_FOUND', `Session ${input.id} not found`)
      return session
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_UPDATE,
    async (
      _event,
      input: { id: string; title?: string; scene?: string; model?: string },
    ) => {
      const session = sessions.get(input.id)
      if (!session)
        throw createError('NOT_FOUND', `Session ${input.id} not found`)
      if (input.title) session.title = input.title
      if (input.scene) session.scene = input.scene
      if (input.model) session.model = input.model
      session.updatedAt = new Date().toISOString()
      return { success: true }
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

  ipcMain.handle(
    IPC_CHANNELS.SESSION_SEARCH,
    async (_event, input: { query: string; limit?: number }) => {
      const limit = input.limit ?? 20
      const query = input.query.toLowerCase()
      const results = Array.from(sessions.values())
        .filter(s => s.title.toLowerCase().includes(query))
        .slice(0, limit)
      return { sessions: results }
    },
  )

  // === Models ===
  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async () => {
    const models: ModelInfo[] = [
      {
        id: 'auto',
        name: 'Auto',
        provider: 'auto',
        capability: 'high',
        maxTokens: 200000,
        available: true,
      },
      {
        id: 'claude-sonnet',
        name: 'Claude Sonnet',
        provider: 'anthropic',
        capability: 'high',
        maxTokens: 200000,
        available: true,
      },
      {
        id: 'claude-haiku',
        name: 'Claude Haiku',
        provider: 'anthropic',
        capability: 'medium',
        maxTokens: 200000,
        available: true,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        capability: 'high',
        maxTokens: 128000,
        available: true,
      },
      {
        id: 'deepseek-v3',
        name: 'DeepSeek V3',
        provider: 'deepseek',
        capability: 'high',
        maxTokens: 128000,
        available: true,
      },
      {
        id: 'gemini-2.0',
        name: 'Gemini 2.0',
        provider: 'google',
        capability: 'medium',
        maxTokens: 1000000,
        available: true,
      },
    ]
    return { models }
  })

  ipcMain.handle(
    IPC_CHANNELS.MODEL_SET,
    async (_event, input: { modelId: string }) => {
      activeModel = input.modelId
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MODEL_TEST,
    async (_event, input: { modelId: string }) => {
      void input
      const latency = Math.floor(Math.random() * 500) + 100
      return { latency, available: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MODEL_CONFIGURE,
    async (
      _event,
      input: { modelId: string; config: Record<string, unknown> },
    ) => {
      void input
      return { success: true }
    },
  )

  // === Experts ===
  ipcMain.handle(
    IPC_CHANNELS.EXPERT_LIST,
    async (_event, input: { category?: string }) => {
      let list = Array.from(experts.values())
      if (input?.category) {
        list = list.filter(e => e.category === input.category)
      }
      return { experts: list }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPERT_GET,
    async (_event, input: { id: string }) => {
      const expert = experts.get(input.id)
      if (!expert)
        throw createError('NOT_FOUND', `Expert ${input.id} not found`)
      return expert
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPERT_SUMMON,
    async (_event, input: { expertId: string; sessionId: string }) => {
      const expert = experts.get(input.expertId)
      if (!expert)
        throw createError('NOT_FOUND', `Expert ${input.expertId} not found`)
      return { success: true, greeting: `${expert.name} is ready to help.` }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPERT_CREATE,
    async (
      _event,
      input: {
        name: string
        description: string
        systemPrompt: string
        avatar?: string
      },
    ) => {
      const id = `expert-${generateId()}`
      const expert: ExpertInfo = {
        id,
        name: input.name,
        description: input.description,
        avatar: input.avatar ?? '🤖',
        category: 'custom',
        systemPrompt: input.systemPrompt,
        tags: [],
      }
      experts.set(id, expert)
      return { id }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPERT_RECENT,
    async (_event, input: { limit?: number }) => {
      const limit = input?.limit ?? 5
      const list = Array.from(experts.values()).slice(0, limit)
      return { experts: list }
    },
  )

  // === Skills ===
  ipcMain.handle(
    IPC_CHANNELS.SKILL_LIST,
    async (_event, input: { category?: string; installed?: boolean }) => {
      let list = Array.from(skills.values())
      if (input?.category)
        list = list.filter(s => s.category === input.category)
      if (input?.installed !== undefined)
        list = list.filter(s => s.installed === input.installed)
      return { skills: list }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SKILL_INSTALL,
    async (_event, input: { skillId: string }) => {
      const skill = skills.get(input.skillId)
      if (skill) {
        skill.installed = true
        skill.enabled = true
      }
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SKILL_TOGGLE,
    async (_event, input: { skillId: string; enabled: boolean }) => {
      const skill = skills.get(input.skillId)
      if (skill) skill.enabled = input.enabled
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SKILL_EXECUTE,
    async (
      _event,
      input: { skillId: string; params?: Record<string, unknown> },
    ) => {
      const skill = skills.get(input.skillId)
      if (!skill)
        throw createError('NOT_FOUND', `Skill ${input.skillId} not found`)
      return { result: `Executed skill: ${skill.name}` }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SKILL_DELETE,
    async (_event, input: { skillId: string }) => {
      skills.delete(input.skillId)
      return { success: true }
    },
  )

  // === Automation ===
  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_LIST,
    async (_event, input: { status?: string }) => {
      let list = Array.from(automations.values())
      if (input?.status) list = list.filter(a => a.status === input.status)
      return { automations: list }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_CREATE,
    async (
      _event,
      input: { name: string; prompt: string; cron: string; workspace: string },
    ) => {
      const id = `auto-${generateId()}`
      const automation: AutomationInfo = {
        id,
        name: input.name,
        prompt: input.prompt,
        cron: input.cron,
        workspace: input.workspace,
        status: 'active',
        nextRun: new Date(Date.now() + 3600000).toISOString(),
      }
      automations.set(id, automation)
      automationRuns.set(id, [])
      return { id }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_UPDATE,
    async (_event, input: { id: string; updates: Record<string, unknown> }) => {
      const automation = automations.get(input.id)
      if (!automation)
        throw createError('NOT_FOUND', `Automation ${input.id} not found`)
      Object.assign(automation, input.updates)
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_DELETE,
    async (_event, input: { id: string }) => {
      automations.delete(input.id)
      automationRuns.delete(input.id)
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_HISTORY,
    async (_event, input: { id: string; limit?: number }) => {
      const limit = input.limit ?? 20
      const runs = (automationRuns.get(input.id) ?? []).slice(-limit)
      return { runs }
    },
  )

  // === Settings ===
  const settingsStore: Record<string, unknown> = {
    theme: 'light',
    language: 'zh-CN',
    fontSize: 14,
    sendKey: 'Enter',
    model: 'auto',
    temperature: 0.7,
    maxTokens: 4096,
  }

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (_event, input: { key?: string }) => {
      if (input?.key) return { [input.key]: settingsStore[input.key] }
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

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RESET,
    async (_event, input: { key?: string }) => {
      if (input?.key) {
        delete settingsStore[input.key]
      }
      return { success: true }
    },
  )
}
