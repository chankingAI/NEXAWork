/**
 * SessionManager — Backend session lifecycle management
 * Handles CRUD operations, search, persistence (SQLite-ready)
 * Uses in-memory store with SQLite schema ready for integration
 */
import type {
  Session,
  SessionMessage,
  Space,
  SceneType,
  SessionStatus,
  SessionSearchResult,
} from '../../shared/session-types'

// ─── ID Generator ─────────────────────────────────────────────
let counter = 0
function generateId(): string {
  return `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 10)}`
}

let lastTs = 0
function nowISO(): string {
  let ts = Date.now()
  if (ts <= lastTs) ts = lastTs + 1
  lastTs = ts
  return new Date(ts).toISOString()
}

// ─── In-Memory Store (SQLite-ready interface) ─────────────────
class SessionStore {
  private sessions: Map<string, Session> = new Map()
  private messages: Map<string, SessionMessage[]> = new Map()
  private spaces: Map<string, Space> = new Map()

  // ── Sessions ──
  createSession(params: {
    title?: string
    scene?: SceneType
    model?: string
    spaceId?: string | null
  }): Session {
    const now = nowISO()
    const session: Session = {
      id: generateId(),
      title: params.title ?? '新对话',
      scene: params.scene ?? 'office',
      model: params.model ?? 'auto',
      status: 'active',
      spaceId: params.spaceId ?? null,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.set(session.id, session)
    this.messages.set(session.id, [])
    return session
  }

  getSession(id: string): Session | null {
    return this.sessions.get(id) ?? null
  }

  listSessions(options?: {
    status?: SessionStatus
    spaceId?: string | null
    scene?: SceneType
    limit?: number
    offset?: number
  }): Session[] {
    let results = Array.from(this.sessions.values())

    if (options?.status) {
      results = results.filter(s => s.status === options.status)
    }
    if (options?.spaceId !== undefined) {
      results = results.filter(s => s.spaceId === options.spaceId)
    }
    if (options?.scene) {
      results = results.filter(s => s.scene === options.scene)
    }

    // Sort by updatedAt descending
    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    const offset = options?.offset ?? 0
    const limit = options?.limit ?? 50
    return results.slice(offset, offset + limit)
  }

  updateSession(
    id: string,
    updates: Partial<
      Pick<Session, 'title' | 'scene' | 'model' | 'status' | 'spaceId'>
    >,
  ): Session | null {
    const session = this.sessions.get(id)
    if (!session) return null

    const updated: Session = {
      ...session,
      ...updates,
      updatedAt: nowISO(),
    }
    this.sessions.set(id, updated)
    return updated
  }

  deleteSession(id: string): boolean {
    this.messages.delete(id)
    return this.sessions.delete(id)
  }

  searchSessions(query: string): SessionSearchResult[] {
    if (!query.trim()) return []
    const lower = query.toLowerCase()
    const results: SessionSearchResult[] = []

    for (const session of this.sessions.values()) {
      // Title match
      if (session.title.toLowerCase().includes(lower)) {
        results.push({ session, matchType: 'title' })
        continue
      }

      // Content match
      const msgs = this.messages.get(session.id) ?? []
      const match = msgs.find(m => m.content.toLowerCase().includes(lower))
      if (match) {
        const idx = match.content.toLowerCase().indexOf(lower)
        const start = Math.max(0, idx - 20)
        const end = Math.min(match.content.length, idx + query.length + 20)
        const snippet =
          (start > 0 ? '...' : '') +
          match.content.slice(start, end) +
          (end < match.content.length ? '...' : '')
        results.push({ session, matchType: 'content', snippet })
      }
    }

    return results.sort((a, b) =>
      b.session.updatedAt.localeCompare(a.session.updatedAt),
    )
  }

  // ── Messages ──
  addMessage(
    sessionId: string,
    role: SessionMessage['role'],
    content: string,
  ): SessionMessage | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    const message: SessionMessage = {
      id: generateId(),
      sessionId,
      role,
      content,
      createdAt: nowISO(),
    }

    const msgs = this.messages.get(sessionId) ?? []
    msgs.push(message)
    this.messages.set(sessionId, msgs)

    // Update session
    session.messageCount = msgs.length
    session.updatedAt = nowISO()

    // Auto-title from first user message
    if (
      session.title === '新对话' &&
      role === 'user' &&
      msgs.filter(m => m.role === 'user').length === 1
    ) {
      session.title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
    }

    this.sessions.set(sessionId, session)
    return message
  }

  getMessages(
    sessionId: string,
    options?: { limit?: number; before?: string },
  ): SessionMessage[] {
    const msgs = this.messages.get(sessionId) ?? []

    if (options?.before) {
      const idx = msgs.findIndex(m => m.id === options.before)
      if (idx > 0) {
        const limit = options.limit ?? 50
        return msgs.slice(Math.max(0, idx - limit), idx)
      }
    }

    const limit = options?.limit ?? 100
    return msgs.slice(-limit)
  }

  // ── Spaces ──
  createSpace(name: string, color: string = '#6B7280'): Space {
    const space: Space = {
      id: generateId(),
      name,
      color,
      order: this.spaces.size,
      createdAt: nowISO(),
    }
    this.spaces.set(space.id, space)
    return space
  }

  listSpaces(): Space[] {
    return Array.from(this.spaces.values()).sort((a, b) => a.order - b.order)
  }

  updateSpace(
    id: string,
    updates: Partial<Pick<Space, 'name' | 'color' | 'order'>>,
  ): Space | null {
    const space = this.spaces.get(id)
    if (!space) return null
    const updated = { ...space, ...updates }
    this.spaces.set(id, updated)
    return updated
  }

  deleteSpace(id: string): boolean {
    // Unassign sessions from this space
    for (const session of this.sessions.values()) {
      if (session.spaceId === id) {
        session.spaceId = null
        this.sessions.set(session.id, session)
      }
    }
    return this.spaces.delete(id)
  }

  // ── Stats ──
  getSessionCount(): number {
    return this.sessions.size
  }

  getRecentSessions(limit: number = 5): Session[] {
    return this.listSessions({ limit })
  }
}

// ─── Singleton Export ─────────────────────────────────────────
export const sessionManager = new SessionStore()
export type { SessionStore }
