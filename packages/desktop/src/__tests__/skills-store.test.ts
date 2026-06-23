import { describe, test, expect, beforeEach } from 'bun:test'
import { useAppStore } from '../renderer/store/appStore'
import {
  defaultSkills,
  resolveSkillSource,
} from '../renderer/components/skillCatalog'

/**
 * Skill store tests (N15)
 *
 * Verifies the Zustand skill slice: hydration (loadSkills), category/search
 * state, enable/disable toggling, and the import flow. Runs without a DOM, so
 * window.nexawork is undefined and the store exercises its offline fallbacks
 * (deterministic default catalog + locally synthesised import).
 */

function resetSkills() {
  useAppStore.setState(
    {
      skillList: defaultSkills.map(s => ({ ...s })),
      skillCategory: 'builtin',
      skillSearchQuery: '',
      selectedSkillId: null,
      skillImporting: false,
      skillImportMessage: null,
    },
    false,
  )
}

beforeEach(() => {
  resetSkills()
})

describe('Skill store: actions exist', () => {
  test('exposes the N15 skill actions', () => {
    const s = useAppStore.getState()
    expect(typeof s.loadSkills).toBe('function')
    expect(typeof s.setSkillCategory).toBe('function')
    expect(typeof s.setSkillSearchQuery).toBe('function')
    expect(typeof s.selectSkill).toBe('function')
    expect(typeof s.toggleSkill).toBe('function')
    expect(typeof s.importSkill).toBe('function')
  })
})

describe('Skill store: hydration', () => {
  test('loadSkills falls back to the default catalog without IPC', async () => {
    useAppStore.setState({ skillList: [] }, false)
    await useAppStore.getState().loadSkills()
    expect(useAppStore.getState().skillList.length).toBe(defaultSkills.length)
  })

  test('initial state seeds skills and defaults to builtin tier', () => {
    expect(useAppStore.getState().skillList.length).toBeGreaterThan(0)
    expect(useAppStore.getState().skillCategory).toBe('builtin')
  })
})

describe('Skill store: category + search', () => {
  test('setSkillCategory switches tier and clears the selection', () => {
    useAppStore.getState().selectSkill('skill-web-search')
    useAppStore.getState().setSkillCategory('available')
    expect(useAppStore.getState().skillCategory).toBe('available')
    expect(useAppStore.getState().selectedSkillId).toBeNull()
  })

  test('setSkillSearchQuery stores the query', () => {
    useAppStore.getState().setSkillSearchQuery('brave')
    expect(useAppStore.getState().skillSearchQuery).toBe('brave')
  })
})

describe('Skill store: enable / disable', () => {
  test('toggleSkill flips the enabled flag for the right skill', () => {
    useAppStore.getState().toggleSkill('skill-web-search', false)
    const skill = useAppStore
      .getState()
      .skillList.find(s => s.id === 'skill-web-search')!
    expect(skill.enabled).toBe(false)

    useAppStore.getState().toggleSkill('skill-web-search', true)
    expect(
      useAppStore.getState().skillList.find(s => s.id === 'skill-web-search')!
        .enabled,
    ).toBe(true)
  })

  test('toggleSkill leaves other skills untouched', () => {
    const before = useAppStore
      .getState()
      .skillList.find(s => s.id === 'skill-file-edit')!.enabled
    useAppStore.getState().toggleSkill('skill-web-search', false)
    expect(
      useAppStore.getState().skillList.find(s => s.id === 'skill-file-edit')!
        .enabled,
    ).toBe(before)
  })
})

describe('Skill store: selection', () => {
  test('selectSkill sets and clears the selected id', () => {
    useAppStore.getState().selectSkill('skill-code-run')
    expect(useAppStore.getState().selectedSkillId).toBe('skill-code-run')
    useAppStore.getState().selectSkill(null)
    expect(useAppStore.getState().selectedSkillId).toBeNull()
  })
})

describe('Skill store: import', () => {
  test('importSkill (offline) appends an installed skill and reports success', async () => {
    const before = useAppStore.getState().skillList.length
    const result = await useAppStore
      .getState()
      .importSkill('https://github.com/owner/cool-skill.git', 'repo')

    expect(result.success).toBe(true)
    const state = useAppStore.getState()
    expect(state.skillList.length).toBe(before + 1)
    expect(state.skillCategory).toBe('installed')
    expect(state.skillImporting).toBe(false)
    expect(state.skillImportMessage).toBeTruthy()

    const imported = state.skillList.find(s => s.id === result.skillId)!
    expect(imported.name).toBe('cool-skill')
    expect(resolveSkillSource(imported)).toBe('installed')
  })

  test('importSkill derives a clean name from a file path', async () => {
    const result = await useAppStore
      .getState()
      .importSkill('/tmp/my-skill.zip', 'file')
    const imported = useAppStore
      .getState()
      .skillList.find(s => s.id === result.skillId)!
    expect(imported.name).toBe('my-skill')
  })

  test('importSkill rejects an empty source', async () => {
    const before = useAppStore.getState().skillList.length
    const result = await useAppStore.getState().importSkill('   ', 'url')
    expect(result.success).toBe(false)
    expect(useAppStore.getState().skillList.length).toBe(before)
  })

  test('clearSkillImportMessage resets the banner', () => {
    useAppStore.setState({ skillImportMessage: '已导入' }, false)
    useAppStore.getState().clearSkillImportMessage()
    expect(useAppStore.getState().skillImportMessage).toBeNull()
  })
})
