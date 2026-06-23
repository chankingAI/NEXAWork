import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { execFile } from 'child_process'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ChatMessage,
  SessionInfo,
  ModelInfo,
  ExpertInfo,
  SkillInfo,
  AutomationInfo,
  AutomationCreateInput,
  ProjectInfo,
  ProjectCreateInput,
  IPCError,
  DesktopPermissionMode,
  PermissionDecisionAction,
  PermissionScope,
} from '../shared/ipc-channels'
import { computeNextRun, parseSchedule } from '../shared/schedule'
import { PROJECT_TEMPLATES, getTemplate } from '../shared/project-templates'
import {
  initializeEngine,
  getSessionEngine,
  executeQuery,
  executeStreamQuery,
  cancelQuery,
  getHistory,
  updateEngineConfig,
  removeSessionEngine,
} from './backend/engine'
import { initDatabase, type Database } from './backend/database'
import { Scheduler, type AutomationExecutor } from './backend/scheduler'
import { initSettingsStore, type SettingsStore } from './backend/settings-store'
import { initMemoryStore, type MemoryStore } from './backend/memory-store'
import { initSecureStore, type SecureStore } from './backend/secure-store'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { permissionManager } from './backend/permission-manager'

/**
 * NexaWork IPC Handler Registry
 * Centralized handler registration (Codex pattern: 63 methods)
 */

// In-memory stores (sessions/experts/skills); automations & projects are
// persisted via the Database layer below.
const sessions: Map<string, SessionInfo> = new Map()
const messages: Map<string, ChatMessage[]> = new Map()
const experts: Map<string, ExpertInfo> = new Map()
const skills: Map<string, SkillInfo> = new Map()
let activeModel = 'auto'

// Persistent storage + automation scheduler (initialized in registerIPCHandlers).
let db: Database
let scheduler: Scheduler
// Operation-memory + encrypted API-key stores (N22).
let memoryStore: MemoryStore
let secureStore: SecureStore

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createError(code: string, message: string): IPCError {
  return { code, message }
}

/**
 * Resolve the on-disk persistence path from Electron's userData dir, falling
 * back to in-memory when unavailable (e.g. unit tests mocking electron).
 */
function resolveDatabasePath(): string | null {
  try {
    const getPath = (app as { getPath?: (n: string) => string }).getPath
    if (typeof getPath !== 'function') return null
    const userData = getPath.call(app, 'userData')
    return join(userData, 'nexawork.db.json')
  } catch {
    return null
  }
}

/** Push a live "automations changed" event to every renderer window. */
function broadcastAutomationChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.AUTOMATION_CHANGED)
    }
  }
}

/** Push the full, updated settings snapshot to every renderer window. */
function broadcastSettingsChanged(): void {
  const snapshot = settings.all()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, snapshot)
    }
  }
}

/** Push a live "memory changed" event to every renderer window. */
function broadcastMemoryChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.MEMORY_CHANGED)
    }
  }
}

/** Resolve the on-disk path for a userData JSON file, or null in tests. */
function resolveUserDataPath(fileName: string): string | null {
  try {
    const getPath = (app as { getPath?: (n: string) => string }).getPath
    if (typeof getPath !== 'function') return null
    const userData = getPath.call(app, 'userData')
    return join(userData, fileName)
  } catch {
    return null
  }
}

/**
 * Resolve the on-disk path for settings.json, or null when unavailable
 * (e.g. unit tests mocking electron) so the store falls back to in-memory.
 */
function resolveSettingsPath(): string | null {
  try {
    const getPath = (app as { getPath?: (n: string) => string }).getPath
    if (typeof getPath !== 'function') return null
    const userData = getPath.call(app, 'userData')
    return join(userData, 'settings.json')
  } catch {
    return null
  }
}

/**
 * Default automation executor: runs the stored prompt through the backend
 * engine in a transient session. Failures are captured (not thrown) so the
 * scheduler records them as failed runs.
 */
const defaultExecutor: AutomationExecutor = async automation => {
  const sessionId = `auto-${automation.id}`
  try {
    const result = await executeQuery(sessionId, automation.prompt, {})
    return { output: result.content }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { error: e?.message ?? 'Automation execution failed' }
  } finally {
    removeSessionEngine(sessionId)
  }
}

/** Compute the initial nextRun for a new automation given its valid range. */
function computeInitialNextRun(
  cron: string,
  startDate?: string,
): string | undefined {
  const config = parseSchedule(cron)
  if (!config) return undefined
  const now = new Date()
  const base =
    startDate && new Date(startDate).getTime() > now.getTime()
      ? new Date(startDate)
      : now
  const next = computeNextRun(config, base)
  return next?.toISOString()
}

/** Run `git init` in `dir` (best-effort, promisified). */
function gitInit(dir: string): Promise<void> {
  return new Promise(resolve => {
    execFile('git', ['init'], { cwd: dir }, () => resolve())
  })
}

/**
 * Get API key from settings or environment
 */
function getApiKey(provider: string): string | undefined {
  // Encrypted secure-store (safeStorage) is the source of truth; fall back to
  // legacy plaintext settings keys and finally environment variables.
  const stored = secureStore?.get(provider)
  if (stored) return stored
  switch (provider) {
    case 'anthropic':
      return (
        (settings.get('apiKeys.anthropic') as string) ??
        process.env.ANTHROPIC_API_KEY
      )
    case 'openai':
      return (
        (settings.get('apiKeys.openai') as string) ?? process.env.OPENAI_API_KEY
      )
    case 'gemini':
    case 'google':
      return (
        (settings.get('apiKeys.gemini') as string) ?? process.env.GEMINI_API_KEY
      )
    case 'grok':
      return (settings.get('apiKeys.grok') as string) ?? process.env.XAI_API_KEY
    default:
      return undefined
  }
}

/**
 * Map model ID to provider name
 */
function getProviderForModel(modelId: string): string {
  if (modelId.includes('claude') || modelId === 'auto') return 'anthropic'
  if (
    modelId.includes('gpt') ||
    modelId.includes('o1') ||
    modelId.includes('o3')
  )
    return 'openai'
  if (modelId.includes('gemini')) return 'gemini'
  if (modelId.includes('deepseek')) return 'openai' // deepseek uses openai-compatible
  if (modelId.includes('grok')) return 'grok'
  return 'anthropic'
}

/**
 * Read the agent/model behaviour overrides from persisted settings so that
 * System Prompt / temperature / max-tokens / custom endpoint changes affect
 * AI behaviour immediately (N22 acceptance: "System Prompt 修改即时影响 AI 行为").
 */
function agentConfigFromSettings(): {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  baseURL?: string
} {
  const systemPrompt = settings.get('systemPrompt') as string | undefined
  const temperature = settings.get('temperature') as number | undefined
  const maxTokens = settings.get('maxTokens') as number | undefined
  const customEndpoint = settings.get('customEndpoint') as string | undefined
  return {
    systemPrompt: systemPrompt?.trim() ? systemPrompt : undefined,
    temperature: typeof temperature === 'number' ? temperature : undefined,
    maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
    baseURL: customEndpoint?.trim() ? customEndpoint.trim() : undefined,
  }
}

/**
 * Resolve model ID to actual API model name
 */
function resolveModelName(modelId: string): string {
  const modelMap: Record<string, string> = {
    auto: 'claude-sonnet-4-20250514',
    'claude-sonnet': 'claude-sonnet-4-20250514',
    'claude-haiku': 'claude-haiku-4-20250414',
    'gpt-4o': 'gpt-4o',
    'deepseek-v3': 'deepseek-chat',
    'gemini-2.0': 'gemini-2.0-flash',
  }
  return modelMap[modelId] ?? modelId
}

// Persistent settings store (shared reference for API key lookups + N21 UI).
// Initialized in registerIPCHandlers; defaults applied until then.
let settings: SettingsStore = initSettingsStore(null, { ...DEFAULT_SETTINGS })

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
  permissionManager.reset()
  activeModel = 'auto'

  // Initialize persistent storage + automation scheduler.
  db = initDatabase(resolveDatabasePath())
  scheduler?.stop()
  scheduler = new Scheduler(db, {
    executor: defaultExecutor,
    onChange: broadcastAutomationChanged,
    intervalMs: 30_000,
  })
  scheduler.start()

  // Initialize persistent settings (settings.json), defaults applied on first
  // run; persisted overrides are merged in.
  settings = initSettingsStore(resolveSettingsPath(), { ...DEFAULT_SETTINGS })

  // Initialize N22 stores: operation memory + encrypted API keys. Prune memory
  // entries past the configured retention window on startup.
  memoryStore = initMemoryStore(resolveUserDataPath('memory.json'))
  secureStore = initSecureStore(resolveUserDataPath('secure-keys.json'))
  memoryStore.prune(
    (settings.get('memoryRetentionDays') as number) ??
      DEFAULT_SETTINGS.memoryRetentionDays,
  )

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

  // === Initialize Backend Engine ===
  const provider = getProviderForModel(activeModel)
  const apiKey = getApiKey(provider)
  initializeEngine({
    apiKey,
    provider: provider as 'anthropic' | 'openai' | 'gemini' | 'grok',
    model: resolveModelName(activeModel),
    cwd: process.cwd(),
    maxRetries: 3,
    maxTurns: 50,
  })

  // === Chat (N4: QueryEngine Integration) ===
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (
      _event,
      input: { sessionId: string; message: string; model?: string },
    ) => {
      const { sessionId, message } = input
      if (!sessionId)
        throw createError('INVALID_INPUT', 'sessionId is required')

      // Configure engine with API key for selected model
      const modelId = input.model ?? activeModel
      const modelProvider = getProviderForModel(modelId)
      const modelApiKey = getApiKey(modelProvider)
      updateEngineConfig(sessionId, {
        model: resolveModelName(modelId),
        provider: modelProvider as 'anthropic' | 'openai' | 'gemini' | 'grok',
        apiKey: modelApiKey,
        ...agentConfigFromSettings(),
      })

      try {
        const result = await executeQuery(sessionId, message, {
          model: resolveModelName(modelId),
        })
        return { messageId: result.messageId, content: result.content }
      } catch (err: unknown) {
        const error = err as IPCError
        throw createError(
          error.code ?? 'QUERY_ERROR',
          error.message ?? 'Query failed',
        )
      }
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

      // Configure engine with API key for selected model
      const modelId = input.model ?? activeModel
      const modelProvider = getProviderForModel(modelId)
      const modelApiKey = getApiKey(modelProvider)
      updateEngineConfig(sessionId, {
        model: resolveModelName(modelId),
        provider: modelProvider as 'anthropic' | 'openai' | 'gemini' | 'grok',
        apiKey: modelApiKey,
        ...agentConfigFromSettings(),
      })

      const win = BrowserWindow.fromWebContents(event.sender)
      try {
        const result = await executeStreamQuery(sessionId, message, win, {
          model: resolveModelName(modelId),
        })
        return { streamId: result.streamId }
      } catch (err: unknown) {
        const error = err as IPCError
        throw createError(
          error.code ?? 'STREAM_ERROR',
          error.message ?? 'Stream failed',
        )
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_STOP,
    async (_event, input: { sessionId: string }) => {
      cancelQuery(input.sessionId)
      // Always return success — stop is best-effort
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

      // Try backend engine first (has real conversation data)
      const engineHistory = getHistory(sessionId, { limit })
      if (engineHistory.messages.length > 0) {
        return {
          messages: engineHistory.messages,
          hasMore: engineHistory.hasMore,
        }
      }

      // Fallback to in-memory store (for legacy sessions)
      const allMessages = messages.get(sessionId) ?? []
      const sliced = allMessages.slice(-limit)
      return { messages: sliced, hasMore: allMessages.length > limit }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_REGENERATE,
    async (event, input: { sessionId: string; messageId: string }) => {
      const { sessionId, messageId } = input
      const engine = getSessionEngine(sessionId)

      // Find the user message that preceded the messageId and re-send it
      const msgIndex = engine.messages.findIndex(m => m.id === messageId)
      let lastUserMessage = ''
      if (msgIndex > 0) {
        // Look backward for the user message
        for (let i = msgIndex - 1; i >= 0; i--) {
          if (engine.messages[i].role === 'user') {
            lastUserMessage = engine.messages[i].content
            break
          }
        }
      }

      if (!lastUserMessage) {
        // If we can't find the preceding user message, use a placeholder
        lastUserMessage = 'Please regenerate your previous response.'
      }

      // Remove the old assistant message and re-query
      engine.messages = engine.messages.filter(m => m.id !== messageId)

      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await executeStreamQuery(sessionId, lastUserMessage, win)

      return { messageId: result.streamId, content: '' }
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
      removeSessionEngine(input.id)
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
      const modelId = input?.modelId ?? activeModel
      const provider = getProviderForModel(modelId)
      // 'auto' uses the built-in engine and is always reachable; other models
      // need a configured API key (secure store / settings / env) to connect.
      const available = modelId === 'auto' || Boolean(getApiKey(provider))
      const latency = available ? Math.floor(Math.random() * 500) + 100 : 0
      return { latency, available }
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

  ipcMain.handle(
    IPC_CHANNELS.MODEL_SET_API_KEY,
    async (_event, input: { provider: string; apiKey: string }) => {
      if (!input?.provider)
        throw createError('INVALID_INPUT', 'provider is required')
      secureStore.set(input.provider, input.apiKey ?? '')
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MODEL_DELETE_API_KEY,
    async (_event, input: { provider: string }) => {
      if (!input?.provider)
        throw createError('INVALID_INPUT', 'provider is required')
      secureStore.delete(input.provider)
      return { success: true }
    },
  )

  ipcMain.handle(IPC_CHANNELS.MODEL_API_KEY_STATUS, async () => {
    return {
      configured: secureStore.status(),
      encryptionAvailable: secureStore.isEncryptionAvailable(),
    }
  })

  // === Memory (N22: operationMemory) ===
  ipcMain.handle(IPC_CHANNELS.MEMORY_LIST, async () => {
    const entries = memoryStore.list()
    return { entries, total: entries.length }
  })

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_ADD,
    async (_event, input: { content: string; category?: string }) => {
      if (!input?.content)
        throw createError('INVALID_INPUT', 'content is required')
      const entry = memoryStore.add({
        content: input.content,
        category: input.category,
      })
      broadcastMemoryChanged()
      return { entry }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_DELETE,
    async (_event, input: { id: string }) => {
      if (!input?.id) throw createError('INVALID_INPUT', 'id is required')
      const removed = memoryStore.delete(input.id)
      if (removed) broadcastMemoryChanged()
      return { success: removed }
    },
  )

  ipcMain.handle(IPC_CHANNELS.MEMORY_CLEAR, async () => {
    memoryStore.clear()
    broadcastMemoryChanged()
    return { success: true }
  })

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

  // === Automation (N18/N19: persistent + scheduled) ===
  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_LIST,
    async (_event, input: { status?: AutomationInfo['status'] }) => {
      return { automations: db.listAutomations(input?.status) }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_CREATE,
    async (_event, input: AutomationCreateInput) => {
      if (!input.name?.trim())
        throw createError('INVALID_INPUT', 'name is required')
      if (!input.prompt?.trim())
        throw createError('INVALID_INPUT', 'prompt is required')
      if (!input.cron?.trim())
        throw createError('INVALID_INPUT', 'schedule is required')

      const id = `auto-${generateId()}`
      const now = new Date().toISOString()
      const automation: AutomationInfo = {
        id,
        name: input.name.trim(),
        prompt: input.prompt,
        cron: input.cron,
        workspace: input.workspace ?? '',
        connector: input.connector,
        status: 'active',
        validFrom: input.startDate,
        validTo: input.endDate,
        nextRun: computeInitialNextRun(input.cron, input.startDate),
        createdAt: now,
      }
      db.insertAutomation(automation)
      broadcastAutomationChanged()
      return { id }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_UPDATE,
    async (_event, input: { id: string; updates: Partial<AutomationInfo> }) => {
      const existing = db.getAutomation(input.id)
      if (!existing)
        throw createError('NOT_FOUND', `Automation ${input.id} not found`)
      const updates = { ...input.updates }
      // Recompute nextRun if the schedule changed.
      if (updates.cron && updates.cron !== existing.cron) {
        updates.nextRun = computeInitialNextRun(
          updates.cron,
          updates.validFrom ?? existing.validFrom,
        )
      }
      db.updateAutomation(input.id, updates)
      broadcastAutomationChanged()
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_PAUSE,
    async (_event, input: { id: string }) => {
      const existing = db.getAutomation(input.id)
      if (!existing)
        throw createError('NOT_FOUND', `Automation ${input.id} not found`)
      db.updateAutomation(input.id, { status: 'paused' })
      broadcastAutomationChanged()
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_RESUME,
    async (_event, input: { id: string }) => {
      const existing = db.getAutomation(input.id)
      if (!existing)
        throw createError('NOT_FOUND', `Automation ${input.id} not found`)
      db.updateAutomation(input.id, {
        status: 'active',
        nextRun:
          existing.nextRun ??
          computeInitialNextRun(existing.cron, existing.validFrom),
      })
      broadcastAutomationChanged()
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_RUN_NOW,
    async (_event, input: { id: string }) => {
      const run = await scheduler.runNow(input.id)
      if (!run)
        throw createError('NOT_FOUND', `Automation ${input.id} not found`)
      return { run }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_DELETE,
    async (_event, input: { id: string }) => {
      const ok = db.deleteAutomation(input.id)
      broadcastAutomationChanged()
      return { success: ok }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AUTOMATION_HISTORY,
    async (_event, input: { id: string; limit?: number }) => {
      return { runs: db.listRuns(input.id, input.limit ?? 20) }
    },
  )

  // === Project (N20: persistent + git init) ===
  ipcMain.handle(IPC_CHANNELS.PROJECT_TEMPLATES, async () => {
    return { templates: PROJECT_TEMPLATES }
  })

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_LIST,
    async (_event, input: { query?: string }) => {
      return { projects: db.listProjects(input?.query) }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_GET,
    async (_event, input: { id: string }) => {
      const project = db.getProject(input.id)
      if (!project)
        throw createError('NOT_FOUND', `Project ${input.id} not found`)
      return project
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CREATE,
    async (_event, input: ProjectCreateInput) => {
      if (!input.name?.trim())
        throw createError('INVALID_INPUT', 'name is required')

      const template = input.template ? getTemplate(input.template) : undefined
      const id = `proj-${generateId()}`
      const now = new Date().toISOString()
      const project: ProjectInfo = {
        id,
        name: input.name.trim(),
        description: input.description ?? template?.description ?? '',
        template: input.template ?? 'blank',
        path: input.path ?? '',
        icon: input.icon ?? template?.icon ?? '📁',
        color: input.color ?? template?.color ?? '#6B7280',
        createdAt: now,
        updatedAt: now,
      }

      // Optionally create + git-init the local directory (best-effort).
      if (input.path) {
        try {
          if (!existsSync(input.path))
            mkdirSync(input.path, { recursive: true })
          if (input.initGit) await gitInit(input.path)
        } catch {
          // Directory/git failures are non-fatal; project metadata is still saved.
        }
      }

      db.insertProject(project)
      return { id, project }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE,
    async (
      _event,
      input: { id: string; name?: string; description?: string },
    ) => {
      const existing = db.getProject(input.id)
      if (!existing)
        throw createError('NOT_FOUND', `Project ${input.id} not found`)
      const updates: Partial<ProjectInfo> = {
        updatedAt: new Date().toISOString(),
      }
      if (input.name !== undefined) updates.name = input.name.trim()
      if (input.description !== undefined)
        updates.description = input.description
      db.updateProject(input.id, updates)
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DELETE,
    async (_event, input: { id: string }) => {
      return { success: db.deleteProject(input.id) }
    },
  )

  // === Settings ===
  // Backed by the persistent SettingsStore (settings.json). Mutations persist
  // to disk and broadcast a fresh snapshot to every renderer for live sync.

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (_event, input: { key?: string }) => {
      if (input?.key) return { [input.key]: settings.get(input.key) }
      return settings.all()
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (_event, input: { key: string; value: unknown }) => {
      settings.set(input.key, input.value)
      broadcastSettingsChanged()
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_RESET,
    async (_event, input: { key?: string }) => {
      settings.reset(input?.key)
      broadcastSettingsChanged()
      return { success: true }
    },
  )

  // === Permission (N17) ===
  ipcMain.handle(IPC_CHANNELS.PERMISSION_GET_MODE, async () => {
    return {
      mode: permissionManager.getMode(),
      bypassAvailable: permissionManager.isBypassAvailable(),
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_SET_MODE,
    async (_event, input: { mode: DesktopPermissionMode }) => {
      const mode = permissionManager.setMode(input.mode)
      return { success: true, mode }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_RESPOND,
    async (
      _event,
      input: {
        requestId: string
        decision: PermissionDecisionAction
        scope: PermissionScope
      },
    ) => {
      const success = permissionManager.respond(
        input.requestId,
        input.decision,
        input.scope,
      )
      return { success }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_LOG_LIST,
    async (_event, input: { limit?: number }) => {
      return { entries: permissionManager.getLog(input?.limit) }
    },
  )

  ipcMain.handle(IPC_CHANNELS.PERMISSION_LOG_CLEAR, async () => {
    permissionManager.clearLog()
    return { success: true }
  })
}
