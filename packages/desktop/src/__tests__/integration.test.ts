import { describe, test, expect, beforeEach, mock } from 'bun:test'

/**
 * Integration Tests - End-to-End IPC Flows
 * Tests complete user workflows through the handler layer
 */

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

describe('Integration: Full Chat Workflow', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('create → send → history → delete lifecycle', async () => {
    // 1. Create session
    const session = await mockHandlers.get('session:create')!(
      {},
      {
        title: 'Integration Test',
        scene: 'office',
      },
    )
    expect(session.id).toBeDefined()

    // 2. Send message
    const msg = await mockHandlers.get('chat:send')!(
      {},
      {
        sessionId: session.id,
        message: 'Hello NexaWork!',
      },
    )
    expect(msg.messageId).toBeDefined()
    expect(typeof msg.content).toBe('string')

    // 3. Get history (user + assistant = 2 messages)
    const history = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId: session.id,
      },
    )
    expect(history.messages.length).toBe(2)
    expect(history.messages[0].role).toBe('user')
    expect(history.messages[0].content).toBe('Hello NexaWork!')
    expect(history.messages[1].role).toBe('assistant')

    // 4. Delete session
    const del = await mockHandlers.get('session:delete')!(
      {},
      { id: session.id },
    )
    expect(del.success).toBe(true)

    // 5. Verify removal
    const list = await mockHandlers.get('session:list')!({}, {})
    const found = list.sessions.find((s: { id: string }) => s.id === session.id)
    expect(found).toBeUndefined()
  })

  test('multi-session isolation', async () => {
    const s1 = await mockHandlers.get('session:create')!(
      {},
      { title: 'Session A' },
    )
    const s2 = await mockHandlers.get('session:create')!(
      {},
      { title: 'Session B' },
    )

    await mockHandlers.get('chat:send')!(
      {},
      { sessionId: s1.id, message: 'A msg' },
    )
    await mockHandlers.get('chat:send')!(
      {},
      { sessionId: s2.id, message: 'B msg' },
    )

    const h1 = await mockHandlers.get('chat:history')!({}, { sessionId: s1.id })
    const h2 = await mockHandlers.get('chat:history')!({}, { sessionId: s2.id })

    expect(h1.messages[0].content).toBe('A msg')
    expect(h2.messages[0].content).toBe('B msg')
    expect(h1.messages[0].content).not.toBe(h2.messages[0].content)
  })

  test('chat history limit and hasMore', async () => {
    const session = await mockHandlers.get('session:create')!(
      {},
      { title: 'Limit' },
    )

    for (let i = 0; i < 5; i++) {
      await mockHandlers.get('chat:send')!(
        {},
        {
          sessionId: session.id,
          message: `msg ${i}`,
        },
      )
    }

    const limited = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId: session.id,
        limit: 4,
      },
    )
    expect(limited.messages.length).toBe(4)
    expect(limited.hasMore).toBe(true)

    const all = await mockHandlers.get('chat:history')!(
      {},
      {
        sessionId: session.id,
        limit: 100,
      },
    )
    expect(all.messages.length).toBe(10) // 5 user + 5 assistant
    expect(all.hasMore).toBe(false)
  })
})

describe('Integration: Expert System', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('list → summon → verify in session', async () => {
    const experts = await mockHandlers.get('expert:list')!({}, {})
    expect(experts.experts.length).toBe(3)

    const session = await mockHandlers.get('session:create')!({}, {})
    const summon = await mockHandlers.get('expert:summon')!(
      {},
      {
        expertId: 'expert-code',
        sessionId: session.id,
      },
    )
    expect(summon.success).toBe(true)
    expect(summon.greeting).toContain('Code Expert')
  })

  test('create custom expert → get → verify', async () => {
    const created = await mockHandlers.get('expert:create')!(
      {},
      {
        name: 'Finance Expert',
        description: 'Accounting help',
        systemPrompt: 'You are a finance expert',
        avatar: '💰',
      },
    )
    expect(created.id).toBeDefined()

    const expert = await mockHandlers.get('expert:get')!({}, { id: created.id })
    expect(expert.name).toBe('Finance Expert')
    expect(expert.avatar).toBe('💰')
    expect(expert.category).toBe('custom')
  })
})

describe('Integration: Skill System', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('list → execute → toggle → verify', async () => {
    // List all
    const list = await mockHandlers.get('skill:list')!({}, {})
    expect(list.skills.length).toBe(8)

    // Execute
    const exec = await mockHandlers.get('skill:execute')!(
      {},
      { skillId: 'skill-web-search' },
    )
    expect(exec.result).toContain('Web Search')

    // Toggle off
    await mockHandlers.get('skill:toggle')!(
      {},
      { skillId: 'skill-web-search', enabled: false },
    )

    // Verify skill is still listable (enabled state changed internally)
    const list2 = await mockHandlers.get('skill:list')!({}, {})
    expect(list2.skills.length).toBe(8)
  })

  test('delete skill → verify removal', async () => {
    await mockHandlers.get('skill:delete')!({}, { skillId: 'skill-code-run' })

    const list = await mockHandlers.get('skill:list')!({}, {})
    const found = list.skills.find(
      (s: { id: string }) => s.id === 'skill-code-run',
    )
    expect(found).toBeUndefined()
  })
})

describe('Integration: Automation System', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('create → list → update → delete workflow', async () => {
    // Create
    const created = await mockHandlers.get('automation:create')!(
      {},
      {
        name: 'Daily Report',
        prompt: 'Generate daily report',
        cron: '0 9 * * 1-5',
        workspace: '/projects/main',
      },
    )
    expect(created.id).toBeDefined()

    // List
    const list = await mockHandlers.get('automation:list')!({}, {})
    expect(list.automations.length).toBeGreaterThan(0)
    const auto = list.automations.find(
      (a: { id: string }) => a.id === created.id,
    )
    expect(auto.name).toBe('Daily Report')
    expect(auto.status).toBe('active')

    // Update
    const updated = await mockHandlers.get('automation:update')!(
      {},
      {
        id: created.id,
        updates: { status: 'paused' },
      },
    )
    expect(updated.success).toBe(true)

    // Delete
    const deleted = await mockHandlers.get('automation:delete')!(
      {},
      { id: created.id },
    )
    expect(deleted.success).toBe(true)

    // Verify removal
    const list2 = await mockHandlers.get('automation:list')!({}, {})
    const notFound = list2.automations.find(
      (a: { id: string }) => a.id === created.id,
    )
    expect(notFound).toBeUndefined()
  })
})

describe('Integration: Settings System', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('defaults → update → verify → reset', async () => {
    const defaults = await mockHandlers.get('settings:get')!({}, {})
    expect(defaults.theme).toBe('light')
    expect(defaults.language).toBe('zh-CN')
    expect(defaults.fontSize).toBe(14)

    await mockHandlers.get('settings:set')!({}, { key: 'theme', value: 'dark' })
    await mockHandlers.get('settings:set')!({}, { key: 'fontSize', value: 16 })

    const updated = await mockHandlers.get('settings:get')!({}, {})
    expect(updated.theme).toBe('dark')
    expect(updated.fontSize).toBe(16)

    await mockHandlers.get('settings:reset')!({}, { key: 'theme' })
    const afterReset = await mockHandlers.get('settings:get')!({}, {})
    expect(afterReset.theme).toBeUndefined()
    expect(afterReset.fontSize).toBe(16)
  })

  test('model list consistency', async () => {
    const result = await mockHandlers.get('model:list')!({})
    const models = result.models

    const auto = models.find((m: { id: string }) => m.id === 'auto')
    expect(auto).toBeDefined()
    expect(auto.available).toBe(true)

    const claude = models.find((m: { id: string }) => m.id === 'claude-sonnet')
    expect(claude).toBeDefined()
    expect(claude.provider).toBe('anthropic')
    expect(claude.capability).toBe('high')
    expect(claude.maxTokens).toBe(200000)
  })
})
