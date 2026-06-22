import { describe, test, expect, beforeEach, mock } from 'bun:test'

/**
 * Integration Tests - End-to-End Flows
 * Tests complete user workflows through the IPC layer
 */

// Mock electron BEFORE any imports
const mockHandlers = new Map<string, Function>()

mock.module('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      mockHandlers.set(channel, handler)
    },
  },
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

describe('Integration: Full Chat Session Flow', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('complete chat workflow: create → send → history → delete', async () => {
    // 1. Create session
    const createResult = await mockHandlers.get('session:create')!(
      {},
      {
        title: 'Integration Test',
        scene: 'office',
        model: 'auto',
      },
    )
    expect(createResult.id).toBeDefined()
    const sessionId = createResult.id

    // 2. Send message
    const sendResult = await mockHandlers.get('chat:send')!(
      {},
      {
        sessionId,
        message: 'Hello NexaWork!',
      },
    )
    expect(sendResult.messageId).toBeDefined()
    expect(sendResult.content).toBeDefined()

    // 3. Get history
    const historyResult = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId,
      },
    )
    expect(historyResult.messages.length).toBe(2) // user + assistant
    expect(historyResult.messages[0].role).toBe('user')
    expect(historyResult.messages[0].content).toBe('Hello NexaWork!')
    expect(historyResult.messages[1].role).toBe('assistant')

    // 4. Verify session appears in list
    const listResult = await mockHandlers.get('session:list')!({}, {})
    const found = listResult.sessions.find(
      (s: { id: string }) => s.id === sessionId,
    )
    expect(found).toBeDefined()
    expect(found.title).toBe('Integration Test')

    // 5. Delete session
    const deleteResult = await mockHandlers.get('session:delete')!(
      {},
      {
        id: sessionId,
      },
    )
    expect(deleteResult.success).toBe(true)

    // 6. Verify session removed
    const listAfter = await mockHandlers.get('session:list')!({}, {})
    const notFound = listAfter.sessions.find(
      (s: { id: string }) => s.id === sessionId,
    )
    expect(notFound).toBeUndefined()
  })

  test('multi-session concurrent workflow', async () => {
    // Create multiple sessions
    const session1 = await mockHandlers.get('session:create')!(
      {},
      {
        title: 'Session A',
      },
    )
    const session2 = await mockHandlers.get('session:create')!(
      {},
      {
        title: 'Session B',
      },
    )

    // Send messages to different sessions
    await mockHandlers.get('chat:send')!(
      {},
      {
        sessionId: session1.id,
        message: 'Message to A',
      },
    )
    await mockHandlers.get('chat:send')!(
      {},
      {
        sessionId: session2.id,
        message: 'Message to B',
      },
    )

    // Verify isolation
    const historyA = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId: session1.id,
      },
    )
    const historyB = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId: session2.id,
      },
    )

    expect(historyA.messages[0].content).toBe('Message to A')
    expect(historyB.messages[0].content).toBe('Message to B')
    expect(historyA.messages[0].content).not.toBe(historyB.messages[0].content)
  })

  test('settings persistence workflow', async () => {
    // Get defaults
    const defaults = await mockHandlers.get('settings:get')!({}, {})
    expect(defaults.theme).toBe('light')

    // Update theme
    await mockHandlers.get('settings:set')!(
      {},
      {
        key: 'theme',
        value: 'dark',
      },
    )

    // Verify update
    const updated = await mockHandlers.get('settings:get')!(
      {},
      {
        key: 'theme',
      },
    )
    expect(updated.theme).toBe('dark')

    // Update multiple settings
    await mockHandlers.get('settings:set')!(
      {},
      {
        key: 'fontSize',
        value: 16,
      },
    )
    await mockHandlers.get('settings:set')!(
      {},
      {
        key: 'language',
        value: 'en-US',
      },
    )

    // Verify all
    const all = await mockHandlers.get('settings:get')!({}, {})
    expect(all.theme).toBe('dark')
    expect(all.fontSize).toBe(16)
    expect(all.language).toBe('en-US')
  })

  test('model list returns required models', async () => {
    const result = await mockHandlers.get('model:list')!({})
    const models = result.models

    // Must include auto
    const auto = models.find((m: { id: string }) => m.id === 'auto')
    expect(auto).toBeDefined()
    expect(auto.available).toBe(true)

    // Must include Claude
    const claude = models.find((m: { id: string }) => m.id.includes('claude'))
    expect(claude).toBeDefined()
    expect(claude.provider).toBe('anthropic')

    // All models have required fields
    for (const model of models) {
      expect(model.id).toBeDefined()
      expect(model.name).toBeDefined()
      expect(model.provider).toBeDefined()
      expect(['high', 'medium', 'low']).toContain(model.capability)
      expect(typeof model.available).toBe('boolean')
    }
  })

  test('chat history respects limit parameter', async () => {
    const session = await mockHandlers.get('session:create')!(
      {},
      {
        title: 'Limit Test',
      },
    )

    // Send 5 messages (creates 10 total: 5 user + 5 assistant)
    for (let i = 0; i < 5; i++) {
      await mockHandlers.get('chat:send')!(
        {},
        {
          sessionId: session.id,
          message: `Message ${i}`,
        },
      )
    }

    // Request with limit
    const limited = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId: session.id,
        limit: 4,
      },
    )
    expect(limited.messages.length).toBe(4)
    expect(limited.hasMore).toBe(true)

    // Request all
    const all = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId: session.id,
        limit: 100,
      },
    )
    expect(all.messages.length).toBe(10)
    expect(all.hasMore).toBe(false)
  })
})
