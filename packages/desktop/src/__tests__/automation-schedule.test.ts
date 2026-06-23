import { describe, test, expect } from 'bun:test'
import {
  parseTime,
  parseDate,
  buildCron,
  validateSchedule,
  describeSchedule,
  type ScheduleSpec,
} from '../shared/automation-schedule'
import { cronMatches } from '../shared/cron'

const base: ScheduleSpec = {
  mode: 'recurring',
  recurringUnit: 'daily',
  weekdays: [1, 2, 3, 4, 5],
  time: '08:00',
  intervalValue: 1,
  intervalUnit: 'hour',
  onceDate: '2026-06-01',
  onceTime: '09:30',
}

describe('parseTime', () => {
  test('parses valid HH:MM', () => {
    expect(parseTime('08:05')).toEqual({ hour: 8, minute: 5 })
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 })
  })

  test('rejects out-of-range and malformed', () => {
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('08:60')).toBeNull()
    expect(parseTime('abc')).toBeNull()
    expect(parseTime('')).toBeNull()
  })
})

describe('parseDate', () => {
  test('parses valid YYYY-MM-DD', () => {
    expect(parseDate('2026-06-01')).toEqual({ year: 2026, month: 6, day: 1 })
  })

  test('rejects malformed and out-of-range', () => {
    expect(parseDate('2026-13-01')).toBeNull()
    expect(parseDate('2026-06-32')).toBeNull()
    expect(parseDate('06-01-2026')).toBeNull()
  })
})

describe('buildCron — recurring', () => {
  test('daily maps to "M H * * *"', () => {
    expect(buildCron({ ...base, recurringUnit: 'daily', time: '08:30' })).toBe(
      '30 8 * * *',
    )
  })

  test('weekly maps to sorted, deduped day list', () => {
    expect(
      buildCron({
        ...base,
        recurringUnit: 'weekly',
        weekdays: [5, 1, 1, 3],
        time: '09:00',
      }),
    ).toBe('0 9 * * 1,3,5')
  })

  test('weekly with no days is invalid', () => {
    expect(
      buildCron({ ...base, recurringUnit: 'weekly', weekdays: [] }),
    ).toBeNull()
  })

  test('invalid time is null', () => {
    expect(buildCron({ ...base, time: '99:99' })).toBeNull()
  })

  test('produced daily cron actually matches the target time', () => {
    const cron = buildCron({ ...base, recurringUnit: 'daily', time: '08:30' })
    expect(cron).not.toBeNull()
    const at = new Date(2026, 5, 1, 8, 30)
    expect(cronMatches(cron as string, at)).toBe(true)
    expect(cronMatches(cron as string, new Date(2026, 5, 1, 8, 31))).toBe(false)
  })
})

describe('buildCron — interval', () => {
  test('minutes', () => {
    expect(
      buildCron({
        ...base,
        mode: 'interval',
        intervalValue: 15,
        intervalUnit: 'minute',
      }),
    ).toBe('*/15 * * * *')
  })

  test('hours', () => {
    expect(
      buildCron({
        ...base,
        mode: 'interval',
        intervalValue: 2,
        intervalUnit: 'hour',
      }),
    ).toBe('0 */2 * * *')
  })

  test('days', () => {
    expect(
      buildCron({
        ...base,
        mode: 'interval',
        intervalValue: 3,
        intervalUnit: 'day',
      }),
    ).toBe('0 0 */3 * *')
  })

  test('rejects < 1 and out-of-range per unit', () => {
    expect(
      buildCron({
        ...base,
        mode: 'interval',
        intervalValue: 0,
        intervalUnit: 'hour',
      }),
    ).toBeNull()
    expect(
      buildCron({
        ...base,
        mode: 'interval',
        intervalValue: 60,
        intervalUnit: 'minute',
      }),
    ).toBeNull()
    expect(
      buildCron({
        ...base,
        mode: 'interval',
        intervalValue: 1.5,
        intervalUnit: 'hour',
      }),
    ).toBeNull()
  })
})

describe('buildCron — once', () => {
  test('maps date+time to a specific minute/hour/day/month', () => {
    expect(
      buildCron({
        ...base,
        mode: 'once',
        onceDate: '2026-06-01',
        onceTime: '09:30',
      }),
    ).toBe('30 9 1 6 *')
  })

  test('invalid date or time is null', () => {
    expect(
      buildCron({ ...base, mode: 'once', onceDate: '', onceTime: '09:30' }),
    ).toBeNull()
    expect(
      buildCron({
        ...base,
        mode: 'once',
        onceDate: '2026-06-01',
        onceTime: '',
      }),
    ).toBeNull()
  })
})

describe('validateSchedule', () => {
  test('valid recurring/interval/once return null', () => {
    expect(
      validateSchedule({ ...base, mode: 'recurring', recurringUnit: 'daily' }),
    ).toBeNull()
    expect(
      validateSchedule({
        ...base,
        mode: 'interval',
        intervalValue: 5,
        intervalUnit: 'minute',
      }),
    ).toBeNull()
    expect(validateSchedule({ ...base, mode: 'once' })).toBeNull()
  })

  test('weekly without days errors', () => {
    expect(
      validateSchedule({
        ...base,
        mode: 'recurring',
        recurringUnit: 'weekly',
        weekdays: [],
      }),
    ).toBe('请至少选择一个星期')
  })

  test('interval out of range errors', () => {
    expect(
      validateSchedule({
        ...base,
        mode: 'interval',
        intervalValue: 0,
        intervalUnit: 'hour',
      }),
    ).toBe('间隔需为正整数')
    expect(
      validateSchedule({
        ...base,
        mode: 'interval',
        intervalValue: 100,
        intervalUnit: 'minute',
      }),
    ).toContain('间隔最大为')
  })

  test('once without date errors', () => {
    expect(validateSchedule({ ...base, mode: 'once', onceDate: '' })).toBe(
      '请选择执行日期',
    )
  })
})

describe('describeSchedule', () => {
  test('daily / weekly / interval / once', () => {
    expect(
      describeSchedule({ ...base, recurringUnit: 'daily', time: '08:00' }),
    ).toBe('每天 08:00')
    expect(
      describeSchedule({
        ...base,
        recurringUnit: 'weekly',
        weekdays: [1, 3],
        time: '09:00',
      }),
    ).toBe('每周一、三 09:00')
    expect(
      describeSchedule({
        ...base,
        mode: 'interval',
        intervalValue: 2,
        intervalUnit: 'hour',
      }),
    ).toBe('每 2 小时')
    expect(
      describeSchedule({
        ...base,
        mode: 'once',
        onceDate: '2026-06-01',
        onceTime: '09:30',
      }),
    ).toBe('2026-06-01 09:30 执行一次')
  })
})
