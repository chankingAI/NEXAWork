import { describe, test, expect } from 'bun:test'
import type { ProjectInfo } from '../shared/ipc-channels'
import {
  projectTemplates,
  templateIcon,
  templateToWizardForm,
  emptyWizardForm,
  isWizardStepValid,
  wizardToCreateInput,
  filterProjects,
  formatCreatedAt,
  WIZARD_STEPS,
  WIZARD_STEP_COUNT,
  type WizardForm,
} from '../renderer/components/ProjectPage'

function proj(id: string, extra: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    id,
    name: id,
    description: '',
    path: `~/${id}`,
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

describe('projectTemplates', () => {
  test('exposes 6 templates with required fields', () => {
    expect(projectTemplates).toHaveLength(6)
    for (const tpl of projectTemplates) {
      expect(tpl.id).toBeTruthy()
      expect(tpl.name).toBeTruthy()
      expect(tpl.description).toBeTruthy()
      expect(tpl.preset).toBeTruthy()
    }
  })

  test('template ids are unique', () => {
    const ids = projectTemplates.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('covers the prompt-specified templates', () => {
    const names = projectTemplates.map(t => t.name)
    expect(names).toContain('产品需求全流程')
    expect(names).toContain('市场调研与竞品分析')
    expect(names).toContain('团队知识库')
    expect(names).toContain('项目交付')
    expect(names.some(n => n.includes('Bug'))).toBe(true)
  })
})

describe('templateIcon', () => {
  test('returns a component for every known template id', () => {
    for (const tpl of projectTemplates) {
      expect(templateIcon(tpl.id)).toBeDefined()
    }
  })

  test('falls back for unknown / undefined ids', () => {
    expect(templateIcon(undefined)).toBeDefined()
    expect(templateIcon('nope')).toBeDefined()
  })
})

describe('templateToWizardForm', () => {
  test('prefills template id and preset description, leaves name empty', () => {
    const tpl = projectTemplates[0]
    const form = templateToWizardForm(tpl)
    expect(form.template).toBe(tpl.id)
    expect(form.description).toBe(tpl.preset)
    expect(form.name).toBe('')
  })
})

describe('isWizardStepValid', () => {
  const base: WizardForm = { ...emptyWizardForm }

  test('step 1 (template/blank) is always valid', () => {
    expect(isWizardStepValid(1, base)).toBe(true)
    expect(isWizardStepValid(1, { ...base, template: 'tpl-prd-flow' })).toBe(
      true,
    )
  })

  test('step 2 requires a name', () => {
    expect(isWizardStepValid(2, { ...base, name: '' })).toBe(false)
    expect(isWizardStepValid(2, { ...base, name: '   ' })).toBe(false)
    expect(isWizardStepValid(2, { ...base, name: 'X' })).toBe(true)
  })

  test('step 3 requires a path', () => {
    expect(isWizardStepValid(3, { ...base, path: '' })).toBe(false)
    expect(isWizardStepValid(3, { ...base, path: '~/p' })).toBe(true)
  })

  test('step 4 (confirm) requires both name and path', () => {
    expect(isWizardStepValid(4, { ...base, name: 'X', path: '' })).toBe(false)
    expect(isWizardStepValid(4, { ...base, name: '', path: '~/p' })).toBe(false)
    expect(isWizardStepValid(4, { ...base, name: 'X', path: '~/p' })).toBe(true)
  })

  test('unknown step is invalid', () => {
    expect(isWizardStepValid(99, { ...base, name: 'X', path: '~/p' })).toBe(
      false,
    )
  })

  test('WIZARD_STEPS has WIZARD_STEP_COUNT entries (4)', () => {
    expect(WIZARD_STEPS).toHaveLength(WIZARD_STEP_COUNT)
    expect(WIZARD_STEP_COUNT).toBe(4)
  })
})

describe('wizardToCreateInput', () => {
  test('trims fields and forwards template + initGit', () => {
    const input = wizardToCreateInput({
      template: 'tpl-prd-flow',
      name: '  App  ',
      description: '  desc  ',
      path: '  ~/app  ',
      initGit: true,
    })
    expect(input).toEqual({
      name: 'App',
      description: 'desc',
      template: 'tpl-prd-flow',
      path: '~/app',
      initGit: true,
    })
  })

  test('blank project has undefined template', () => {
    const input = wizardToCreateInput({
      ...emptyWizardForm,
      name: 'B',
      path: '~/b',
    })
    expect(input.template).toBeUndefined()
  })
})

describe('filterProjects', () => {
  const list = [
    proj('alpha', { name: 'Alpha Service', description: 'auth' }),
    proj('beta', { name: 'Beta', description: 'payment gateway' }),
  ]

  test('empty query returns all', () => {
    expect(filterProjects(list, '')).toHaveLength(2)
    expect(filterProjects(list, '   ')).toHaveLength(2)
  })

  test('matches name or description, case-insensitive', () => {
    expect(filterProjects(list, 'ALPHA').map(p => p.id)).toEqual(['alpha'])
    expect(filterProjects(list, 'gateway').map(p => p.id)).toEqual(['beta'])
    expect(filterProjects(list, 'zzz')).toHaveLength(0)
  })
})

describe('formatCreatedAt', () => {
  test('formats ISO to YYYY-MM-DD', () => {
    expect(formatCreatedAt('2026-06-23T08:30:00.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })

  test('returns raw input for an unparseable value', () => {
    expect(formatCreatedAt('not-a-date')).toBe('not-a-date')
  })
})
