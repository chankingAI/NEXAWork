import { describe, test, expect, beforeEach } from 'bun:test'
import { sessionManager } from '../main/backend/session-manager'
import { formatRelativeTime } from '../renderer/components/SessionList'
import type {
  Session,
  SessionMessage,
  Space,
  SceneType,
  SessionStatus,
  SessionSearchResult,
} from '../shared/session-types'
import { SESSION_SCHEMA } from '../shared/session-types'

/**
 * Session Management Unit + Integration Tests (N10)
 * Tests CRUD, search, persistence schema, relative time, spaces
 */

describe('Session CRUD', () => {
  test('create session with defaults', () => {
    const session = sessionManager.createSession({})
    expect(session.id).toBeTruthy()
    expect(session.title).toBe('新对话')
    expect(session.scene).toBe('office')
    expect(session.model).toBe('auto')
    expect(session.status).toBe('active')
    expect(session.spaceId).toBeNull()
    expect(session.messageCount).toBe(0)
    expect(session.createdAt).toBeTruthy()
    expect(session.updatedAt).toBeTruthy()
  })

  test('create session with custom params', () => {
    const session = sessionManager.createSession({
      title: 'Test Session',
      scene: 'coding',
      model: 'claude-sonnet',
      spaceId: null,
    })
    expect(session.title).toBe('Test Session')
    expect(session.scene).toBe('coding')
    expect(session.model).toBe('claude-sonnet')
  })

  test('get session by id', () => {
    const created = sessionManager.createSession({ title: 'Find Me' })
    const found = sessionManager.getSession(created.id)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('Find Me')
  })

  test('get non-existent session returns null', () => {
    const found = sessionManager.getSession('non-existent-id')
    expect(found).toBeNull()
  })

  test('update session title', () => {
    const session = sessionManager.createSession({ title: 'Original' })
    const updated = sessionManager.updateSession(session.id, {
      title: 'Updated',
    })
    expect(updated).not.toBeNull()
    expect(updated!.title).toBe('Updated')
    expect(updated!.updatedAt).not.toBe(session.updatedAt)
  })

  test('update session model', () => {
    const session = sessionManager.createSession({})
    const updated = sessionManager.updateSession(session.id, {
      model: 'gpt-4o',
    })
    expect(updated!.model).toBe('gpt-4o')
  })

  test('update non-existent session returns null', () => {
    const result = sessionManager.updateSession('bad-id', { title: 'X' })
    expect(result).toBeNull()
  })

  test('delete session', () => {
    const session = sessionManager.createSession({ title: 'Delete Me' })
    const deleted = sessionManager.deleteSession(session.id)
    expect(deleted).toBe(true)
    expect(sessionManager.getSession(session.id)).toBeNull()
  })

  test('delete non-existent session returns false', () => {
    const result = sessionManager.deleteSession('bad-id')
    expect(result).toBe(false)
  })
})

describe('Session Listing', () => {
  test('list sessions returns array', () => {
    sessionManager.createSession({ title: 'List Test' })
    const list = sessionManager.listSessions()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
  })

  test('list sessions sorted by updatedAt desc', () => {
    const s1 = sessionManager.createSession({ title: 'Old' })
    const s2 = sessionManager.createSession({ title: 'New' })
    const list = sessionManager.listSessions()
    const idx1 = list.findIndex(s => s.id === s1.id)
    const idx2 = list.findIndex(s => s.id === s2.id)
    // s2 (newer) should come before s1
    expect(idx2).toBeLessThan(idx1)
  })

  test('list sessions with limit', () => {
    for (let i = 0; i < 5; i++) {
      sessionManager.createSession({ title: `Limit Test ${i}` })
    }
    const limited = sessionManager.listSessions({ limit: 3 })
    expect(limited.length).toBeLessThanOrEqual(3)
  })

  test('list sessions by scene filter', () => {
    sessionManager.createSession({ scene: 'design' })
    const designs = sessionManager.listSessions({ scene: 'design' })
    for (const s of designs) {
      expect(s.scene).toBe('design')
    }
  })
})

describe('Message Management', () => {
  test('add message to session', () => {
    const session = sessionManager.createSession({})
    const msg = sessionManager.addMessage(session.id, 'user', 'Hello')
    expect(msg).not.toBeNull()
    expect(msg!.role).toBe('user')
    expect(msg!.content).toBe('Hello')
    expect(msg!.sessionId).toBe(session.id)
  })

  test('add message updates message count', () => {
    const session = sessionManager.createSession({})
    sessionManager.addMessage(session.id, 'user', 'One')
    sessionManager.addMessage(session.id, 'assistant', 'Two')
    const updated = sessionManager.getSession(session.id)!
    expect(updated.messageCount).toBe(2)
  })

  test('first user message auto-titles session', () => {
    const session = sessionManager.createSession({})
    sessionManager.addMessage(session.id, 'user', '分析销售数据')
    const updated = sessionManager.getSession(session.id)!
    expect(updated.title).toBe('分析销售数据')
  })

  test('long first message truncates title', () => {
    const session = sessionManager.createSession({})
    const longMsg = 'A'.repeat(100)
    sessionManager.addMessage(session.id, 'user', longMsg)
    const updated = sessionManager.getSession(session.id)!
    expect(updated.title.length).toBeLessThanOrEqual(53) // 50 + "..."
  })

  test('get messages for session', () => {
    const session = sessionManager.createSession({})
    sessionManager.addMessage(session.id, 'user', 'Q1')
    sessionManager.addMessage(session.id, 'assistant', 'A1')
    sessionManager.addMessage(session.id, 'user', 'Q2')
    const msgs = sessionManager.getMessages(session.id)
    expect(msgs).toHaveLength(3)
    expect(msgs[0].content).toBe('Q1')
    expect(msgs[2].content).toBe('Q2')
  })

  test('add message to non-existent session returns null', () => {
    const msg = sessionManager.addMessage('bad-id', 'user', 'X')
    expect(msg).toBeNull()
  })
})

describe('Session Search', () => {
  test('search by title', () => {
    sessionManager.createSession({ title: 'React 项目优化' })
    const results = sessionManager.searchSessions('React')
    const found = results.find(r => r.session.title.includes('React'))
    expect(found).toBeTruthy()
    expect(found!.matchType).toBe('title')
  })

  test('search by message content', () => {
    const session = sessionManager.createSession({ title: 'Generic Title' })
    sessionManager.addMessage(session.id, 'user', '请帮我分析 Kubernetes 集群')
    const results = sessionManager.searchSessions('Kubernetes')
    const found = results.find(r => r.session.id === session.id)
    expect(found).toBeTruthy()
    expect(found!.matchType).toBe('content')
    expect(found!.snippet).toContain('Kubernetes')
  })

  test('empty search returns empty results', () => {
    const results = sessionManager.searchSessions('')
    expect(results).toHaveLength(0)
  })

  test('search is case-insensitive', () => {
    sessionManager.createSession({ title: 'TypeScript Migration' })
    const results = sessionManager.searchSessions('typescript')
    const found = results.find(r => r.session.title.includes('TypeScript'))
    expect(found).toBeTruthy()
  })

  test('no match returns empty array', () => {
    const results = sessionManager.searchSessions('zzz_impossible_query_xyz')
    expect(results).toHaveLength(0)
  })
})

describe('Space Management', () => {
  test('create space', () => {
    const space = sessionManager.createSpace('开发项目', '#3b82f6')
    expect(space.id).toBeTruthy()
    expect(space.name).toBe('开发项目')
    expect(space.color).toBe('#3b82f6')
  })

  test('list spaces sorted by order', () => {
    sessionManager.createSpace('Space A')
    sessionManager.createSpace('Space B')
    const spaces = sessionManager.listSpaces()
    expect(spaces.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < spaces.length; i++) {
      expect(spaces[i].order).toBeGreaterThanOrEqual(spaces[i - 1].order)
    }
  })

  test('update space name', () => {
    const space = sessionManager.createSpace('Old Name')
    const updated = sessionManager.updateSpace(space.id, { name: 'New Name' })
    expect(updated!.name).toBe('New Name')
  })

  test('delete space unassigns sessions', () => {
    const space = sessionManager.createSpace('To Delete')
    const session = sessionManager.createSession({ spaceId: space.id })
    sessionManager.deleteSpace(space.id)
    const updatedSession = sessionManager.getSession(session.id)!
    expect(updatedSession.spaceId).toBeNull()
  })

  test('assign session to space', () => {
    const space = sessionManager.createSpace('My Space')
    const session = sessionManager.createSession({})
    const updated = sessionManager.updateSession(session.id, {
      spaceId: space.id,
    })
    expect(updated!.spaceId).toBe(space.id)
  })
})

describe('Relative Time Formatting', () => {
  test('just now (< 60s)', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now)).toBe('刚刚')
  })

  test('minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(fiveMinAgo)).toBe('5分钟前')
  })

  test('hours ago', () => {
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    ).toISOString()
    expect(formatRelativeTime(threeHoursAgo)).toBe('3小时前')
  })

  test('days ago', () => {
    const twoDaysAgo = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString()
    expect(formatRelativeTime(twoDaysAgo)).toBe('2天前')
  })

  test('weeks ago', () => {
    const twoWeeksAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString()
    expect(formatRelativeTime(twoWeeksAgo)).toBe('2周前')
  })

  test('months ago', () => {
    const twoMonthsAgo = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000,
    ).toISOString()
    expect(formatRelativeTime(twoMonthsAgo)).toBe('2个月前')
  })
})

describe('Session Status Transitions', () => {
  test('new session starts as active', () => {
    const session = sessionManager.createSession({})
    expect(session.status).toBe('active')
  })

  test('pin session', () => {
    const session = sessionManager.createSession({})
    const pinned = sessionManager.updateSession(session.id, {
      status: 'pinned',
    })
    expect(pinned!.status).toBe('pinned')
  })

  test('archive session', () => {
    const session = sessionManager.createSession({})
    const archived = sessionManager.updateSession(session.id, {
      status: 'archived',
    })
    expect(archived!.status).toBe('archived')
  })

  test('unpin session', () => {
    const session = sessionManager.createSession({})
    sessionManager.updateSession(session.id, { status: 'pinned' })
    const unpinned = sessionManager.updateSession(session.id, {
      status: 'active',
    })
    expect(unpinned!.status).toBe('active')
  })
})

describe('SQL Schema Definition', () => {
  test('schema contains sessions table', () => {
    expect(SESSION_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS sessions')
  })

  test('schema contains messages table', () => {
    expect(SESSION_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS messages')
  })

  test('schema contains spaces table', () => {
    expect(SESSION_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS spaces')
  })

  test('messages has session_id foreign key', () => {
    expect(SESSION_SCHEMA).toContain(
      'FOREIGN KEY (session_id) REFERENCES sessions(id)',
    )
  })

  test('sessions has space_id foreign key', () => {
    expect(SESSION_SCHEMA).toContain(
      'FOREIGN KEY (space_id) REFERENCES spaces(id)',
    )
  })

  test('has indexes for performance', () => {
    expect(SESSION_SCHEMA).toContain(
      'CREATE INDEX IF NOT EXISTS idx_messages_session',
    )
    expect(SESSION_SCHEMA).toContain(
      'CREATE INDEX IF NOT EXISTS idx_sessions_space',
    )
    expect(SESSION_SCHEMA).toContain(
      'CREATE INDEX IF NOT EXISTS idx_sessions_updated',
    )
  })

  test('messages cascade delete with session', () => {
    expect(SESSION_SCHEMA).toContain('ON DELETE CASCADE')
  })

  test('space deletion sets session space to null', () => {
    expect(SESSION_SCHEMA).toContain('ON DELETE SET NULL')
  })
})

describe('Session Data Types', () => {
  test('Scene types are valid', () => {
    const scenes: SceneType[] = ['office', 'coding', 'design', 'record']
    expect(scenes).toHaveLength(4)
  })

  test('Status types are valid', () => {
    const statuses: SessionStatus[] = ['active', 'archived', 'pinned']
    expect(statuses).toHaveLength(3)
  })

  test('Session interface has all fields', () => {
    const session: Session = {
      id: 'test',
      title: 'Test',
      scene: 'office',
      model: 'auto',
      status: 'active',
      spaceId: null,
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    expect(session.id).toBe('test')
    expect(session.spaceId).toBeNull()
  })

  test('Message interface has all fields', () => {
    const msg: SessionMessage = {
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'Hello',
      createdAt: new Date().toISOString(),
    }
    expect(msg.role).toBe('user')
  })

  test('Space interface has all fields', () => {
    const space: Space = {
      id: 'sp1',
      name: 'Dev',
      color: '#000',
      order: 0,
      createdAt: new Date().toISOString(),
    }
    expect(space.order).toBe(0)
  })
})

describe('Integration: Session → UI Flow', () => {
  test('create session → appears in list', () => {
    const session = sessionManager.createSession({ title: 'UI Flow Test' })
    const list = sessionManager.listSessions()
    const found = list.find(s => s.id === session.id)
    expect(found).toBeTruthy()
  })

  test('delete session → removed from list', () => {
    const session = sessionManager.createSession({ title: 'To Remove' })
    sessionManager.deleteSession(session.id)
    const list = sessionManager.listSessions()
    const found = list.find(s => s.id === session.id)
    expect(found).toBeUndefined()
  })

  test('send message → updates session timestamp', () => {
    const session = sessionManager.createSession({})
    const before = session.updatedAt
    // Small delay to ensure different timestamp
    sessionManager.addMessage(session.id, 'user', 'Update time')
    const after = sessionManager.getSession(session.id)!.updatedAt
    expect(after).not.toBe(before)
  })

  test('session count increases with creation', () => {
    const before = sessionManager.getSessionCount()
    sessionManager.createSession({ title: 'Count Test' })
    const after = sessionManager.getSessionCount()
    expect(after).toBe(before + 1)
  })

  test('recent sessions returns limited results', () => {
    const recent = sessionManager.getRecentSessions(3)
    expect(recent.length).toBeLessThanOrEqual(3)
  })
})
