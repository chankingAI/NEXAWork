/**
 * NexaWork automation schedule helpers (N19) — shared between the renderer
 * AddAutomationDialog and the cron-backed AutomationManager.
 *
 * Converts the three add-automation frequency modes (周期 / 按间隔 / 单次) into a
 * 5-field cron expression, and validates the form's schedule portion. Pure and
 * dependency-free so both processes and the test suite can use it.
 */

export type ScheduleMode = 'recurring' | 'interval' | 'once'
export type RecurringUnit = 'daily' | 'weekly'
export type IntervalUnit = 'minute' | 'hour' | 'day'

export interface ScheduleSpec {
  mode: ScheduleMode
  // recurring
  recurringUnit: RecurringUnit
  /** Selected weekdays for weekly recurrence (0 = Sunday … 6 = Saturday). */
  weekdays: number[]
  /** "HH:MM" time for recurring schedules. */
  time: string
  // interval
  intervalValue: number
  intervalUnit: IntervalUnit
  // once
  /** "YYYY-MM-DD" date for a one-shot schedule. */
  onceDate: string
  /** "HH:MM" time for a one-shot schedule. */
  onceTime: string
}

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const INTERVAL_UNIT_LABEL: Record<IntervalUnit, string> = {
  minute: '分钟',
  hour: '小时',
  day: '天',
}

const INTERVAL_UNIT_MAX: Record<IntervalUnit, number> = {
  minute: 59,
  hour: 23,
  day: 31,
}

/** Parse a "HH:MM" string into numeric fields, or null when malformed. */
export function parseTime(
  time: string,
): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(time.trim())
  if (!match) return null
  const hour = Number.parseInt(match[1], 10)
  const minute = Number.parseInt(match[2], 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/** Parse a "YYYY-MM-DD" string into numeric fields, or null when malformed. */
export function parseDate(
  date: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim())
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/**
 * Build a 5-field cron expression from a schedule spec.
 * Returns null when the spec is incomplete or invalid.
 */
export function buildCron(spec: ScheduleSpec): string | null {
  if (spec.mode === 'recurring') {
    const t = parseTime(spec.time)
    if (!t) return null
    if (spec.recurringUnit === 'daily') {
      return `${t.minute} ${t.hour} * * *`
    }
    // weekly
    const days = Array.from(new Set(spec.weekdays)).filter(
      d => Number.isInteger(d) && d >= 0 && d <= 6,
    )
    if (days.length === 0) return null
    days.sort((a, b) => a - b)
    return `${t.minute} ${t.hour} * * ${days.join(',')}`
  }

  if (spec.mode === 'interval') {
    const n = spec.intervalValue
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > INTERVAL_UNIT_MAX[spec.intervalUnit]
    ) {
      return null
    }
    if (spec.intervalUnit === 'minute') return `*/${n} * * * *`
    if (spec.intervalUnit === 'hour') return `0 */${n} * * *`
    return `0 0 */${n} * *`
  }

  // once
  const t = parseTime(spec.onceTime)
  const d = parseDate(spec.onceDate)
  if (!t || !d) return null
  return `${t.minute} ${t.hour} ${d.day} ${d.month} *`
}

/** Validate the schedule portion; returns an error message or null when valid. */
export function validateSchedule(spec: ScheduleSpec): string | null {
  if (spec.mode === 'recurring') {
    if (!parseTime(spec.time)) return '请选择有效的执行时间'
    if (spec.recurringUnit === 'weekly' && spec.weekdays.length === 0) {
      return '请至少选择一个星期'
    }
    return null
  }
  if (spec.mode === 'interval') {
    const n = spec.intervalValue
    if (!Number.isInteger(n) || n < 1) return '间隔需为正整数'
    if (n > INTERVAL_UNIT_MAX[spec.intervalUnit]) {
      return `间隔最大为 ${INTERVAL_UNIT_MAX[spec.intervalUnit]} ${INTERVAL_UNIT_LABEL[spec.intervalUnit]}`
    }
    return null
  }
  // once
  if (!parseDate(spec.onceDate)) return '请选择执行日期'
  if (!parseTime(spec.onceTime)) return '请选择执行时间'
  return null
}

/** Human-readable Chinese summary of the schedule spec. */
export function describeSchedule(spec: ScheduleSpec): string {
  if (spec.mode === 'recurring') {
    if (spec.recurringUnit === 'daily') return `每天 ${spec.time}`
    const days = Array.from(new Set(spec.weekdays))
      .filter(d => d >= 0 && d <= 6)
      .sort((a, b) => a - b)
    if (days.length === 0) return `每周 ${spec.time}`
    return `每周${days.map(d => WEEKDAY_LABELS[d]).join('、')} ${spec.time}`
  }
  if (spec.mode === 'interval') {
    return `每 ${spec.intervalValue} ${INTERVAL_UNIT_LABEL[spec.intervalUnit]}`
  }
  return `${spec.onceDate} ${spec.onceTime} 执行一次`
}
