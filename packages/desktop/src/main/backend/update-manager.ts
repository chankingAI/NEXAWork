/**
 * NexaWork Update Manager (N36)
 * ==============================
 * Owns the Electron auto-update lifecycle on top of `electron-updater` +
 * GitHub Releases: it checks for updates on startup and every 6 hours, asks the
 * user before downloading (autoDownload off), streams download progress, and
 * installs on restart. A download / install failure never touches the running
 * binary, so the current version keeps working (the rollback requirement).
 *
 * Following the N28–N32 managers, the underlying updater is injected behind the
 * minimal `Updater` interface, so unit tests drive the whole state machine with
 * a fake emitter and never load Electron. All pure version / scheduling / state
 * logic lives in `../../shared/auto-updater`, reused verbatim by the renderer.
 */
import {
  CHECK_INTERVAL_MS,
  canDownload,
  canInstall,
  initialUpdateState,
  normalizeProgress,
  reduceUpdateState,
  type UpdateEvent,
  type UpdateState,
} from '../../shared/auto-updater'

/** Raw electron-updater progress payload. */
export interface RawDownloadProgress {
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
}

/** Subset of electron-updater's `UpdateInfo` we consume. */
export interface UpdateCheckInfo {
  version: string
  releaseName?: string | null
  releaseNotes?: string | { note: string | null }[] | null
}

/** The electron-updater events the manager listens to. */
export interface UpdaterListeners {
  'checking-for-update': () => void
  'update-available': (info: UpdateCheckInfo) => void
  'update-not-available': (info: UpdateCheckInfo) => void
  'download-progress': (progress: RawDownloadProgress) => void
  'update-downloaded': (info: UpdateCheckInfo) => void
  error: (err: Error) => void
}

/**
 * Minimal structural interface over `electron-updater`'s `autoUpdater`, so the
 * manager can be driven by a fake in tests without importing Electron.
 */
export interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on<E extends keyof UpdaterListeners>(
    event: E,
    listener: UpdaterListeners[E],
  ): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

type IntervalHandle = ReturnType<typeof setInterval>

export interface UpdateManagerOptions {
  /** The running app version (from `app.getVersion()`). */
  currentVersion: string
  /** Injected updater; null/omitted disables updates (dev / unpackaged). */
  updater?: Updater | null
  /** Clock source (defaults to `Date.now`). */
  now?: () => number
  /** Injectable timers (defaults to the globals). */
  timers?: {
    setInterval: (fn: () => void, ms: number) => IntervalHandle
    clearInterval: (handle: IntervalHandle) => void
  }
  /** Polling interval after the startup check (defaults to 6 hours). */
  checkIntervalMs?: number
}

type ChangeListener = (state: UpdateState) => void

/** Coerce electron-updater's release notes (string | list | null) to text. */
export function flattenReleaseNotes(
  notes: UpdateCheckInfo['releaseNotes'],
): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes
  const joined = notes
    .map(n => n.note)
    .filter((n): n is string => typeof n === 'string')
    .join('\n\n')
  return joined || null
}

export class UpdateManager {
  private readonly updater: Updater | null
  private readonly now: () => number
  private readonly timers: NonNullable<UpdateManagerOptions['timers']>
  private readonly checkIntervalMs: number
  private state: UpdateState
  private readonly changeListeners = new Set<ChangeListener>()
  private interval: IntervalHandle | null = null
  private wired = false

  constructor(opts: UpdateManagerOptions) {
    this.updater = opts.updater ?? null
    this.now = opts.now ?? (() => Date.now())
    this.timers = opts.timers ?? {
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: handle => clearInterval(handle),
    }
    this.checkIntervalMs = opts.checkIntervalMs ?? CHECK_INTERVAL_MS
    this.state = initialUpdateState(opts.currentVersion, this.updater !== null)
  }

  /**
   * Wire updater events, run the startup check, and schedule periodic checks.
   * A no-op when updates are disabled (no injected updater).
   */
  start(): void {
    if (!this.updater) return
    this.wireEvents()
    void this.checkForUpdates()
    this.interval = this.timers.setInterval(() => {
      void this.checkForUpdates()
    }, this.checkIntervalMs)
  }

  getState(): UpdateState {
    return {
      ...this.state,
      progress: this.state.progress ? { ...this.state.progress } : null,
    }
  }

  /** Trigger an update check (no-op / not-available when disabled). */
  async checkForUpdates(): Promise<UpdateState> {
    if (!this.updater) return this.getState()
    this.dispatch({ type: 'check' })
    try {
      await this.updater.checkForUpdates()
    } catch (err) {
      this.dispatch({ type: 'error', message: errorMessage(err) })
    }
    return this.getState()
  }

  /** Begin downloading the available update after user confirmation. */
  async downloadUpdate(): Promise<UpdateState> {
    if (!this.updater || !canDownload(this.state)) return this.getState()
    this.dispatch({
      type: 'progress',
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    })
    try {
      await this.updater.downloadUpdate()
    } catch (err) {
      this.dispatch({ type: 'error', message: errorMessage(err) })
    }
    return this.getState()
  }

  /** Quit and install a downloaded update (restart to update). */
  quitAndInstall(): boolean {
    if (!this.updater || !canInstall(this.state)) return false
    this.updater.quitAndInstall()
    return true
  }

  onChanged(listener: ChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.interval !== null) {
      this.timers.clearInterval(this.interval)
      this.interval = null
    }
    this.changeListeners.clear()
  }

  // ─── Internals ────────────────────────────────────────────────

  private wireEvents(): void {
    if (this.wired || !this.updater) return
    this.wired = true
    // We gate downloads behind explicit user consent, but still install on quit.
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true

    this.updater.on('checking-for-update', () => {
      this.dispatch({ type: 'check' })
    })
    this.updater.on('update-available', info => {
      this.dispatch({
        type: 'available',
        version: info.version,
        releaseName: info.releaseName ?? null,
        releaseNotes: flattenReleaseNotes(info.releaseNotes),
        at: this.now(),
      })
    })
    this.updater.on('update-not-available', () => {
      this.dispatch({ type: 'not-available', at: this.now() })
    })
    this.updater.on('download-progress', progress => {
      this.dispatch({ type: 'progress', progress: normalizeProgress(progress) })
    })
    this.updater.on('update-downloaded', info => {
      this.dispatch({ type: 'downloaded', version: info.version })
    })
    this.updater.on('error', err => {
      this.dispatch({ type: 'error', message: errorMessage(err) })
    })
  }

  private dispatch(event: UpdateEvent): void {
    this.state = reduceUpdateState(this.state, event)
    this.emitChange()
  }

  private emitChange(): void {
    const snapshot = this.getState()
    for (const listener of this.changeListeners) listener(snapshot)
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown update error'
}

// ─── Singleton management ─────────────────────────────────────
let instance: UpdateManager | null = null

/** Initialize the singleton update manager (disposing any previous one). */
export function initUpdateManager(opts: UpdateManagerOptions): UpdateManager {
  instance?.dispose()
  instance = new UpdateManager(opts)
  return instance
}

/** Get the singleton, or null when it has not been initialized. */
export function getUpdateManager(): UpdateManager | null {
  return instance
}
