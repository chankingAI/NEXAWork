import { describe, test, expect, beforeEach, mock } from 'bun:test'

/**
 * IPC Handlers Unit Tests
 * Tests the handler logic in isolation (mocking Electron IPC)
 */

// Mock electron modules BEFORE any imports that reference them
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

    expect(registeredChannels).toContain('window:minimize')
    expect(registeredChannels).toContain('window:maximize')
    expect(registeredChannels).toContain('window:close')
    expect(registeredChannels).toContain('window:isMaximized')
    expect(registeredChannels).toContain('app:version')
    expect(registeredChannels).toContain('app:platform')
    expect(registeredChannels).toContain('chat:send')
    expect(registeredChannels).toContain('chat:stop')
    expect(registeredChannels).toContain('chat:history')
    expect(registeredChannels).toContain('session:create')
    expect(registeredChannels).toContain('session:list')
    expect(registeredChannels).toContain('session:delete')
    expect(registeredChannels).toContain('model:list')
    expect(registeredChannels).toContain('settings:get')
    expect(registeredChannels).toContain('settings:set')
  })

  test('handler count matches expected total', async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
    // 4 window + 2 app + 3 chat + 3 session + 1 model + 2 settings = 15
    expect(mockHandlers.size).toBe(15)
  })
})

describe('Handler Logic (Direct Invocation)', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('app:version returns version string', async () => {
    const handler = mockHandlers.get('app:version')
    expect(handler).toBeDefined()
    const result = await handler!({})
    expect(result).toBe('0.1.0')
  })

  test('app:platform returns platform string', async () => {
    const handler = mockHandlers.get('app:platform')
    expect(handler).toBeDefined()
    const result = await handler!({})
    expect(typeof result).toBe('string')
  })

  test('session:create creates a new session', async () => {
    const handler = mockHandlers.get('session:create')
    expect(handler).toBeDefined()
    const result = await handler!({}, { title: 'Test', scene: 'code' })
    expect(result.id).toBeDefined()
    expect(result.title).toBe('Test')
    expect(result.createdAt).toBeDefined()
  })

  test('session:list returns sessions array', async () => {
    const handler = mockHandlers.get('session:list')
    expect(handler).toBeDefined()
    const result = await handler!({}, {})
    expect(result.sessions).toBeDefined()
    expect(Array.isArray(result.sessions)).toBe(true)
  })

  test('chat:send returns message response', async () => {
    const createHandler = mockHandlers.get('session:create')
    const session = await createHandler!({}, { title: 'Chat Test' })

    const handler = mockHandlers.get('chat:send')
    expect(handler).toBeDefined()
    const result = await handler!(
      {},
      {
        sessionId: session.id,
        message: 'Hello NexaWork',
      },
    )
    expect(result.messageId).toBeDefined()
    expect(result.content).toBeDefined()
    expect(typeof result.content).toBe('string')
  })

  test('chat:history returns messages for session', async () => {
    const createHandler = mockHandlers.get('session:create')
    const session = await createHandler!({}, {})

    const sendHandler = mockHandlers.get('chat:send')
    await sendHandler!({}, { sessionId: session.id, message: 'test' })

    const historyHandler = mockHandlers.get('chat:history')
    const result = await historyHandler!({}, { sessionId: session.id })
    expect(result.messages.length).toBeGreaterThan(0)
    expect(result.hasMore).toBe(false)
  })

  test('chat:stop returns success', async () => {
    const handler = mockHandlers.get('chat:stop')
    expect(handler).toBeDefined()
    const result = await handler!({}, { sessionId: 'any' })
    expect(result.success).toBe(true)
  })

  test('session:delete removes session', async () => {
    const createHandler = mockHandlers.get('session:create')
    const session = await createHandler!({}, { title: 'To Delete' })

    const deleteHandler = mockHandlers.get('session:delete')
    const result = await deleteHandler!({}, { id: session.id })
    expect(result.success).toBe(true)
  })

  test('model:list returns available models', async () => {
    const handler = mockHandlers.get('model:list')
    expect(handler).toBeDefined()
    const result = await handler!({})
    expect(result.models.length).toBeGreaterThan(0)
    expect(result.models[0].id).toBeDefined()
    expect(result.models[0].name).toBeDefined()
    expect(result.models[0].provider).toBeDefined()
    expect(result.models[0].capability).toBeDefined()
  })

  test('settings:get returns settings', async () => {
    const handler = mockHandlers.get('settings:get')
    expect(handler).toBeDefined()
    const result = await handler!({}, {})
    expect(result.theme).toBe('light')
    expect(result.language).toBe('zh-CN')
    expect(result.fontSize).toBe(14)
  })

  test('settings:get with key returns specific setting', async () => {
    const handler = mockHandlers.get('settings:get')
    const result = await handler!({}, { key: 'theme' })
    expect(result.theme).toBe('light')
  })

  test('settings:set updates a setting', async () => {
    const setHandler = mockHandlers.get('settings:set')
    const result = await setHandler!({}, { key: 'theme', value: 'dark' })
    expect(result.success).toBe(true)

    const getHandler = mockHandlers.get('settings:get')
    const settings = await getHandler!({}, { key: 'theme' })
    expect(settings.theme).toBe('dark')
  })
})
