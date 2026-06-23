import { describe, test, expect } from 'bun:test'
import type { AutomationInfo } from '../shared/ipc-channels'
import {
  splitAutomations,
  scheduledDotColor,
  validateAutomationForm,
  isFormValid,
  toCreateInput,
  automationTemplates,
  emptyForm,
  type AutomationForm,
} from '../renderer/components/AutomationPanel'

function make(
  id: string,
  status: AutomationInfo['status'],
  extra: Partial<AutomationInfo> = {},
): AutomationInfo {
  return {
    id,
    name: id,
    prompt: 'p',
    cron: '0 8 * * *',
    workspace: 'ws',
    status,
    ...extra,
  }
}

describe('splitAutomations', () => {
  test('groups active/paused into scheduled and completed separately', () => {
    const list = [
      make('a', 'active'),
      make('b', 'paused'),
      make('c', 'completed'),
      make('d', 'active'),
    ]
    const { scheduled, completed } = splitAutomations(list)
    expect(scheduled.map(a => a.id)).toEqual(['a', 'b', 'd'])
    expect(completed.map(a => a.id)).toEqual(['c'])
  })

  test('empty input', () => {
    const { scheduled, completed } = splitAutomations([])
    expect(scheduled).toHaveLength(0)
    expect(completed).toHaveLength(0)
  })
})

describe('scheduledDotColor', () => {
  test('active is green, paused is orange', () => {
    expect(scheduledDotColor('active')).toBe('var(--color-accent-green)')
    expect(scheduledDotColor('paused')).toBe('var(--color-accent-orange)')
  })
})

describe('validateAutomationForm', () => {
  const valid: AutomationForm = {
    name: 'Daily Report',
    prompt: 'generate report',
    cron: '0 8 * * *',
    workspace: '产品开发',
    startDate: '',
    endDate: '',
  }

  test('valid form has no errors', () => {
    expect(validateAutomationForm(valid)).toHaveLength(0)
    expect(isFormValid(valid)).toBe(true)
  })

  test('missing name', () => {
    expect(validateAutomationForm({ ...valid, name: '  ' })).toContain(
      '请填写任务名称',
    )
  })

  test('missing prompt', () => {
    expect(validateAutomationForm({ ...valid, prompt: '' })).toContain(
      '请填写任务指令',
    )
  })

  test('invalid cron arity', () => {
    expect(validateAutomationForm({ ...valid, cron: '0 8 * *' })).toContain(
      'Cron 表达式需为 5 段',
    )
  })

  test('missing workspace', () => {
    expect(validateAutomationForm({ ...valid, workspace: '' })).toContain(
      '请选择关联空间',
    )
  })

  test('empty form is invalid', () => {
    expect(isFormValid(emptyForm)).toBe(false)
  })
})

describe('toCreateInput', () => {
  test('trims fields and omits empty dates', () => {
    const input = toCreateInput({
      name: '  X  ',
      prompt: '  do  ',
      cron: ' 0 8 * * * ',
      workspace: ' ws ',
      startDate: '',
      endDate: '',
    })
    expect(input).toEqual({
      name: 'X',
      prompt: 'do',
      cron: '0 8 * * *',
      workspace: 'ws',
      startDate: undefined,
      endDate: undefined,
    })
  })

  test('keeps provided dates', () => {
    const input = toCreateInput({
      name: 'X',
      prompt: 'do',
      cron: '0 8 * * *',
      workspace: 'ws',
      startDate: '2026-06-01',
      endDate: '2026-12-31',
    })
    expect(input.startDate).toBe('2026-06-01')
    expect(input.endDate).toBe('2026-12-31')
  })
})

describe('automationTemplates', () => {
  test('every template carries a valid 5-field cron and required fields', () => {
    expect(automationTemplates.length).toBeGreaterThan(0)
    for (const tpl of automationTemplates) {
      expect(tpl.id).toBeTruthy()
      expect(tpl.name).toBeTruthy()
      expect(tpl.prompt).toBeTruthy()
      expect(tpl.workspace).toBeTruthy()
      expect(tpl.cron.trim().split(/\s+/)).toHaveLength(5)
    }
  })

  test('template ids are unique', () => {
    const ids = automationTemplates.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
