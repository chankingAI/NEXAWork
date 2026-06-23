import { describe, test, expect } from 'bun:test'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  ChatMessage,
  SessionInfo,
  ModelInfo,
  ExpertInfo,
  SkillInfo,
  AutomationInfo,
  StreamEvent,
  IPCError,
  IPCResult,
  IPCChannel,
  IPCInput,
  IPCOutput,
} from '../shared/ipc-channels'

describe('IPC_CHANNELS', () => {
  test('all channel constants are defined and unique', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values.length).toBeGreaterThan(0)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  test('chat channels follow naming convention', () => {
    expect(IPC_CHANNELS.CHAT_SEND).toBe('chat:send')
    expect(IPC_CHANNELS.CHAT_STREAM).toBe('chat:stream')
    expect(IPC_CHANNELS.CHAT_STOP).toBe('chat:stop')
    expect(IPC_CHANNELS.CHAT_HISTORY).toBe('chat:history')
    expect(IPC_CHANNELS.CHAT_REGENERATE).toBe('chat:regenerate')
    expect(IPC_CHANNELS.CHAT_STREAM_TOKEN).toBe('chat:stream:token')
    expect(IPC_CHANNELS.CHAT_STREAM_END).toBe('chat:stream:end')
  })

  test('session channels follow naming convention', () => {
    expect(IPC_CHANNELS.SESSION_CREATE).toBe('session:create')
    expect(IPC_CHANNELS.SESSION_LIST).toBe('session:list')
    expect(IPC_CHANNELS.SESSION_GET).toBe('session:get')
    expect(IPC_CHANNELS.SESSION_UPDATE).toBe('session:update')
    expect(IPC_CHANNELS.SESSION_DELETE).toBe('session:delete')
    expect(IPC_CHANNELS.SESSION_SEARCH).toBe('session:search')
  })

  test('model channels follow naming convention', () => {
    expect(IPC_CHANNELS.MODEL_LIST).toBe('model:list')
    expect(IPC_CHANNELS.MODEL_SET).toBe('model:set')
    expect(IPC_CHANNELS.MODEL_TEST).toBe('model:test')
    expect(IPC_CHANNELS.MODEL_CONFIGURE).toBe('model:configure')
  })

  test('expert channels follow naming convention', () => {
    expect(IPC_CHANNELS.EXPERT_LIST).toBe('expert:list')
    expect(IPC_CHANNELS.EXPERT_GET).toBe('expert:get')
    expect(IPC_CHANNELS.EXPERT_SUMMON).toBe('expert:summon')
    expect(IPC_CHANNELS.EXPERT_CREATE).toBe('expert:create')
    expect(IPC_CHANNELS.EXPERT_RECENT).toBe('expert:recent')
  })

  test('skill channels follow naming convention', () => {
    expect(IPC_CHANNELS.SKILL_LIST).toBe('skill:list')
    expect(IPC_CHANNELS.SKILL_INSTALL).toBe('skill:install')
    expect(IPC_CHANNELS.SKILL_TOGGLE).toBe('skill:toggle')
    expect(IPC_CHANNELS.SKILL_EXECUTE).toBe('skill:execute')
    expect(IPC_CHANNELS.SKILL_DELETE).toBe('skill:delete')
  })

  test('automation channels follow naming convention', () => {
    expect(IPC_CHANNELS.AUTOMATION_LIST).toBe('automation:list')
    expect(IPC_CHANNELS.AUTOMATION_CREATE).toBe('automation:create')
    expect(IPC_CHANNELS.AUTOMATION_UPDATE).toBe('automation:update')
    expect(IPC_CHANNELS.AUTOMATION_DELETE).toBe('automation:delete')
    expect(IPC_CHANNELS.AUTOMATION_HISTORY).toBe('automation:history')
    expect(IPC_CHANNELS.AUTOMATION_TOGGLE).toBe('automation:toggle')
    expect(IPC_CHANNELS.AUTOMATION_RUN_NOW).toBe('automation:runNow')
    expect(IPC_CHANNELS.AUTOMATION_RUN_EVENT).toBe('automation:runEvent')
  })

  test('settings channels follow naming convention', () => {
    expect(IPC_CHANNELS.SETTINGS_GET).toBe('settings:get')
    expect(IPC_CHANNELS.SETTINGS_SET).toBe('settings:set')
    expect(IPC_CHANNELS.SETTINGS_RESET).toBe('settings:reset')
  })

  test('window channels follow naming convention', () => {
    expect(IPC_CHANNELS.WINDOW_MINIMIZE).toBe('window:minimize')
    expect(IPC_CHANNELS.WINDOW_MAXIMIZE).toBe('window:maximize')
    expect(IPC_CHANNELS.WINDOW_CLOSE).toBe('window:close')
    expect(IPC_CHANNELS.WINDOW_IS_MAXIMIZED).toBe('window:isMaximized')
  })

  test('app channels follow naming convention', () => {
    expect(IPC_CHANNELS.APP_VERSION).toBe('app:version')
    expect(IPC_CHANNELS.APP_PLATFORM).toBe('app:platform')
  })

  test('all channels use domain:action pattern', () => {
    const values = Object.values(IPC_CHANNELS)
    for (const channel of values) {
      expect(channel).toMatch(/^[a-z]+:[a-z]/)
    }
  })
})

describe('Type definitions', () => {
  test('ChatMessage has correct structure', () => {
    const msg: ChatMessage = {
      id: '1',
      role: 'user',
      content: 'hello',
      createdAt: '2026-01-01',
    }
    expect(msg.id).toBe('1')
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('hello')
  })

  test('ChatMessage supports optional toolCalls', () => {
    const msg: ChatMessage = {
      id: '2',
      role: 'assistant',
      content: 'result',
      model: 'claude-sonnet',
      toolCalls: [{ name: 'search', input: {}, status: 'done' }],
      createdAt: '2026-01-01',
    }
    expect(msg.toolCalls!.length).toBe(1)
    expect(msg.toolCalls![0].name).toBe('search')
    expect(msg.toolCalls![0].status).toBe('done')
  })

  test('ChatMessage roles are restricted', () => {
    const roles: ChatMessage['role'][] = ['user', 'assistant', 'system']
    expect(roles).toHaveLength(3)
  })

  test('SessionInfo has correct structure', () => {
    const session: SessionInfo = {
      id: 's1',
      title: 'Test',
      scene: 'office',
      model: 'auto',
      messageCount: 5,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    expect(session.messageCount).toBe(5)
  })

  test('ModelInfo has correct structure', () => {
    const model: ModelInfo = {
      id: 'm1',
      name: 'Claude',
      provider: 'anthropic',
      capability: 'high',
      maxTokens: 200000,
      available: true,
    }
    expect(model.maxTokens).toBe(200000)
  })

  test('ExpertInfo has correct structure', () => {
    const expert: ExpertInfo = {
      id: 'e1',
      name: 'Code Expert',
      description: 'Dev helper',
      avatar: 'icon',
      category: 'development',
      systemPrompt: 'You are expert',
      tags: ['code'],
    }
    expect(expert.tags).toContain('code')
  })

  test('SkillInfo has correct structure', () => {
    const skill: SkillInfo = {
      id: 's1',
      name: 'Search',
      description: 'Web search',
      category: 'tools',
      installed: true,
      enabled: true,
      version: '1.0.0',
    }
    expect(skill.installed).toBe(true)
  })

  test('AutomationInfo has correct structure', () => {
    const auto: AutomationInfo = {
      id: 'a1',
      name: 'Daily Report',
      prompt: 'Generate report',
      cron: '0 9 * * *',
      workspace: '/project',
      status: 'active',
    }
    expect(auto.status).toBe('active')
  })

  test('IPCError has correct structure', () => {
    const err: IPCError = {
      code: 'NOT_FOUND',
      message: 'Resource not found',
      details: { id: '123' },
    }
    expect(err.code).toBe('NOT_FOUND')
    expect(err.details!.id).toBe('123')
  })

  test('IPCResult success type', () => {
    const result: IPCResult<string> = { success: true, data: 'ok' }
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('ok')
    }
  })

  test('IPCResult error type', () => {
    const result: IPCResult<string> = {
      success: false,
      error: { code: 'ERR', message: 'failed' },
    }
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ERR')
    }
  })

  test('StreamEvent union covers all types', () => {
    const events: StreamEvent[] = [
      { type: 'token', data: 'hello' },
      { type: 'tool_start', data: { name: 'bash', input: {} } },
      { type: 'tool_result', data: { name: 'bash', output: 'ok' } },
      { type: 'done', data: { messageId: 'm1', totalTokens: 100 } },
      { type: 'error', data: { code: 'ERR', message: 'oops' } },
    ]
    expect(events).toHaveLength(5)
    expect(events[0].type).toBe('token')
    expect(events[4].type).toBe('error')
  })

  test('IPCChannel type is a union of all channel values', () => {
    const channel: IPCChannel = 'chat:send'
    expect(channel).toBe('chat:send')
  })

  test('IPCInput/IPCOutput helper types work correctly', () => {
    type SendInput = IPCInput<'chat:send'>
    type SendOutput = IPCOutput<'chat:send'>
    const input: SendInput = { sessionId: 's1', message: 'hi' }
    expect(input.sessionId).toBe('s1')
    const output: SendOutput = { messageId: 'm1', content: 'hi' }
    expect(output.messageId).toBe('m1')
  })
})
