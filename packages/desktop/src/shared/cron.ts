/**
 * NexaWork cron helpers (N18) — shared between the main-process
 * AutomationManager and the renderer AutomationPanel.
 *
 * Pure, dependency-free functions: 5-field cron parsing/matching, next-run
 * computation, and human-readable Chinese formatting.
 */

/** Parse a single cron field into a membership predicate over [min, max]. */
export function parseCronField(
  field: string,
  min: number,
  max: number,
): (value: number) => boolean {
  if (field === '*') return () => true

  const allowed = new Set<number>()
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart ? Number.parseInt(stepPart, 10) : 1
    if (!Number.isFinite(step) || step <= 0) continue

    let start = min
    let end = max
    if (rangePart !== '*') {
      const [a, b] = rangePart.split('-')
      start = Number.parseInt(a, 10)
      end = b !== undefined ? Number.parseInt(b, 10) : start
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue

    for (let v = start; v <= end; v += step) {
      if (v >= min && v <= max) allowed.add(v)
    }
  }
  return (value: number) => allowed.has(value)
}

/** Does the given date satisfy the 5-field cron expression? */
export function cronMatches(cron: string, date: Date): boolean {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [min, hour, dom, mon, dow] = fields

  const minuteOk = parseCronField(min, 0, 59)(date.getMinutes())
  const hourOk = parseCronField(hour, 0, 23)(date.getHours())
  const domOk = parseCronField(dom, 1, 31)(date.getDate())
  const monOk = parseCronField(mon, 1, 12)(date.getMonth() + 1)
  // cron day-of-week: 0 and 7 are both Sunday.
  const weekday = date.getDay()
  const dowMatcher = parseCronField(dow, 0, 7)
  const dowOk = dowMatcher(weekday) || (weekday === 0 && dowMatcher(7))

  // Standard cron semantics: when both DOM and DOW are restricted, either matches.
  const domRestricted = dom !== '*'
  const dowRestricted = dow !== '*'
  const dayOk = domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk

  return minuteOk && hourOk && dayOk && monOk
}

/**
 * Compute the next run time at or after `from` for a 5-field cron expression.
 * Returns undefined when no match is found within a year (or the cron is invalid).
 */
export function computeNextRun(
  cron: string,
  from: Date = new Date(),
): Date | undefined {
  if (cron.trim().split(/\s+/).length !== 5) return undefined
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)
  // Search minute-by-minute up to ~366 days.
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (cronMatches(cron, cursor)) return new Date(cursor)
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return undefined
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** Human-readable Chinese description for common cron expressions. */
export function describeCron(cron: string): string {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return cron
  const [min, hour, dom, mon, dow] = fields
  const pad = (s: string) => s.padStart(2, '0')
  const time =
    /^\d+$/.test(min) && /^\d+$/.test(hour) ? `${pad(hour)}:${pad(min)}` : null

  if (min === '*' && hour === '*') return '每分钟'
  if (time && dom === '*' && mon === '*' && dow === '*') return `每天 ${time}`
  if (time && dow === '1-5') return `工作日 ${time}`
  if (time && dow === '0,6') return `周末 ${time}`
  if (time && /^\d$/.test(dow))
    return `每${WEEKDAY_NAMES[Number(dow) % 7]} ${time}`
  if (time && dom !== '*' && dow === '*') return `每月${dom}日 ${time}`
  return cron
}

/** Format the countdown to the next run, e.g. "4小时后开始". */
export function formatCountdown(
  target?: string,
  now: Date = new Date(),
): string {
  if (!target) return '未安排'
  const diff = new Date(target).getTime() - now.getTime()
  if (Number.isNaN(diff)) return '未安排'
  if (diff <= 0) return '即将开始'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}分钟后开始`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时后开始`
  const days = Math.floor(hours / 24)
  return `${days}天后开始`
}

/** Format the effective window (生效期) for display. */
export function formatValidRange(from?: string, to?: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  if (!from && !to) return '长期有效'
  return `${from ? fmt(from) : '即日'} ~ ${to ? fmt(to) : '长期'}`
}
