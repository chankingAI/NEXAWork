import { describe, test, expect, beforeEach } from 'bun:test'
import { useAppStore } from '../renderer/store/appStore'
import { defaultExperts } from '../renderer/components/ExpertListPage'
import { defaultTeams } from '../renderer/components/ExpertTeamDialog'
import { builtinModels } from '../renderer/components/ModelSelector'

/**
 * App Store Integration Tests (N8–N14 wiring)
 *
 * Verifies the centralized Zustand store that connects routing/state to the
 * previously-orphaned components: navigation routing, session CRUD, chat
 * configuration (mode/model/expert/toolbar), expert recents persistence, and
 * the expert-team summon flow.
 */

// Fresh store snapshot for each test
const initialState = useAppStore.getState()

function resetStore() {
  useAppStore.setState(
    {
      activeNav: 'assistant',
      activeSessionId: null,
      sidebarCollapsed: false,
      scene: 'office',
      subTag: null,
      chatMode: 'craft',
      modelId: 'auto',
      maxMode: false,
      currentExpertId: null,
      recentExpertIds: [],
      toolbarConfig: {
        expertId: null,
        modelMode: '自动',
        skillMode: 'auto',
        permission: 'default',
      },
      expertMarketTab: 'experts',
      expertSearchQuery: '',
      summonedTeamId: null,
      sessions: [],
      sessionSearchQuery: '',
      pendingInput: null,
    },
    false,
  )
}

beforeEach(() => {
  resetStore()
})

describe('Store wiring: actions exist', () => {
  test('exposes all wiring actions', () => {
    expect(typeof initialState.navigate).toBe('function')
    expect(typeof initialState.newSession).toBe('function')
    expect(typeof initialState.selectExpert).toBe('function')
    expect(typeof initialState.confirmSummonTeam).toBe('function')
    expect(typeof initialState.setModelId).toBe('function')
    expect(typeof initialState.setChatMode).toBe('function')
  })
})

describe('Navigation routing', () => {
  test('navigate to a non-assistant view clears the active session', () => {
    useAppStore.getState().selectSession('session-x')
    expect(useAppStore.getState().activeSessionId).toBe('session-x')

    useAppStore.getState().navigate('experts')
    expect(useAppStore.getState().activeNav).toBe('experts')
    expect(useAppStore.getState().activeSessionId).toBeNull()
  })

  test('navigate to assistant keeps the active session', () => {
    useAppStore.getState().selectSession('session-y')
    useAppStore.getState().navigate('assistant')
    expect(useAppStore.getState().activeNav).toBe('assistant')
    expect(useAppStore.getState().activeSessionId).toBe('session-y')
  })

  test('openExpertList routes to experts view', () => {
    useAppStore.getState().openExpertList()
    expect(useAppStore.getState().activeNav).toBe('experts')
  })

  test('toggleSidebar flips collapsed state', () => {
    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    useAppStore.getState().toggleSidebar()
    expect(useAppStore.getState().sidebarCollapsed).toBe(true)
  })
})

describe('Session management', () => {
  test('newSession creates and activates a session in the assistant view', () => {
    const id = useAppStore.getState().newSession()
    const state = useAppStore.getState()
    expect(state.sessions.length).toBe(1)
    expect(state.sessions[0].id).toBe(id)
    expect(state.activeSessionId).toBe(id)
    expect(state.activeNav).toBe('assistant')
  })

  test('newSession stores prefill as pendingInput and is consumable once', () => {
    useAppStore.getState().newSession('帮我写一个 React 组件')
    expect(useAppStore.getState().pendingInput).toBe('帮我写一个 React 组件')
    useAppStore.getState().consumePendingInput()
    expect(useAppStore.getState().pendingInput).toBeNull()
  })

  test('newSession adopts current model and scene', () => {
    useAppStore.getState().setModelId('claude-sonnet')
    useAppStore.getState().setScene('coding')
    const id = useAppStore.getState().newSession()
    const session = useAppStore.getState().sessions.find(s => s.id === id)!
    expect(session.model).toBe('claude-sonnet')
    expect(session.scene).toBe('coding')
  })

  test('rename / pin / archive / delete mutate the right session', () => {
    const id = useAppStore.getState().newSession()

    useAppStore.getState().renameSession(id, '重命名后的会话')
    expect(useAppStore.getState().sessions.find(s => s.id === id)!.title).toBe(
      '重命名后的会话',
    )

    useAppStore.getState().pinSession(id)
    expect(useAppStore.getState().sessions.find(s => s.id === id)!.status).toBe(
      'pinned',
    )
    useAppStore.getState().pinSession(id)
    expect(useAppStore.getState().sessions.find(s => s.id === id)!.status).toBe(
      'active',
    )

    useAppStore.getState().archiveSession(id)
    expect(useAppStore.getState().sessions.find(s => s.id === id)!.status).toBe(
      'archived',
    )

    useAppStore.getState().deleteSession(id)
    expect(
      useAppStore.getState().sessions.find(s => s.id === id),
    ).toBeUndefined()
    expect(useAppStore.getState().activeSessionId).toBeNull()
  })
})

describe('Chat configuration (toolbar)', () => {
  test('setModelId mirrors the model name into the toolbar config', () => {
    const target = builtinModels.find(m => m.id === 'claude-sonnet')!
    useAppStore.getState().setModelId('claude-sonnet')
    expect(useAppStore.getState().modelId).toBe('claude-sonnet')
    expect(useAppStore.getState().toolbarConfig.modelMode).toBe(target.name)
  })

  test('updateToolbar merges partial config', () => {
    useAppStore.getState().updateToolbar({ permission: 'strict' })
    expect(useAppStore.getState().toolbarConfig.permission).toBe('strict')
    useAppStore.getState().updateToolbar({ skillMode: 'manual' })
    expect(useAppStore.getState().toolbarConfig.skillMode).toBe('manual')
    expect(useAppStore.getState().toolbarConfig.permission).toBe('strict')
  })

  test('setChatMode and setMaxMode update state', () => {
    useAppStore.getState().setChatMode('plan')
    expect(useAppStore.getState().chatMode).toBe('plan')
    useAppStore.getState().setMaxMode(true)
    expect(useAppStore.getState().maxMode).toBe(true)
  })
})

describe('Expert selection', () => {
  test('selecting an expert updates current + toolbar + recents (max 3, deduped, newest first)', () => {
    const ids = defaultExperts.slice(0, 4).map(e => e.id)
    for (const id of ids) useAppStore.getState().selectExpert(id)

    const state = useAppStore.getState()
    expect(state.currentExpertId).toBe(ids[3])
    expect(state.toolbarConfig.expertId).toBe(ids[3])
    expect(state.recentExpertIds.length).toBe(3)
    expect(state.recentExpertIds[0]).toBe(ids[3])
    expect(state.recentExpertIds).not.toContain(ids[0])

    // Re-selecting an existing recent moves it to the front without duplicating
    useAppStore.getState().selectExpert(ids[1])
    const recents = useAppStore.getState().recentExpertIds
    expect(recents[0]).toBe(ids[1])
    expect(recents.filter(r => r === ids[1]).length).toBe(1)
  })

  test('clearing the expert resets current and toolbar without touching recents', () => {
    useAppStore.getState().selectExpert(defaultExperts[0].id)
    useAppStore.getState().selectExpert(null)
    const state = useAppStore.getState()
    expect(state.currentExpertId).toBeNull()
    expect(state.toolbarConfig.expertId).toBeNull()
    expect(state.recentExpertIds).toContain(defaultExperts[0].id)
  })
})

describe('Expert team summon flow', () => {
  test('summonTeam opens the dialog, dismissTeam closes it', () => {
    const teamId = defaultTeams[0].id
    useAppStore.getState().summonTeam(teamId)
    expect(useAppStore.getState().summonedTeamId).toBe(teamId)
    useAppStore.getState().dismissTeam()
    expect(useAppStore.getState().summonedTeamId).toBeNull()
  })

  test('confirmSummonTeam closes dialog, creates a session titled after the team, and navigates to chat', () => {
    const team = defaultTeams[0]
    useAppStore.getState().summonTeam(team.id)
    useAppStore.getState().confirmSummonTeam(team.id)

    const state = useAppStore.getState()
    expect(state.summonedTeamId).toBeNull()
    expect(state.activeNav).toBe('assistant')
    expect(state.activeSessionId).not.toBeNull()
    expect(state.sessions[0].title).toBe(team.name)
    expect(state.pendingInput).toContain(team.name)
  })
})
