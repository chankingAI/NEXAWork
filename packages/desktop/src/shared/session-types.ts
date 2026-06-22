/**
 * Session data types — shared between Main and Renderer
 * Defines session, message, and space structures
 */

export type SceneType = 'office' | 'coding' | 'design' | 'record'
export type MessageRole = 'user' | 'assistant' | 'system'
export type SessionStatus = 'active' | 'archived' | 'pinned'

export interface SessionMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  createdAt: string // ISO string
}

export interface Session {
  id: string
  title: string
  scene: SceneType
  model: string
  status: SessionStatus
  spaceId: string | null
  messageCount: number
  createdAt: string // ISO string
  updatedAt: string // ISO string
}

export interface Space {
  id: string
  name: string
  color: string
  order: number
  createdAt: string
}

export interface SessionSearchResult {
  session: Session
  matchType: 'title' | 'content'
  snippet?: string
}

// ─── SQL Schema (reference for SQLite implementation) ──────────
export const SESSION_SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scene TEXT NOT NULL DEFAULT 'office',
  model TEXT NOT NULL DEFAULT 'auto',
  status TEXT NOT NULL DEFAULT 'active',
  space_id TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_space ON sessions(space_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
`
