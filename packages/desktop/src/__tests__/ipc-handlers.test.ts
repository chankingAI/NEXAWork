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

    // Automation (8)
    expect(registeredChannels).toContain('automation:list')
    expect(registeredChannels).toContain('automation:create')
    expect(registeredChannels).toContain('automation:update')
    expect(registeredChannels).toContain('automation:delete')
    expect(registeredChannels).toContain('automation:history')
    expect(registeredChannels).toContain('automation:pause')
    expect(registeredChannels).toContain('automation:resume')
    expect(registeredChannels).toContain('automation:runNow')

    // Project (6)
    expect(registeredChannels).toContain('project:list')
    expect(registeredChannels).toContain('project:get')
    expect(registeredChannels).toContain('project:create')
    expect(registeredChannels).toContain('project:update')
    expect(registeredChannels).toContain('project:delete')
    expect(registeredChannels).toContain('project:templates')

    // Settings (3)
    expect(registeredChannels).toContain('settings:get')
    expect(registeredChannels).toContain('settings:set')
    expect(registeredChannels).toContain('settings:reset')

    // Window (4)
    expect(registeredChannels).toContain('window:minimize')
    expect(registeredChannels).toContain('window:maximize')
    expect(registeredChannels).toContain('window:close')
    expect(registeredChannels).toContain('window:isMaximized')

    // App (2)
    expect(registeredChannels).toContain('app:version')
    expect(registeredChannels).toContain('app:platform')
  })

  test('total handler count: 48 channels registered', async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
    // 5 chat + 6 session + 4 model + 5 expert + 5 skill + 8 automation + 6 project + 3 settings + 4 window + 2 app = 48
    expect(mockHandlers.size).toBe(48)
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

  test('automation:create rejects missing name/prompt/cron', async () => {
    const handler = mockHandlers.get('automation:create')!
    expect(
      handler({}, { name: '', prompt: 'p', cron: 'P|day|08:00' }),
    ).rejects.toThrow()
    expect(
      handler({}, { name: 'n', prompt: '', cron: 'P|day|08:00' }),
    ).rejects.toThrow()
    expect(handler({}, { name: 'n', prompt: 'p', cron: '' })).rejects.toThrow()
  })

  test('automation:pause then resume toggles status', async () => {
    const create = mockHandlers.get('automation:create')!
    const list = mockHandlers.get('automation:list')!
    const created = await create(
      {},
      { name: 'Pausable', prompt: 'p', cron: 'P|day|08:00', workspace: '/' },
    )

    const pause = mockHandlers.get('automation:pause')!
    expect((await pause({}, { id: created.id })).success).toBe(true)
    let found = (await list({}, {})).automations.find(
      (a: { id: string }) => a.id === created.id,
    )
    expect(found.status).toBe('paused')

    const resume = mockHandlers.get('automation:resume')!
    expect((await resume({}, { id: created.id })).success).toBe(true)
    found = (await list({}, {})).automations.find(
      (a: { id: string }) => a.id === created.id,
    )
    expect(found.status).toBe('active')
  })

  test('automation:pause/resume/runNow throw for unknown id', async () => {
    expect(
      mockHandlers.get('automation:pause')!({}, { id: 'nope' }),
    ).rejects.toThrow()
    expect(
      mockHandlers.get('automation:resume')!({}, { id: 'nope' }),
    ).rejects.toThrow()
    expect(
      mockHandlers.get('automation:runNow')!({}, { id: 'nope' }),
    ).rejects.toThrow()
  })

  test('automation:runNow executes and records a run in history', async () => {
    const create = mockHandlers.get('automation:create')!
    const created = await create(
      {},
      { name: 'RunNow', prompt: 'hi', cron: 'P|day|08:00', workspace: '/' },
    )

    const runNow = mockHandlers.get('automation:runNow')!
    const result = await runNow({}, { id: created.id })
    expect(result.run).toBeDefined()
    expect(['success', 'failure']).toContain(result.run.status)

    const history = mockHandlers.get('automation:history')!
    expect((await history({}, { id: created.id })).runs.length).toBeGreaterThan(
      0,
    )
  })

  test('automation:create with periodic cron computes a nextRun', async () => {
    const create = mockHandlers.get('automation:create')!
    const list = mockHandlers.get('automation:list')!
    const created = await create(
      {},
      { name: 'Next', prompt: 'p', cron: 'P|day|08:00', workspace: '/' },
    )
    const found = (await list({}, {})).automations.find(
      (a: { id: string }) => a.id === created.id,
    )
    expect(found.nextRun).toBeDefined()
  })
})

describe('Handler Logic: Project', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('project:templates returns 6 templates', async () => {
    const handler = mockHandlers.get('project:templates')!
    const result = await handler({})
    expect(result.templates).toHaveLength(6)
  })

  test('project:create returns id + project with defaults from template', async () => {
    const handler = mockHandlers.get('project:create')!
    const result = await handler({}, { name: 'My PRD', template: 'prd-flow' })
    expect(result.id).toContain('proj-')
    expect(result.project.name).toBe('My PRD')
    expect(result.project.template).toBe('prd-flow')
    expect(result.project.icon).toBeTruthy()
  })

  test('project:create rejects missing name', async () => {
    const handler = mockHandlers.get('project:create')!
    expect(handler({}, { name: '' })).rejects.toThrow()
  })

  test('project:list returns created projects and supports search', async () => {
    const create = mockHandlers.get('project:create')!
    await create({}, { name: 'Alpha Marketing' })
    await create({}, { name: 'Beta Engineering' })

    const list = mockHandlers.get('project:list')!
    expect((await list({}, {})).projects.length).toBeGreaterThanOrEqual(2)
    const filtered = await list({}, { query: 'alpha' })
    expect(filtered.projects).toHaveLength(1)
    expect(filtered.projects[0].name).toBe('Alpha Marketing')
  })

  test('project:get returns specific project, throws for unknown', async () => {
    const create = mockHandlers.get('project:create')!
    const created = await create({}, { name: 'Gettable' })

    const get = mockHandlers.get('project:get')!
    expect((await get({}, { id: created.id })).name).toBe('Gettable')
    expect(get({}, { id: 'nope' })).rejects.toThrow()
  })

  test('project:update modifies name/description', async () => {
    const create = mockHandlers.get('project:create')!
    const created = await create({}, { name: 'Old', description: 'old' })

    const update = mockHandlers.get('project:update')!
    expect(
      (await update({}, { id: created.id, name: 'New', description: 'new' }))
        .success,
    ).toBe(true)

    const get = mockHandlers.get('project:get')!
    const after = await get({}, { id: created.id })
    expect(after.name).toBe('New')
    expect(after.description).toBe('new')
  })

  test('project:delete removes project', async () => {
    const create = mockHandlers.get('project:create')!
    const created = await create({}, { name: 'ToDelete' })

    const del = mockHandlers.get('project:delete')!
    expect((await del({}, { id: created.id })).success).toBe(true)

    const list = mockHandlers.get('project:list')!
    const ids = (await list({}, {})).projects.map((p: { id: string }) => p.id)
    expect(ids).not.toContain(created.id)
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

  test('settings:reset (no key) restores all defaults', async () => {
    const setHandler = mockHandlers.get('settings:set')!
    await setHandler({}, { key: 'fontSize', value: 20 })
    await setHandler({}, { key: 'readingMode', value: true })

    const resetHandler = mockHandlers.get('settings:reset')!
    await resetHandler({}, {})

    const getHandler = mockHandlers.get('settings:get')!
    const result = await getHandler({}, {})
    expect(result.fontSize).toBe(14)
    expect(result.readingMode).toBe(false)
    expect(result.language).toBe('zh-CN')
  })

  test('settings:reset (single key) restores that field default', async () => {
    const setHandler = mockHandlers.get('settings:set')!
    await setHandler({}, { key: 'language', value: 'ja' })

    const resetHandler = mockHandlers.get('settings:reset')!
    await resetHandler({}, { key: 'language' })

    const getHandler = mockHandlers.get('settings:get')!
    const result = await getHandler({}, { key: 'language' })
    expect(result.language).toBe('zh-CN')
  })

  test('settings:set persists boolean + numeric N21 fields', async () => {
    const setHandler = mockHandlers.get('settings:set')!
    await setHandler({}, { key: 'skillAutoInstall', value: true })
    await setHandler({}, { key: 'sendKey', value: 'Ctrl+Enter' })

    const getHandler = mockHandlers.get('settings:get')!
    const all = await getHandler({}, {})
    expect(all.skillAutoInstall).toBe(true)
    expect(all.sendKey).toBe('Ctrl+Enter')
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
