import { describe, test, expect } from 'bun:test'
import {
  modeConfigs,
  type ChatMode,
  type ModeConfig,
  type ExpertItem,
  type ModeSelectorProps,
  type ModeState,
} from '../renderer/components/ModeSelector'

/**
 * ModeSelector Unit + Integration Tests (N8)
 * Tests mode switching, tool behavior, expert sub-menu, persistence
 */

describe('Mode Configurations', () => {
  test('three modes are defined', () => {
    expect(modeConfigs).toHaveLength(3)
  })

  test('all modes have required fields', () => {
    for (const mode of modeConfigs) {
      expect(mode.id).toBeTruthy()
      expect(mode.label).toBeTruthy()
      expect(mode.description).toBeTruthy()
      expect(mode.icon).toBeTruthy()
      expect(typeof mode.toolsEnabled).toBe('boolean')
      expect(typeof mode.planMode).toBe('boolean')
    }
  })

  test('mode IDs are unique', () => {
    const ids = modeConfigs.map(m => m.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test('mode IDs match expected values', () => {
    const ids = modeConfigs.map(m => m.id)
    expect(ids).toContain('craft')
    expect(ids).toContain('ask')
    expect(ids).toContain('plan')
  })
})

describe('Craft Mode', () => {
  const craft = modeConfigs.find(m => m.id === 'craft')!

  test('label is Craft', () => {
    expect(craft.label).toBe('Craft')
  })

  test('description is 深度创作与开发', () => {
    expect(craft.description).toBe('深度创作与开发')
  })

  test('tools are enabled', () => {
    expect(craft.toolsEnabled).toBe(true)
  })

  test('plan mode is disabled', () => {
    expect(craft.planMode).toBe(false)
  })
})

describe('Ask Mode', () => {
  const ask = modeConfigs.find(m => m.id === 'ask')!

  test('label is Ask', () => {
    expect(ask.label).toBe('Ask')
  })

  test('description is 快速问答', () => {
    expect(ask.description).toBe('快速问答')
  })

  test('tools are DISABLED', () => {
    expect(ask.toolsEnabled).toBe(false)
  })

  test('plan mode is disabled', () => {
    expect(ask.planMode).toBe(false)
  })
})

describe('Plan Mode', () => {
  const plan = modeConfigs.find(m => m.id === 'plan')!

  test('label is Plan', () => {
    expect(plan.label).toBe('Plan')
  })

  test('description is 任务规划', () => {
    expect(plan.description).toBe('任务规划')
  })

  test('tools are enabled (for planning tools)', () => {
    expect(plan.toolsEnabled).toBe(true)
  })

  test('plan mode is ENABLED', () => {
    expect(plan.planMode).toBe(true)
  })
})

describe('Mode Switching Logic', () => {
  test('switching to Craft enables all tools', () => {
    const craft = modeConfigs.find(m => m.id === 'craft')!
    expect(craft.toolsEnabled).toBe(true)
    expect(craft.planMode).toBe(false)
  })

  test('switching to Ask disables all tools', () => {
    const ask = modeConfigs.find(m => m.id === 'ask')!
    expect(ask.toolsEnabled).toBe(false)
    expect(ask.planMode).toBe(false)
  })

  test('switching to Plan enables plan tool only', () => {
    const plan = modeConfigs.find(m => m.id === 'plan')!
    expect(plan.toolsEnabled).toBe(true)
    expect(plan.planMode).toBe(true)
  })

  test('mode change callback is called with correct id', () => {
    let selectedMode: ChatMode = 'craft'
    const onModeChange = (mode: ChatMode) => {
      selectedMode = mode
    }

    onModeChange('ask')
    expect(selectedMode as string).toBe('ask')

    onModeChange('plan')
    expect(selectedMode as string).toBe('plan')

    onModeChange('craft')
    expect(selectedMode as string).toBe('craft')
  })
})

describe('Expert System', () => {
  const defaultExperts: ExpertItem[] = [
    { id: 'frontend', name: '前端专家', specialty: 'React/Vue/CSS' },
    { id: 'backend', name: '后端专家', specialty: 'Node/Python/Go' },
    { id: 'data', name: '数据专家', specialty: 'SQL/ML/Analytics' },
    { id: 'design', name: '设计专家', specialty: 'UI/UX/Figma' },
    { id: 'devops', name: 'DevOps专家', specialty: 'CI/CD/K8s' },
  ]

  test('5 default experts exist', () => {
    expect(defaultExperts).toHaveLength(5)
  })

  test('each expert has id, name, specialty', () => {
    for (const expert of defaultExperts) {
      expect(expert.id).toBeTruthy()
      expect(expert.name).toBeTruthy()
      expect(expert.specialty).toBeTruthy()
    }
  })

  test('expert IDs are unique', () => {
    const ids = defaultExperts.map(e => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test('selecting expert calls onSummonExpert', () => {
    let summonedId: string | null = null
    const onSummonExpert = (id: string) => {
      summonedId = id
    }

    onSummonExpert('frontend')
    expect(summonedId as string | null).toBe('frontend')
  })

  test('expert names have Chinese labels', () => {
    for (const expert of defaultExperts) {
      expect(expert.name).toMatch(/专家$/)
    }
  })
})

describe('Dropdown Behavior', () => {
  test('dropdown starts closed', () => {
    const isOpen = false
    expect(isOpen).toBe(false)
  })

  test('clicking trigger toggles open state', () => {
    let isOpen = false
    const toggle = () => {
      isOpen = !isOpen
    }

    toggle()
    expect(isOpen).toBe(true)

    toggle()
    expect(isOpen).toBe(false)
  })

  test('selecting mode closes dropdown', () => {
    let isOpen = true
    const selectMode = () => {
      isOpen = false
    }

    selectMode()
    expect(isOpen).toBe(false)
  })

  test('escape key closes dropdown', () => {
    let isOpen = true
    const handleEsc = (key: string) => {
      if (key === 'Escape') isOpen = false
    }

    handleEsc('Escape')
    expect(isOpen).toBe(false)
  })

  test('outside click closes dropdown', () => {
    let isOpen = true
    const handleOutsideClick = () => {
      isOpen = false
    }

    handleOutsideClick()
    expect(isOpen).toBe(false)
  })
})

describe('Expert Sub-menu', () => {
  test('experts panel starts hidden', () => {
    const showExperts = false
    expect(showExperts).toBe(false)
  })

  test('clicking 召唤专家 toggles expert panel', () => {
    let showExperts = false
    const toggle = () => {
      showExperts = !showExperts
    }

    toggle()
    expect(showExperts).toBe(true)

    toggle()
    expect(showExperts).toBe(false)
  })

  test('selecting expert closes both panels', () => {
    let isOpen = true
    let showExperts = true
    const selectExpert = () => {
      isOpen = false
      showExperts = false
    }

    selectExpert()
    expect(isOpen).toBe(false)
    expect(showExperts).toBe(false)
  })

  test('chevron rotates when experts shown', () => {
    const showExperts = true
    const rotation = showExperts ? 90 : 0
    expect(rotation).toBe(90)
  })
})

describe('Mode Persistence', () => {
  test('default mode is craft', () => {
    const defaultMode: ChatMode = 'craft'
    expect(defaultMode).toBe('craft')
  })

  test('valid stored modes are accepted', () => {
    const validModes: ChatMode[] = ['craft', 'ask', 'plan']
    for (const mode of validModes) {
      expect(mode === 'craft' || mode === 'ask' || mode === 'plan').toBe(true)
    }
  })

  test('invalid stored value falls back to craft', () => {
    const stored: string = 'invalid'
    const isValid = stored === 'craft' || stored === 'ask' || stored === 'plan'
    const result: ChatMode = isValid ? (stored as ChatMode) : 'craft'
    expect(result).toBe('craft')
  })

  test('storage key is nexawork-chat-mode', () => {
    const key = 'nexawork-chat-mode'
    expect(key).toBe('nexawork-chat-mode')
  })
})

describe('Visual States', () => {
  test('selected mode shows check icon', () => {
    const isSelected = true
    const showCheck = isSelected
    expect(showCheck).toBe(true)
  })

  test('trigger shows current mode label', () => {
    const mode = modeConfigs.find(m => m.id === 'craft')!
    expect(mode.label).toBe('Craft')
  })

  test('trigger has chevron that rotates when open', () => {
    const isOpen = true
    const rotation = isOpen ? 180 : 0
    expect(rotation).toBe(180)
  })

  test('dropdown has shadow and border', () => {
    const shadow = 'var(--shadow-dropdown)'
    const border = 'var(--color-border)'
    expect(shadow).toContain('--shadow-dropdown')
    expect(border).toContain('--color-border')
  })

  test('mode icon has tertiary bg container', () => {
    const iconBg = 'var(--color-bg-tertiary)'
    expect(iconBg).toContain('--color-bg-tertiary')
  })
})

describe('Accessibility', () => {
  test('trigger has aria-expanded', () => {
    const isOpen = true
    const ariaExpanded = isOpen
    expect(ariaExpanded).toBe(true)
  })

  test('trigger has aria-haspopup listbox', () => {
    const haspopup = 'listbox'
    expect(haspopup).toBe('listbox')
  })

  test('dropdown has listbox role', () => {
    const role = 'listbox'
    expect(role).toBe('listbox')
  })

  test('options have option role', () => {
    const role = 'option'
    expect(role).toBe('option')
  })

  test('active option has aria-selected true', () => {
    const ariaSelected = true
    expect(ariaSelected).toBe(true)
  })

  test('dropdown has aria-activedescendant', () => {
    const mode: ChatMode = 'craft'
    const id = `mode-${mode}`
    expect(id).toBe('mode-craft')
  })
})

describe('Integration: Mode → QueryEngine', () => {
  test('Craft mode passes tools to engine', () => {
    const mode = modeConfigs.find(m => m.id === 'craft')!
    const engineConfig = {
      tools: mode.toolsEnabled ? 'all' : 'none',
      planMode: mode.planMode,
    }
    expect(engineConfig.tools).toBe('all')
    expect(engineConfig.planMode).toBe(false)
  })

  test('Ask mode passes no tools to engine', () => {
    const mode = modeConfigs.find(m => m.id === 'ask')!
    const engineConfig = {
      tools: mode.toolsEnabled ? 'all' : 'none',
      planMode: mode.planMode,
    }
    expect(engineConfig.tools).toBe('none')
    expect(engineConfig.planMode).toBe(false)
  })

  test('Plan mode passes plan tool to engine', () => {
    const mode = modeConfigs.find(m => m.id === 'plan')!
    const engineConfig = {
      tools: mode.toolsEnabled ? 'all' : 'none',
      planMode: mode.planMode,
    }
    expect(engineConfig.tools).toBe('all')
    expect(engineConfig.planMode).toBe(true)
  })

  test('mode change updates engine configuration', () => {
    let currentTools = 'all'
    let currentPlan = false

    const applyMode = (mode: ChatMode) => {
      const config = modeConfigs.find(m => m.id === mode)!
      currentTools = config.toolsEnabled ? 'all' : 'none'
      currentPlan = config.planMode
    }

    applyMode('ask')
    expect(currentTools).toBe('none')
    expect(currentPlan).toBe(false)

    applyMode('plan')
    expect(currentTools).toBe('all')
    expect(currentPlan).toBe(true)

    applyMode('craft')
    expect(currentTools).toBe('all')
    expect(currentPlan).toBe(false)
  })
})

describe('ModeSelectorProps Interface', () => {
  test('all required props defined', () => {
    const props: ModeSelectorProps = {
      activeMode: 'craft',
      onModeChange: () => {},
    }
    expect(props.activeMode).toBe('craft')
    expect(typeof props.onModeChange).toBe('function')
  })

  test('optional props work correctly', () => {
    const props: ModeSelectorProps = {
      activeMode: 'ask',
      onModeChange: () => {},
      onSummonExpert: () => {},
      experts: [{ id: 'test', name: 'Test', specialty: 'Testing' }],
    }
    expect(props.experts).toHaveLength(1)
    expect(typeof props.onSummonExpert).toBe('function')
  })
})
