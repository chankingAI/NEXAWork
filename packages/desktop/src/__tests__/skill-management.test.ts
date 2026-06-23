import { describe, test, expect } from 'bun:test'
import {
  managementTabs,
  importMethods,
  installSteps,
  nextInstallStep,
  getInstalledSkills,
  getMarketSkills,
  getCreatedSkills,
  validateDraft,
  isDraftValid,
  emptyDraft,
  type CreateSkillDraft,
} from '../renderer/components/SkillManagementPage'
import {
  defaultSkills,
  type MarketSkill,
} from '../renderer/components/SkillSearchPanel'

/**
 * SkillManagementPage Unit Tests (N16)
 * Tests tabs, import methods, install flow, filtering, and draft validation.
 */

describe('Management Tabs', () => {
  test('three tabs defined', () => {
    expect(managementTabs.map(t => t.id)).toEqual([
      'installed',
      'market',
      'created',
    ])
  })

  test('all tabs have labels and icons', () => {
    for (const tab of managementTabs) {
      expect(tab.label).toBeTruthy()
      expect(tab.icon).toBeTruthy()
    }
  })
})

describe('Import Methods', () => {
  test('file/url/git supported', () => {
    expect(importMethods.map(m => m.id)).toEqual(['file', 'url', 'git'])
  })

  test('each has placeholder', () => {
    for (const m of importMethods) {
      expect(m.placeholder).toBeTruthy()
    }
  })
})

describe('Install Flow', () => {
  test('four ordered steps', () => {
    expect(installSteps).toEqual(['select', 'permissions', 'confirm', 'done'])
  })

  test('nextInstallStep advances', () => {
    expect(nextInstallStep('select')).toBe('permissions')
    expect(nextInstallStep('permissions')).toBe('confirm')
    expect(nextInstallStep('confirm')).toBe('done')
  })

  test('nextInstallStep clamps at done', () => {
    expect(nextInstallStep('done')).toBe('done')
  })
})

describe('Skill Filtering', () => {
  test('installed includes bundled + installed sources', () => {
    const installed = getInstalledSkills(defaultSkills)
    expect(
      installed.every(s => s.source === 'installed' || s.source === 'bundled'),
    ).toBe(true)
  })

  test('market is only available source', () => {
    const market = getMarketSkills(defaultSkills)
    expect(market.every(s => s.source === 'available')).toBe(true)
  })

  test('created matches fromRecorder or custom id', () => {
    const skills: MarketSkill[] = [
      ...defaultSkills,
      { ...defaultSkills[0], id: 'custom-123', fromRecorder: false },
      { ...defaultSkills[0], id: 'rec-1', fromRecorder: true },
    ]
    const created = getCreatedSkills(skills)
    expect(created.some(s => s.id === 'custom-123')).toBe(true)
    expect(created.some(s => s.id === 'rec-1')).toBe(true)
  })
})

describe('Draft Validation', () => {
  test('empty draft is invalid', () => {
    expect(isDraftValid(emptyDraft)).toBe(false)
    expect(validateDraft(emptyDraft)).toContain('name')
    expect(validateDraft(emptyDraft)).toContain('description')
    expect(validateDraft(emptyDraft)).toContain('instruction')
  })

  test('trigger is optional', () => {
    const draft: CreateSkillDraft = {
      name: 'My Skill',
      description: 'Does things',
      trigger: '',
      instruction: 'Do the thing',
    }
    expect(isDraftValid(draft)).toBe(true)
    expect(validateDraft(draft)).toHaveLength(0)
  })

  test('whitespace-only fields are invalid', () => {
    const draft: CreateSkillDraft = {
      name: '   ',
      description: 'ok',
      trigger: '',
      instruction: 'ok',
    }
    expect(validateDraft(draft)).toContain('name')
  })
})
