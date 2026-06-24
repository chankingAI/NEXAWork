import { describe, test, expect } from 'bun:test'
import {
  UpdateManager,
  flattenReleaseNotes,
  initUpdateManager,
  getUpdateManager,
  type RawDownloadProgress,
  type UpdateCheckInfo,
  type Updater,
  type UpdaterListeners,
} from '../main/backend/update-manager'
import type { UpdateState } from '../shared/auto-updater'

/**
 * UpdateManager integration tests (N36).
 * Drives the whole electron-updater lifecycle with a fake emitter + fake timers
 * so no Electron, network feed or real timer is ever touched.
 */

class FakeUpdater implements Updater {
  autoDownload = true
  autoInstallOnAppQuit = false
  checkCalls = 0
  downloadCalls = 0
  quitCalls = 0
  checkError: Error | null = null
  downloadError: Error | null = null

  private readonly listeners: {
    [K in keyof UpdaterListeners]: UpdaterListeners[K][]
  } = {
    'checking-for-update': [],
    'update-available': [],
    'update-not-available': [],
    'download-progress': [],
    'update-downloaded': [],
    error: [],
  }

  on<E extends keyof UpdaterListeners>(
    event: E,
    listener: UpdaterListeners[E],
  ): void {
    this.listeners[event].push(listener)
  }

  async checkForUpdates(): Promise<unknown> {
    this.checkCalls++
    if (this.checkError) throw this.checkError
    return {}
  }

  async downloadUpdate(): Promise<unknown> {
    this.downloadCalls++
    if (this.downloadError) throw this.downloadError
    return {}
  }

  quitAndInstall(): void {
    this.quitCalls++
  }

  emitChecking(): void {
    for (const l of this.listeners['checking-for-update']) l()
  }
  emitAvailable(info: UpdateCheckInfo): void {
    for (const l of this.listeners['update-available']) l(info)
  }
  emitNotAvailable(info: UpdateCheckInfo): void {
    for (const l of this.listeners['update-not-available']) l(info)
  }
  emitProgress(p: RawDownloadProgress): void {
    for (const l of this.listeners['download-progress']) l(p)
  }
  emitDownloaded(info: UpdateCheckInfo): void {
    for (const l of this.listeners['update-downloaded']) l(info)
  }
  emitError(err: Error): void {
    for (const l of this.listeners.error) l(err)
  }
}

function makeTimers() {
  let tick: (() => void) | null = null
  let cleared = false
  return {
    runTick: () => tick?.(),
    isCleared: () => cleared,
    timers: {
      setInterval: (fn: () => void) => {
        tick = fn
        return 1 as unknown as ReturnType<typeof setInterval>
      },
      clearInterval: () => {
        cleared = true
        tick = null
      },
    },
  }
}

function build(extra?: { now?: () => number }) {
  const updater = new FakeUpdater()
  const t = makeTimers()
  const manager = new UpdateManager({
    currentVersion: '1.0.0',
    updater,
    timers: t.timers,
    now: extra?.now ?? (() => 12345),
  })
  return { updater, manager, t }
}

describe('UpdateManager — disabled (no updater)', () => {
  test('reports disabled and all actions are inert', async () => {
    const manager = new UpdateManager({ currentVersion: '1.0.0' })
    manager.start()
    expect(manager.getState().enabled).toBe(false)
    expect(manager.getState().status).toBe('idle')
    await manager.checkForUpdates()
    expect(manager.getState().status).toBe('idle')
    await manager.downloadUpdate()
    expect(manager.quitAndInstall()).toBe(false)
  })
})

describe('UpdateManager — lifecycle', () => {
  test('start() configures the updater for confirm-then-download', () => {
    const { updater, manager } = build()
    manager.start()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
  })

  test('start() runs a startup check and schedules periodic checks', () => {
    const { updater, manager, t } = build()
    manager.start()
    expect(updater.checkCalls).toBe(1)
    t.runTick()
    expect(updater.checkCalls).toBe(2)
  })

  test('dispose() clears the interval and stops notifying listeners', () => {
    const { updater, manager, t } = build()
    let calls = 0
    manager.onChanged(() => {
      calls++
    })
    manager.start()
    updater.emitChecking()
    expect(calls).toBeGreaterThan(0)
    const after = calls
    manager.dispose()
    expect(t.isCleared()).toBe(true)
    updater.emitAvailable({ version: '1.1.0' })
    expect(calls).toBe(after)
  })
})

describe('UpdateManager — event wiring', () => {
  test('checking-for-update → checking', () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitChecking()
    expect(manager.getState().status).toBe('checking')
  })

  test('update-available records version/notes and a check timestamp', () => {
    const { updater, manager } = build({ now: () => 999 })
    manager.start()
    updater.emitAvailable({
      version: '1.2.0',
      releaseName: 'Big',
      releaseNotes: 'Lots',
    })
    const s = manager.getState()
    expect(s.status).toBe('available')
    expect(s.availableVersion).toBe('1.2.0')
    expect(s.releaseName).toBe('Big')
    expect(s.releaseNotes).toBe('Lots')
    expect(s.lastCheckedAt).toBe(999)
  })

  test('update-not-available → not-available', () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitNotAvailable({ version: '1.0.0' })
    expect(manager.getState().status).toBe('not-available')
  })

  test('download-progress is normalized into downloading', () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitProgress({
      percent: 42.55,
      transferred: 5,
      total: 10,
      bytesPerSecond: 3,
    })
    const s = manager.getState()
    expect(s.status).toBe('downloading')
    expect(s.progress?.percent).toBe(42.6)
  })

  test('update-downloaded → downloaded', () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitDownloaded({ version: '1.2.0' })
    expect(manager.getState().status).toBe('downloaded')
  })

  test('onChanged delivers a state snapshot', () => {
    const { updater, manager } = build()
    const seen: UpdateState[] = []
    manager.onChanged(s => seen.push(s))
    manager.start()
    updater.emitAvailable({ version: '1.2.0' })
    expect(seen.at(-1)?.availableVersion).toBe('1.2.0')
  })
})

describe('UpdateManager — download + install', () => {
  test('downloadUpdate requires a known available version', async () => {
    const { updater, manager } = build()
    manager.start()
    await manager.downloadUpdate()
    expect(updater.downloadCalls).toBe(0)
  })

  test('downloadUpdate starts at 0% then tracks progress to downloaded', async () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitAvailable({ version: '1.2.0' })
    await manager.downloadUpdate()
    expect(updater.downloadCalls).toBe(1)
    expect(manager.getState().status).toBe('downloading')
    expect(manager.getState().progress?.percent).toBe(0)
    updater.emitProgress({
      percent: 50,
      transferred: 5,
      total: 10,
      bytesPerSecond: 1,
    })
    expect(manager.getState().progress?.percent).toBe(50)
    updater.emitDownloaded({ version: '1.2.0' })
    expect(manager.getState().status).toBe('downloaded')
  })

  test('quitAndInstall only fires once downloaded', async () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitAvailable({ version: '1.2.0' })
    expect(manager.quitAndInstall()).toBe(false)
    expect(updater.quitCalls).toBe(0)
    updater.emitDownloaded({ version: '1.2.0' })
    expect(manager.quitAndInstall()).toBe(true)
    expect(updater.quitCalls).toBe(1)
  })
})

describe('UpdateManager — failure / rollback', () => {
  test('a download error rolls back to available, current version intact', () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitAvailable({ version: '1.2.0' })
    updater.emitProgress({ percent: 30 })
    updater.emitError(new Error('connection reset'))
    const s = manager.getState()
    expect(s.status).toBe('available')
    expect(s.error).toBe('connection reset')
    expect(s.currentVersion).toBe('1.0.0')
    expect(s.progress).toBeNull()
  })

  test('a rejected checkForUpdates surfaces an error', async () => {
    const { updater, manager } = build()
    updater.checkError = new Error('feed 404')
    manager.start()
    await manager.checkForUpdates()
    expect(manager.getState().error).toBe('feed 404')
  })

  test('a rejected downloadUpdate surfaces an error but keeps the version', async () => {
    const { updater, manager } = build()
    updater.downloadError = new Error('disk full')
    manager.start()
    updater.emitAvailable({ version: '1.2.0' })
    await manager.downloadUpdate()
    const s = manager.getState()
    expect(s.error).toBe('disk full')
    expect(s.currentVersion).toBe('1.0.0')
  })

  test('the manager can retry a download after an error', async () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitAvailable({ version: '1.2.0' })
    updater.emitError(new Error('transient'))
    await manager.downloadUpdate()
    expect(updater.downloadCalls).toBe(1)
  })
})

describe('flattenReleaseNotes', () => {
  test('passes strings through and joins note lists', () => {
    expect(flattenReleaseNotes('hello')).toBe('hello')
    expect(flattenReleaseNotes(null)).toBeNull()
    expect(
      flattenReleaseNotes([{ note: 'a' }, { note: null }, { note: 'b' }]),
    ).toBe('a\n\nb')
    expect(flattenReleaseNotes([{ note: null }])).toBeNull()
  })
})

describe('getState immutability', () => {
  test('mutating a returned snapshot does not affect the manager', () => {
    const { updater, manager } = build()
    manager.start()
    updater.emitProgress({
      percent: 10,
      transferred: 1,
      total: 2,
      bytesPerSecond: 1,
    })
    const snap = manager.getState()
    if (snap.progress) snap.progress.percent = 999
    expect(manager.getState().progress?.percent).toBe(10)
  })
})

describe('initUpdateManager singleton', () => {
  test('replaces and exposes the active instance', () => {
    const first = initUpdateManager({ currentVersion: '1.0.0' })
    expect(getUpdateManager()).toBe(first)
    const second = initUpdateManager({ currentVersion: '1.0.1' })
    expect(getUpdateManager()).toBe(second)
    expect(second).not.toBe(first)
  })
})
