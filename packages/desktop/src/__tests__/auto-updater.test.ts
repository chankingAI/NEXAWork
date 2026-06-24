import { describe, test, expect } from 'bun:test'
import {
  CHECK_INTERVAL_MS,
  canDownload,
  canInstall,
  compareVersions,
  formatBytes,
  formatSpeed,
  initialUpdateState,
  isNewerVersion,
  normalizeProgress,
  parseVersion,
  reduceUpdateState,
  shouldCheckNow,
  type UpdateState,
} from '../shared/auto-updater'

/**
 * Auto-updater pure-helper unit tests (N36).
 * Versioning, scheduling, progress formatting and the state-machine reducer
 * run identically in main / renderer / tests; this covers all of it in isolation.
 */

describe('parseVersion', () => {
  test('parses a plain semver', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    })
  })

  test('tolerates a leading v and build metadata', () => {
    expect(parseVersion('v2.0.0+build.5')).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
      prerelease: [],
    })
  })

  test('captures prerelease identifiers', () => {
    expect(parseVersion('1.0.0-beta.2')?.prerelease).toEqual(['beta', '2'])
  })

  test('returns null for garbage', () => {
    expect(parseVersion('not-a-version')).toBeNull()
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })
})

describe('compareVersions', () => {
  test('orders by major/minor/patch', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  test('a stable release outranks its prerelease', () => {
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
  })

  test('compares prerelease identifiers numerically then lexically', () => {
    expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.1.1')).toBe(-1)
  })

  test('unparseable versions sort below valid ones', () => {
    expect(compareVersions('bad', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', 'bad')).toBe(1)
    expect(compareVersions('bad', 'worse')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  test('true only when candidate is strictly newer', () => {
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(false)
  })
})

describe('shouldCheckNow', () => {
  test('always checks when never checked before', () => {
    expect(shouldCheckNow(null, 0)).toBe(true)
  })

  test('waits for the full interval to elapse', () => {
    const last = 1_000_000
    expect(shouldCheckNow(last, last + CHECK_INTERVAL_MS - 1)).toBe(false)
    expect(shouldCheckNow(last, last + CHECK_INTERVAL_MS)).toBe(true)
  })

  test('the default interval is 6 hours', () => {
    expect(CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000)
  })
})

describe('normalizeProgress', () => {
  test('clamps percent and floors byte counts', () => {
    expect(
      normalizeProgress({ percent: 150, transferred: 1.9, total: 10.5 }),
    ).toEqual({
      percent: 100,
      transferred: 1,
      total: 10,
      bytesPerSecond: 0,
    })
  })

  test('floors negatives to zero', () => {
    expect(
      normalizeProgress({ percent: -5, bytesPerSecond: -10 }).percent,
    ).toBe(0)
    expect(
      normalizeProgress({ percent: -5, bytesPerSecond: -10 }).bytesPerSecond,
    ).toBe(0)
  })

  test('rounds percent to one decimal', () => {
    expect(normalizeProgress({ percent: 33.339 }).percent).toBe(33.3)
  })
})

describe('formatBytes / formatSpeed', () => {
  test('formats human-readable sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB')
  })

  test('formats speeds with a dash when idle', () => {
    expect(formatSpeed(0)).toBe('—')
    expect(formatSpeed(1024 * 1024)).toBe('1.0 MB/s')
  })
})

describe('reduceUpdateState', () => {
  const base = initialUpdateState('1.0.0', true)

  test('initial state is idle and enabled-aware', () => {
    expect(base.status).toBe('idle')
    expect(base.currentVersion).toBe('1.0.0')
    expect(base.enabled).toBe(true)
    expect(initialUpdateState('1.0.0', false).enabled).toBe(false)
  })

  test('check → checking and clears prior error', () => {
    const errored: UpdateState = { ...base, error: 'boom' }
    const next = reduceUpdateState(errored, { type: 'check' })
    expect(next.status).toBe('checking')
    expect(next.error).toBeNull()
  })

  test('available records version + notes + timestamp', () => {
    const next = reduceUpdateState(base, {
      type: 'available',
      version: '1.1.0',
      releaseName: 'Spring',
      releaseNotes: 'Fixes',
      at: 42,
    })
    expect(next.status).toBe('available')
    expect(next.availableVersion).toBe('1.1.0')
    expect(next.releaseName).toBe('Spring')
    expect(next.releaseNotes).toBe('Fixes')
    expect(next.lastCheckedAt).toBe(42)
  })

  test('not-available clears the available version', () => {
    const avail = reduceUpdateState(base, {
      type: 'available',
      version: '1.1.0',
      at: 1,
    })
    const next = reduceUpdateState(avail, { type: 'not-available', at: 2 })
    expect(next.status).toBe('not-available')
    expect(next.availableVersion).toBeNull()
    expect(next.lastCheckedAt).toBe(2)
  })

  test('progress drives the downloading status', () => {
    const next = reduceUpdateState(base, {
      type: 'progress',
      progress: { percent: 40, transferred: 4, total: 10, bytesPerSecond: 2 },
    })
    expect(next.status).toBe('downloading')
    expect(next.progress?.percent).toBe(40)
  })

  test('downloaded pins progress to 100', () => {
    const next = reduceUpdateState(base, {
      type: 'downloaded',
      version: '1.1.0',
    })
    expect(next.status).toBe('downloaded')
    expect(next.progress?.percent).toBe(100)
    expect(next.availableVersion).toBe('1.1.0')
  })

  test('error rolls back to available when an update is known (current unaffected)', () => {
    const avail = reduceUpdateState(base, {
      type: 'available',
      version: '1.1.0',
      at: 1,
    })
    const next = reduceUpdateState(avail, {
      type: 'error',
      message: 'net down',
    })
    expect(next.status).toBe('available')
    expect(next.error).toBe('net down')
    expect(next.currentVersion).toBe('1.0.0')
    expect(next.progress).toBeNull()
  })

  test('error with no known update surfaces an error state', () => {
    const next = reduceUpdateState(base, { type: 'error', message: 'boom' })
    expect(next.status).toBe('error')
    expect(next.error).toBe('boom')
  })

  test('reset returns to idle', () => {
    const errored: UpdateState = { ...base, status: 'error', error: 'x' }
    const next = reduceUpdateState(errored, { type: 'reset' })
    expect(next.status).toBe('idle')
    expect(next.error).toBeNull()
  })

  test('is immutable — never mutates the input', () => {
    const snapshot = JSON.stringify(base)
    reduceUpdateState(base, { type: 'available', version: '9.9.9', at: 1 })
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('canDownload / canInstall', () => {
  const base = initialUpdateState('1.0.0', true)

  test('canDownload requires an enabled updater with a known version', () => {
    expect(canDownload(base)).toBe(false)
    const avail = reduceUpdateState(base, {
      type: 'available',
      version: '1.1.0',
      at: 1,
    })
    expect(canDownload(avail)).toBe(true)
    const disabled = reduceUpdateState(initialUpdateState('1.0.0', false), {
      type: 'available',
      version: '1.1.0',
      at: 1,
    })
    expect(canDownload(disabled)).toBe(false)
  })

  test('canDownload allows retry from an error state', () => {
    let s = reduceUpdateState(base, {
      type: 'available',
      version: '1.1.0',
      at: 1,
    })
    s = reduceUpdateState(s, { type: 'error', message: 'x' })
    expect(canDownload(s)).toBe(true)
  })

  test('canInstall only when downloaded', () => {
    expect(canInstall(base)).toBe(false)
    const done = reduceUpdateState(base, {
      type: 'downloaded',
      version: '1.1.0',
    })
    expect(canInstall(done)).toBe(true)
  })
})
