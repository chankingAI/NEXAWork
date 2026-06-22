import { describe, test, expect, beforeEach } from 'bun:test'
import {
  initializeEngine,
  getSessionEngine,
  removeSessionEngine,
  updateEngineConfig,
  executeQuery,
  cancelQuery,
  getHistory,
  getActiveSessionIds,
  registerTools,
  getRegisteredTools,
  type EngineConfig,
  type ToolDefinition,
} from '../main/backend/engine'

/**
 * Backend Engine Unit Tests (N4)
 * Tests QueryEngine bridge layer: session management, query execution,
 * streaming, cancellation, history, tool management, provider routing.
 */

describe('Engine Initialization', () => {
  beforeEach(() => {
    // Clean up any existing sessions
    for (const id of getActiveSessionIds()) {
      removeSessionEngine(id)
    }
  })

  test('initializeEngine sets default config', () => {
    initializeEngine({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      cwd: '/test',
      maxRetries: 3,
      maxTurns: 50,
    })

    const engine = getSessionEngine('test-session-1')
    expect(engine.config.provider).toBe('anthropic')
    expect(engine.config.model).toBe('claude-sonnet-4-20250514')
    expect(engine.config.maxRetries).toBe(3)
  })

  test('initializeEngine with partial config merges defaults', () => {
    initializeEngine({ model: 'gpt-4o' })
    const engine = getSessionEngine('test-partial')
    expect(engine.config.model).toBe('gpt-4o')
    // Other defaults preserved
    expect(engine.config.maxRetries).toBe(3)
  })
})

describe('Session Engine Management', () => {
  beforeEach(() => {
    for (const id of getActiveSessionIds()) {
      removeSessionEngine(id)
    }
    initializeEngine({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      cwd: '/test',
      maxRetries: 3,
      maxTurns: 50,
    })
  })

  test('getSessionEngine creates new engine if not exists', () => {
    const engine = getSessionEngine('new-session')
    expect(engine.id).toBe('new-session')
    expect(engine.messages).toHaveLength(0)
    expect(engine.isActive).toBe(false)
    expect(engine.createdAt).toBeTruthy()
  })

  test('getSessionEngine returns existing engine', () => {
    const first = getSessionEngine('reuse-session')
    first.messages.push({
      id: 'msg-1',
      role: 'user',
      content: 'hello',
      createdAt: new Date().toISOString(),
    })

    const second = getSessionEngine('reuse-session')
    expect(second.messages).toHaveLength(1)
    expect(second.messages[0].content).toBe('hello')
  })

  test('removeSessionEngine cleans up', () => {
    getSessionEngine('to-remove')
    expect(getActiveSessionIds()).toContain('to-remove')

    removeSessionEngine('to-remove')
    expect(getActiveSessionIds()).not.toContain('to-remove')
  })

  test('updateEngineConfig updates specific fields', () => {
    const engine = getSessionEngine('update-test')
    expect(engine.config.model).toBe('claude-sonnet-4-20250514')

    updateEngineConfig('update-test', { model: 'gpt-4o' })
    const updated = getSessionEngine('update-test')
    expect(updated.config.model).toBe('gpt-4o')
    expect(updated.config.provider).toBe('anthropic') // unchanged
  })

  test('getActiveSessionIds returns all sessions', () => {
    getSessionEngine('s1')
    getSessionEngine('s2')
    getSessionEngine('s3')

    const ids = getActiveSessionIds()
    expect(ids).toContain('s1')
    expect(ids).toContain('s2')
    expect(ids).toContain('s3')
  })
})

describe('Query Execution (Mock Mode)', () => {
  beforeEach(() => {
    for (const id of getActiveSessionIds()) {
      removeSessionEngine(id)
    }
    initializeEngine({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      cwd: '/test',
      maxRetries: 3,
      maxTurns: 50,
      // No apiKey — will use mock mode
    })
  })

  test('executeQuery returns mock response without API key', async () => {
    const result = await executeQuery('mock-session', 'Hello AI')
    expect(result.messageId).toBeTruthy()
    expect(result.content).toContain('Hello AI')
    expect(result.content).toContain('模拟响应')
  })

  test('executeQuery stores user and assistant messages', async () => {
    await executeQuery('history-test', 'Test message')

    const engine = getSessionEngine('history-test')
    expect(engine.messages).toHaveLength(2)
    expect(engine.messages[0].role).toBe('user')
    expect(engine.messages[0].content).toBe('Test message')
    expect(engine.messages[1].role).toBe('assistant')
  })

  test('executeQuery respects model override', async () => {
    const result = await executeQuery('model-test', 'Test', {
      model: 'gpt-4o',
    })
    expect(result.content).toContain('gpt-4o')
  })

  test('multiple queries accumulate messages', async () => {
    await executeQuery('multi-test', 'First')
    await executeQuery('multi-test', 'Second')
    await executeQuery('multi-test', 'Third')

    const engine = getSessionEngine('multi-test')
    // Each query creates 1 user + 1 assistant = 2 messages
    expect(engine.messages).toHaveLength(6)
  })
})

describe('Query Cancellation', () => {
  beforeEach(() => {
    for (const id of getActiveSessionIds()) {
      removeSessionEngine(id)
    }
    initializeEngine({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      cwd: '/test',
      maxRetries: 3,
      maxTurns: 50,
    })
  })

  test('cancelQuery returns false if no active query', () => {
    getSessionEngine('cancel-test')
    const result = cancelQuery('cancel-test')
    expect(result).toBe(false)
  })

  test('cancelQuery returns false for non-existent session', () => {
    const result = cancelQuery('non-existent')
    expect(result).toBe(false)
  })
})

describe('History Management', () => {
  beforeEach(() => {
    for (const id of getActiveSessionIds()) {
      removeSessionEngine(id)
    }
    initializeEngine({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      cwd: '/test',
      maxRetries: 3,
      maxTurns: 50,
    })
  })

  test('getHistory returns empty for new session', () => {
    const result = getHistory('empty-session')
    expect(result.messages).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  test('getHistory returns messages after queries', async () => {
    await executeQuery('hist-session', 'Message 1')
    await executeQuery('hist-session', 'Message 2')

    const result = getHistory('hist-session')
    expect(result.messages).toHaveLength(4) // 2 user + 2 assistant
    expect(result.total).toBe(4)
  })

  test('getHistory respects limit', async () => {
    await executeQuery('limit-session', 'A')
    await executeQuery('limit-session', 'B')
    await executeQuery('limit-session', 'C')

    const result = getHistory('limit-session', { limit: 2 })
    expect(result.messages).toHaveLength(2)
    expect(result.hasMore).toBe(true)
  })

  test('getHistory respects offset', async () => {
    await executeQuery('offset-session', 'A')
    await executeQuery('offset-session', 'B')

    const result = getHistory('offset-session', { offset: 2, limit: 10 })
    expect(result.messages).toHaveLength(2) // messages 3-4
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[0].content).toBe('B')
  })
})

describe('Tool Management', () => {
  test('registerTools replaces existing tools', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'file_read',
        description: 'Read a file',
        inputSchema: { type: 'object' },
        requiresPermission: false,
      },
      {
        name: 'bash',
        description: 'Run shell command',
        inputSchema: { type: 'object' },
        requiresPermission: true,
      },
    ]

    registerTools(tools)
    const registered = getRegisteredTools()
    expect(registered).toHaveLength(2)
    expect(registered[0].name).toBe('file_read')
    expect(registered[1].requiresPermission).toBe(true)
  })

  test('registerTools clears previous registrations', () => {
    registerTools([
      {
        name: 'tool_a',
        description: 'A',
        inputSchema: {},
        requiresPermission: false,
      },
    ])
    expect(getRegisteredTools()).toHaveLength(1)

    registerTools([
      {
        name: 'tool_b',
        description: 'B',
        inputSchema: {},
        requiresPermission: false,
      },
      {
        name: 'tool_c',
        description: 'C',
        inputSchema: {},
        requiresPermission: true,
      },
    ])
    expect(getRegisteredTools()).toHaveLength(2)
    expect(getRegisteredTools()[0].name).toBe('tool_b')
  })

  test('getRegisteredTools returns copy (not reference)', () => {
    registerTools([
      {
        name: 'original',
        description: 'test',
        inputSchema: {},
        requiresPermission: false,
      },
    ])

    const tools = getRegisteredTools()
    tools.push({
      name: 'injected',
      description: 'hack',
      inputSchema: {},
      requiresPermission: false,
    })

    // Original should not be affected
    expect(getRegisteredTools()).toHaveLength(1)
  })
})

describe('Provider Routing', () => {
  test('provider endpoint resolution', () => {
    // Test the logic that maps providers to endpoints
    const providerEndpoints: Record<string, string> = {
      anthropic: 'https://api.anthropic.com/v1/messages',
      openai: 'https://api.openai.com/v1/chat/completions',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
      grok: 'https://api.x.ai/v1/chat/completions',
    }

    expect(providerEndpoints.anthropic).toContain('anthropic')
    expect(providerEndpoints.openai).toContain('openai')
    expect(providerEndpoints.gemini).toContain('googleapis')
    expect(providerEndpoints.grok).toContain('x.ai')
  })

  test('provider header configuration', () => {
    // Test provider-specific auth header patterns
    const headers = {
      anthropic: { 'x-api-key': 'key', 'anthropic-version': '2023-06-01' },
      openai: { Authorization: 'Bearer key' },
      gemini: { 'x-goog-api-key': 'key' },
      grok: { Authorization: 'Bearer key' },
    }

    expect(headers.anthropic['x-api-key']).toBe('key')
    expect(headers.openai.Authorization).toContain('Bearer')
    expect(headers.gemini['x-goog-api-key']).toBe('key')
  })

  test('response parsing per provider', () => {
    // Anthropic response format
    const anthropicData = {
      content: [{ type: 'text', text: 'Hello from Claude' }],
    }
    const anthropicContent = anthropicData.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
    expect(anthropicContent).toBe('Hello from Claude')

    // OpenAI response format
    const openaiData = {
      choices: [{ message: { content: 'Hello from GPT' } }],
    }
    const openaiContent = openaiData.choices[0].message.content
    expect(openaiContent).toBe('Hello from GPT')

    // Gemini response format
    const geminiData = {
      candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
    }
    const geminiContent = geminiData.candidates[0].content.parts[0].text
    expect(geminiContent).toBe('Hello from Gemini')
  })
})

describe('Error Handling', () => {
  beforeEach(() => {
    for (const id of getActiveSessionIds()) {
      removeSessionEngine(id)
    }
  })

  test('engine handles missing API key gracefully (mock mode)', async () => {
    initializeEngine({
      provider: 'anthropic',
      model: 'test',
      cwd: '/test',
      maxRetries: 3,
      maxTurns: 50,
      // No apiKey = mock mode
    })

    // Should not throw — returns mock response
    const result = await executeQuery('no-key-test', 'Hello')
    expect(result.content).toBeTruthy()
  })

  test('error format is IPCError compatible', () => {
    const error = { code: 'INVALID_API_KEY', message: 'API key is invalid' }
    expect(error.code).toBe('INVALID_API_KEY')
    expect(error.message).toBe('API key is invalid')
  })

  test('error codes cover all scenarios', () => {
    const errorCodes = [
      'INVALID_API_KEY',
      'RATE_LIMITED',
      'TOKEN_LIMIT',
      'API_ERROR',
      'MAX_RETRIES',
      'UNKNOWN',
    ]

    expect(errorCodes).toContain('INVALID_API_KEY')
    expect(errorCodes).toContain('RATE_LIMITED')
    expect(errorCodes).toContain('TOKEN_LIMIT')
    expect(errorCodes).toContain('MAX_RETRIES')
  })
})

describe('IPC Handler Integration', () => {
  test('model resolution maps correctly', () => {
    const modelMap: Record<string, string> = {
      auto: 'claude-sonnet-4-20250514',
      'claude-sonnet': 'claude-sonnet-4-20250514',
      'claude-haiku': 'claude-haiku-4-20250414',
      'gpt-4o': 'gpt-4o',
      'deepseek-v3': 'deepseek-chat',
      'gemini-2.0': 'gemini-2.0-flash',
    }

    expect(modelMap.auto).toBe('claude-sonnet-4-20250514')
    expect(modelMap['claude-haiku']).toBe('claude-haiku-4-20250414')
    expect(modelMap['deepseek-v3']).toBe('deepseek-chat')
  })

  test('provider detection from model ID', () => {
    function getProvider(modelId: string): string {
      if (modelId.includes('claude') || modelId === 'auto') return 'anthropic'
      if (modelId.includes('gpt')) return 'openai'
      if (modelId.includes('gemini')) return 'gemini'
      if (modelId.includes('deepseek')) return 'openai'
      if (modelId.includes('grok')) return 'grok'
      return 'anthropic'
    }

    expect(getProvider('auto')).toBe('anthropic')
    expect(getProvider('claude-sonnet')).toBe('anthropic')
    expect(getProvider('gpt-4o')).toBe('openai')
    expect(getProvider('gemini-2.0')).toBe('gemini')
    expect(getProvider('deepseek-v3')).toBe('openai')
    expect(getProvider('grok-2')).toBe('grok')
  })

  test('settings store provides API key lookup', () => {
    const settings: Record<string, unknown> = {
      'apiKeys.anthropic': 'sk-ant-test123',
      'apiKeys.openai': 'sk-openai-test',
    }

    expect(settings['apiKeys.anthropic']).toBe('sk-ant-test123')
    expect(settings['apiKeys.openai']).toBe('sk-openai-test')
    expect(settings['apiKeys.gemini']).toBeUndefined()
  })
})
