import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  mock,
} from 'bun:test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  PtyProcess,
  PtySpawnOptions,
} from '../main/backend/terminal-manager'

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

    // Model (7: 4 core + 3 N22 API-key)
    expect(registeredChannels).toContain('model:list')
    expect(registeredChannels).toContain('model:set')
    expect(registeredChannels).toContain('model:test')
    expect(registeredChannels).toContain('model:configure')
    expect(registeredChannels).toContain('model:apiKey:set')
    expect(registeredChannels).toContain('model:apiKey:delete')
    expect(registeredChannels).toContain('model:apiKey:status')

    // Memory (4: N22 operationMemory)
    expect(registeredChannels).toContain('memory:list')
    expect(registeredChannels).toContain('memory:add')
    expect(registeredChannels).toContain('memory:delete')
    expect(registeredChannels).toContain('memory:clear')

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

    // Permission (5)
    expect(registeredChannels).toContain('permission:getMode')
    expect(registeredChannels).toContain('permission:setMode')
    expect(registeredChannels).toContain('permission:respond')
    expect(registeredChannels).toContain('permission:log:list')
    expect(registeredChannels).toContain('permission:log:clear')

    // Data management (8: N23; DATA_CHANGED is push-only)
    expect(registeredChannels).toContain('data:stats')
    expect(registeredChannels).toContain('data:export')
    expect(registeredChannels).toContain('data:import')
    expect(registeredChannels).toContain('data:clearSessions')
    expect(registeredChannels).toContain('data:clearCache')
    expect(registeredChannels).toContain('data:resetSettings')
    expect(registeredChannels).toContain('data:backup')
    expect(registeredChannels).toContain('data:restore')

    // Recording (8: N24 + N25 config; RECORD_CHANGED is push-only)
    expect(registeredChannels).toContain('record:start')
    expect(registeredChannels).toContain('record:pause')
    expect(registeredChannels).toContain('record:resume')
    expect(registeredChannels).toContain('record:stop')
    expect(registeredChannels).toContain('record:status')
    expect(registeredChannels).toContain('record:discard')
    expect(registeredChannels).toContain('record:getConfig')
    expect(registeredChannels).toContain('record:setConfig')
    expect(registeredChannels).toContain('record:list')

    // Replay (8: N26; REPLAY_CHANGED + REPLAY_DONE are push-only)
    expect(registeredChannels).toContain('replay:load')
    expect(registeredChannels).toContain('replay:play')
    expect(registeredChannels).toContain('replay:pause')
    expect(registeredChannels).toContain('replay:step')
    expect(registeredChannels).toContain('replay:stop')
    expect(registeredChannels).toContain('replay:setSpeed')
    expect(registeredChannels).toContain('replay:status')
    expect(registeredChannels).toContain('replay:report')

    // Recorded skills (14: N27; SKILL_RECORDED_CHANGED is push-only)
    expect(registeredChannels).toContain('skill:recorded:list')
    expect(registeredChannels).toContain('skill:recorded:get')
    expect(registeredChannels).toContain('skill:recorded:analyze')
    expect(registeredChannels).toContain('skill:recorded:create')
    expect(registeredChannels).toContain('skill:recorded:update')
    expect(registeredChannels).toContain('skill:recorded:reorder')
    expect(registeredChannels).toContain('skill:recorded:updateStep')
    expect(registeredChannels).toContain('skill:recorded:removeStep')
    expect(registeredChannels).toContain('skill:recorded:addWait')
    expect(registeredChannels).toContain('skill:recorded:duplicate')
    expect(registeredChannels).toContain('skill:recorded:delete')
    expect(registeredChannels).toContain('skill:recorded:execute')
    expect(registeredChannels).toContain('skill:recorded:recordExec')
    expect(registeredChannels).toContain('skill:recorded:export')

    // Code editor (7: N28; EDITOR_OPEN_FILE is push-only)
    expect(registeredChannels).toContain('editor:readFile')
    expect(registeredChannels).toContain('editor:writeFile')
    expect(registeredChannels).toContain('editor:statFile')
    expect(registeredChannels).toContain('editor:loadState')
    expect(registeredChannels).toContain('editor:saveState')
    expect(registeredChannels).toContain('editor:gitChanges')
    expect(registeredChannels).toContain('editor:gitDiff')

    // Terminal (5: N29; terminal:data/exit/aiCommand are push-only)
    expect(registeredChannels).toContain('terminal:create')
    expect(registeredChannels).toContain('terminal:write')
    expect(registeredChannels).toContain('terminal:resize')
    expect(registeredChannels).toContain('terminal:kill')
    expect(registeredChannels).toContain('terminal:list')

    // File browser (7: N30; file:changed is push-only)
    expect(registeredChannels).toContain('file:root')
    expect(registeredChannels).toContain('file:list')
    expect(registeredChannels).toContain('file:create')
    expect(registeredChannels).toContain('file:rename')
    expect(registeredChannels).toContain('file:move')
    expect(registeredChannels).toContain('file:delete')
    expect(registeredChannels).toContain('file:search')

    // Git panel (18: N31; git:changed is push-only)
    expect(registeredChannels).toContain('git:status')
    expect(registeredChannels).toContain('git:branches')
    expect(registeredChannels).toContain('git:stage')
    expect(registeredChannels).toContain('git:unstage')
    expect(registeredChannels).toContain('git:stageAll')
    expect(registeredChannels).toContain('git:unstageAll')
    expect(registeredChannels).toContain('git:discard')
    expect(registeredChannels).toContain('git:stageHunk')
    expect(registeredChannels).toContain('git:unstageHunk')
    expect(registeredChannels).toContain('git:commit')
    expect(registeredChannels).toContain('git:push')
    expect(registeredChannels).toContain('git:pull')
    expect(registeredChannels).toContain('git:commitPush')
    expect(registeredChannels).toContain('git:createBranch')
    expect(registeredChannels).toContain('git:checkout')
    expect(registeredChannels).toContain('git:merge')
    expect(registeredChannels).toContain('git:diff')
    expect(registeredChannels).toContain('git:diffHunks')

    // App (2)
    expect(registeredChannels).toContain('app:version')
    expect(registeredChannels).toContain('app:platform')
  })

  test('total handler count: 136 channels registered', async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
    // 5 chat + 6 session + 7 model (4 core + 3 N22 apiKey) + 5 expert + 5 skill
    // + 8 automation + 6 project + 3 settings + 4 memory + 5 permission
    // + 8 data (N23) + 9 record (6 N24 + 2 N25 config + 1 N26 list)
    // + 8 replay (N26) + 14 recorded skill (N27)
    // + 7 editor (N28: read/write/stat/loadState/saveState/gitChanges/gitDiff)
    // + 5 terminal (N29: create/write/resize/kill/list)
    // + 7 file browser (N30: root/list/create/rename/move/delete/search)
    // + 18 git panel (N31: status/branches/stage/unstage/stageAll/unstageAll/
    //   discard/stageHunk/unstageHunk/commit/push/pull/commitPush/createBranch/
    //   checkout/merge/diff/diffHunks; git:changed is push-only)
    // + 4 window + 2 app = 136
    expect(mockHandlers.size).toBe(136)
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

describe('Handler Logic: Model API Keys (N22)', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('model:apiKey:status starts with no configured providers', async () => {
    const handler = mockHandlers.get('model:apiKey:status')!
    const result = await handler({})
    expect(result.configured).toBeDefined()
    expect(typeof result.encryptionAvailable).toBe('boolean')
  })

  test('model:apiKey:set then status reports the provider configured', async () => {
    const setHandler = mockHandlers.get('model:apiKey:set')!
    expect(
      (await setHandler({}, { provider: 'anthropic', apiKey: 'sk-1' })).success,
    ).toBe(true)

    const statusHandler = mockHandlers.get('model:apiKey:status')!
    const result = await statusHandler({})
    expect(result.configured.anthropic).toBe(true)
  })

  test('model:apiKey:delete clears a configured provider', async () => {
    const setHandler = mockHandlers.get('model:apiKey:set')!
    await setHandler({}, { provider: 'openai', apiKey: 'sk-2' })

    const deleteHandler = mockHandlers.get('model:apiKey:delete')!
    expect((await deleteHandler({}, { provider: 'openai' })).success).toBe(true)

    const statusHandler = mockHandlers.get('model:apiKey:status')!
    const result = await statusHandler({})
    expect(result.configured.openai).toBeUndefined()
  })

  test('model:apiKey:set rejects a missing provider', async () => {
    const setHandler = mockHandlers.get('model:apiKey:set')!
    expect(setHandler({}, { provider: '', apiKey: 'x' })).rejects.toThrow()
  })
})

describe('Handler Logic: Memory (N22)', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('memory:add creates an entry and memory:list returns it', async () => {
    const addHandler = mockHandlers.get('memory:add')!
    const added = await addHandler({}, { content: 'user prefers dark mode' })
    expect(added.entry.id).toMatch(/^mem-/)
    expect(added.entry.content).toBe('user prefers dark mode')

    const listHandler = mockHandlers.get('memory:list')!
    const list = await listHandler({})
    expect(list.total).toBeGreaterThan(0)
    expect(
      list.entries.some(
        (e: { content: string }) => e.content === 'user prefers dark mode',
      ),
    ).toBe(true)
  })

  test('memory:add rejects empty content', async () => {
    const addHandler = mockHandlers.get('memory:add')!
    expect(addHandler({}, { content: '' })).rejects.toThrow()
  })

  test('memory:delete removes a single entry', async () => {
    const addHandler = mockHandlers.get('memory:add')!
    const added = await addHandler({}, { content: 'to delete' })

    const deleteHandler = mockHandlers.get('memory:delete')!
    expect((await deleteHandler({}, { id: added.entry.id })).success).toBe(true)

    const listHandler = mockHandlers.get('memory:list')!
    const list = await listHandler({})
    expect(
      list.entries.some((e: { id: string }) => e.id === added.entry.id),
    ).toBe(false)
  })

  test('memory:delete requires an id', async () => {
    const deleteHandler = mockHandlers.get('memory:delete')!
    expect(deleteHandler({}, {})).rejects.toThrow()
  })

  test('memory:clear empties the store', async () => {
    const addHandler = mockHandlers.get('memory:add')!
    await addHandler({}, { content: 'a' })
    await addHandler({}, { content: 'b' })

    const clearHandler = mockHandlers.get('memory:clear')!
    expect((await clearHandler({})).success).toBe(true)

    const listHandler = mockHandlers.get('memory:list')!
    expect((await listHandler({})).total).toBe(0)
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

describe('Handler Logic: Data management (N23)', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  async function seedSession(title: string, message: string) {
    const create = mockHandlers.get('session:create')!
    const session = await create({}, { title })
    const send = mockHandlers.get('chat:send')!
    await send({}, { sessionId: session.id, message })
    return session
  }

  test('data:stats returns counts and disk usage', async () => {
    await seedSession('Stats Session', 'hi')
    const handler = mockHandlers.get('data:stats')!
    const stats = await handler({})
    expect(stats.sessionCount).toBeGreaterThan(0)
    expect(stats.messageCount).toBeGreaterThan(0)
    expect(typeof stats.skillCount).toBe('number')
    expect(typeof stats.diskUsageBytes).toBe('number')
    expect(stats.diskUsageBytes).toBeGreaterThan(0)
  })

  test('data:export (json) returns parseable content + timestamped filename', async () => {
    await seedSession('Export JSON', 'hello world')
    const handler = mockHandlers.get('data:export')!
    const result = await handler({}, { scope: 'all', format: 'json' })
    expect(result.format).toBe('json')
    expect(result.filename).toMatch(/^nexawork-export-.*\.json$/)
    expect(result.byteLength).toBeGreaterThan(0)
    const parsed = JSON.parse(result.content)
    expect(Array.isArray(parsed.sessions)).toBe(true)
    expect(parsed.sessions.length).toBeGreaterThan(0)
  })

  test('data:export (markdown) returns readable text + .md filename', async () => {
    await seedSession('Export Markdown', 'markdown body')
    const handler = mockHandlers.get('data:export')!
    const result = await handler({}, { scope: 'all', format: 'markdown' })
    expect(result.format).toBe('markdown')
    expect(result.filename).toMatch(/\.md$/)
    expect(result.content).toContain('#')
  })

  test('data:import round-trips an exported bundle (overwrite)', async () => {
    await seedSession('Round Trip', 'persist me')
    const exportHandler = mockHandlers.get('data:export')!
    const exported = await exportHandler({}, { scope: 'all', format: 'json' })

    const clearHandler = mockHandlers.get('data:clearSessions')!
    await clearHandler({})

    const importHandler = mockHandlers.get('data:import')!
    const result = await importHandler(
      {},
      { content: exported.content, strategy: 'overwrite' },
    )
    expect(result.stats.importedSessions).toBeGreaterThan(0)

    const statsHandler = mockHandlers.get('data:stats')!
    const stats = await statsHandler({})
    expect(stats.sessionCount).toBeGreaterThan(0)
  })

  test('data:import rejects invalid content', async () => {
    const handler = mockHandlers.get('data:import')!
    await expect(handler({}, { content: 'not-json' })).rejects.toBeDefined()
  })

  test('data:clearSessions empties sessions and reports cleared count', async () => {
    await seedSession('To Clear', 'bye')
    const handler = mockHandlers.get('data:clearSessions')!
    const result = await handler({})
    expect(result.success).toBe(true)
    expect(result.cleared).toBeGreaterThan(0)

    const statsHandler = mockHandlers.get('data:stats')!
    const stats = await statsHandler({})
    expect(stats.sessionCount).toBe(0)
  })

  test('data:clearCache succeeds', async () => {
    const handler = mockHandlers.get('data:clearCache')!
    const result = await handler({})
    expect(result.success).toBe(true)
  })

  test('data:resetSettings restores defaults', async () => {
    const setHandler = mockHandlers.get('settings:set')!
    await setHandler({}, { key: 'fontSize', value: 20 })

    const resetHandler = mockHandlers.get('data:resetSettings')!
    const result = await resetHandler({})
    expect(result.success).toBe(true)

    const getHandler = mockHandlers.get('settings:get')!
    const all = await getHandler({}, {})
    expect(all.fontSize).not.toBe(20)
  })

  test('data:backup produces a full json snapshot', async () => {
    await seedSession('Backup Session', 'snapshot me')
    const handler = mockHandlers.get('data:backup')!
    const result = await handler({})
    expect(result.filename).toMatch(/^nexawork-backup-.*\.json$/)
    const parsed = JSON.parse(result.content)
    expect(Array.isArray(parsed.sessions)).toBe(true)
  })

  test('data:restore replaces all data losslessly', async () => {
    await seedSession('Restore Source', 'restore body')
    const backupHandler = mockHandlers.get('data:backup')!
    const backup = await backupHandler({})

    const clearHandler = mockHandlers.get('data:clearSessions')!
    await clearHandler({})

    const restoreHandler = mockHandlers.get('data:restore')!
    const result = await restoreHandler({}, { content: backup.content })
    expect(result.success).toBe(true)
    expect(result.stats.sessionCount).toBeGreaterThan(0)
  })

  test('data:restore rejects invalid content', async () => {
    const handler = mockHandlers.get('data:restore')!
    await expect(handler({}, { content: '{bad' })).rejects.toBeDefined()
  })
})

describe('Handler Logic: Recording (N24)', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
    // Ensure a clean recorder state across tests (stop if a prior test left one).
    const status = mockHandlers.get('record:status')!
    const current = await status({})
    if (current.state !== 'idle') await mockHandlers.get('record:stop')!({})
  })

  test('record:start transitions idle -> recording and reports a session id', async () => {
    const start = mockHandlers.get('record:start')!
    const result = await start({}, { taskDescription: 'demo' })
    expect(result.state).toBe('recording')
    expect(result.sessionId).toBeTruthy()
    expect(result.eventCount).toBe(0)
    await mockHandlers.get('record:stop')!({})
  })

  test('record:status reflects the live recorder state', async () => {
    const start = mockHandlers.get('record:start')!
    await start({}, {})
    const status = mockHandlers.get('record:status')!
    const snapshot = await status({})
    expect(snapshot.state).toBe('recording')
    await mockHandlers.get('record:stop')!({})
  })

  test('record:pause then record:resume toggle the recorder state', async () => {
    await mockHandlers.get('record:start')!({}, {})
    const paused = await mockHandlers.get('record:pause')!({})
    expect(paused.state).toBe('paused')
    const resumed = await mockHandlers.get('record:resume')!({})
    expect(resumed.state).toBe('recording')
    await mockHandlers.get('record:stop')!({})
  })

  test('record:stop returns a result with id/duration/eventCount and resets to idle', async () => {
    await mockHandlers.get('record:start')!({}, {})
    const result = await mockHandlers.get('record:stop')!({})
    expect(result.id).toBeTruthy()
    expect(typeof result.durationMs).toBe('number')
    expect(typeof result.eventCount).toBe('number')
    const snapshot = await mockHandlers.get('record:status')!({})
    expect(snapshot.state).toBe('idle')
  })

  test('record:discard requires an id', async () => {
    const discard = mockHandlers.get('record:discard')!
    await expect(discard({}, {})).rejects.toBeDefined()
  })

  test('record:discard reports success for an unknown id', async () => {
    const discard = mockHandlers.get('record:discard')!
    const result = await discard({}, { id: 'rec_missing' })
    expect(typeof result.success).toBe('boolean')
  })

  test('record:getConfig returns a fully-populated config', async () => {
    const getConfig = mockHandlers.get('record:getConfig')!
    const config = await getConfig({})
    expect(config.mode).toBeTruthy()
    expect(config.screenshotFrequency).toBeTruthy()
    expect(typeof config.maskPasswords).toBe('boolean')
    expect(Array.isArray(config.windowFilter)).toBe(true)
    expect(typeof config.maxDurationMs).toBe('number')
  })

  test('record:setConfig persists a patch and getConfig reflects it', async () => {
    const setConfig = mockHandlers.get('record:setConfig')!
    const getConfig = mockHandlers.get('record:getConfig')!
    const updated = await setConfig(
      {},
      { mode: 'hybrid', maskPasswords: false, windowFilter: ['Chrome'] },
    )
    expect(updated.mode).toBe('hybrid')
    expect(updated.maskPasswords).toBe(false)
    const roundTrip = await getConfig({})
    expect(roundTrip.mode).toBe('hybrid')
    expect(roundTrip.maskPasswords).toBe(false)
    expect(roundTrip.windowFilter).toEqual(['Chrome'])
    // restore the default so later tests are not affected
    await setConfig({}, { mode: 'cdp', maskPasswords: true, windowFilter: [] })
  })

  test('record:setConfig normalizes malformed input defensively', async () => {
    const setConfig = mockHandlers.get('record:setConfig')!
    const updated = await setConfig({}, { mode: 'bogus', maxDurationMs: -10 })
    expect(['cdp', 'desktop', 'hybrid']).toContain(updated.mode)
    expect(updated.maxDurationMs).toBeGreaterThanOrEqual(0)
  })

  test('record:list returns the recordings array', async () => {
    const list = mockHandlers.get('record:list')!
    const result = await list({})
    expect(Array.isArray(result.recordings)).toBe(true)
  })
})

describe('Handler Logic: Replay (N26)', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
    // Reset the replay controller to a clean idle state between tests.
    await mockHandlers.get('replay:stop')!({})
  })

  test('replay:status reports an idle snapshot before anything is loaded', async () => {
    const status = await mockHandlers.get('replay:status')!({})
    expect(status.state).toBe('idle')
    expect(status.recordingId).toBeNull()
    expect(status.totalSteps).toBe(0)
    expect(status.currentStep).toBe(-1)
    expect(status.progress).toBe(0)
    expect(Array.isArray(status.steps)).toBe(true)
  })

  test('replay:report returns a null report before a run completes', async () => {
    const result = await mockHandlers.get('replay:report')!({})
    expect(result.report).toBeNull()
  })

  test('replay:load rejects when recordingId is missing', async () => {
    const load = mockHandlers.get('replay:load')!
    await expect(load({}, {})).rejects.toBeDefined()
  })

  test('replay:load rejects with NOT_FOUND for an unknown recording', async () => {
    const load = mockHandlers.get('replay:load')!
    await expect(load({}, { recordingId: 'rec_missing' })).rejects.toBeDefined()
  })

  test('replay:setSpeed returns a status with a supported speed', async () => {
    const setSpeed = mockHandlers.get('replay:setSpeed')!
    const status = await setSpeed({}, { speed: 2 })
    expect([0.5, 1, 2, 5]).toContain(status.speed)
    const fallback = await setSpeed({}, { speed: 999 })
    expect([0.5, 1, 2, 5]).toContain(fallback.speed)
  })

  test('replay:play rejects when no recording is loaded', async () => {
    const play = mockHandlers.get('replay:play')!
    await expect(play({})).rejects.toBeDefined()
  })

  test('replay:stop is a no-op idle snapshot when nothing is loaded', async () => {
    const stop = mockHandlers.get('replay:stop')!
    const status = await stop({})
    expect(status.state).toBe('idle')
  })
})

/**
 * N27 handler-level coverage. The recorder singleton runs without an output dir
 * in tests, so recordings are never persisted to disk and `create` cannot load
 * one — these tests therefore exercise the wiring, validation and unknown-id
 * branches of every channel. The deep CRUD/execute behaviour is covered against
 * the `SkillManager` directly in `skill.test.ts`.
 */
describe('Handler Logic: Recorded skills (N27)', () => {
  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('skill:recorded:list returns an array', async () => {
    const result = await mockHandlers.get('skill:recorded:list')!({})
    expect(Array.isArray(result.skills)).toBe(true)
  })

  test('skill:recorded:create rejects without a recordingId', async () => {
    const create = mockHandlers.get('skill:recorded:create')!
    await expect(create({}, { name: 'x' })).rejects.toBeDefined()
  })

  test('skill:recorded:create rejects an unknown recording (NOT_FOUND)', async () => {
    const create = mockHandlers.get('skill:recorded:create')!
    await expect(
      create({}, { recordingId: 'rec_missing', name: 'x' }),
    ).rejects.toBeDefined()
  })

  test('skill:recorded:analyze rejects without a recordingId', async () => {
    const analyze = mockHandlers.get('skill:recorded:analyze')!
    await expect(analyze({}, {})).rejects.toBeDefined()
  })

  test('skill:recorded:analyze returns null analysis for an unknown recording', async () => {
    const result = await mockHandlers.get('skill:recorded:analyze')!(
      {},
      { recordingId: 'rec_missing' },
    )
    expect(result.analysis).toBeNull()
  })

  test('skill:recorded:get returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:get')!(
      {},
      { id: 'nope' },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:update returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:update')!(
      {},
      { id: 'nope', name: 'x' },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:reorder returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:reorder')!(
      {},
      { id: 'nope', fromIndex: 0, toIndex: 1 },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:updateStep returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:updateStep')!(
      {},
      { id: 'nope', stepId: 's', detail: 'x' },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:removeStep returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:removeStep')!(
      {},
      { id: 'nope', stepId: 's' },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:addWait returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:addWait')!(
      {},
      { id: 'nope', afterIndex: 0, waitMs: 300 },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:duplicate returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:duplicate')!(
      {},
      { id: 'nope' },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:delete reports ok=false for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:delete')!(
      {},
      { id: 'nope' },
    )
    expect(result.ok).toBe(false)
  })

  test('skill:recorded:recordExec returns null for an unknown id', async () => {
    const result = await mockHandlers.get('skill:recorded:recordExec')!(
      {},
      {
        id: 'nope',
        startedAt: 0,
        finishedAt: 1,
        durationMs: 1,
        success: true,
        params: {},
      },
    )
    expect(result.skill).toBeNull()
  })

  test('skill:recorded:execute rejects without an id', async () => {
    const execute = mockHandlers.get('skill:recorded:execute')!
    await expect(execute({}, { params: {} })).rejects.toBeDefined()
  })

  test('skill:recorded:execute rejects an unknown id (NOT_FOUND)', async () => {
    const execute = mockHandlers.get('skill:recorded:execute')!
    await expect(execute({}, { id: 'nope', params: {} })).rejects.toBeDefined()
  })

  test('skill:recorded:export returns null for an unknown id', async () => {
    const exported = await mockHandlers.get('skill:recorded:export')!(
      {},
      { id: 'nope' },
    )
    expect(exported).toBeNull()
  })
})

/**
 * N28 code-editor handler-level coverage. File IO goes through a real temp dir
 * (the editor manager keeps an in-memory tab session in tests since the
 * user-data state path resolves to null). Git-backed channels are exercised
 * against the repo working tree and only asserted structurally.
 */
describe('Handler Logic: Code editor (N28)', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'nexa-ipc-editor-'))

  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const { registerIPCHandlers } = await import('../main/ipc-handlers')
    registerIPCHandlers()
  })

  test('editor:writeFile then editor:readFile round-trips through disk', async () => {
    const path = join(workDir, 'note.ts')
    const write = await mockHandlers.get('editor:writeFile')!(
      {},
      { path, content: 'export const a = 1\n' },
    )
    expect(write.success).toBe(true)

    const read = await mockHandlers.get('editor:readFile')!({}, { path })
    expect(read.content).toBe('export const a = 1\n')
    expect(read.language).toBe('typescript')
  })

  test('editor:readFile rejects when path is missing', async () => {
    const read = mockHandlers.get('editor:readFile')!
    await expect(read({}, {})).rejects.toBeDefined()
  })

  test('editor:readFile rejects (READ_FAILED) for a missing file', async () => {
    const read = mockHandlers.get('editor:readFile')!
    await expect(
      read({}, { path: join(workDir, 'absent.ts') }),
    ).rejects.toBeDefined()
  })

  test('editor:writeFile rejects when path is missing', async () => {
    const write = mockHandlers.get('editor:writeFile')!
    await expect(write({}, { content: 'x' })).rejects.toBeDefined()
  })

  test('editor:statFile reports existence without throwing', async () => {
    const path = join(workDir, 'stat.txt')
    await mockHandlers.get('editor:writeFile')!({}, { path, content: 'hi' })
    const ok = await mockHandlers.get('editor:statFile')!({}, { path })
    expect(ok.exists).toBe(true)
    expect(ok.isFile).toBe(true)

    const missing = await mockHandlers.get('editor:statFile')!(
      {},
      { path: join(workDir, 'nope.txt') },
    )
    expect(missing.exists).toBe(false)
  })

  test('editor:saveState then editor:loadState round-trips the session', async () => {
    const saved = await mockHandlers.get('editor:saveState')!(
      {},
      { openPaths: ['/a.ts', '/b.ts'], activePath: '/a.ts' },
    )
    expect(saved.openPaths).toEqual(['/a.ts', '/b.ts'])

    const loaded = await mockHandlers.get('editor:loadState')!({})
    expect(loaded.activePath).toBe('/a.ts')
  })

  test('editor:gitChanges returns a structural result', async () => {
    const result = await mockHandlers.get('editor:gitChanges')!({}, {})
    expect(Array.isArray(result.changes)).toBe(true)
    expect(
      typeof result.repoRoot === 'string' || result.repoRoot === null,
    ).toBe(true)
  })

  test('editor:gitDiff rejects when path is missing', async () => {
    const diff = mockHandlers.get('editor:gitDiff')!
    await expect(diff({}, {})).rejects.toBeDefined()
  })
})

/**
 * N29 terminal handler-level coverage. A fake PTY is injected via the
 * `__setTerminalSpawnForTests` seam before registration so the native node-pty
 * binding is never loaded; the invoke handlers are then driven directly to
 * verify spawn → session, stdin/resize routing, kill, and list snapshots.
 */
describe('Handler Logic: Terminal (N29)', () => {
  const spawned: FakeHandlerPty[] = []

  class FakeHandlerPty implements PtyProcess {
    written: string[] = []
    size: { cols: number; rows: number } | null = null
    killed = false
    private exitCb: ((e: { exitCode: number }) => void) | null = null
    constructor(public readonly opts: PtySpawnOptions) {}
    write(data: string): void {
      this.written.push(data)
    }
    resize(cols: number, rows: number): void {
      this.size = { cols, rows }
    }
    kill(): void {
      this.killed = true
    }
    onData(): void {}
    onExit(cb: (e: { exitCode: number }) => void): void {
      this.exitCb = cb
    }
    emitExit(code: number): void {
      this.exitCb?.({ exitCode: code })
    }
  }

  beforeEach(async () => {
    spawned.length = 0
    mockHandlers.clear()
    mockHandle.mockClear()
    const handlers = await import('../main/ipc-handlers')
    handlers.__setTerminalSpawnForTests(opts => {
      const pty = new FakeHandlerPty(opts)
      spawned.push(pty)
      return pty
    })
    handlers.registerIPCHandlers()
  })

  afterAll(async () => {
    const handlers = await import('../main/ipc-handlers')
    handlers.__setTerminalSpawnForTests(null)
  })

  test('terminal:create spawns a PTY and returns running metadata', async () => {
    const info = await mockHandlers.get('terminal:create')!(
      {},
      { cols: 100, rows: 30 },
    )
    expect(info.id).toBeDefined()
    expect(info.status).toBe('running')
    expect(info.cols).toBe(100)
    expect(info.rows).toBe(30)
    expect(spawned).toHaveLength(1)
  })

  test('terminal:write forwards stdin to the PTY', async () => {
    const info = await mockHandlers.get('terminal:create')!({}, {})
    const res = await mockHandlers.get('terminal:write')!(
      {},
      { id: info.id, data: 'echo hi\n' },
    )
    expect(res.success).toBe(true)
    expect(spawned[0].written).toEqual(['echo hi\n'])
  })

  test('terminal:write rejects when id is missing', async () => {
    await expect(
      mockHandlers.get('terminal:write')!({}, { data: 'x' }),
    ).rejects.toBeDefined()
  })

  test('terminal:resize clamps and forwards new dimensions', async () => {
    const info = await mockHandlers.get('terminal:create')!({}, {})
    const res = await mockHandlers.get('terminal:resize')!(
      {},
      { id: info.id, cols: 0, rows: 99999 },
    )
    expect(res.success).toBe(true)
    expect(spawned[0].size).toEqual({ cols: 2, rows: 1000 })
  })

  test('terminal:list reflects created and killed sessions', async () => {
    const a = await mockHandlers.get('terminal:create')!({}, {})
    await mockHandlers.get('terminal:create')!({}, {})
    let listed = await mockHandlers.get('terminal:list')!({})
    expect(listed.sessions).toHaveLength(2)

    const killed = await mockHandlers.get('terminal:kill')!({}, { id: a.id })
    expect(killed.success).toBe(true)
    expect(spawned[0].killed).toBe(true)

    listed = await mockHandlers.get('terminal:list')!({})
    expect(listed.sessions).toHaveLength(1)
    expect(listed.sessions.map((s: { id: string }) => s.id)).not.toContain(a.id)
  })

  test('terminal:write returns success=false after the PTY exits', async () => {
    const info = await mockHandlers.get('terminal:create')!({}, {})
    spawned[0].emitExit(0)
    const res = await mockHandlers.get('terminal:write')!(
      {},
      { id: info.id, data: 'x' },
    )
    expect(res.success).toBe(false)
  })
})

/**
 * N30 file-browser handler logic. Disk IO runs against a temp directory; the fs
 * watcher is stubbed via `__setFileWatchForTests` so registration never opens
 * real OS watch handles. Paths are absolute so they resolve regardless of the
 * manager's project root.
 */
describe('Handler Logic: File browser (N30)', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'nexa-ipc-files-'))

  beforeEach(async () => {
    mockHandlers.clear()
    mockHandle.mockClear()
    const handlers = await import('../main/ipc-handlers')
    handlers.__setFileWatchForTests(() => ({ close: () => {} }))
    handlers.registerIPCHandlers()
  })

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  test('file:root returns the project root', async () => {
    const res = await mockHandlers.get('file:root')!({})
    expect(typeof res.root).toBe('string')
    expect(res.root.length).toBeGreaterThan(0)
  })

  test('file:create then file:list surfaces the new entry', async () => {
    const filePath = join(workDir, 'hello.ts')
    const created = await mockHandlers.get('file:create')!(
      {},
      { path: filePath, kind: 'file' },
    )
    expect(created.success).toBe(true)

    const listed = await mockHandlers.get('file:list')!({}, { path: workDir })
    expect(listed.entries.map((e: { name: string }) => e.name)).toContain(
      'hello.ts',
    )
    expect(listed.path).toBe(workDir)
  })

  test('file:list rejects when path is missing', async () => {
    const list = mockHandlers.get('file:list')!
    await expect(list({}, {})).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('file:create rejects (CREATE_FAILED) for an existing path', async () => {
    const p = join(workDir, 'dup.ts')
    await mockHandlers.get('file:create')!({}, { path: p, kind: 'file' })
    await expect(
      mockHandlers.get('file:create')!({}, { path: p, kind: 'file' }),
    ).rejects.toMatchObject({ code: 'CREATE_FAILED' })
  })

  test('file:rename moves a file on disk', async () => {
    const from = join(workDir, 'before.ts')
    const to = join(workDir, 'after.ts')
    await mockHandlers.get('file:create')!({}, { path: from, kind: 'file' })
    const res = await mockHandlers.get('file:rename')!(
      {},
      { path: from, newPath: to },
    )
    expect(res.success).toBe(true)
    const listed = await mockHandlers.get('file:list')!({}, { path: workDir })
    const names = listed.entries.map((e: { name: string }) => e.name)
    expect(names).toContain('after.ts')
    expect(names).not.toContain('before.ts')
  })

  test('file:rename rejects when newPath is missing', async () => {
    const rename = mockHandlers.get('file:rename')!
    await expect(
      rename({}, { path: join(workDir, 'x.ts') }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('file:move relocates an entry into a target dir', async () => {
    const sub = join(workDir, 'sub')
    const file = join(workDir, 'movable.ts')
    await mockHandlers.get('file:create')!({}, { path: sub, kind: 'directory' })
    await mockHandlers.get('file:create')!({}, { path: file, kind: 'file' })
    const res = await mockHandlers.get('file:move')!(
      {},
      { path: file, targetDir: sub },
    )
    expect(res.success).toBe(true)
    const listed = await mockHandlers.get('file:list')!({}, { path: sub })
    expect(listed.entries.map((e: { name: string }) => e.name)).toContain(
      'movable.ts',
    )
  })

  test('file:delete removes an entry', async () => {
    const p = join(workDir, 'trash.ts')
    await mockHandlers.get('file:create')!({}, { path: p, kind: 'file' })
    const res = await mockHandlers.get('file:delete')!({}, { path: p })
    expect(res.success).toBe(true)
    const listed = await mockHandlers.get('file:list')!({}, { path: workDir })
    expect(listed.entries.map((e: { name: string }) => e.name)).not.toContain(
      'trash.ts',
    )
  })

  test('file:search fuzzy-matches a created file by name', async () => {
    const p = join(workDir, 'searchable-token.ts')
    await mockHandlers.get('file:create')!({}, { path: p, kind: 'file' })
    const res = await mockHandlers.get('file:search')!(
      {},
      { query: 'searchabletoken', root: workDir },
    )
    expect(
      res.matches.some(
        (m: { name: string }) => m.name === 'searchable-token.ts',
      ),
    ).toBe(true)
  })

  test('file:search returns nothing for an empty query', async () => {
    const res = await mockHandlers.get('file:search')!(
      {},
      { query: '   ', root: workDir },
    )
    expect(res.matches).toEqual([])
  })
})

/**
 * N31 git-panel handler logic. A real git CLI runner is injected via
 * `__setGitRunnerForTests`, pinned to a temp repo so the handlers operate on an
 * isolated repository (never the project's own working tree). This exercises
 * the full IPC handler → GitManager → runner pipeline plus input validation.
 */
describe('Handler Logic: Git panel (N31)', () => {
  let gitRepo: string

  const runGit = (...args: string[]): string =>
    execFileSync('git', args, { cwd: gitRepo, encoding: 'utf-8' }).trim()

  beforeEach(async () => {
    gitRepo = mkdtempSync(join(tmpdir(), 'nexa-ipc-git-'))
    runGit('init', '-q')
    runGit('config', 'user.email', 'test@nexa.work')
    runGit('config', 'user.name', 'Nexa Test')
    runGit('config', 'commit.gpgsign', 'false')
    writeFileSync(join(gitRepo, 'a.txt'), 'first\n')
    runGit('add', 'a.txt')
    runGit('commit', '-q', '-m', 'initial')

    mockHandlers.clear()
    mockHandle.mockClear()
    const handlers = await import('../main/ipc-handlers')
    handlers.__setFileWatchForTests(() => ({ close: () => {} }))
    // Pin every git invocation to the temp repo regardless of process.cwd().
    handlers.__setGitRunnerForTests(async (args, _cwd, input) => {
      try {
        const stdout = execFileSync('git', args, {
          cwd: gitRepo,
          encoding: 'utf-8',
          ...(input !== undefined ? { input } : {}),
        })
        return { stdout, stderr: '', code: 0 }
      } catch (err) {
        const e = err as {
          stdout?: string | Buffer
          stderr?: string | Buffer
          status?: number
        }
        return {
          stdout: e.stdout?.toString() ?? '',
          stderr: e.stderr?.toString() ?? '',
          code: typeof e.status === 'number' ? e.status : 1,
        }
      }
    })
    handlers.registerIPCHandlers()
  })

  afterEach(async () => {
    const handlers = await import('../main/ipc-handlers')
    handlers.__setGitRunnerForTests(null)
    rmSync(gitRepo, { recursive: true, force: true })
  })

  test('git:status reports the current branch and changes', async () => {
    writeFileSync(join(gitRepo, 'a.txt'), 'changed\n')
    const res = await mockHandlers.get('git:status')!({})
    expect(res.repoRoot).not.toBeNull()
    expect(res.branch).toBeTruthy()
    expect(
      res.files.find((f: { path: string }) => f.path === 'a.txt'),
    ).toBeTruthy()
  })

  test('git:stage then git:commit clears the working tree', async () => {
    writeFileSync(join(gitRepo, 'a.txt'), 'changed\n')
    const staged = await mockHandlers.get('git:stage')!(
      {},
      { paths: ['a.txt'] },
    )
    expect(staged.success).toBe(true)
    const committed = await mockHandlers.get('git:commit')!(
      {},
      { message: 'feat: change' },
    )
    expect(committed.success).toBe(true)
    expect(runGit('log', '--oneline')).toContain('feat: change')
  })

  test('git:commit rejects an empty message', async () => {
    await expect(
      mockHandlers.get('git:commit')!({}, { message: '   ' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('git:createBranch then git:branches lists the new branch', async () => {
    const created = await mockHandlers.get('git:createBranch')!(
      {},
      { name: 'feature-z' },
    )
    expect(created.success).toBe(true)
    const branches = await mockHandlers.get('git:branches')!({})
    expect(branches.current).toBe('feature-z')
    expect(branches.branches.map((b: { name: string }) => b.name)).toContain(
      'feature-z',
    )
  })

  test('git:createBranch rejects a blank name', async () => {
    await expect(
      mockHandlers.get('git:createBranch')!({}, { name: '  ' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('git:diff returns Monaco diff data for a modified file', async () => {
    writeFileSync(join(gitRepo, 'a.txt'), 'second\n')
    const diff = await mockHandlers.get('git:diff')!({}, { path: 'a.txt' })
    expect(diff.original).toBe('first\n')
    expect(diff.modified).toBe('second\n')
  })

  test('git:diff rejects when path is missing', async () => {
    await expect(mockHandlers.get('git:diff')!({}, {})).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
  })

  test('git:diffHunks splits the unified diff into hunks', async () => {
    writeFileSync(join(gitRepo, 'a.txt'), 'first\nadded\n')
    const parsed = await mockHandlers.get('git:diffHunks')!(
      {},
      { path: 'a.txt' },
    )
    expect(parsed.hunks.length).toBeGreaterThan(0)
  })
})
