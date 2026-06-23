/**
 * NexaWork Schedule System
 * ========================
 * Pure, dependency-free helpers shared by the main-process scheduler and the
 * renderer UI. A schedule is serialized into the `AutomationInfo.cron` string
 * so it round-trips through IPC and persistence without a separate field.
 *
 * Serialized formats (pipe-delimited, stable):
 *   periodic:  "P|day|HH:MM"            → every day at HH:MM
 *              "P|week|<weekday>|HH:MM"  → weekday 0..6 (0 = Sunday)
 *   interval:  "I|<n>|minute|hour|day"  → every n units
 *   once:      "O|<ISO-8601>"           → single run at the given instant
 */

export type ScheduleKind = 'periodic' | 'interval' | 'once'
export type PeriodicUnit = 'day' | 'week'
export type IntervalUnit = 'minute' | 'hour' | 'day'

export interface PeriodicSchedule {
  type: 'periodic'
  unit: PeriodicUnit
  /** 24h "HH:MM" local time. */
  time: string
  /** 0..6 (0 = Sunday); required when unit === 'week'. */
  weekday?: number
}

export interface IntervalSchedule {
  type: 'interval'
  every: number
  unit: IntervalUnit
}

export interface OnceSchedule {
  type: 'once'
  /** ISO-8601 timestamp of the single execution. */
  at: string
}

export type ScheduleConfig = PeriodicSchedule | IntervalSchedule | OnceSchedule

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const INTERVAL_UNIT_LABELS: Record<IntervalUnit, string> = {
  minute: '分钟',
  hour: '小时',
  day: '天',
}

const INTERVAL_UNIT_MS: Record<IntervalUnit, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
}

// ─── Validation ───────────────────────────────────────────────
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time)
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

// ─── Serialize ────────────────────────────────────────────────
export function serializeSchedule(config: ScheduleConfig): string {
  switch (config.type) {
    case 'periodic':
      if (config.unit === 'week') {
        return `P|week|${config.weekday ?? 1}|${config.time}`
      }
      return `P|day|${config.time}`
    case 'interval':
      return `I|${config.every}|${config.unit}`
    case 'once':
      return `O|${config.at}`
  }
}

// ─── Parse ────────────────────────────────────────────────────
export function parseSchedule(serialized: string): ScheduleConfig | null {
  if (!serialized) return null
  const parts = serialized.split('|')
  switch (parts[0]) {
    case 'P': {
      if (parts[1] === 'week') {
        const weekday = Number(parts[2])
        const time = parts[3]
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
          return null
        if (!isValidTime(time)) return null
        return { type: 'periodic', unit: 'week', weekday, time }
      }
      if (parts[1] === 'day') {
        const time = parts[2]
        if (!isValidTime(time)) return null
        return { type: 'periodic', unit: 'day', time }
      }
      return null
    }
    case 'I': {
      const every = Number(parts[1])
      const unit = parts[2] as IntervalUnit
      if (!Number.isFinite(every) || every <= 0) return null
      if (unit !== 'minute' && unit !== 'hour' && unit !== 'day') return null
      return { type: 'interval', every, unit }
    }
    case 'O': {
      const at = parts.slice(1).join('|')
      if (!at || Number.isNaN(Date.parse(at))) return null
      return { type: 'once', at }
    }
    default:
      return null
  }
}

// ─── Compute next run ─────────────────────────────────────────
/**
 * Returns the next execution instant strictly after `from`, or `null` when the
 * schedule has no future occurrence (e.g. a one-shot that already fired).
 */
export function computeNextRun(
  config: ScheduleConfig,
  from: Date = new Date(),
): Date | null {
  switch (config.type) {
    case 'once': {
      const at = new Date(config.at)
      return at.getTime() > from.getTime() ? at : null
    }
    case 'interval': {
      const step = config.every * INTERVAL_UNIT_MS[config.unit]
      if (step <= 0) return null
      return new Date(from.getTime() + step)
    }
    case 'periodic': {
      const [h, m] = config.time.split(':').map(Number)
      const next = new Date(from)
      next.setSeconds(0, 0)
      next.setHours(h, m, 0, 0)
      if (config.unit === 'day') {
        if (next.getTime() <= from.getTime()) {
          next.setDate(next.getDate() + 1)
        }
        return next
      }
      // weekly
      const targetDow = config.weekday ?? 1
      let dayDelta = (targetDow - next.getDay() + 7) % 7
      if (dayDelta === 0 && next.getTime() <= from.getTime()) {
        dayDelta = 7
      }
      next.setDate(next.getDate() + dayDelta)
      return next
    }
  }
}

// ─── Human-readable schedule label ────────────────────────────
export function formatSchedule(config: ScheduleConfig): string {
  switch (config.type) {
    case 'periodic':
      if (config.unit === 'week') {
        return `每${WEEKDAY_LABELS[config.weekday ?? 1]} ${config.time}`
      }
      return `每天 ${config.time}`
    case 'interval':
      return `每${config.every}${INTERVAL_UNIT_LABELS[config.unit]}`
    case 'once': {
      const d = new Date(config.at)
      return `单次 ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
        d.getDate(),
      )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    }
  }
}

/** Convenience: format directly from a serialized string. */
export function formatScheduleString(serialized: string): string {
  const config = parseSchedule(serialized)
  return config ? formatSchedule(config) : serialized
}

// ─── Countdown to next run ────────────────────────────────────
/**
 * Returns a short Chinese countdown such as "4小时后开始" / "2分钟后开始".
 * Returns "已过期" when the target is in the past, and "—" when no target.
 */
export function formatCountdown(
  nextRun: string | undefined | null,
  now: Date = new Date(),
): string {
  if (!nextRun) return '—'
  const target = new Date(nextRun).getTime()
  if (Number.isNaN(target)) return '—'
  const diff = target - now.getTime()
  if (diff <= 0) return '已过期'

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '不到1分钟后开始'
  if (minutes < 60) return `${minutes}分钟后开始`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remMin = minutes % 60
    return remMin > 0 ? `${hours}小时${remMin}分钟后开始` : `${hours}小时后开始`
  }

  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days}天${remHours}小时后开始` : `${days}天后开始`
}

/** Format an ISO date range as "2026-06-23 ~ 2026-07-23" (or open-ended). */
export function formatDateRange(
  from?: string | null,
  to?: string | null,
): string {
  const fmt = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }
  const left = from ? fmt(from) : '长期'
  const right = to ? fmt(to) : '长期'
  if (!from && !to) return '长期有效'
  return `${left} ~ ${right}`
}

/** True when `now` is within [validFrom, validTo] (inclusive, open-ended ok). */
export function isWithinValidRange(
  validFrom: string | undefined | null,
  validTo: string | undefined | null,
  now: Date = new Date(),
): boolean {
  const t = now.getTime()
  if (validFrom) {
    const f = new Date(validFrom).getTime()
    if (!Number.isNaN(f) && t < f) return false
  }
  if (validTo) {
    const to = new Date(validTo).getTime()
    // validTo is inclusive of the whole day → push to end of that day
    if (!Number.isNaN(to) && t > to + 86_399_999) return false
  }
  return true
}
