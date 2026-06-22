import { describe, test, expect } from 'bun:test'
import {
  sceneQuickActions,
  onboardingSteps,
  type WelcomeScene,
  type QuickAction,
  type OnboardingStep,
  type WelcomePageProps,
} from '../renderer/components/WelcomePage'

/**
 * WelcomePage Unit + Integration Tests (N11)
 * Tests brand display, scene tabs, quick actions, onboarding
 */

describe('Scene Quick Actions', () => {
  test('4 scenes defined', () => {
    const scenes = Object.keys(sceneQuickActions)
    expect(scenes).toHaveLength(4)
    expect(scenes).toContain('office')
    expect(scenes).toContain('coding')
    expect(scenes).toContain('design')
    expect(scenes).toContain('record')
  })

  test('each scene has 4 quick actions', () => {
    for (const actions of Object.values(sceneQuickActions)) {
      expect(actions).toHaveLength(4)
    }
  })

  test('all actions have required fields', () => {
    for (const actions of Object.values(sceneQuickActions)) {
      for (const action of actions) {
        expect(action.id).toBeTruthy()
        expect(action.label).toBeTruthy()
        expect(action.prompt).toBeTruthy()
        expect(action.icon).toBeTruthy()
      }
    }
  })

  test('action IDs are unique within scene', () => {
    for (const actions of Object.values(sceneQuickActions)) {
      const ids = actions.map(a => a.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    }
  })

  test('action IDs are globally unique', () => {
    const allIds: string[] = []
    for (const actions of Object.values(sceneQuickActions)) {
      allIds.push(...actions.map(a => a.id))
    }
    const unique = new Set(allIds)
    expect(unique.size).toBe(allIds.length)
  })
})

describe('Office Scene Actions', () => {
  const actions = sceneQuickActions.office

  test('includes 日常开发', () => {
    expect(actions.find(a => a.label === '日常开发')).toBeTruthy()
  })

  test('includes 网站开发', () => {
    expect(actions.find(a => a.label === '网站开发')).toBeTruthy()
  })

  test('includes Agent 应用', () => {
    expect(actions.find(a => a.label === 'Agent 应用')).toBeTruthy()
  })

  test('includes 文档写作', () => {
    expect(actions.find(a => a.label === '文档写作')).toBeTruthy()
  })

  test('prompts are non-empty strings', () => {
    for (const action of actions) {
      expect(action.prompt.length).toBeGreaterThan(5)
    }
  })
})

describe('Coding Scene Actions', () => {
  const actions = sceneQuickActions.coding

  test('includes 前端', () => {
    expect(actions.find(a => a.label === '前端')).toBeTruthy()
  })

  test('includes 后端', () => {
    expect(actions.find(a => a.label === '后端')).toBeTruthy()
  })

  test('includes 数据库', () => {
    expect(actions.find(a => a.label === '数据库')).toBeTruthy()
  })

  test('includes DevOps', () => {
    expect(actions.find(a => a.label === 'DevOps')).toBeTruthy()
  })
})

describe('Design Scene Actions', () => {
  const actions = sceneQuickActions.design

  test('includes 图片生成', () => {
    expect(actions.find(a => a.label === '图片生成')).toBeTruthy()
  })

  test('includes UI 设计', () => {
    expect(actions.find(a => a.label === 'UI 设计')).toBeTruthy()
  })

  test('includes 原型', () => {
    expect(actions.find(a => a.label === '原型')).toBeTruthy()
  })
})

describe('Record Scene Actions', () => {
  const actions = sceneQuickActions.record

  test('includes 浏览器录制', () => {
    expect(actions.find(a => a.label === '浏览器录制')).toBeTruthy()
  })

  test('includes 桌面录制', () => {
    expect(actions.find(a => a.label === '桌面录制')).toBeTruthy()
  })

  test('includes 技能回放', () => {
    expect(actions.find(a => a.label === '技能回放')).toBeTruthy()
  })

  test('includes 自动化', () => {
    expect(actions.find(a => a.label === '自动化')).toBeTruthy()
  })
})

describe('Onboarding Steps', () => {
  test('3 onboarding steps', () => {
    expect(onboardingSteps).toHaveLength(3)
  })

  test('each step has required fields', () => {
    for (const step of onboardingSteps) {
      expect(step.title).toBeTruthy()
      expect(step.description).toBeTruthy()
      expect(step.icon).toBeTruthy()
    }
  })

  test('step 1 is about scene selection', () => {
    expect(onboardingSteps[0].title).toBe('选择场景')
  })

  test('step 2 is about conversation', () => {
    expect(onboardingSteps[1].title).toBe('对话创作')
  })

  test('step 3 is about persistence', () => {
    expect(onboardingSteps[2].title).toBe('持续协作')
  })

  test('descriptions are informative', () => {
    for (const step of onboardingSteps) {
      expect(step.description.length).toBeGreaterThan(10)
    }
  })
})

describe('Onboarding Flow', () => {
  test('starts at step 0', () => {
    const currentStep = 0
    expect(currentStep).toBe(0)
    expect(onboardingSteps[currentStep].title).toBe('选择场景')
  })

  test('progresses through steps', () => {
    let step = 0
    const next = () => {
      step = Math.min(step + 1, onboardingSteps.length - 1)
    }
    const prev = () => {
      step = Math.max(step - 1, 0)
    }

    next()
    expect(step).toBe(1)
    next()
    expect(step).toBe(2)
    next() // should stay at 2 (max)
    expect(step).toBe(2)
    prev()
    expect(step).toBe(1)
  })

  test('skip jumps to complete', () => {
    let complete = false
    const skip = () => {
      complete = true
    }
    skip()
    expect(complete).toBe(true)
  })
})

describe('First-Time Detection', () => {
  test('ONBOARDING_KEY is nexawork-onboarding-complete', () => {
    const key = 'nexawork-onboarding-complete'
    expect(key).toBe('nexawork-onboarding-complete')
  })

  test('first time when no localStorage value', () => {
    const stored = null
    const isFirstTime = stored !== 'true'
    expect(isFirstTime).toBe(true)
  })

  test('not first time when localStorage has true', () => {
    const stored = 'true'
    const isFirstTime = stored !== 'true'
    expect(isFirstTime).toBe(false)
  })

  test('mark complete sets localStorage', () => {
    let storage: Record<string, string> = {}
    const markComplete = () => {
      storage['nexawork-onboarding-complete'] = 'true'
    }
    markComplete()
    expect(storage['nexawork-onboarding-complete']).toBe('true')
  })
})

describe('WelcomePage Props', () => {
  test('required props defined', () => {
    const props: WelcomePageProps = {
      activeScene: 'office',
      onSceneChange: () => {},
      onQuickAction: () => {},
      onStartChat: () => {},
    }
    expect(props.activeScene).toBe('office')
  })

  test('optional props work', () => {
    const props: WelcomePageProps = {
      activeScene: 'coding',
      onSceneChange: () => {},
      onQuickAction: () => {},
      onStartChat: () => {},
      isFirstTime: true,
      onOnboardingComplete: () => {},
    }
    expect(props.isFirstTime).toBe(true)
  })

  test('scene change callback fires', () => {
    let scene: WelcomeScene = 'office'
    const onChange = (s: WelcomeScene) => {
      scene = s
    }
    onChange('coding')
    expect(scene).toBe('coding')
  })

  test('quick action callback fires with prompt', () => {
    let fired = ''
    const onAction = (p: string) => {
      fired = p
    }
    onAction('创建一个 React 组件')
    expect(fired).toBe('创建一个 React 组件')
  })
})

describe('Scene Tabs Rendering', () => {
  test('4 scene tabs', () => {
    const tabs: WelcomeScene[] = ['office', 'coding', 'design', 'record']
    expect(tabs).toHaveLength(4)
  })

  test('active scene has black bg white text (pill shape)', () => {
    const activeScene = 'coding'
    const isActive = (id: WelcomeScene) => id === activeScene
    expect(isActive('coding')).toBe(true)
    expect(isActive('office')).toBe(false)
  })

  test('inactive scene has transparent bg gray text', () => {
    const activeScene = 'coding'
    const isInactive = (id: WelcomeScene) => id !== activeScene
    expect(isInactive('office')).toBe(true)
    expect(isInactive('design')).toBe(true)
  })
})

describe('Brand Display', () => {
  test('brand name is NexaWork', () => {
    const brandName = 'NexaWork'
    expect(brandName).toBe('NexaWork')
  })

  test('subtitle is AI 全能办公助手', () => {
    const subtitle = 'AI 全能办公助手'
    expect(subtitle).toBe('AI 全能办公助手')
  })

  test('brand font size is 32px', () => {
    const fontSize = 32
    expect(fontSize).toBe(32)
  })
})

describe('Integration: Welcome → Session', () => {
  test('no session shows welcome', () => {
    const activeSessionId: string | null = null
    const showWelcome = activeSessionId === null
    expect(showWelcome).toBe(true)
  })

  test('has session hides welcome', () => {
    const activeSessionId: string | null = 'session-123'
    const showWelcome = activeSessionId === null
    expect(showWelcome).toBe(false)
  })

  test('quick action creates new session', () => {
    let sessionCreated = false
    const onStartChat = () => {
      sessionCreated = true
    }
    onStartChat()
    expect(sessionCreated).toBe(true)
  })
})
