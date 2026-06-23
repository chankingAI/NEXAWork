/**
 * AddAutomationDialog (N19) — form logic unit tests
 * buildScheduleConfig / validateAutomationForm / toCreateInput / emptyForm.
 */
import { describe, test, expect } from 'bun:test'
import {
  emptyForm,
  buildScheduleConfig,
  validateAutomationForm,
  toCreateInput,
  type AutomationFormState,
} from '../renderer/components/AddAutomationDialog'
import { parseSchedule } from '../shared/schedule'

function form(over: Partial<AutomationFormState> = {}): AutomationFormState {
  return { ...emptyForm(), ...over }
}

describe('buildScheduleConfig', () => {
  test('periodic daily', () => {
    expect(
      buildScheduleConfig(
        form({ kind: 'periodic', periodicUnit: 'day', time: '08:00' }),
      ),
    ).toEqual({
      type: 'periodic',
      unit: 'day',
      time: '08:00',
    })
  })
  test('periodic weekly', () => {
    expect(
      buildScheduleConfig(
        form({
          kind: 'periodic',
          periodicUnit: 'week',
          weekday: 3,
          time: '09:30',
        }),
      ),
    ).toEqual({ type: 'periodic', unit: 'week', weekday: 3, time: '09:30' })
  })
  test('periodic with invalid time → null', () => {
    expect(
      buildScheduleConfig(form({ kind: 'periodic', time: '99:99' })),
    ).toBeNull()
  })
  test('interval', () => {
    expect(
      buildScheduleConfig(
        form({ kind: 'interval', intervalEvery: 5, intervalUnit: 'minute' }),
      ),
    ).toEqual({ type: 'interval', every: 5, unit: 'minute' })
  })
  test('interval with non-positive count → null', () => {
    expect(
      buildScheduleConfig(form({ kind: 'interval', intervalEvery: 0 })),
    ).toBeNull()
  })
  test('once with valid datetime', () => {
    const config = buildScheduleConfig(
      form({ kind: 'once', onceAt: '2026-06-23T10:00' }),
    )
    expect(config?.type).toBe('once')
  })
  test('once empty → null', () => {
    expect(buildScheduleConfig(form({ kind: 'once', onceAt: '' }))).toBeNull()
  })
})

describe('validateAutomationForm', () => {
  test('valid form → no errors', () => {
    const errors = validateAutomationForm(
      form({ name: 'Daily', prompt: 'do it', kind: 'periodic', time: '08:00' }),
    )
    expect(Object.keys(errors)).toHaveLength(0)
  })
  test('missing name', () => {
    expect(
      validateAutomationForm(form({ name: '', prompt: 'x' })).name,
    ).toBeDefined()
  })
  test('missing prompt', () => {
    expect(
      validateAutomationForm(form({ name: 'x', prompt: '' })).prompt,
    ).toBeDefined()
  })
  test('invalid schedule', () => {
    expect(
      validateAutomationForm(
        form({ name: 'x', prompt: 'y', kind: 'once', onceAt: '' }),
      ).schedule,
    ).toBeDefined()
  })
  test('whitespace-only name is invalid', () => {
    expect(
      validateAutomationForm(form({ name: '   ', prompt: 'y' })).name,
    ).toBeDefined()
  })
})

describe('toCreateInput', () => {
  test('produces a serialized payload that round-trips through parseSchedule', () => {
    const payload = toCreateInput(
      form({
        name: '  Daily  ',
        prompt: '  hello  ',
        workspace: ' /ws ',
        connector: ' mcp ',
        kind: 'periodic',
        periodicUnit: 'day',
        time: '08:00',
      }),
    )
    expect(payload).not.toBeNull()
    expect(payload!.name).toBe('Daily') // trimmed
    expect(payload!.prompt).toBe('hello')
    expect(payload!.workspace).toBe('/ws')
    expect(payload!.connector).toBe('mcp')
    expect(parseSchedule(payload!.cron)).toEqual({
      type: 'periodic',
      unit: 'day',
      time: '08:00',
    })
  })

  test('converts date range to ISO', () => {
    const payload = toCreateInput(
      form({
        name: 'x',
        prompt: 'y',
        startDate: '2026-06-23',
        endDate: '2026-07-23',
      }),
    )
    expect(payload!.startDate).toContain('2026-06-23')
    expect(payload!.endDate).toContain('2026-07-23')
  })

  test('invalid schedule → null', () => {
    expect(
      toCreateInput(form({ name: 'x', prompt: 'y', kind: 'once', onceAt: '' })),
    ).toBeNull()
  })

  test('empty connector becomes undefined', () => {
    const payload = toCreateInput(
      form({ name: 'x', prompt: 'y', connector: '' }),
    )
    expect(payload!.connector).toBeUndefined()
  })
})
