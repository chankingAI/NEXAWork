/**
 * NexaWork Auto-Updater — shared pure helpers (N36)
 * ==================================================
 * Zero-dependency, side-effect-free logic for the Electron auto-update flow:
 *  - semver parsing + comparison (`compareVersions`, `isNewerVersion`),
 *  - the periodic check scheduler (`shouldCheckNow`, `CHECK_INTERVAL_MS`),
 *  - the update state machine (`reduceUpdateState`) driving the UI, and
 *  - download-progress formatting helpers.
 *
 * Everything here runs identically in the main process, the renderer and under
 * `bun test`; all electron-updater / GitHub Releases wiring lives in the
 * UpdateManager and the IPC handlers.
 */

// ─── Versioning ───────────────────────────────────────────────

export interface SemVer {
  major: number
  minor: number
  patch: number
  /** Dot-separated prerelease identifiers (empty for a stable release). */
  prerelease: string[]
}

/** Parse a semver string (a leading `v` is tolerated), or null if invalid. */
export function parseVersion(input: string): SemVer | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim().replace(/^v/i, '')
  const match = trimmed.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  )
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

/** Compare two prerelease identifier lists per the semver precedence rules. */
function comparePrerelease(a: string[], b: string[]): number {
  // A version with no prerelease outranks one that has a prerelease.
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const ai = a[i]
    const bi = b[i]
    const an = /^\d+$/.test(ai)
    const bn = /^\d+$/.test(bi)
    if (an && bn) {
      const diff = Number(ai) - Number(bi)
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (an !== bn) {
      // Numeric identifiers always have lower precedence than alphanumeric.
      return an ? -1 : 1
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1
    }
  }
  if (a.length === b.length) return 0
  return a.length < b.length ? -1 : 1
}

/**
 * Compare two version strings. Returns -1 / 0 / 1 (a<b / a==b / a>b).
 * Unparseable versions sort below valid ones (and equal to each other).
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }
  const pre = comparePrerelease(pa.prerelease, pb.prerelease)
  return pre < 0 ? -1 : pre > 0 ? 1 : 0
}

/** True when `candidate` is strictly newer than `current`. */
export function isNewerVersion(current: string, candidate: string): boolean {
  return compareVersions(candidate, current) === 1
}

// ─── Check scheduling ─────────────────────────────────────────

/** How often to poll for updates after the startup check (6 hours). */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Whether a periodic check is due. A never-checked updater (`lastCheckedAt`
 * null) is always due; otherwise the interval must have fully elapsed.
 */
export function shouldCheckNow(
  lastCheckedAt: number | null,
  now: number,
  intervalMs: number = CHECK_INTERVAL_MS,
): boolean {
  if (lastCheckedAt === null) return true
  return now - lastCheckedAt >= intervalMs
}

// ─── Download progress ────────────────────────────────────────

export interface DownloadProgress {
  /** 0–100, clamped. */
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

/** Clamp + round a raw electron-updater progress payload. */
export function normalizeProgress(raw: {
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
}): DownloadProgress {
  const clamp = (n: number) => (n < 0 ? 0 : n > 100 ? 100 : n)
  return {
    percent: Math.round(clamp(raw.percent ?? 0) * 10) / 10,
    transferred: Math.max(0, Math.floor(raw.transferred ?? 0)),
    total: Math.max(0, Math.floor(raw.total ?? 0)),
    bytesPerSecond: Math.max(0, Math.floor(raw.bytesPerSecond ?? 0)),
  }
}

/** Human-readable byte size (e.g. `12.4 MB`). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const value = bytes / 1024 ** exp
  return `${exp === 0 ? value : value.toFixed(1)} ${units[exp]}`
}

/** Human-readable transfer speed (e.g. `2.1 MB/s`). */
export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

// ─── Update state machine ─────────────────────────────────────

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** The full update state surfaced to the renderer. */
export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  releaseName: string | null
  releaseNotes: string | null
  progress: DownloadProgress | null
  error: string | null
  /** Epoch ms of the last completed check (null = never checked). */
  lastCheckedAt: number | null
  /** Whether the updater is operational (packaged app with a feed). */
  enabled: boolean
}

/** Build the initial state for a given current version. */
export function initialUpdateState(
  currentVersion: string,
  enabled: boolean,
): UpdateState {
  return {
    status: 'idle',
    currentVersion,
    availableVersion: null,
    releaseName: null,
    releaseNotes: null,
    progress: null,
    error: null,
    lastCheckedAt: null,
    enabled,
  }
}

export type UpdateEvent =
  | { type: 'check' }
  | {
      type: 'available'
      version: string
      releaseName?: string | null
      releaseNotes?: string | null
      at: number
    }
  | { type: 'not-available'; at: number }
  | { type: 'progress'; progress: DownloadProgress }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }
  | { type: 'reset' }

/**
 * Pure reducer mapping an updater event onto the next state. Keeps the known
 * available version across a download error so the user can retry, and never
 * mutates the input.
 */
export function reduceUpdateState(
  state: UpdateState,
  event: UpdateEvent,
): UpdateState {
  switch (event.type) {
    case 'check':
      return { ...state, status: 'checking', error: null }
    case 'available':
      return {
        ...state,
        status: 'available',
        availableVersion: event.version,
        releaseName: event.releaseName ?? null,
        releaseNotes: event.releaseNotes ?? null,
        progress: null,
        error: null,
        lastCheckedAt: event.at,
      }
    case 'not-available':
      return {
        ...state,
        status: 'not-available',
        availableVersion: null,
        progress: null,
        error: null,
        lastCheckedAt: event.at,
      }
    case 'progress':
      return { ...state, status: 'downloading', progress: event.progress }
    case 'downloaded':
      return {
        ...state,
        status: 'downloaded',
        availableVersion: event.version,
        progress: { percent: 100, transferred: 0, total: 0, bytesPerSecond: 0 },
        error: null,
      }
    case 'error':
      // Rollback: a failure never replaces the running version. Fall back to
      // 'available' when we already know about an update so the user can retry,
      // otherwise to 'error'.
      return {
        ...state,
        status: state.availableVersion ? 'available' : 'error',
        progress: null,
        error: event.message,
      }
    case 'reset':
      return { ...state, status: 'idle', progress: null, error: null }
    default:
      return state
  }
}

/** Whether a "restart to update" action is currently meaningful. */
export function canInstall(state: UpdateState): boolean {
  return state.status === 'downloaded'
}

/** Whether a download can be started from the current state. */
export function canDownload(state: UpdateState): boolean {
  return (
    state.enabled &&
    state.availableVersion !== null &&
    (state.status === 'available' || state.status === 'error')
  )
}
