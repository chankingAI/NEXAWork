/**
 * Schedule helpers (N18/N19) — unit tests
 * Covers serialize/parse round-trips, next-run computation, human labels,
 * countdown formatting, date-range formatting, and validity windows.
 */
import { describe, test, expect } from 'bun:test'
import {
  serializeSchedule,
  parseSchedule,
  computeNextRun,
  formatSchedule,
  formatScheduleString,
  formatCountdown,
  formatDateRange,
  isWithinValidRange,
  isValidTime,
  type ScheduleConfig,
} from '../shared/schedule'

describe('isValidTime', () => {
  test('accepts valid 24h times', () => {
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('08:30')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
  })
  test('rejects invalid times', () => {
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('8:30')).toBe(false)
    expect(isValidTime('12:60')).toBe(false)
    expect(isValidTime('')).toBe(false)
  })
})

describe('serialize/parse round-trip', () => {
  const cases: ScheduleConfig[] = [
    { type: 'periodic', unit: 'day', time: '08:00' },
    { type: 'periodic', unit: 'week', weekday: 3, time: '15:30' },
    { type: 'interval', every: 5, unit: 'minute' },
    { type: 'interval', every: 2, unit: 'hour' },
    { type: 'once', at: '2026-06-23T15:21:00.000Z' },
  ]
  for (const config of cases) {
    test(`round-trips ${JSON.stringify(config)}`, () => {
      const serialized = serializeSchedule(config)
      const parsed = parseSchedule(serialized)
      expect(parsed).toEqual(config)
    })
  }

  test('daily serialized format', () => {
    expect(
      serializeSchedule({ type: 'periodic', unit: 'day', time: '08:00' }),
    ).toBe('P|day|08:00')
  })
  test('weekly serialized format', () => {
    expect(
      serializeSchedule({
        type: 'periodic',
        unit: 'week',
        weekday: 1,
        time: '09:00',
      }),
    ).toBe('P|week|1|09:00')
  })
  test('interval serialized format', () => {
    expect(serializeSchedule({ type: 'interval', every: 3, unit: 'day' })).toBe(
      'I|3|day',
    )
  })
  test('once serialized format', () => {
    expect(
      serializeSchedule({ type: 'once', at: '2026-01-01T00:00:00.000Z' }),
    ).toBe('O|2026-01-01T00:00:00.000Z')
  })
})

describe('parseSchedule rejects malformed input', () => {
  test('empty string → null', () => {
    expect(parseSchedule('')).toBeNull()
  })
  test('unknown kind → null', () => {
    expect(parseSchedule('X|whatever')).toBeNull()
  })
  test('bad interval unit → null', () => {
    expect(parseSchedule('I|5|year')).toBeNull()
  })
  test('bad interval count → null', () => {
    expect(parseSchedule('I|0|minute')).toBeNull()
  })
  test('bad weekday → null', () => {
    expect(parseSchedule('P|week|9|08:00')).toBeNull()
  })
  test('bad once timestamp → null', () => {
    expect(parseSchedule('O|not-a-date')).toBeNull()
  })
})

describe('computeNextRun', () => {
  test('daily — same day if time is later', () => {
    const from = new Date('2026-06-23T06:00:00')
    const next = computeNextRun(
      { type: 'periodic', unit: 'day', time: '08:00' },
      from,
    )
    expect(next?.getHours()).toBe(8)
    expect(next?.getDate()).toBe(23)
  })
  test('daily — next day if time already passed', () => {
    const from = new Date('2026-06-23T09:00:00')
    const next = computeNextRun(
      { type: 'periodic', unit: 'day', time: '08:00' },
      from,
    )
    expect(next?.getDate()).toBe(24)
  })
  test('interval — adds the step', () => {
    const from = new Date('2026-06-23T09:00:00.000Z')
    const next = computeNextRun(
      { type: 'interval', every: 30, unit: 'minute' },
      from,
    )
    expect(next?.getTime()).toBe(from.getTime() + 30 * 60_000)
  })
  test('once — future returns the instant, past returns null', () => {
    const from = new Date('2026-06-23T09:00:00.000Z')
    expect(
      computeNextRun(
        { type: 'once', at: '2026-06-23T10:00:00.000Z' },
        from,
      )?.toISOString(),
    ).toBe('2026-06-23T10:00:00.000Z')
    expect(
      computeNextRun({ type: 'once', at: '2026-06-23T08:00:00.000Z' }, from),
    ).toBeNull()
  })
  test('weekly — lands on the correct weekday', () => {
    // 2026-06-23 is a Tuesday (getDay() === 2).
    const from = new Date('2026-06-23T09:00:00')
    const next = computeNextRun(
      { type: 'periodic', unit: 'week', weekday: 5, time: '10:00' },
      from,
    )
    expect(next?.getDay()).toBe(5)
  })
})

describe('formatSchedule labels', () => {
  test('daily', () => {
    expect(
      formatSchedule({ type: 'periodic', unit: 'day', time: '08:00' }),
    ).toBe('每天 08:00')
  })
  test('weekly', () => {
    expect(
      formatSchedule({
        type: 'periodic',
        unit: 'week',
        weekday: 1,
        time: '15:30',
      }),
    ).toBe('每周一 15:30')
  })
  test('interval', () => {
    expect(formatSchedule({ type: 'interval', every: 2, unit: 'hour' })).toBe(
      '每2小时',
    )
  })
  test('formatScheduleString falls back to raw on bad input', () => {
    expect(formatScheduleString('garbage')).toBe('garbage')
    expect(formatScheduleString('P|day|08:00')).toBe('每天 08:00')
  })
})

describe('formatCountdown', () => {
  const now = new Date('2026-06-23T09:00:00.000Z')
  test('no target → dash', () => {
    expect(formatCountdown(undefined, now)).toBe('—')
  })
  test('past → 已过期', () => {
    expect(formatCountdown('2026-06-23T08:00:00.000Z', now)).toBe('已过期')
  })
  test('minutes', () => {
    expect(formatCountdown('2026-06-23T09:30:00.000Z', now)).toBe(
      '30分钟后开始',
    )
  })
  test('hours', () => {
    expect(formatCountdown('2026-06-23T13:00:00.000Z', now)).toBe('4小时后开始')
  })
  test('hours + minutes', () => {
    expect(formatCountdown('2026-06-23T13:30:00.000Z', now)).toBe(
      '4小时30分钟后开始',
    )
  })
  test('days', () => {
    expect(formatCountdown('2026-06-25T09:00:00.000Z', now)).toBe('2天后开始')
  })
})

describe('formatDateRange', () => {
  test('both open-ended', () => {
    expect(formatDateRange(undefined, undefined)).toBe('长期有效')
  })
  test('with bounds', () => {
    expect(
      formatDateRange('2026-06-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'),
    ).toContain('~')
  })
})

describe('isWithinValidRange', () => {
  const now = new Date('2026-06-23T09:00:00.000Z')
  test('open range always valid', () => {
    expect(isWithinValidRange(undefined, undefined, now)).toBe(true)
  })
  test('before start → invalid', () => {
    expect(isWithinValidRange('2026-06-24T00:00:00.000Z', undefined, now)).toBe(
      false,
    )
  })
  test('after end → invalid', () => {
    expect(isWithinValidRange(undefined, '2026-06-22T00:00:00.000Z', now)).toBe(
      false,
    )
  })
  test('within → valid', () => {
    expect(
      isWithinValidRange(
        '2026-06-01T00:00:00.000Z',
        '2026-06-30T00:00:00.000Z',
        now,
      ),
    ).toBe(true)
  })
})
