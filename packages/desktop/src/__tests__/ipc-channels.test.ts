import { describe, test, expect } from 'bun:test'
import {
  IPC_CHANNELS,
  type IPCRequestMap,
  type ChatMessage,
  type SessionInfo,
  type ModelInfo,
  type StreamEvent,
  type StreamTokenEvent,
  type StreamDoneEvent,
  type StreamErrorEvent,
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
    expect(IPC_CHANNELS.CHAT_STREAM_TOKEN).toBe('chat:stream:token')
  })

  test('session channels follow naming convention', () => {
    expect(IPC_CHANNELS.SESSION_CREATE).toBe('session:create')
    expect(IPC_CHANNELS.SESSION_LIST).toBe('session:list')
    expect(IPC_CHANNELS.SESSION_GET).toBe('session:get')
    expect(IPC_CHANNELS.SESSION_UPDATE).toBe('session:update')
    expect(IPC_CHANNELS.SESSION_DELETE).toBe('session:delete')
  })

  test('model channels follow naming convention', () => {
    expect(IPC_CHANNELS.MODEL_LIST).toBe('model:list')
    expect(IPC_CHANNELS.MODEL_SET).toBe('model:set')
    expect(IPC_CHANNELS.MODEL_TEST).toBe('model:test')
  })

  test('settings channels follow naming convention', () => {
    expect(IPC_CHANNELS.SETTINGS_GET).toBe('settings:get')
    expect(IPC_CHANNELS.SETTINGS_SET).toBe('settings:set')
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
})

describe('Type definitions', () => {
  test('ChatMessage has correct structure', () => {
    const msg: ChatMessage = {
      id: 'test-id',
      role: 'user',
      content: 'hello',
      createdAt: '2026-01-01T00:00:00Z',
    }
    expect(msg.id).toBe('test-id')
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('hello')
    expect(msg.createdAt).toBe('2026-01-01T00:00:00Z')
  })

  test('ChatMessage roles are restricted', () => {
    const roles: ChatMessage['role'][] = ['user', 'assistant', 'system']
    expect(roles).toHaveLength(3)
  })

  test('SessionInfo has correct structure', () => {
    const session: SessionInfo = {
      id: 'sess-1',
      title: 'Test Session',
      scene: 'office',
      model: 'auto',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(session.id).toBe('sess-1')
    expect(session.title).toBe('Test Session')
    expect(session.scene).toBe('office')
  })

  test('ModelInfo has correct structure', () => {
    const model: ModelInfo = {
      id: 'claude-sonnet',
      name: 'Claude Sonnet',
      provider: 'anthropic',
      capability: 'high',
      available: true,
    }
    expect(model.id).toBe('claude-sonnet')
    expect(model.capability).toBe('high')
    expect(model.available).toBe(true)
  })

  test('ModelInfo capability is restricted', () => {
    const caps: ModelInfo['capability'][] = ['high', 'medium', 'low']
    expect(caps).toHaveLength(3)
  })

  test('StreamEvent types are correct', () => {
    const tokenEvent: StreamTokenEvent = {
      type: 'token',
      data: 'hello',
    }
    expect(tokenEvent.type).toBe('token')

    const doneEvent: StreamDoneEvent = {
      type: 'done',
      data: { totalTokens: 100 },
    }
    expect(doneEvent.type).toBe('done')
    expect(doneEvent.data.totalTokens).toBe(100)

    const errorEvent: StreamErrorEvent = {
      type: 'error',
      data: { code: 'AUTH_REQUIRED', message: 'API key missing' },
    }
    expect(errorEvent.type).toBe('error')
    expect(errorEvent.data.code).toBe('AUTH_REQUIRED')
  })

  test('StreamEvent union covers all types', () => {
    const events: StreamEvent[] = [
      { type: 'token', data: 'hi' },
      { type: 'tool_start', data: { name: 'read', input: {} } },
      { type: 'tool_result', data: { name: 'read', output: 'content' } },
      { type: 'done', data: { totalTokens: 50 } },
      { type: 'error', data: { code: 'ERR', message: 'fail' } },
    ]
    expect(events).toHaveLength(5)
  })

  test('IPCRequestMap type exists and is structurally correct', () => {
    // Verify that the type maps channel to input/output
    type ChatSendInput = IPCRequestMap[typeof IPC_CHANNELS.CHAT_SEND]['input']
    type ChatSendOutput = IPCRequestMap[typeof IPC_CHANNELS.CHAT_SEND]['output']

    const input: ChatSendInput = {
      sessionId: 's1',
      message: 'hello',
    }
    expect(input.sessionId).toBe('s1')

    const output: ChatSendOutput = {
      messageId: 'm1',
      content: 'response',
    }
    expect(output.messageId).toBe('m1')
  })
})
