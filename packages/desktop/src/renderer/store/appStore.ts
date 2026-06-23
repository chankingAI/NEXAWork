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
import { defaultSkills, resolveSkillSource } from '../components/skillCatalog'
import type { Session, SceneType } from '../../shared/session-types'
import type {
  SkillInfo,
  SkillSource,
  SkillImportSourceType,
} from '../../shared/ipc-channels'

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

// ─── Skill enabled-state persistence ──────────────────────────
const SKILL_ENABLED_KEY = 'nexawork-skill-enabled'

function loadSkillEnabledOverrides(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const stored = localStorage.getItem(SKILL_ENABLED_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, boolean>
      }
    }
  } catch {
    /* ignore */
  }
  return {}
}

function persistSkillEnabledOverride(id: string, enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    const current = loadSkillEnabledOverrides()
    current[id] = enabled
    localStorage.setItem(SKILL_ENABLED_KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
}

/** Apply persisted enable/disable overrides onto a freshly-loaded catalog. */
function applySkillOverrides(skills: SkillInfo[]): SkillInfo[] {
  const overrides = loadSkillEnabledOverrides()
  return skills.map(s =>
    s.id in overrides ? { ...s, enabled: overrides[s.id]! } : s,
  )
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

  // Skills (N15)
  skillList: SkillInfo[]
  skillCategory: SkillSource
  skillSearchQuery: string
  selectedSkillId: string | null
  skillImporting: boolean
  skillImportMessage: string | null

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

  // ── Skill actions (N15) ──
  loadSkills: () => Promise<void>
  setSkillCategory: (category: SkillSource) => void
  setSkillSearchQuery: (query: string) => void
  selectSkill: (id: string | null) => void
  toggleSkill: (id: string, enabled: boolean) => void
  importSkill: (
    source: string,
    sourceType: SkillImportSourceType,
  ) => Promise<{ success: boolean; message: string; skillId?: string }>
  clearSkillImportMessage: () => void
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

  // Skills (N15) — hydrated from the default catalog with persisted
  // enable/disable overrides; loadSkills() refreshes from IPC when available.
  skillList: applySkillOverrides(defaultSkills),
  skillCategory: 'builtin',
  skillSearchQuery: '',
  selectedSkillId: null,
  skillImporting: false,
  skillImportMessage: null,

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

  // ── Skills (N15) ──
  loadSkills: async () => {
    const api =
      typeof window !== 'undefined' ? window.nexawork?.skill : undefined
    if (!api) {
      set({ skillList: applySkillOverrides(defaultSkills) })
      return
    }
    try {
      const result = await api.list()
      const skills =
        result?.skills && result.skills.length > 0
          ? result.skills
          : defaultSkills
      set({ skillList: applySkillOverrides(skills) })
    } catch {
      set({ skillList: applySkillOverrides(defaultSkills) })
    }
  },
  setSkillCategory: category =>
    set({ skillCategory: category, selectedSkillId: null }),
  setSkillSearchQuery: query => set({ skillSearchQuery: query }),
  selectSkill: id => set({ selectedSkillId: id }),
  toggleSkill: (id, enabled) => {
    persistSkillEnabledOverride(id, enabled)
    set(state => ({
      skillList: state.skillList.map(s =>
        s.id === id ? { ...s, enabled } : s,
      ),
    }))
    if (typeof window !== 'undefined') {
      window.nexawork?.skill?.toggle({ skillId: id, enabled })?.catch(() => {})
    }
  },
  importSkill: async (source, sourceType) => {
    const trimmed = source.trim()
    if (!trimmed) {
      const message = '导入来源不能为空'
      set({ skillImportMessage: message })
      return { success: false, message }
    }
    set({ skillImporting: true, skillImportMessage: null })
    const api =
      typeof window !== 'undefined' ? window.nexawork?.skill : undefined
    if (!api) {
      // Offline fallback: synthesise an imported skill locally.
      const id = `skill-imported-${Date.now()}`
      const name =
        trimmed
          .replace(/[?#].*$/, '')
          .replace(/\/+$/, '')
          .split(/[/\\]/)
          .filter(Boolean)
          .pop()
          ?.replace(/\.git$/, '')
          ?.replace(/\.[^.]+$/, '') || '导入的技能'
      const skill: SkillInfo = {
        id,
        name,
        description: `Imported from ${sourceType}: ${trimmed}`,
        category: 'imported',
        installed: true,
        enabled: true,
        version: '1.0.0',
        source: 'installed',
        icon: '📦',
        color: '#0EA5E9',
        author: `import:${sourceType}`,
        permissions: [],
      }
      const message = `已导入技能「${name}」`
      set(state => ({
        skillList: [...state.skillList, skill],
        skillImporting: false,
        skillImportMessage: message,
        skillCategory: 'installed',
      }))
      return { success: true, skillId: id, message }
    }
    try {
      const result = await api.import({ source: trimmed, sourceType })
      if (result?.success) {
        await get().loadSkills()
        set({
          skillImporting: false,
          skillImportMessage: result.message,
          skillCategory: 'installed',
        })
        return result
      }
      set({
        skillImporting: false,
        skillImportMessage: result?.message ?? '导入失败',
      })
      return {
        success: false,
        message: result?.message ?? '导入失败',
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入失败'
      set({ skillImporting: false, skillImportMessage: message })
      return { success: false, message }
    }
  },
  clearSkillImportMessage: () => set({ skillImportMessage: null }),
}))
