import { describe, test, expect } from 'bun:test'
import {
  emptyAddForm,
  validateAddForm,
  isAddFormValid,
  addFormToCreateInput,
  templateToAddForm,
  availableConnectors,
  type AddAutomationForm,
} from '../renderer/components/AddAutomationDialog'

const valid: AddAutomationForm = {
  ...emptyAddForm,
  name: '每日报表',
  prompt: '汇总昨日数据',
}

describe('validateAddForm', () => {
  test('valid form has no errors', () => {
    expect(validateAddForm(valid)).toHaveLength(0)
    expect(isAddFormValid(valid)).toBe(true)
  })

  test('empty form requires name and prompt', () => {
    const errors = validateAddForm(emptyAddForm)
    expect(errors).toContain('请填写任务名称')
    expect(errors).toContain('请填写提示词')
    expect(isAddFormValid(emptyAddForm)).toBe(false)
  })

  test('whitespace-only name is invalid', () => {
    expect(validateAddForm({ ...valid, name: '   ' })).toContain(
      '请填写任务名称',
    )
  })

  test('weekly recurrence without weekdays is invalid', () => {
    expect(
      validateAddForm({ ...valid, recurringUnit: 'weekly', weekdays: [] }),
    ).toContain('请至少选择一个星期')
  })

  test('interval out of range is invalid', () => {
    expect(
      validateAddForm({
        ...valid,
        scheduleMode: 'interval',
        intervalValue: 0,
        intervalUnit: 'hour',
      }),
    ).toContain('间隔需为正整数')
  })

  test('once without a date is invalid', () => {
    expect(
      validateAddForm({ ...valid, scheduleMode: 'once', onceDate: '' }),
    ).toContain('请选择执行日期')
  })
})

describe('addFormToCreateInput', () => {
  test('recurring daily builds cron and trims text', () => {
    const input = addFormToCreateInput({
      ...valid,
      name: '  报表  ',
      prompt: '  做事  ',
      time: '08:30',
    })
    expect(input.name).toBe('报表')
    expect(input.prompt).toBe('做事')
    expect(input.cron).toBe('30 8 * * *')
  })

  test('blank workspace falls back to default', () => {
    expect(addFormToCreateInput({ ...valid, workspace: '' }).workspace).toBe(
      '默认工作区',
    )
    expect(
      addFormToCreateInput({ ...valid, workspace: ' 运维 ' }).workspace,
    ).toBe('运维')
  })

  test('once mode pins start/end date to the run date', () => {
    const input = addFormToCreateInput({
      ...valid,
      scheduleMode: 'once',
      onceDate: '2026-06-01',
      onceTime: '09:00',
    })
    expect(input.cron).toBe('0 9 1 6 *')
    expect(input.startDate).toBe('2026-06-01')
    expect(input.endDate).toBe('2026-06-01')
  })

  test('recurring carries valid date range when provided', () => {
    const input = addFormToCreateInput({
      ...valid,
      startDate: '2026-06-01',
      endDate: '2026-12-31',
    })
    expect(input.startDate).toBe('2026-06-01')
    expect(input.endDate).toBe('2026-12-31')
  })

  test('optional execution context only set when non-default', () => {
    const bare = addFormToCreateInput(valid)
    expect(bare.connector).toBeUndefined()
    expect(bare.model).toBeUndefined()
    expect(bare.skill).toBeUndefined()
    expect(bare.expert).toBeUndefined()
    expect(bare.permissionMode).toBeUndefined()

    const full = addFormToCreateInput({
      ...valid,
      connector: 'github',
      model: 'claude-sonnet',
      skill: 'skill-x',
      expert: 'frontend-expert',
      permissionMode: 'full',
    })
    expect(full.connector).toBe('github')
    expect(full.model).toBe('claude-sonnet')
    expect(full.skill).toBe('skill-x')
    expect(full.expert).toBe('frontend-expert')
    expect(full.permissionMode).toBe('full')
  })

  test('auto model is treated as default (omitted)', () => {
    expect(
      addFormToCreateInput({ ...valid, model: 'auto' }).model,
    ).toBeUndefined()
  })
})

describe('templateToAddForm', () => {
  test('daily template prefills daily recurrence + time', () => {
    const form = templateToAddForm({
      name: 'T',
      prompt: 'P',
      workspace: 'W',
      cron: '0 8 * * *',
    })
    expect(form.name).toBe('T')
    expect(form.prompt).toBe('P')
    expect(form.workspace).toBe('W')
    expect(form.scheduleMode).toBe('recurring')
    expect(form.recurringUnit).toBe('daily')
    expect(form.time).toBe('08:00')
  })

  test('weekly range template prefills weekday set', () => {
    const form = templateToAddForm({
      name: 'T',
      prompt: 'P',
      workspace: 'W',
      cron: '30 18 * * 1-5',
    })
    expect(form.recurringUnit).toBe('weekly')
    expect(form.weekdays).toEqual([1, 2, 3, 4, 5])
    expect(form.time).toBe('18:30')
  })

  test('round-trips back to the same cron via addFormToCreateInput', () => {
    const form = templateToAddForm({
      name: 'T',
      prompt: 'P',
      workspace: 'W',
      cron: '0 9 * * 1',
    })
    expect(addFormToCreateInput(form).cron).toBe('0 9 * * 1')
  })
})

describe('availableConnectors', () => {
  test('first option is the empty (none) connector', () => {
    expect(availableConnectors[0].id).toBe('')
    expect(availableConnectors.length).toBeGreaterThan(1)
  })
})
