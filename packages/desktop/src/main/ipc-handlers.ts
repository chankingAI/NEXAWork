import { ipcMain, BrowserWindow, app } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ChatMessage,
  SessionInfo,
  ModelInfo,
  ExpertInfo,
  SkillInfo,
  SkillImportSourceType,
  AutomationInfo,
  AutomationRun,
  IPCError,
} from '../shared/ipc-channels'
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
 * Derive a human-friendly skill name from an import source string.
 * file → basename without extension; url/repo → last path segment.
 */
function deriveSkillName(
  source: string,
  sourceType: SkillImportSourceType,
): string {
  const cleaned = source.replace(/[?#].*$/, '').replace(/\/+$/, '')
  const segment = cleaned.split(/[/\\]/).filter(Boolean).pop() ?? cleaned
  const base = sourceType === 'file' ? segment.replace(/\.[^.]+$/, '') : segment
  const name = base.replace(/\.git$/, '').trim()
  return name.length > 0 ? name : '导入的技能'
}

/**
 * Get API key from settings or environment
 */
function getApiKey(provider: string): string | undefined {
  switch (provider) {
    case 'anthropic':
      return (
        (settingsStore['apiKeys.anthropic'] as string) ??
        process.env.ANTHROPIC_API_KEY
      )
    case 'openai':
      return (
        (settingsStore['apiKeys.openai'] as string) ??
        process.env.OPENAI_API_KEY
      )
    case 'gemini':
    case 'google':
      return (
        (settingsStore['apiKeys.gemini'] as string) ??
        process.env.GEMINI_API_KEY
      )
    case 'grok':
      return (
        (settingsStore['apiKeys.grok'] as string) ?? process.env.XAI_API_KEY
      )
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

// Settings store (shared reference for API key lookups)
const settingsStore: Record<string, unknown> = {
  theme: 'light',
  language: 'zh-CN',
  fontSize: 14,
  sendKey: 'Enter',
  model: 'auto',
  temperature: 0.7,
  maxTokens: 4096,
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

// Seed default skills — three tiers mirror the N15 panel categories:
// builtin (bundledSkills.ts), installed (.claude/skills/ + recorder), available
// (marketplace). Detail metadata powers the SkillDetail panel.
function seedSkills(): void {
  const defaults: SkillInfo[] = [
    // ── Builtin (bundled) ──
    {
      id: 'skill-web-search',
      name: 'Web Search',
      description: 'Search the web for up-to-date information',
      category: 'tools',
      installed: true,
      enabled: true,
      version: '1.0.0',
      source: 'builtin',
      icon: '🔍',
      color: '#3B82F6',
      author: 'NexaWork',
      longDescription:
        'Query the web for current information and summarise the results inline. Backed by the WebSearch tool.',
      permissions: ['network'],
      config: [
        {
          key: 'maxResults',
          label: '最大结果数',
          type: 'number',
          value: 5,
          description: '每次搜索返回的结果数量',
        },
      ],
    },
    {
      id: 'skill-file-edit',
      name: 'File Edit',
      description: 'Read and edit files in the workspace',
      category: 'tools',
      installed: true,
      enabled: true,
      version: '1.0.0',
      source: 'builtin',
      icon: '📝',
      color: '#10B981',
      author: 'NexaWork',
      longDescription:
        'Read, create and modify files using the FileRead / FileEdit / FileWrite tools.',
      permissions: ['filesystem:read', 'filesystem:write'],
    },
    {
      id: 'skill-code-run',
      name: 'Code Runner',
      description: 'Execute code in a sandboxed shell',
      category: 'development',
      installed: true,
      enabled: true,
      version: '1.0.0',
      source: 'builtin',
      icon: '⚡',
      color: '#F59E0B',
      author: 'NexaWork',
      longDescription:
        'Run shell commands and scripts inside the sandbox runtime via the Bash tool.',
      permissions: ['shell', 'filesystem:read'],
    },
    {
      id: 'skill-creation-guide',
      name: '技能创建指南',
      description: 'Step-by-step guide for authoring new skills',
      category: 'guide',
      installed: true,
      enabled: true,
      version: '1.0.0',
      source: 'builtin',
      icon: '📚',
      color: '#8B5CF6',
      author: 'NexaWork',
      longDescription:
        'Walks through SKILL.md structure, frontmatter, allowed tools and packaging so you can publish your own skills.',
      permissions: [],
    },
    // ── Installed (custom / recorder) ──
    {
      id: 'skill-self-improving-agent',
      name: 'self-improving-agent',
      description: 'Agent that refines its own prompts from feedback',
      category: 'agent',
      installed: true,
      enabled: false,
      version: '0.3.0',
      source: 'installed',
      icon: '🤖',
      color: '#EC4899',
      author: '.claude/skills',
      longDescription:
        'Learns from operation memory to iteratively improve its instructions. Loaded from .claude/skills/.',
      permissions: ['filesystem:read', 'filesystem:write'],
      config: [
        {
          key: 'autoApply',
          label: '自动应用改进',
          type: 'boolean',
          value: false,
          description: '无需确认即应用自我改进',
        },
      ],
    },
    {
      id: 'skill-recorded-onboarding',
      name: '录制：新员工入职',
      description: 'Replayable workflow captured by the recorder',
      category: 'recorder',
      installed: true,
      enabled: true,
      version: '1.0.0',
      source: 'installed',
      icon: '🎬',
      color: '#06B6D4',
      author: 'Recorder',
      longDescription:
        'A recorded operation sequence promoted to a reusable skill. Replays the onboarding workflow.',
      permissions: ['filesystem:read'],
    },
    // ── Available (marketplace) ──
    {
      id: 'skill-brave-search-cli',
      name: 'Brave Search CLI',
      description: 'Privacy-first web search via the Brave API',
      category: 'tools',
      installed: false,
      enabled: false,
      version: '2.1.0',
      source: 'available',
      icon: '🦁',
      color: '#F97316',
      author: 'Community',
      longDescription:
        'Search the web through the Brave Search API. Requires an API key configured below.',
      permissions: ['network'],
      config: [
        {
          key: 'apiKey',
          label: 'Brave API Key',
          type: 'string',
          value: '',
          description: '从 brave.com/search/api 获取',
        },
      ],
    },
    {
      id: 'skill-github-pr-review',
      name: 'GitHub PR Review',
      description: 'Automated pull-request review and summaries',
      category: 'development',
      installed: false,
      enabled: false,
      version: '1.4.2',
      source: 'available',
      icon: '🐙',
      color: '#6366F1',
      author: 'Community',
      longDescription:
        'Fetches a pull request, reviews the diff and posts structured feedback.',
      permissions: ['network'],
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

  // Reset settings to defaults
  Object.keys(settingsStore).forEach(k => delete settingsStore[k])
  Object.assign(settingsStore, {
    theme: 'light',
    language: 'zh-CN',
    fontSize: 14,
    sendKey: 'Enter',
    model: 'auto',
    temperature: 0.7,
    maxTokens: 4096,
  })

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
    async (
      _event,
      input: {
        category?: string
        installed?: boolean
        source?: 'builtin' | 'installed' | 'available'
      },
    ) => {
      let list = Array.from(skills.values())
      if (input?.category)
        list = list.filter(s => s.category === input.category)
      if (input?.installed !== undefined)
        list = list.filter(s => s.installed === input.installed)
      if (input?.source) list = list.filter(s => s.source === input.source)
      return { skills: list }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET,
    async (_event, input: { skillId: string }) => {
      const skill = skills.get(input.skillId)
      if (!skill)
        throw createError('NOT_FOUND', `Skill ${input.skillId} not found`)
      return skill
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SKILL_INSTALL,
    async (_event, input: { skillId: string }) => {
      const skill = skills.get(input.skillId)
      if (skill) {
        skill.installed = true
        skill.enabled = true
        if (skill.source === 'available') skill.source = 'installed'
      }
      return { success: true }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SKILL_IMPORT,
    async (
      _event,
      input: { source: string; sourceType: SkillImportSourceType },
    ) => {
      const trimmed = (input?.source ?? '').trim()
      if (!trimmed) {
        return {
          success: false,
          message: '导入来源不能为空',
        }
      }
      const id = `skill-imported-${generateId()}`
      const name = deriveSkillName(trimmed, input.sourceType)
      const skill: SkillInfo = {
        id,
        name,
        description: `Imported from ${input.sourceType}: ${trimmed}`,
        category: 'imported',
        installed: true,
        enabled: true,
        version: '1.0.0',
        source: 'installed',
        icon: '📦',
        color: '#0EA5E9',
        author: `import:${input.sourceType}`,
        longDescription: `Skill imported from a ${input.sourceType} source (${trimmed}).`,
        permissions: [],
      }
      skills.set(id, skill)
      return {
        success: true,
        skillId: id,
        message: `已导入技能「${name}」`,
      }
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
  // Settings store is defined at module level (shared with API key lookup)

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
