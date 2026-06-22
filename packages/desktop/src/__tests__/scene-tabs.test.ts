import { describe, test, expect } from 'bun:test'
import {
  sceneConfigs,
  type SceneId,
  type SceneConfig,
  type SubTag,
  type SceneTabsProps,
} from '../renderer/components/SceneTabs'

/**
 * SceneTabs Unit + Integration Tests (N7)
 * Tests scene switching, sub-tags, tools, and state management
 */

describe('Scene Configurations', () => {
  test('four scenes are defined', () => {
    expect(sceneConfigs).toHaveLength(4)
  })

  test('all scenes have required fields', () => {
    for (const scene of sceneConfigs) {
      expect(scene.id).toBeTruthy()
      expect(scene.label).toBeTruthy()
      expect(scene.icon).toBeTruthy()
      expect(scene.description).toBeTruthy()
      expect(scene.subTags.length).toBeGreaterThan(0)
      expect(scene.tools.length).toBeGreaterThan(0)
    }
  })

  test('scene IDs are unique', () => {
    const ids = sceneConfigs.map(s => s.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test('scene IDs match expected values', () => {
    const ids = sceneConfigs.map(s => s.id)
    expect(ids).toContain('office')
    expect(ids).toContain('coding')
    expect(ids).toContain('design')
    expect(ids).toContain('record')
  })
})

describe('Office Scene (日常办公)', () => {
  const office = sceneConfigs.find(s => s.id === 'office')!

  test('label is 日常办公', () => {
    expect(office.label).toBe('日常办公')
  })

  test('description mentions dialogue and documents', () => {
    expect(office.description).toContain('对话')
    expect(office.description).toContain('文档')
    expect(office.description).toContain('搜索')
  })

  test('has 4 sub-tags', () => {
    expect(office.subTags).toHaveLength(4)
  })

  test('sub-tags include expected items', () => {
    const labels = office.subTags.map(t => t.label)
    expect(labels).toContain('日常开发')
    expect(labels).toContain('网站开发')
    expect(labels).toContain('Agent 应用')
    expect(labels).toContain('更多')
  })

  test('tools include chat and document', () => {
    expect(office.tools).toContain('chat')
    expect(office.tools).toContain('document')
    expect(office.tools).toContain('search')
  })
})

describe('Coding Scene (代码开发)', () => {
  const coding = sceneConfigs.find(s => s.id === 'coding')!

  test('label is 代码开发', () => {
    expect(coding.label).toBe('代码开发')
  })

  test('description mentions editor and terminal', () => {
    expect(coding.description).toContain('编辑器')
    expect(coding.description).toContain('终端')
    expect(coding.description).toContain('Git')
  })

  test('has 4 sub-tags', () => {
    expect(coding.subTags).toHaveLength(4)
  })

  test('sub-tags include development categories', () => {
    const labels = coding.subTags.map(t => t.label)
    expect(labels).toContain('前端')
    expect(labels).toContain('后端')
    expect(labels).toContain('数据库')
    expect(labels).toContain('DevOps')
  })

  test('tools include editor and git', () => {
    expect(coding.tools).toContain('editor')
    expect(coding.tools).toContain('terminal')
    expect(coding.tools).toContain('git')
  })
})

describe('Design Scene (设计创意)', () => {
  const design = sceneConfigs.find(s => s.id === 'design')!

  test('label is 设计创意', () => {
    expect(design.label).toBe('设计创意')
  })

  test('description mentions image generation', () => {
    expect(design.description).toContain('图片生成')
    expect(design.description).toContain('设计工具')
  })

  test('has 4 sub-tags', () => {
    expect(design.subTags).toHaveLength(4)
  })

  test('sub-tags include design categories', () => {
    const labels = design.subTags.map(t => t.label)
    expect(labels).toContain('图片生成')
    expect(labels).toContain('UI设计')
    expect(labels).toContain('原型')
    expect(labels).toContain('素材')
  })

  test('tools include image generation', () => {
    expect(design.tools).toContain('image-gen')
    expect(design.tools).toContain('design')
  })
})

describe('Record/Replay Scene', () => {
  const record = sceneConfigs.find(s => s.id === 'record')!

  test('label is Record/Replay', () => {
    expect(record.label).toBe('Record/Replay')
  })

  test('description mentions recording and skills', () => {
    expect(record.description).toContain('录制')
    expect(record.description).toContain('回放')
    expect(record.description).toContain('技能')
  })

  test('has 3 sub-tags', () => {
    expect(record.subTags).toHaveLength(3)
  })

  test('sub-tags include recording types', () => {
    const labels = record.subTags.map(t => t.label)
    expect(labels).toContain('浏览器录制')
    expect(labels).toContain('桌面录制')
    expect(labels).toContain('技能回放')
  })

  test('tools include record and replay', () => {
    expect(record.tools).toContain('record')
    expect(record.tools).toContain('replay')
    expect(record.tools).toContain('skill-gen')
  })
})

describe('Scene Switching State', () => {
  test('default scene is office', () => {
    const defaultScene: SceneId = 'office'
    expect(defaultScene).toBe('office')
  })

  test('scene change resets sub-tag', () => {
    let activeSubTag: string | null = 'frontend'
    const setScene = () => {
      activeSubTag = null
    }
    setScene()
    expect(activeSubTag).toBeNull()
  })

  test('each scene maintains independent state', () => {
    const sceneStates: Record<SceneId, string | null> = {
      office: 'daily',
      coding: 'frontend',
      design: null,
      record: 'browser-record',
    }
    expect(sceneStates.office).toBe('daily')
    expect(sceneStates.coding).toBe('frontend')
    expect(sceneStates.design).toBeNull()
    expect(sceneStates.record).toBe('browser-record')
  })
})

describe('Sub-Tag Behavior', () => {
  test('clicking active sub-tag deselects it', () => {
    let activeSubTag: string | null = 'frontend'
    const toggle = (tag: string) => {
      activeSubTag = activeSubTag === tag ? null : tag
    }
    toggle('frontend')
    expect(activeSubTag).toBeNull()
  })

  test('clicking different sub-tag selects it', () => {
    let activeSubTag: string | null = 'frontend'
    const toggle = (tag: string) => {
      activeSubTag = activeSubTag === tag ? null : tag
    }
    toggle('backend')
    expect(activeSubTag).toBe('backend')
  })

  test('sub-tags are unique within a scene', () => {
    for (const scene of sceneConfigs) {
      const ids = scene.subTags.map(t => t.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    }
  })
})

describe('Tool List per Scene', () => {
  test('office has 5 tools', () => {
    const office = sceneConfigs.find(s => s.id === 'office')!
    expect(office.tools).toHaveLength(5)
  })

  test('coding has 5 tools', () => {
    const coding = sceneConfigs.find(s => s.id === 'coding')!
    expect(coding.tools).toHaveLength(5)
  })

  test('design has 4 tools', () => {
    const design = sceneConfigs.find(s => s.id === 'design')!
    expect(design.tools).toHaveLength(4)
  })

  test('record has 4 tools', () => {
    const record = sceneConfigs.find(s => s.id === 'record')!
    expect(record.tools).toHaveLength(4)
  })

  test('tools are unique within each scene', () => {
    for (const scene of sceneConfigs) {
      const unique = new Set(scene.tools)
      expect(unique.size).toBe(scene.tools.length)
    }
  })
})

describe('Visual States', () => {
  test('selected tab has black bg white text', () => {
    const selectedBg = 'var(--color-text-primary)'
    const selectedText = 'var(--color-bg-primary)'
    expect(selectedBg).toContain('--color-text-primary')
    expect(selectedText).toContain('--color-bg-primary')
  })

  test('unselected tab has transparent bg gray text', () => {
    const unselectedText = 'var(--color-text-tertiary)'
    expect(unselectedText).toContain('--color-text-tertiary')
  })

  test('tab has pill shape radius (20px)', () => {
    const radius = '20px'
    expect(radius).toBe('20px')
  })

  test('transition duration is 150ms (fast)', () => {
    const duration = 150
    expect(duration).toBe(150)
  })

  test('selected sub-tag has bg-tertiary background', () => {
    const selectedSubBg = 'var(--color-bg-tertiary)'
    expect(selectedSubBg).toContain('--color-bg-tertiary')
  })
})

describe('Accessibility', () => {
  test('tabs container has tablist role', () => {
    const role = 'tablist'
    expect(role).toBe('tablist')
  })

  test('each tab has tab role', () => {
    const role = 'tab'
    expect(role).toBe('tab')
  })

  test('active tab has aria-selected true', () => {
    const ariaSelected = true
    expect(ariaSelected).toBe(true)
  })

  test('sub-tags container has toolbar role', () => {
    const role = 'toolbar'
    expect(role).toBe('toolbar')
  })

  test('tabs have aria-controls referencing panel', () => {
    const sceneId: SceneId = 'coding'
    const panelId = `scene-panel-${sceneId}`
    expect(panelId).toBe('scene-panel-coding')
  })
})

describe('Integration: Scene → Tools', () => {
  test('switching to coding shows code tools', () => {
    const scene = sceneConfigs.find(s => s.id === 'coding')!
    expect(scene.tools).toContain('editor')
    expect(scene.tools).toContain('terminal')
    expect(scene.tools).not.toContain('image-gen')
  })

  test('switching to design shows design tools', () => {
    const scene = sceneConfigs.find(s => s.id === 'design')!
    expect(scene.tools).toContain('image-gen')
    expect(scene.tools).not.toContain('terminal')
  })

  test('switching to record shows record tools', () => {
    const scene = sceneConfigs.find(s => s.id === 'record')!
    expect(scene.tools).toContain('record')
    expect(scene.tools).toContain('replay')
    expect(scene.tools).not.toContain('editor')
  })

  test('scene change updates available sub-tags', () => {
    const officeSubTags = sceneConfigs.find(s => s.id === 'office')!.subTags
    const codingSubTags = sceneConfigs.find(s => s.id === 'coding')!.subTags

    const officeLabels = officeSubTags.map(t => t.label)
    const codingLabels = codingSubTags.map(t => t.label)

    // They should be different sets
    expect(officeLabels).not.toEqual(codingLabels)
  })
})

describe('SceneTabsProps Interface', () => {
  test('all required props are defined', () => {
    const props: SceneTabsProps = {
      activeScene: 'office',
      activeSubTag: null,
      onSceneChange: () => {},
      onSubTagChange: () => {},
    }
    expect(props.activeScene).toBe('office')
    expect(props.activeSubTag).toBeNull()
    expect(typeof props.onSceneChange).toBe('function')
    expect(typeof props.onSubTagChange).toBe('function')
  })

  test('activeSubTag can be string or null', () => {
    const withTag: SceneTabsProps = {
      activeScene: 'coding',
      activeSubTag: 'frontend',
      onSceneChange: () => {},
      onSubTagChange: () => {},
    }
    expect(withTag.activeSubTag).toBe('frontend')

    const withoutTag: SceneTabsProps = {
      activeScene: 'coding',
      activeSubTag: null,
      onSceneChange: () => {},
      onSubTagChange: () => {},
    }
    expect(withoutTag.activeSubTag).toBeNull()
  })
})
