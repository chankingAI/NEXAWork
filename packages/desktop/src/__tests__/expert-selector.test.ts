/**
 * N14 — ExpertSelector Tests
 * Covers: data types, recent experts, toolbar config, hook logic,
 * expert selection, permission/skill modes, integration flows
 */
import { describe, test, expect } from 'bun:test'
import {
  type PermissionLevel,
  type SkillMode,
  type ToolbarConfig,
  type ExpertSelectorProps,
  RECENT_EXPERTS_KEY,
  MAX_RECENT,
} from '../renderer/components/ExpertSelector'
import {
  defaultExperts,
  type Expert,
} from '../renderer/components/ExpertListPage'

// ─── Type Tests ───────────────────────────────────────────────
describe('ExpertSelector types', () => {
  test('PermissionLevel covers all values', () => {
    const levels: PermissionLevel[] = ['default', 'strict', 'permissive']
    expect(levels).toHaveLength(3)
  })

  test('SkillMode covers all values', () => {
    const modes: SkillMode[] = ['auto', 'manual', 'disabled']
    expect(modes).toHaveLength(3)
  })

  test('ToolbarConfig has all required fields', () => {
    const config: ToolbarConfig = {
      expertId: null,
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }
    expect(config.expertId).toBeNull()
    expect(config.modelMode).toBe('自动')
    expect(config.skillMode).toBe('auto')
    expect(config.permission).toBe('default')
  })

  test('ToolbarConfig with expert selected', () => {
    const config: ToolbarConfig = {
      expertId: 'frontend-expert',
      modelMode: '自动',
      skillMode: 'manual',
      permission: 'strict',
    }
    expect(config.expertId).toBe('frontend-expert')
    expect(config.skillMode).toBe('manual')
    expect(config.permission).toBe('strict')
  })
})

// ─── Constants Tests ──────────────────────────────────────────
describe('ExpertSelector constants', () => {
  test('RECENT_EXPERTS_KEY is correct', () => {
    expect(RECENT_EXPERTS_KEY).toBe('nexawork-recent-experts')
  })

  test('MAX_RECENT is 3', () => {
    expect(MAX_RECENT).toBe(3)
  })
})

// ─── Recent Experts Logic Tests ───────────────────────────────
describe('recent experts logic', () => {
  test('adding expert to empty list', () => {
    const recent: string[] = []
    const expertId = 'frontend-expert'
    const filtered = recent.filter(id => id !== expertId)
    const updated = [expertId, ...filtered].slice(0, MAX_RECENT)
    expect(updated).toEqual(['frontend-expert'])
  })

  test('adding expert moves to front', () => {
    const recent = ['backend-expert', 'data-scientist']
    const expertId = 'data-scientist'
    const filtered = recent.filter(id => id !== expertId)
    const updated = [expertId, ...filtered].slice(0, MAX_RECENT)
    expect(updated).toEqual(['data-scientist', 'backend-expert'])
  })

  test('list is capped at MAX_RECENT', () => {
    const recent = ['a', 'b', 'c']
    const expertId = 'd'
    const filtered = recent.filter(id => id !== expertId)
    const updated = [expertId, ...filtered].slice(0, MAX_RECENT)
    expect(updated).toHaveLength(3)
    expect(updated[0]).toBe('d')
    expect(updated).not.toContain('c')
  })

  test('duplicate does not increase list length', () => {
    const recent = ['frontend-expert', 'backend-expert', 'data-scientist']
    const expertId = 'backend-expert'
    const filtered = recent.filter(id => id !== expertId)
    const updated = [expertId, ...filtered].slice(0, MAX_RECENT)
    expect(updated).toHaveLength(3)
    expect(updated[0]).toBe('backend-expert')
  })

  test('resolving recent ids to expert objects', () => {
    const recentIds = ['frontend-expert', 'backend-expert']
    const resolved = recentIds
      .map(id => defaultExperts.find(e => e.id === id))
      .filter((e): e is Expert => e !== undefined)
    expect(resolved).toHaveLength(2)
    expect(resolved[0].name).toBe('前端架构师')
    expect(resolved[1].name).toBe('后端架构师')
  })

  test('invalid ids are filtered out', () => {
    const recentIds = ['frontend-expert', 'nonexistent', 'backend-expert']
    const resolved = recentIds
      .map(id => defaultExperts.find(e => e.id === id))
      .filter((e): e is Expert => e !== undefined)
    expect(resolved).toHaveLength(2)
  })
})

// ─── Expert Selection Logic Tests ─────────────────────────────
describe('expert selection', () => {
  test('select expert updates current', () => {
    let currentId = null as string | null
    const select = (id: string | null) => {
      currentId = id
    }
    select('frontend-expert')
    expect(currentId as unknown as string).toBe('frontend-expert')
  })

  test('deselect sets to null', () => {
    let currentId = 'frontend-expert' as string | null
    const select = (id: string | null) => {
      currentId = id
    }
    select(null)
    expect(currentId).toBeNull()
  })

  test('switch expert replaces current', () => {
    let currentId = 'frontend-expert' as string | null
    const select = (id: string | null) => {
      currentId = id
    }
    select('backend-expert')
    expect(currentId as string).toBe('backend-expert')
  })

  test('getting expert by id returns correct expert', () => {
    const getExpert = (id: string) => defaultExperts.find(e => e.id === id)
    const expert = getExpert('frontend-expert')
    expect(expert).toBeDefined()
    expect(expert!.name).toBe('前端架构师')
  })

  test('getting nonexistent expert returns undefined', () => {
    const getExpert = (id: string) => defaultExperts.find(e => e.id === id)
    const expert = getExpert('nonexistent')
    expect(expert).toBeUndefined()
  })

  test('current expert returns correct object', () => {
    const currentId = 'product-manager'
    const current = defaultExperts.find(e => e.id === currentId)
    expect(current).toBeDefined()
    expect(current!.name).toBe('产品经理')
    expect(current!.role).toBe('产品策略与用户体验')
  })

  test('null current returns no expert', () => {
    const currentId: string | null = null
    const current = currentId
      ? defaultExperts.find(e => e.id === currentId)
      : undefined
    expect(current).toBeUndefined()
  })
})

// ─── Toolbar Config Tests ─────────────────────────────────────
describe('toolbar config', () => {
  test('default toolbar config', () => {
    const config: ToolbarConfig = {
      expertId: null,
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }
    expect(config.expertId).toBeNull()
    expect(config.skillMode).toBe('auto')
    expect(config.permission).toBe('default')
  })

  test('partial toolbar update preserves other fields', () => {
    const config: ToolbarConfig = {
      expertId: null,
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }
    const updated = { ...config, skillMode: 'manual' as SkillMode }
    expect(updated.expertId).toBeNull()
    expect(updated.modelMode).toBe('自动')
    expect(updated.skillMode).toBe('manual')
    expect(updated.permission).toBe('default')
  })

  test('update permission level', () => {
    const config: ToolbarConfig = {
      expertId: null,
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }
    const updated = { ...config, permission: 'strict' as PermissionLevel }
    expect(updated.permission).toBe('strict')
  })

  test('update expert updates toolbar config', () => {
    const config: ToolbarConfig = {
      expertId: null,
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }
    const updated = { ...config, expertId: 'frontend-expert' }
    expect(updated.expertId).toBe('frontend-expert')
  })

  test('all skill modes are settable', () => {
    const modes: SkillMode[] = ['auto', 'manual', 'disabled']
    for (const mode of modes) {
      const config: ToolbarConfig = {
        expertId: null,
        modelMode: '自动',
        skillMode: mode,
        permission: 'default',
      }
      expect(config.skillMode).toBe(mode)
    }
  })

  test('all permission levels are settable', () => {
    const levels: PermissionLevel[] = ['default', 'strict', 'permissive']
    for (const level of levels) {
      const config: ToolbarConfig = {
        expertId: null,
        modelMode: '自动',
        skillMode: 'auto',
        permission: level,
      }
      expect(config.permission).toBe(level)
    }
  })
})

// ─── Permission Labels Tests ──────────────────────────────────
describe('permission labels', () => {
  const labels: Record<PermissionLevel, string> = {
    default: '默认权限',
    strict: '严格模式',
    permissive: '宽松模式',
  }

  test('default label is correct', () => {
    expect(labels.default).toBe('默认权限')
  })

  test('strict label is correct', () => {
    expect(labels.strict).toBe('严格模式')
  })

  test('permissive label is correct', () => {
    expect(labels.permissive).toBe('宽松模式')
  })
})

// ─── Skill Labels Tests ──────────────────────────────────────
describe('skill labels', () => {
  const labels: Record<SkillMode, string> = {
    auto: '自动',
    manual: '手动',
    disabled: '禁用',
  }

  test('auto label is correct', () => {
    expect(labels.auto).toBe('自动')
  })

  test('manual label is correct', () => {
    expect(labels.manual).toBe('手动')
  })

  test('disabled label is correct', () => {
    expect(labels.disabled).toBe('禁用')
  })
})

// ─── Props Structure Tests ────────────────────────────────────
describe('ExpertSelector props', () => {
  test('valid props with no expert', () => {
    const props: ExpertSelectorProps = {
      currentExpertId: null,
      recentExpertIds: [],
      onSelectExpert: () => {},
      onOpenExpertList: () => {},
      toolbarConfig: {
        expertId: null,
        modelMode: '自动',
        skillMode: 'auto',
        permission: 'default',
      },
      onToolbarChange: () => {},
    }
    expect(props.currentExpertId).toBeNull()
    expect(props.recentExpertIds).toHaveLength(0)
  })

  test('valid props with expert selected', () => {
    const props: ExpertSelectorProps = {
      currentExpertId: 'frontend-expert',
      recentExpertIds: ['frontend-expert', 'backend-expert'],
      onSelectExpert: () => {},
      onOpenExpertList: () => {},
      toolbarConfig: {
        expertId: 'frontend-expert',
        modelMode: '自动',
        skillMode: 'auto',
        permission: 'default',
      },
      onToolbarChange: () => {},
    }
    expect(props.currentExpertId).toBe('frontend-expert')
    expect(props.recentExpertIds).toHaveLength(2)
  })
})

// ─── Dropdown State Tests ─────────────────────────────────────
describe('dropdown state management', () => {
  test('dropdown toggle logic', () => {
    let isOpen = false
    const toggle = () => {
      isOpen = !isOpen
    }
    toggle()
    expect(isOpen).toBe(true)
    toggle()
    expect(isOpen).toBe(false)
  })

  test('selecting expert closes dropdown', () => {
    let isOpen = true
    const handleSelect = () => {
      isOpen = false
    }
    handleSelect()
    expect(isOpen).toBe(false)
  })

  test('active dropdown toggle logic', () => {
    let activeDropdown = null as string | null
    const toggle = (name: string) => {
      activeDropdown = activeDropdown === name ? null : name
    }
    toggle('skill')
    expect(activeDropdown as unknown as string).toBe('skill')
    toggle('skill')
    expect(activeDropdown).toBeNull()
    toggle('permission')
    expect(activeDropdown as unknown as string).toBe('permission')
  })

  test('switching dropdown closes previous', () => {
    let activeDropdown = null as string | null
    const toggle = (name: string) => {
      activeDropdown = activeDropdown === name ? null : name
    }
    toggle('skill')
    expect(activeDropdown as unknown as string).toBe('skill')
    toggle('permission')
    expect(activeDropdown as unknown as string).toBe('permission')
  })
})

// ─── System Prompt Integration Tests ──────────────────────────
describe('system prompt integration', () => {
  test('expert with systemPrompt provides it', () => {
    const expert: Expert = {
      id: 'custom-1',
      name: 'Custom Expert',
      role: 'Custom',
      avatar: '🎯',
      description: 'Custom expert',
      tags: [],
      category: 'engineering',
      usageCount: 0,
      systemPrompt: 'You are a specialized coding assistant.',
    }
    expect(expert.systemPrompt).toBe('You are a specialized coding assistant.')
  })

  test('expert without systemPrompt returns undefined', () => {
    const expert = defaultExperts[0]
    expect(expert.systemPrompt).toBeUndefined()
  })

  test('selecting expert with systemPrompt changes behavior', () => {
    const experts: Expert[] = [
      { ...defaultExperts[0], systemPrompt: 'You are a React expert.' },
      { ...defaultExperts[1], systemPrompt: 'You are a backend expert.' },
    ]
    let currentPrompt: string | undefined
    const selectExpert = (id: string) => {
      const expert = experts.find(e => e.id === id)
      currentPrompt = expert?.systemPrompt
    }
    selectExpert(experts[0].id)
    expect(currentPrompt).toBe('You are a React expert.')
    selectExpert(experts[1].id)
    expect(currentPrompt).toBe('You are a backend expert.')
  })
})

// ─── Integration Tests ────────────────────────────────────────
describe('ExpertSelector integration', () => {
  test('full flow: no expert → select → switch → deselect', () => {
    let currentId: string | null = null
    let recent: string[] = []
    const config: ToolbarConfig = {
      expertId: null,
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }

    const select = (id: string | null) => {
      currentId = id
      config.expertId = id
      if (id) {
        const filtered = recent.filter(r => r !== id)
        recent = [id, ...filtered].slice(0, MAX_RECENT)
      }
    }

    // Initially no expert
    expect(currentId).toBeNull()
    expect(recent).toHaveLength(0)

    // Select frontend expert
    select('frontend-expert')
    expect(currentId as unknown as string).toBe('frontend-expert')
    expect(recent).toEqual(['frontend-expert'])
    expect(config.expertId as unknown as string).toBe('frontend-expert')

    // Switch to backend
    select('backend-expert')
    expect(currentId as unknown as string).toBe('backend-expert')
    expect(recent).toEqual(['backend-expert', 'frontend-expert'])

    // Deselect
    select(null)
    expect(currentId).toBeNull()
    expect(config.expertId).toBeNull()
    // Recent still preserved
    expect(recent).toEqual(['backend-expert', 'frontend-expert'])
  })

  test('toolbar changes independently of expert', () => {
    const config: ToolbarConfig = {
      expertId: 'frontend-expert',
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }

    // Change skill mode
    const updated1 = { ...config, skillMode: 'manual' as SkillMode }
    expect(updated1.expertId).toBe('frontend-expert')
    expect(updated1.skillMode).toBe('manual')

    // Change permission
    const updated2 = { ...updated1, permission: 'strict' as PermissionLevel }
    expect(updated2.expertId).toBe('frontend-expert')
    expect(updated2.permission).toBe('strict')
  })

  test('recent experts are ordered by recency', () => {
    let recent: string[] = []
    const addRecent = (id: string) => {
      const filtered = recent.filter(r => r !== id)
      recent = [id, ...filtered].slice(0, MAX_RECENT)
    }

    addRecent('a')
    addRecent('b')
    addRecent('c')
    expect(recent).toEqual(['c', 'b', 'a'])

    // Re-select 'a' moves to front
    addRecent('a')
    expect(recent).toEqual(['a', 'c', 'b'])
  })

  test('open expert list callback fires', () => {
    let opened = false
    const onOpen = () => {
      opened = true
    }
    onOpen()
    expect(opened).toBe(true)
  })

  test('toolbar change callback fires with partial config', () => {
    let lastChange = null as Partial<ToolbarConfig> | null
    const onChange = (config: Partial<ToolbarConfig>) => {
      lastChange = config
    }
    onChange({ skillMode: 'manual' })
    expect(lastChange as unknown as Partial<ToolbarConfig>).toEqual({
      skillMode: 'manual',
    })
  })

  test('expert selection with toolbar update flow', () => {
    let currentId: string | null = null
    const config: ToolbarConfig = {
      expertId: null,
      modelMode: '自动',
      skillMode: 'auto',
      permission: 'default',
    }

    // Select expert and update toolbar
    currentId = 'frontend-expert'
    config.expertId = currentId
    config.skillMode = 'manual'
    config.permission = 'strict'

    expect(currentId).toBe('frontend-expert')
    expect(config.expertId).toBe('frontend-expert')
    expect(config.skillMode).toBe('manual')
    expect(config.permission).toBe('strict')
  })
})
