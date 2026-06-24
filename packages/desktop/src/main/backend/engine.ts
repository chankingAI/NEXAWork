/**
 * NexaWork Backend Engine — QueryEngine Bridge Layer
 *
 * Encapsulates the claude-code QueryEngine lifecycle for the Electron Main Process.
 * Each session gets its own engine instance. The engine manages:
 * - API provider selection
 * - Tool registration
 * - Message history
 * - Abort/cancel support
 * - Stream event emission
 *
 * NOTE: This does NOT modify QueryEngine itself.
 * It creates a bridge between IPC handlers and the existing engine.
 */

import type { BrowserWindow } from 'electron'
import type {
  StreamEvent,
  IPCError,
  ChatMessage,
} from '../../shared/ipc-channels'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { extractEditedFilePath, isFileMutatingTool } from '../../shared/editor'
import { permissionManager } from './permission-manager'

// ===== Type Definitions =====

export interface EngineConfig {
  apiKey?: string
  provider: ProviderType
  model: string
  cwd: string
  maxRetries: number
  maxTurns: number
  /** System prompt prepended to every request (N22 agent settings). */
  systemPrompt?: string
  /** Sampling temperature 0-1 (N22 agent settings). */
  temperature?: number
  /** Max completion tokens (N22 agent settings). */
  maxTokens?: number
  /** Custom provider base endpoint override (N22 model settings). */
  baseURL?: string
}

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'grok'
  | 'bedrock'
  | 'vertex'
  | 'local'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
  output?: string
}

export interface SessionEngine {
  id: string
  config: EngineConfig
  messages: ChatMessage[]
  abortController: AbortController | null
  isActive: boolean
  createdAt: string
}

// ===== Engine Registry (Singleton) =====

const engineRegistry = new Map<string, SessionEngine>()
let defaultConfig: EngineConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  cwd: process.cwd(),
  maxRetries: 3,
  maxTurns: 50,
}

/**
 * Initialize the backend engine system
 */
export function initializeEngine(config?: Partial<EngineConfig>): void {
  if (config) {
    defaultConfig = { ...defaultConfig, ...config }
  }
}

/**
 * Get or create a session engine
 */
export function getSessionEngine(sessionId: string): SessionEngine {
  let engine = engineRegistry.get(sessionId)
  if (!engine) {
    engine = {
      id: sessionId,
      config: { ...defaultConfig },
      messages: [],
      abortController: null,
      isActive: false,
      createdAt: new Date().toISOString(),
    }
    engineRegistry.set(sessionId, engine)
  }
  return engine
}

/**
 * Remove a session engine (cleanup)
 */
export function removeSessionEngine(sessionId: string): void {
  const engine = engineRegistry.get(sessionId)
  if (engine?.abortController) {
    engine.abortController.abort()
  }
  engineRegistry.delete(sessionId)
}

/**
 * Update engine configuration (e.g. model switch)
 */
export function updateEngineConfig(
  sessionId: string,
  updates: Partial<EngineConfig>,
): void {
  const engine = getSessionEngine(sessionId)
  engine.config = { ...engine.config, ...updates }
}

/**
 * Get all active session IDs
 */
export function getActiveSessionIds(): string[] {
  return Array.from(engineRegistry.keys())
}

// ===== Query Execution =====

/**
 * Execute a synchronous (non-streaming) query
 * Returns full response after completion
 */
export async function executeQuery(
  sessionId: string,
  message: string,
  options?: { model?: string },
): Promise<{ messageId: string; content: string; toolCalls?: ToolCall[] }> {
  const engine = getSessionEngine(sessionId)
  const model = options?.model ?? engine.config.model
  const abortController = new AbortController()
  engine.abortController = abortController
  engine.isActive = true

  const userMsg: ChatMessage = {
    id: generateId(),
    role: 'user',
    content: message,
    createdAt: new Date().toISOString(),
  }
  engine.messages.push(userMsg)

  try {
    // Validate API configuration
    validateConfig(engine.config)

    // Execute query through the bridge
    const response = await queryBridge({
      message,
      model,
      provider: engine.config.provider,
      apiKey: engine.config.apiKey,
      cwd: engine.config.cwd,
      abortSignal: abortController.signal,
      maxRetries: engine.config.maxRetries,
      systemPrompt: engine.config.systemPrompt,
      temperature: engine.config.temperature,
      maxTokens: engine.config.maxTokens,
      baseURL: engine.config.baseURL,
    })

    const assistantMsg: ChatMessage = {
      id: response.messageId,
      role: 'assistant',
      content: response.content,
      model,
      toolCalls: response.toolCalls?.map(tc => ({
        name: tc.name,
        input: tc.input,
        status: tc.status,
      })),
      createdAt: new Date().toISOString(),
    }
    engine.messages.push(assistantMsg)

    return response
  } catch (err: unknown) {
    const error = normalizeError(err)
    throw error
  } finally {
    engine.abortController = null
    engine.isActive = false
  }
}

/**
 * Execute a streaming query
 * Emits stream events to the BrowserWindow
 */
export async function executeStreamQuery(
  sessionId: string,
  message: string,
  win: BrowserWindow | null,
  options?: { model?: string },
): Promise<{ streamId: string }> {
  const engine = getSessionEngine(sessionId)
  const model = options?.model ?? engine.config.model
  const streamId = generateId()
  const abortController = new AbortController()
  engine.abortController = abortController
  engine.isActive = true

  const userMsg: ChatMessage = {
    id: generateId(),
    role: 'user',
    content: message,
    createdAt: new Date().toISOString(),
  }
  engine.messages.push(userMsg)

  // Execute streaming asynchronously
  streamQueryAsync(
    engine,
    streamId,
    message,
    model,
    win,
    abortController,
  ).catch(() => {
    // Error already emitted as stream event
  })

  return { streamId }
}

/**
 * Cancel an active query
 */
export function cancelQuery(sessionId: string): boolean {
  const engine = engineRegistry.get(sessionId)
  if (engine?.abortController) {
    engine.abortController.abort()
    engine.abortController = null
    engine.isActive = false
    return true
  }
  return false
}

/**
 * Get message history for a session
 */
export function getHistory(
  sessionId: string,
  options?: { limit?: number; offset?: number },
): { messages: ChatMessage[]; total: number; hasMore: boolean } {
  const engine = getSessionEngine(sessionId)
  const total = engine.messages.length
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const sliced = engine.messages.slice(offset, offset + limit)
  return {
    messages: sliced,
    total,
    hasMore: offset + limit < total,
  }
}

// ===== Internal Helpers =====

/**
 * Push an editor open-file event so the renderer's CodeEditor reloads the file
 * an AI tool just wrote and flash-highlights the changed lines (N28). The
 * renderer computes the exact ranges by diffing its cached buffer against the
 * new disk contents, so no range data is sent here.
 */
function notifyEditorFileChanged(
  win: BrowserWindow | null,
  path: string,
): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.EDITOR_OPEN_FILE, { path })
  }
}

async function streamQueryAsync(
  engine: SessionEngine,
  streamId: string,
  message: string,
  model: string,
  win: BrowserWindow | null,
  abortController: AbortController,
): Promise<void> {
  const emitEvent = (event: StreamEvent) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('chat:stream:token', event)
    }
  }

  try {
    validateConfig(engine.config)

    // Stream through the bridge
    const stream = streamBridge({
      message,
      model,
      provider: engine.config.provider,
      apiKey: engine.config.apiKey,
      cwd: engine.config.cwd,
      abortSignal: abortController.signal,
      maxRetries: engine.config.maxRetries,
    })

    let fullContent = ''
    let tokenCount = 0
    // Track the file path each in-flight file-mutating tool targets so the
    // editor can be told to open + highlight it once the write completes (N28).
    const pendingEditPaths = new Map<string, string>()

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break

      switch (chunk.type) {
        case 'text_delta':
          fullContent += chunk.text ?? ''
          tokenCount++
          emitEvent({ type: 'token', data: chunk.text ?? '' })
          break
        case 'tool_use_start': {
          const name = chunk.name ?? 'unknown'
          if (isFileMutatingTool(name)) {
            const path = extractEditedFilePath(chunk.input)
            if (path) pendingEditPaths.set(name, path)
          }
          emitEvent({
            type: 'tool_start',
            data: { name, input: chunk.input ?? {} },
          })
          break
        }
        case 'tool_use_result': {
          const name = chunk.name ?? 'unknown'
          if (isFileMutatingTool(name)) {
            const path = pendingEditPaths.get(name)
            if (path) {
              pendingEditPaths.delete(name)
              notifyEditorFileChanged(win, path)
            }
          }
          emitEvent({
            type: 'tool_result',
            data: { name, output: chunk.output ?? '' },
          })
          break
        }
      }
    }

    // Finalize
    const messageId = generateId()
    const assistantMsg: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: fullContent,
      model,
      createdAt: new Date().toISOString(),
    }
    engine.messages.push(assistantMsg)

    emitEvent({
      type: 'done',
      data: { messageId, totalTokens: tokenCount },
    })
  } catch (err: unknown) {
    const error = normalizeError(err)
    emitEvent({
      type: 'error',
      data: { code: error.code, message: error.message },
    })
  } finally {
    engine.abortController = null
    engine.isActive = false
  }
}

// ===== Bridge Layer =====
// These functions bridge to the real QueryEngine.
// Currently using mock implementations that will be replaced
// when the full backend integration is connected.

interface BridgeParams {
  message: string
  model: string
  provider: ProviderType
  apiKey?: string
  cwd: string
  abortSignal: AbortSignal
  maxRetries: number
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  baseURL?: string
}

interface StreamChunk {
  type: 'text_delta' | 'tool_use_start' | 'tool_use_result'
  text?: string
  name?: string
  input?: Record<string, unknown>
  output?: string
}

async function queryBridge(
  params: BridgeParams,
): Promise<{ messageId: string; content: string; toolCalls?: ToolCall[] }> {
  // Mock implementation — will connect to real QueryEngine in production
  // When API key is configured, this will call the actual API
  if (params.apiKey) {
    return await callRealAPI(params)
  }

  // Fallback: mock response for development
  const content = generateMockResponse(params.message, params.model)
  return {
    messageId: generateId(),
    content,
  }
}

async function* streamBridge(
  params: BridgeParams,
): AsyncGenerator<StreamChunk> {
  // Mock implementation — will connect to real QueryEngine streaming
  if (params.apiKey) {
    yield* callRealAPIStream(params)
    return
  }

  // Fallback: mock streaming for development
  const response = generateMockResponse(params.message, params.model)
  const words = response.split(' ')

  for (const word of words) {
    if (params.abortSignal.aborted) return
    await sleep(30)
    yield { type: 'text_delta', text: word + ' ' }
  }
}

/**
 * Real API call (when API key is available)
 * Bridges to the claude-code API layer
 */
async function callRealAPI(
  params: BridgeParams,
): Promise<{ messageId: string; content: string; toolCalls?: ToolCall[] }> {
  const { message, model, provider, apiKey, abortSignal } = params
  let retries = 0
  const maxRetries = params.maxRetries

  while (retries <= maxRetries) {
    try {
      if (abortSignal.aborted) {
        throw new Error('Request cancelled')
      }

      // Direct API call via fetch (bridges to provider endpoints)
      const response = await fetchFromProvider({
        provider,
        model,
        apiKey: apiKey!,
        messages: [{ role: 'user', content: message }],
        signal: abortSignal,
        systemPrompt: params.systemPrompt,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        baseURL: params.baseURL,
      })

      return {
        messageId: generateId(),
        content: response.content,
        toolCalls: response.toolCalls,
      }
    } catch (err: unknown) {
      if (abortSignal.aborted) throw err
      retries++
      if (retries > maxRetries) throw err
      // Exponential backoff
      await sleep(Math.min(1000 * 2 ** retries, 10000))
    }
  }

  throw createIPCError('MAX_RETRIES', 'Maximum retries exceeded')
}

async function* callRealAPIStream(
  params: BridgeParams,
): AsyncGenerator<StreamChunk> {
  const { message, model, provider, apiKey, abortSignal } = params

  try {
    const response = await fetchFromProvider({
      provider,
      model,
      apiKey: apiKey!,
      messages: [{ role: 'user', content: message }],
      signal: abortSignal,
      stream: true,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      baseURL: params.baseURL,
    })

    // Parse SSE stream
    const words = response.content.split(' ')
    for (const word of words) {
      if (abortSignal.aborted) return
      yield { type: 'text_delta', text: word + ' ' }
    }
  } catch (err: unknown) {
    throw normalizeError(err)
  }
}

// ===== Provider Layer =====

interface ProviderRequest {
  provider: ProviderType
  model: string
  apiKey: string
  messages: Array<{ role: string; content: string }>
  signal: AbortSignal
  stream?: boolean
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  baseURL?: string
}

interface ProviderResponse {
  content: string
  toolCalls?: ToolCall[]
}

function getProviderEndpoint(provider: ProviderType): string {
  switch (provider) {
    case 'anthropic':
      return 'https://api.anthropic.com/v1/messages'
    case 'openai':
      return (
        process.env.OPENAI_BASE_URL ??
        'https://api.openai.com/v1/chat/completions'
      )
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta/models'
    case 'grok':
      return 'https://api.x.ai/v1/chat/completions'
    case 'bedrock':
      return 'https://bedrock-runtime.us-east-1.amazonaws.com'
    case 'vertex':
      return 'https://us-central1-aiplatform.googleapis.com/v1'
    case 'local':
      return process.env.LOCAL_MODEL_URL ?? 'http://localhost:11434/api/chat'
  }
}

async function fetchFromProvider(
  params: ProviderRequest,
): Promise<ProviderResponse> {
  const endpoint = params.baseURL?.trim()
    ? params.baseURL.trim()
    : getProviderEndpoint(params.provider)
  const headers = buildProviderHeaders(params.provider, params.apiKey)
  const body = buildProviderBody(params)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    const statusCode = response.status

    if (statusCode === 401) {
      throw createIPCError('INVALID_API_KEY', 'API key is invalid or expired')
    }
    if (statusCode === 429) {
      throw createIPCError('RATE_LIMITED', 'Rate limited, please wait')
    }
    if (statusCode === 413 || errorBody.includes('prompt is too long')) {
      throw createIPCError(
        'TOKEN_LIMIT',
        'Message exceeds token limit, compaction needed',
      )
    }
    throw createIPCError(
      'API_ERROR',
      `API error ${statusCode}: ${errorBody.slice(0, 200)}`,
    )
  }

  const data = await response.json()
  return parseProviderResponse(params.provider, data)
}

function buildProviderHeaders(
  provider: ProviderType,
  apiKey: string,
): Record<string, string> {
  const common = { 'Content-Type': 'application/json' }

  switch (provider) {
    case 'anthropic':
      return {
        ...common,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }
    case 'openai':
    case 'grok':
      return { ...common, Authorization: `Bearer ${apiKey}` }
    case 'gemini':
      return { ...common, 'x-goog-api-key': apiKey }
    default:
      return { ...common, Authorization: `Bearer ${apiKey}` }
  }
}

function buildProviderBody(params: ProviderRequest): Record<string, unknown> {
  const maxTokens = params.maxTokens ?? 8192
  switch (params.provider) {
    case 'anthropic':
      return {
        model: params.model,
        max_tokens: maxTokens,
        ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
        ...(params.temperature !== undefined
          ? { temperature: params.temperature }
          : {}),
        messages: params.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: params.stream ?? false,
      }
    case 'openai':
    case 'grok': {
      const messages = params.systemPrompt
        ? [
            { role: 'system', content: params.systemPrompt },
            ...params.messages.map(m => ({ role: m.role, content: m.content })),
          ]
        : params.messages.map(m => ({ role: m.role, content: m.content }))
      return {
        model: params.model,
        max_tokens: maxTokens,
        ...(params.temperature !== undefined
          ? { temperature: params.temperature }
          : {}),
        messages,
        stream: params.stream ?? false,
      }
    }
    case 'gemini':
      return {
        contents: params.messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        ...(params.systemPrompt
          ? {
              systemInstruction: { parts: [{ text: params.systemPrompt }] },
            }
          : {}),
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(params.temperature !== undefined
            ? { temperature: params.temperature }
            : {}),
        },
      }
    default:
      return {
        model: params.model,
        messages: params.messages,
        stream: params.stream ?? false,
      }
  }
}

function parseProviderResponse(
  provider: ProviderType,
  data: Record<string, unknown>,
): ProviderResponse {
  switch (provider) {
    case 'anthropic': {
      const content =
        (data.content as Array<{ type: string; text?: string }>)
          ?.filter(b => b.type === 'text')
          ?.map(b => b.text)
          ?.join('') ?? ''
      return { content }
    }
    case 'openai':
    case 'grok': {
      const choices = data.choices as Array<{ message?: { content?: string } }>
      const content = choices?.[0]?.message?.content ?? ''
      return { content }
    }
    case 'gemini': {
      const candidates = data.candidates as Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
      const content = candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return { content }
    }
    default:
      return { content: JSON.stringify(data) }
  }
}

// ===== Tool Management =====

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  requiresPermission: boolean
}

const registeredTools: ToolDefinition[] = []

/**
 * Register built-in tools (called during initialization)
 */
export function registerTools(tools: ToolDefinition[]): void {
  registeredTools.length = 0
  registeredTools.push(...tools)
}

/**
 * Get all registered tools
 */
export function getRegisteredTools(): ToolDefinition[] {
  return [...registeredTools]
}

/**
 * Request tool permission via IPC.
 * Delegates to the PermissionManager, which handles mode/session rules, the
 * renderer round-trip, the 60s timeout default-deny, and permission logging.
 */
export async function requestToolPermission(
  win: BrowserWindow | null,
  tool: { name: string; input: Record<string, unknown> },
): Promise<boolean> {
  return permissionManager.requestPermission(win, tool)
}

// ===== Utilities =====

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function validateConfig(config: EngineConfig): void {
  // In dev mode without API key, we'll use mock responses
  // When deployed, API key is required
  if (!config.apiKey && config.provider !== 'local') {
    // Allow mock mode — don't throw
    return
  }
}

function createIPCError(code: string, message: string): IPCError {
  return { code, message }
}

function normalizeError(err: unknown): IPCError {
  if (err && typeof err === 'object') {
    if ('code' in err && 'message' in err) {
      return err as IPCError
    }
    if ('message' in err) {
      return { code: 'UNKNOWN', message: (err as Error).message }
    }
  }
  return { code: 'UNKNOWN', message: String(err) }
}

/**
 * Generate mock response for dev mode (no API key)
 */
function generateMockResponse(message: string, model: string): string {
  return `[${model}] 收到你的消息: "${message}"

这是 NexaWork AI 的模拟响应（开发模式）。

要连接真实 AI 引擎，请在设置中配置 API Key:
- Anthropic: ANTHROPIC_API_KEY
- OpenAI: OPENAI_API_KEY
- Gemini: GEMINI_API_KEY

配置后将使用 ${model} 模型进行真实对话。`
}
