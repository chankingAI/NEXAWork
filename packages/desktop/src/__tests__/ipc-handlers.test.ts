import { describe, test, expect, beforeEach, mock } from 'bun:test'

/**
 * IPC Handlers Unit Tests
 * Tests the handler logic in isolation (mocking Electron IPC)
 */

const mockHandlers = new Map<string, Function>()
const mockHandle = mock((channel: string, handler: Function) => {
  mockHandlers.set(channel, handler)
})

mock.module('electron', () => ({
  ipcMain: { handle: mockHandle },
  BrowserWindow: {
    fromWebContents: () => ({
      minimize: () => {},
      maximize: () => {},
      unmaximize: () => {},
      close: () => {},
      isMaximized: () => false,
      isDestroyed: () => false,
      webContents: { send: () => {} },
    }),
    getAllWindows: () => [],
  },
  app: {
    getVersion: () => '0.1.0',
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => {},
  },
  shell: { openExternal: () => Promise.resolve() },
}))

describe('IPC Handler Registration', () => {
  beforeEach(() => {
    mockHandlers.clear()
    mockHandle.mockClear()
  })

  test('registerIPCHandlers registers all expected channels', async () => {
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()

    const registeredChannels = Array.from(mockHandlers.keys())

    // Chat (5)
    expect(registeredChannels).toContain('chat:send')
    expect(registeredChannels).toContain('chat:stream')
    expect(registeredChannels).toContain('chat:stop')
    expect(registeredChannels).toContain('chat:history')
    expect(registeredChannels).toContain('chat:regenerate')

    // Session (6)
    expect(registeredChannels).toContain('session:create')
    expect(registeredChannels).toContain('session:list')
    expect(registeredChannels).toContain('session:get')
    expect(registeredChannels).toContain('session:update')
    expect(registeredChannels).toContain('session:delete')
    expect(registeredChannels).toContain('session:search')

    // Model (4)
    expect(registeredChannels).toContain('model:list')
    expect(registeredChannels).toContain('model:set')
    expect(registeredChannels).toContain('model:test')
    expect(registeredChannels).toContain('model:configure')

    // Expert (5)
    expect(registeredChannels).toContain('expert:list')
    expect(registeredChannels).toContain('expert:get')
    expect(registeredChannels).toContain('expert:summon')
    expect(registeredChannels).toContain('expert:create')
    expect(registeredChannels).toContain('expert:recent')

    // Skill (5)
    expect(registeredChannels).toContain('skill:list')
    expect(registeredChannels).toContain('skill:install')
    expect(registeredChannels).toContain('skill:toggle')
    expect(registeredChannels).toContain('skill:execute')
    expect(registeredChannels).toContain('skill:delete')

    // Automation (5)
    expect(registeredChannels).toContain('automation:list')
    expect(registeredChannels).toContain('automation:create')
    expect(registeredChannels).toContain('automation:update')
    expect(registeredChannels).toContain('automation:delete')
    expect(registeredChannels).toContain('automation:history')

    // Settings (3)
    expect(registeredChannels).toContain('settings:get')
    expect(registeredChannels).toContain('settings:set')
    expect(registeredChannels).toContain('settings:reset')

    // Window (4)
    expect(registeredChannels).toContain('window:minimize')
    expect(registeredChannels).toContain('window:maximize')
    expect(registeredChannels).toContain('window:close')
    expect(registeredChannels).toContain('window:isMaximized')

    // Permission (5)
    expect(registeredChannels).toContain('permission:getMode')
    expect(registeredChannels).toContain('permission:setMode')
    expect(registeredChannels).toContain('permission:respond')
    expect(registeredChannels).toContain('permission:log:list')
    expect(registeredChannels).toContain('permission:log:clear')

    // App (2)
    expect(registeredChannels).toContain('app:version')
    expect(registeredChannels).toContain('app:platform')
  })

  test('total handler count: 44 channels registered', async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
    // 5 chat + 6 session + 4 model + 5 expert + 5 skill + 5 automation + 3 settings + 5 permission + 4 window + 2 app = 44
    expect(mockHandlers.size).toBe(44)
  })
})

describe('Handler Logic: Chat', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('chat:send returns messageId and content', async () => {
    const createHandler = mockHandlers.get('session:create')!
    const session = await createHandler({}, { title: 'Test' })

    const handler = mockHandlers.get('chat:send')!
    const result = await handler(
      {},
      { sessionId: session.id, message: 'Hello' },
    )
    expect(result.messageId).toBeDefined()
    expect(typeof result.content).toBe('string')
  })

  test('chat:stream returns streamId', async () => {
    const createHandler = mockHandlers.get('session:create')!
    const session = await createHandler({}, { title: 'Stream Test' })

    const mockEvent = { sender: { send: () => {} } }
    const handler = mockHandlers.get('chat:stream')!
    const result = await handler(mockEvent, {
      sessionId: session.id,
      message: 'Stream me',
    })
    expect(result.streamId).toBeDefined()
    expect(typeof result.streamId).toBe('string')
  })

  test('chat:stop returns success', async () => {
    const handler = mockHandlers.get('chat:stop')!
    const result = await handler({}, { sessionId: 'any' })
    expect(result.success).toBe(true)
  })

  test('chat:history returns messages', async () => {
    const createHandler = mockHandlers.get('session:create')!
    const session = await createHandler({}, {})

    const sendHandler = mockHandlers.get('chat:send')!
    await sendHandler({}, { sessionId: session.id, message: 'test' })

    const historyHandler = mockHandlers.get('chat:history')!
    const result = await historyHandler({}, { sessionId: session.id })
    expect(result.messages.length).toBeGreaterThan(0)
  })

  test('chat:regenerate returns new message', async () => {
    const createHandler = mockHandlers.get('session:create')!
    const session = await createHandler({}, {})

    const handler = mockHandlers.get('chat:regenerate')!
    const result = await handler({}, { sessionId: session.id, messageId: 'm1' })
    expect(result.messageId).toBeDefined()
    expect(typeof result.content).toBe('string')
  })
})

describe('Handler Logic: Session', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('session:create creates session with id/title/createdAt', async () => {
    const handler = mockHandlers.get('session:create')!
    const result = await handler({}, { title: 'My Session', scene: 'code' })
    expect(result.id).toBeDefined()
    expect(result.title).toBe('My Session')
    expect(result.createdAt).toBeDefined()
  })

  test('session:list returns sessions array with total', async () => {
    const handler = mockHandlers.get('session:list')!
    const result = await handler({}, {})
    expect(result.sessions).toBeDefined()
    expect(Array.isArray(result.sessions)).toBe(true)
    expect(typeof result.total).toBe('number')
  })

  test('session:get returns specific session', async () => {
    const createHandler = mockHandlers.get('session:create')!
    const created = await createHandler({}, { title: 'Get Test' })

    const handler = mockHandlers.get('session:get')!
    const result = await handler({}, { id: created.id })
    expect(result.id).toBe(created.id)
    expect(result.title).toBe('Get Test')
  })

  test('session:update modifies session', async () => {
    const createHandler = mockHandlers.get('session:create')!
    const created = await createHandler({}, { title: 'Original' })

    const handler = mockHandlers.get('session:update')!
    const result = await handler({}, { id: created.id, title: 'Updated' })
    expect(result.success).toBe(true)
  })

  test('session:delete removes session', async () => {
    const createHandler = mockHandlers.get('session:create')!
    const created = await createHandler({}, {})

    const handler = mockHandlers.get('session:delete')!
    const result = await handler({}, { id: created.id })
    expect(result.success).toBe(true)
  })

  test('session:search filters by title', async () => {
    const createHandler = mockHandlers.get('session:create')!
    await createHandler({}, { title: 'Alpha Project' })
    await createHandler({}, { title: 'Beta Task' })

    const handler = mockHandlers.get('session:search')!
    const result = await handler({}, { query: 'alpha' })
    expect(result.sessions.length).toBeGreaterThan(0)
    expect(result.sessions[0].title).toContain('Alpha')
  })
})

describe('Handler Logic: Model', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('model:list returns models with required fields', async () => {
    const handler = mockHandlers.get('model:list')!
    const result = await handler({})
    expect(result.models.length).toBeGreaterThan(0)
    for (const model of result.models) {
      expect(model.id).toBeDefined()
      expect(model.name).toBeDefined()
      expect(model.provider).toBeDefined()
      expect(model.maxTokens).toBeGreaterThan(0)
      expect(typeof model.available).toBe('boolean')
    }
  })

  test('model:set updates active model', async () => {
    const handler = mockHandlers.get('model:set')!
    const result = await handler({}, { modelId: 'claude-sonnet' })
    expect(result.success).toBe(true)
  })

  test('model:test returns latency', async () => {
    const handler = mockHandlers.get('model:test')!
    const result = await handler({}, { modelId: 'auto' })
    expect(typeof result.latency).toBe('number')
    expect(result.available).toBe(true)
  })

  test('model:configure returns success', async () => {
    const handler = mockHandlers.get('model:configure')!
    const result = await handler(
      {},
      { modelId: 'auto', config: { temperature: 0.5 } },
    )
    expect(result.success).toBe(true)
  })
})

describe('Handler Logic: Expert', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('expert:list returns seeded experts', async () => {
    const handler = mockHandlers.get('expert:list')!
    const result = await handler({}, {})
    expect(result.experts.length).toBe(3)
    const ids = result.experts.map((e: { id: string }) => e.id)
    expect(ids).toContain('expert-code')
    expect(ids).toContain('expert-data')
    expect(ids).toContain('expert-writer')
  })

  test('expert:get returns specific expert', async () => {
    const handler = mockHandlers.get('expert:get')!
    const result = await handler({}, { id: 'expert-code' })
    expect(result.name).toBe('Code Expert')
    expect(result.category).toBe('development')
  })

  test('expert:summon returns greeting', async () => {
    const handler = mockHandlers.get('expert:summon')!
    const result = await handler(
      {},
      { expertId: 'expert-code', sessionId: 's1' },
    )
    expect(result.success).toBe(true)
    expect(result.greeting).toContain('Code Expert')
  })

  test('expert:create adds new expert', async () => {
    const handler = mockHandlers.get('expert:create')!
    const result = await handler(
      {},
      {
        name: 'Custom Expert',
        description: 'My expert',
        systemPrompt: 'You help',
      },
    )
    expect(result.id).toBeDefined()
    expect(result.id).toContain('expert-')
  })

  test('expert:recent returns limited list', async () => {
    const handler = mockHandlers.get('expert:recent')!
    const result = await handler({}, { limit: 2 })
    expect(result.experts.length).toBeLessThanOrEqual(2)
  })
})

describe('Handler Logic: Skill', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('skill:list returns seeded skills', async () => {
    const handler = mockHandlers.get('skill:list')!
    const result = await handler({}, {})
    expect(result.skills.length).toBe(3)
  })

  test('skill:execute returns result', async () => {
    const handler = mockHandlers.get('skill:execute')!
    const result = await handler({}, { skillId: 'skill-web-search' })
    expect(result.result).toContain('Web Search')
  })

  test('skill:toggle disables skill', async () => {
    const handler = mockHandlers.get('skill:toggle')!
    const result = await handler(
      {},
      { skillId: 'skill-web-search', enabled: false },
    )
    expect(result.success).toBe(true)
  })

  test('skill:delete removes skill', async () => {
    const handler = mockHandlers.get('skill:delete')!
    const result = await handler({}, { skillId: 'skill-code-run' })
    expect(result.success).toBe(true)
  })
})

describe('Handler Logic: Automation', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('automation:create creates automation with id', async () => {
    const handler = mockHandlers.get('automation:create')!
    const result = await handler(
      {},
      {
        name: 'Daily Backup',
        prompt: 'Run backup',
        cron: '0 2 * * *',
        workspace: '/data',
      },
    )
    expect(result.id).toBeDefined()
    expect(result.id).toContain('auto-')
  })

  test('automation:list returns created automations', async () => {
    const createHandler = mockHandlers.get('automation:create')!
    await createHandler(
      {},
      { name: 'Auto1', prompt: 'p', cron: '* * * * *', workspace: '/' },
    )

    const handler = mockHandlers.get('automation:list')!
    const result = await handler({}, {})
    expect(result.automations.length).toBeGreaterThan(0)
  })

  test('automation:delete removes automation', async () => {
    const createHandler = mockHandlers.get('automation:create')!
    const created = await createHandler(
      {},
      { name: 'ToDelete', prompt: 'x', cron: '0 0 * * *', workspace: '/' },
    )

    const handler = mockHandlers.get('automation:delete')!
    const result = await handler({}, { id: created.id })
    expect(result.success).toBe(true)
  })

  test('automation:history returns empty for new automation', async () => {
    const createHandler = mockHandlers.get('automation:create')!
    const created = await createHandler(
      {},
      { name: 'Hist', prompt: 'x', cron: '0 0 * * *', workspace: '/' },
    )

    const handler = mockHandlers.get('automation:history')!
    const result = await handler({}, { id: created.id })
    expect(result.runs).toHaveLength(0)
  })
})

describe('Handler Logic: Settings', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('settings:get returns all defaults', async () => {
    const handler = mockHandlers.get('settings:get')!
    const result = await handler({}, {})
    expect(result.theme).toBe('light')
    expect(result.language).toBe('zh-CN')
    expect(result.fontSize).toBe(14)
  })

  test('settings:set + settings:get roundtrip', async () => {
    const setHandler = mockHandlers.get('settings:set')!
    await setHandler({}, { key: 'theme', value: 'dark' })

    const getHandler = mockHandlers.get('settings:get')!
    const result = await getHandler({}, { key: 'theme' })
    expect(result.theme).toBe('dark')
  })

  test('settings:reset removes key', async () => {
    const setHandler = mockHandlers.get('settings:set')!
    await setHandler({}, { key: 'customKey', value: 'customValue' })

    const resetHandler = mockHandlers.get('settings:reset')!
    const result = await resetHandler({}, { key: 'customKey' })
    expect(result.success).toBe(true)
  })
})

describe('Handler Logic: App & Window', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('app:version returns version string', async () => {
    const handler = mockHandlers.get('app:version')!
    const result = await handler({})
    expect(result).toBe('0.1.0')
  })

  test('app:platform returns platform string', async () => {
    const handler = mockHandlers.get('app:platform')!
    const result = await handler({})
    expect(typeof result).toBe('string')
  })

  test('window:isMaximized returns boolean', async () => {
    const handler = mockHandlers.get('window:isMaximized')!
    const mockEvent = { sender: {} }
    const result = await handler(mockEvent)
    expect(typeof result).toBe('boolean')
  })
})
