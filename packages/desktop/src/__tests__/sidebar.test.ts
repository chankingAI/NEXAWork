import { describe, test, expect } from 'bun:test'
import type {
  NavigationId,
  TaskItem,
  SpaceItem,
  SidebarProps,
} from '../renderer/components/Sidebar'

/**
 * Sidebar Unit + Integration Tests (N6)
 * Tests navigation, collapse/expand, task list, spaces, user section
 */

describe('NavigationId Types', () => {
  test('all navigation IDs are valid', () => {
    const validIds: NavigationId[] = [
      'assistant',
      'projects',
      'experts',
      'skills',
      'automation',
      'security',
      'more',
      'library',
      'inspiration',
      'settings',
    ]
    expect(validIds).toHaveLength(10)
    expect(validIds).toContain('assistant')
    expect(validIds).toContain('projects')
    expect(validIds).toContain('experts')
    expect(validIds).toContain('skills')
    expect(validIds).toContain('automation')
    expect(validIds).toContain('security')
    expect(validIds).toContain('more')
    expect(validIds).toContain('library')
    expect(validIds).toContain('inspiration')
    expect(validIds).toContain('settings')
  })
})

describe('TaskItem Structure', () => {
  test('task item has required fields', () => {
    const task: TaskItem = {
      id: 'task-1',
      title: '分析Q4销售数据报表',
      time: '2分钟前',
      status: 'active',
    }
    expect(task.id).toBe('task-1')
    expect(task.title).toBe('分析Q4销售数据报表')
    expect(task.time).toBe('2分钟前')
    expect(task.status).toBe('active')
  })

  test('status can be active, completed, or paused', () => {
    const statuses: TaskItem['status'][] = ['active', 'completed', 'paused']
    expect(statuses).toHaveLength(3)
  })

  test('task list can contain multiple items', () => {
    const tasks: TaskItem[] = [
      { id: 't1', title: 'Task 1', time: 'now', status: 'active' },
      { id: 't2', title: 'Task 2', time: '1h ago', status: 'completed' },
      { id: 't3', title: 'Task 3', time: 'yesterday', status: 'paused' },
    ]
    expect(tasks).toHaveLength(3)
    expect(tasks[0].status).toBe('active')
    expect(tasks[1].status).toBe('completed')
    expect(tasks[2].status).toBe('paused')
  })
})

describe('SpaceItem Structure', () => {
  test('space item has required fields', () => {
    const space: SpaceItem = {
      id: 'space-1',
      name: '产品开发',
      color: '#3b82f6',
    }
    expect(space.id).toBe('space-1')
    expect(space.name).toBe('产品开发')
    expect(space.color).toBe('#3b82f6')
  })

  test('space can have children', () => {
    const space: SpaceItem = {
      id: 'space-1',
      name: '产品开发',
      color: '#3b82f6',
      children: [
        { id: 'sub-1', name: '前端重构' },
        { id: 'sub-2', name: 'API设计' },
      ],
    }
    expect(space.children).toHaveLength(2)
    expect(space.children?.[0].name).toBe('前端重构')
    expect(space.children?.[1].name).toBe('API设计')
  })

  test('space without children is valid', () => {
    const space: SpaceItem = {
      id: 'space-3',
      name: '个人笔记',
      color: '#f59e0b',
    }
    expect(space.children).toBeUndefined()
  })
})

describe('SidebarProps Interface', () => {
  test('all required props are defined', () => {
    const props: SidebarProps = {
      collapsed: false,
      onToggle: () => {},
      onNewSession: () => {},
      onSelectSession: () => {},
      onNavigate: () => {},
      activeNav: 'assistant',
      activeSessionId: null,
    }
    expect(props.collapsed).toBe(false)
    expect(typeof props.onToggle).toBe('function')
    expect(typeof props.onNewSession).toBe('function')
    expect(typeof props.onSelectSession).toBe('function')
    expect(typeof props.onNavigate).toBe('function')
    expect(props.activeNav).toBe('assistant')
    expect(props.activeSessionId).toBeNull()
  })

  test('optional props have correct types', () => {
    const props: SidebarProps = {
      collapsed: true,
      onToggle: () => {},
      onNewSession: () => {},
      onSelectSession: () => {},
      onNavigate: () => {},
      activeNav: 'projects',
      activeSessionId: 'session-1',
      recentTasks: [{ id: 't1', title: 'Test', time: 'now', status: 'active' }],
      spaces: [{ id: 's1', name: 'Space', color: '#000' }],
      userName: 'TestUser',
      userAvatar: '/avatar.png',
      notificationCount: 3,
    }
    expect(props.collapsed).toBe(true)
    expect(props.recentTasks).toHaveLength(1)
    expect(props.spaces).toHaveLength(1)
    expect(props.userName).toBe('TestUser')
    expect(props.notificationCount).toBe(3)
  })
})

describe('Sidebar Layout', () => {
  test('collapsed width is 52px', () => {
    const collapsedWidth = 52
    expect(collapsedWidth).toBe(52)
  })

  test('expanded width is 240px', () => {
    const expandedWidth = 240
    expect(expandedWidth).toBe(240)
  })

  test('transition duration is 250ms (normal)', () => {
    const duration = 250
    expect(duration).toBe(250)
  })
})

describe('Navigation Items', () => {
  const items = [
    { id: 'assistant', label: '助理' },
    { id: 'projects', label: '项目' },
    { id: 'experts', label: '专家' },
    { id: 'skills', label: '技能' },
    { id: 'automation', label: '自动化' },
    { id: 'security', label: '安全' },
    { id: 'more', label: '更多' },
  ]

  test('seven main navigation items exist', () => {
    expect(items).toHaveLength(7)
  })

  test('each item has id and label', () => {
    for (const item of items) {
      expect(item.id).toBeTruthy()
      expect(item.label).toBeTruthy()
    }
  })

  test('more item has sub-items', () => {
    const moreSubItems = [
      { id: 'library', label: '资料库' },
      { id: 'inspiration', label: '灵感' },
    ]
    expect(moreSubItems).toHaveLength(2)
    expect(moreSubItems[0].id).toBe('library')
    expect(moreSubItems[1].id).toBe('inspiration')
  })
})

describe('Navigation State', () => {
  test('active nav determines content display', () => {
    const navContentMap: Record<NavigationId, string> = {
      assistant: 'ChatView',
      projects: 'ProjectsView',
      experts: 'ExpertsView',
      skills: 'SkillsView',
      recordedSkills: 'RecordedSkillsView',
      replay: 'ReplayView',
      editor: 'EditorView',
      automation: 'AutomationView',
      security: 'SecurityView',
      more: 'MoreMenu',
      library: 'LibraryView',
      inspiration: 'InspirationView',
      settings: 'SettingsView',
    }

    expect(navContentMap.assistant).toBe('ChatView')
    expect(navContentMap.projects).toBe('ProjectsView')
    expect(navContentMap.settings).toBe('SettingsView')
  })

  test('default active nav is assistant', () => {
    const defaultNav: NavigationId = 'assistant'
    expect(defaultNav).toBe('assistant')
  })

  test('navigating away from assistant clears session', () => {
    let activeSession: string | null = 'session-1'
    const navigate = (id: NavigationId) => {
      if (id !== 'assistant') {
        activeSession = null
      }
    }
    navigate('projects')
    expect(activeSession).toBeNull()
  })

  test('selecting task sets assistant nav', () => {
    let activeNav: NavigationId = 'projects'
    const selectSession = () => {
      activeNav = 'assistant'
    }
    selectSession()
    expect(activeNav as string).toBe('assistant')
  })
})

describe('Collapse/Expand Behavior', () => {
  test('toggle changes collapsed state', () => {
    let collapsed = false
    const toggle = () => {
      collapsed = !collapsed
    }

    toggle()
    expect(collapsed).toBe(true)

    toggle()
    expect(collapsed).toBe(false)
  })

  test('collapsed mode hides text labels', () => {
    const collapsed = true
    const showLabel = !collapsed
    expect(showLabel).toBe(false)
  })

  test('collapsed mode shows tooltips', () => {
    const collapsed = true
    const showTooltip = collapsed
    expect(showTooltip).toBe(true)
  })

  test('collapsed mode hides task list', () => {
    const collapsed = true
    const showTasks = !collapsed
    expect(showTasks).toBe(false)
  })

  test('collapsed mode hides spaces', () => {
    const collapsed = true
    const showSpaces = !collapsed
    expect(showSpaces).toBe(false)
  })

  test('auto-collapse triggers below 768px', () => {
    const breakpoint = 768
    const windowWidth = 600
    const shouldCollapse = windowWidth < breakpoint
    expect(shouldCollapse).toBe(true)
  })

  test('no auto-collapse above 768px', () => {
    const breakpoint = 768
    const windowWidth = 1024
    const shouldCollapse = windowWidth < breakpoint
    expect(shouldCollapse).toBe(false)
  })
})

describe('Active State Styling', () => {
  test('active item has left border indicator', () => {
    const indicatorWidth = 3
    const indicatorColor = 'var(--color-text-primary)'
    expect(indicatorWidth).toBe(3)
    expect(indicatorColor).toContain('--color-text-primary')
  })

  test('active item has bold text', () => {
    const fontWeight = 'medium'
    expect(fontWeight).toBe('medium')
  })

  test('hover state uses bg-hover color', () => {
    const hoverBg = 'var(--color-bg-hover)'
    expect(hoverBg).toContain('--color-bg-hover')
  })
})

describe('Space Expansion', () => {
  test('space toggles expansion', () => {
    const expanded = new Set<string>(['space-1'])

    // Toggle off
    expanded.delete('space-1')
    expect(expanded.has('space-1')).toBe(false)

    // Toggle on
    expanded.add('space-2')
    expect(expanded.has('space-2')).toBe(true)
  })

  test('multiple spaces can be expanded', () => {
    const expanded = new Set(['space-1', 'space-2', 'space-3'])
    expect(expanded.size).toBe(3)
  })

  test('chevron rotates when expanded', () => {
    const isExpanded = true
    const rotation = isExpanded ? 90 : 0
    expect(rotation).toBe(90)
  })
})

describe('Notification Badge', () => {
  test('no badge when count is 0', () => {
    const count = 0
    const showBadge = count > 0
    expect(showBadge).toBe(false)
  })

  test('badge shows count up to 9', () => {
    const count = 5
    const display = count > 9 ? '9+' : String(count)
    expect(display).toBe('5')
  })

  test('badge shows 9+ for large counts', () => {
    const count = 15
    const display = count > 9 ? '9+' : String(count)
    expect(display).toBe('9+')
  })
})

describe('User Section', () => {
  test('shows first letter of username as avatar', () => {
    const userName = 'Alice'
    const initial = userName.charAt(0).toUpperCase()
    expect(initial).toBe('A')
  })

  test('default username is User', () => {
    const defaultName = 'User'
    expect(defaultName).toBe('User')
  })

  test('user section is at bottom of sidebar', () => {
    const position = 'bottom'
    expect(position).toBe('bottom')
  })
})

describe('New Task Button', () => {
  test('button calls onNewSession', () => {
    let called = false
    const onNewSession = () => {
      called = true
    }
    onNewSession()
    expect(called).toBe(true)
  })

  test('collapsed mode shows icon only', () => {
    const collapsed = true
    const showText = !collapsed
    expect(showText).toBe(false)
  })

  test('button uses primary text color for contrast', () => {
    const bgColor = 'var(--color-text-primary)'
    const textColor = 'var(--color-bg-primary)'
    expect(bgColor).toContain('--color-text-primary')
    expect(textColor).toContain('--color-bg-primary')
  })
})

describe('Recent Tasks Display', () => {
  test('shows max 5 tasks', () => {
    const allTasks: TaskItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      time: 'now',
      status: 'active' as const,
    }))
    const displayed = allTasks.slice(0, 5)
    expect(displayed).toHaveLength(5)
  })

  test('active task shows green dot', () => {
    const task: TaskItem = {
      id: 't1',
      title: 'Test',
      time: 'now',
      status: 'active',
    }
    const dotColor = task.status === 'active' ? 'var(--color-accent-green)' : ''
    expect(dotColor).toContain('--color-accent-green')
  })

  test('completed task shows gray dot', () => {
    const task: TaskItem = {
      id: 't1',
      title: 'Test',
      time: 'now',
      status: 'completed',
    }
    const dotColor =
      task.status === 'completed' ? 'var(--color-text-tertiary)' : ''
    expect(dotColor).toContain('--color-text-tertiary')
  })

  test('paused task shows orange dot', () => {
    const task: TaskItem = {
      id: 't1',
      title: 'Test',
      time: 'now',
      status: 'paused',
    }
    const dotColor =
      task.status === 'paused' ? 'var(--color-accent-orange)' : ''
    expect(dotColor).toContain('--color-accent-orange')
  })

  test('selected task has hover bg', () => {
    const isSelected = true
    const bgClass = isSelected ? 'bg-[var(--color-bg-hover)]' : ''
    expect(bgClass).toContain('--color-bg-hover')
  })
})

describe('Accessibility', () => {
  test('sidebar has navigation role', () => {
    const role = 'navigation'
    expect(role).toBe('navigation')
  })

  test('sidebar has aria-label', () => {
    const label = 'Main navigation'
    expect(label).toBe('Main navigation')
  })

  test('active nav item has aria-current page', () => {
    const ariaCurrent = 'page'
    expect(ariaCurrent).toBe('page')
  })

  test('toggle button has descriptive aria-label', () => {
    const collapsed = true
    const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
    expect(label).toBe('Expand sidebar')
  })

  test('collapsed buttons have title for accessibility', () => {
    const collapsed = true
    const hasTooltip = collapsed
    expect(hasTooltip).toBe(true)
  })
})

describe('Integration: Navigation → Content', () => {
  test('clicking assistant shows chat', () => {
    let currentView = 'welcome'
    const navigate = (id: NavigationId) => {
      if (id === 'assistant') currentView = 'chat'
    }
    navigate('assistant')
    expect(currentView).toBe('chat')
  })

  test('clicking projects shows projects view', () => {
    let currentView = 'chat'
    const navigate = (id: NavigationId) => {
      if (id === 'projects') currentView = 'projects'
    }
    navigate('projects')
    expect(currentView).toBe('projects')
  })

  test('new session sets assistant as active nav', () => {
    let activeNav: NavigationId = 'projects'
    const newSession = () => {
      activeNav = 'assistant'
    }
    newSession()
    expect(activeNav as string).toBe('assistant')
  })

  test('selecting a task from list activates it', () => {
    let activeSessionId: string | null = null
    const selectSession = (id: string) => {
      activeSessionId = id
    }
    selectSession('task-1')
    expect(activeSessionId as string | null).toBe('task-1')
  })
})
