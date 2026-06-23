/**
 * NexaWork appStore — centralized renderer state (Zustand)
 *
 * Single source of truth for navigation, scene, chat configuration
 * (mode / model / expert / toolbar) and session management. Replaces the
 * scattered `useState` hooks that previously lived inside App.tsx and
 * connects the N8–N14 components (ModeSelector / ModelSelector /
 * ExpertSelector / ExpertListPage / ExpertTeamDialog / SessionList) into a
 * single, coherent data flow.
 */
import { create } from 'zustand'
import type { NavigationId } from '../components/Sidebar'
import type { SceneId } from '../components/SceneTabs'
import type { ChatMode } from '../components/ModeSelector'
import type { ToolbarConfig } from '../components/ExpertSelector'
import { MAX_RECENT, RECENT_EXPERTS_KEY } from '../components/ExpertSelector'
import type { MarketplaceTab } from '../components/ExpertListPage'
import { defaultExperts } from '../components/ExpertListPage'
import { builtinModels } from '../components/ModelSelector'
import { defaultTeams, generateTeamIntro } from '../components/ExpertTeamDialog'
import type { Session, SceneType } from '../../shared/session-types'

// ─── Persistence helpers ──────────────────────────────────────
const CHAT_MODE_KEY = 'nexawork-chat-mode'

function loadChatMode(): ChatMode {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(CHAT_MODE_KEY)
    if (stored === 'craft' || stored === 'ask' || stored === 'plan') {
      return stored
    }
  }
  return 'craft'
}

function persistChatMode(mode: ChatMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CHAT_MODE_KEY, mode)
  }
}

function loadRecentExperts(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_EXPERTS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as unknown
      if (Array.isArray(parsed))
        return (parsed as string[]).slice(0, MAX_RECENT)
    }
  } catch {
    /* ignore */
  }
  return []
}

function persistRecentExperts(ids: string[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(RECENT_EXPERTS_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

function modelName(modelId: string): string {
  return builtinModels.find(m => m.id === modelId)?.name ?? 'Auto'
}

// ─── Seed sessions (in-memory until backed by IPC/SQLite) ──────
function seedSessions(): Session[] {
  const now = Date.now()
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString()
  return [
    {
      id: 'session-seed-1',
      title: '分析 Q4 销售数据报表',
      scene: 'office',
      model: 'auto',
      status: 'active',
      spaceId: null,
      messageCount: 4,
      createdAt: iso(2 * 60 * 1000),
      updatedAt: iso(2 * 60 * 1000),
    },
    {
      id: 'session-seed-2',
      title: '生成产品需求文档',
      scene: 'office',
      model: 'claude-sonnet',
      status: 'active',
      spaceId: null,
      messageCount: 12,
      createdAt: iso(60 * 60 * 1000),
      updatedAt: iso(60 * 60 * 1000),
    },
    {
      id: 'session-seed-3',
      title: '代码审查 - PR #142',
      scene: 'coding',
      model: 'auto',
      status: 'pinned',
      spaceId: null,
      messageCount: 8,
      createdAt: iso(3 * 60 * 60 * 1000),
      updatedAt: iso(3 * 60 * 60 * 1000),
    },
  ]
}

// ─── Store contract ───────────────────────────────────────────
export interface AppState {
  // Navigation
  activeNav: NavigationId
  activeSessionId: string | null
  sidebarCollapsed: boolean

  // Scene tabs
  scene: SceneId
  subTag: string | null

  // Chat configuration (N8 / N9 / N14)
  chatMode: ChatMode
  modelId: string
  maxMode: boolean
  currentExpertId: string | null
  recentExpertIds: string[]
  toolbarConfig: ToolbarConfig

  // Expert marketplace (N12)
  expertMarketTab: MarketplaceTab
  expertSearchQuery: string

  // Expert team dialog (N13)
  summonedTeamId: string | null

  // Sessions (N10)
  sessions: Session[]
  sessionSearchQuery: string

  // Quick-action / welcome prefill consumed by ChatInput
  pendingInput: string | null

  // ── Navigation actions ──
  navigate: (id: NavigationId) => void
  toggleSidebar: () => void

  // ── Scene actions ──
  setScene: (scene: SceneId) => void
  setSubTag: (tag: string | null) => void

  // ── Chat config actions ──
  setChatMode: (mode: ChatMode) => void
  setModelId: (modelId: string) => void
  setMaxMode: (enabled: boolean) => void
  selectExpert: (expertId: string | null) => void
  updateToolbar: (config: Partial<ToolbarConfig>) => void
  openExpertList: () => void

  // ── Marketplace actions ──
  setExpertMarketTab: (tab: MarketplaceTab) => void
  setExpertSearchQuery: (query: string) => void

  // ── Team dialog actions ──
  summonTeam: (teamId: string) => void
  dismissTeam: () => void
  confirmSummonTeam: (teamId: string) => void

  // ── Session actions ──
  newSession: (prefill?: string) => string
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  pinSession: (id: string) => void
  archiveSession: (id: string) => void
  setSessionSearchQuery: (query: string) => void
  consumePendingInput: () => void
}

const sceneToSceneType: Record<SceneId, SceneType> = {
  office: 'office',
  coding: 'coding',
  design: 'design',
  record: 'record',
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  activeNav: 'assistant',
  activeSessionId: null,
  sidebarCollapsed: false,

  // Scene
  scene: 'office',
  subTag: null,

  // Chat config
  chatMode: loadChatMode(),
  modelId: 'auto',
  maxMode: false,
  currentExpertId: null,
  recentExpertIds: loadRecentExperts(),
  toolbarConfig: {
    expertId: null,
    modelMode: '自动',
    skillMode: 'auto',
    permission: 'default',
  },

  // Marketplace
  expertMarketTab: 'experts',
  expertSearchQuery: '',

  // Team dialog
  summonedTeamId: null,

  // Sessions
  sessions: seedSessions(),
  sessionSearchQuery: '',

  // Prefill
  pendingInput: null,

  // ── Navigation ──
  navigate: id => {
    if (id === 'assistant') {
      set({ activeNav: id })
    } else {
      set({ activeNav: id, activeSessionId: null })
    }
  },
  toggleSidebar: () =>
    set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // ── Scene ──
  setScene: scene => set({ scene, subTag: null }),
  setSubTag: tag => set({ subTag: tag }),

  // ── Chat config ──
  setChatMode: mode => {
    persistChatMode(mode)
    set({ chatMode: mode })
  },
  setModelId: modelId =>
    set(state => ({
      modelId,
      toolbarConfig: { ...state.toolbarConfig, modelMode: modelName(modelId) },
    })),
  setMaxMode: enabled => set({ maxMode: enabled }),
  selectExpert: expertId =>
    set(state => {
      if (!expertId) {
        return {
          currentExpertId: null,
          toolbarConfig: { ...state.toolbarConfig, expertId: null },
        }
      }
      const recent = [
        expertId,
        ...state.recentExpertIds.filter(id => id !== expertId),
      ].slice(0, MAX_RECENT)
      persistRecentExperts(recent)
      return {
        currentExpertId: expertId,
        recentExpertIds: recent,
        toolbarConfig: { ...state.toolbarConfig, expertId },
      }
    }),
  updateToolbar: config =>
    set(state => ({ toolbarConfig: { ...state.toolbarConfig, ...config } })),
  openExpertList: () => set({ activeNav: 'experts', activeSessionId: null }),

  // ── Marketplace ──
  setExpertMarketTab: tab => set({ expertMarketTab: tab }),
  setExpertSearchQuery: query => set({ expertSearchQuery: query }),

  // ── Team dialog ──
  summonTeam: teamId => set({ summonedTeamId: teamId }),
  dismissTeam: () => set({ summonedTeamId: null }),
  confirmSummonTeam: teamId => {
    const team = defaultTeams.find(t => t.id === teamId)
    set({ summonedTeamId: null })
    get().newSession(team ? generateTeamIntro(team) : undefined)
    if (team) {
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === state.activeSessionId ? { ...s, title: team.name } : s,
        ),
      }))
    }
  },

  // ── Sessions ──
  newSession: prefill => {
    const id = `session-${Date.now()}`
    const nowIso = new Date().toISOString()
    const session: Session = {
      id,
      title: '新对话',
      scene: sceneToSceneType[get().scene],
      model: get().modelId,
      status: 'active',
      spaceId: null,
      messageCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    set(state => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
      activeNav: 'assistant',
      pendingInput: prefill ?? null,
    }))
    return id
  },
  selectSession: id => set({ activeSessionId: id, activeNav: 'assistant' }),
  deleteSession: id =>
    set(state => ({
      sessions: state.sessions.filter(s => s.id !== id),
      activeSessionId:
        state.activeSessionId === id ? null : state.activeSessionId,
    })),
  renameSession: (id, title) =>
    set(state => ({
      sessions: state.sessions.map(s => (s.id === id ? { ...s, title } : s)),
    })),
  pinSession: id =>
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === id
          ? { ...s, status: s.status === 'pinned' ? 'active' : 'pinned' }
          : s,
      ),
    })),
  archiveSession: id =>
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === id ? { ...s, status: 'archived' } : s,
      ),
    })),
  setSessionSearchQuery: query => set({ sessionSearchQuery: query }),
  consumePendingInput: () => set({ pendingInput: null }),
}))
