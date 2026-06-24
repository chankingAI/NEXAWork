/**
 * NexaWork Terminal Manager (N29)
 * ===============================
 * Owns node-pty processes for the xterm.js terminal panel. Each terminal tab
 * maps to one PTY; the manager forwards PTY output and exit events to
 * registered listeners (the IPC layer pushes them to the renderer) and routes
 * stdin / resize / kill back to the right process.
 *
 * node-pty is a native module that cannot load under `bun test`, so it is
 * imported lazily inside the default spawn factory and the factory itself is
 * injectable — tests pass a fake PTY and never touch the native binding. This
 * mirrors the injectable-clock pattern used by the other managers.
 */
import { homedir } from 'os'
import {
  clampCols,
  clampRows,
  makeSessionInfo,
  resolveDefaultShell,
  type TerminalSessionInfo,
} from '../../shared/terminal'

/** Minimal subset of node-pty's IPty surface the manager relies on. */
export interface PtyProcess {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void
}

export interface PtySpawnOptions {
  shell: string
  args: string[]
  cwd: string
  cols: number
  rows: number
  env: Record<string, string>
}

/** Factory that produces a PTY for the given command line. */
export type PtySpawnFn = (opts: PtySpawnOptions) => PtyProcess

export interface TerminalManagerOptions {
  /** Injectable PTY spawner (defaults to a lazy node-pty binding). */
  spawn?: PtySpawnFn
  /** Injectable platform / env / default cwd for deterministic tests. */
  platform?: NodeJS.Platform
  env?: Record<string, string | undefined>
  defaultCwd?: string
  /** Injectable id generator. */
  generateId?: () => string
}

export interface CreateTerminalInput {
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
  title?: string
}

interface TerminalEntry {
  info: TerminalSessionInfo
  pty: PtyProcess
}

type DataListener = (id: string, data: string) => void
type ExitListener = (id: string, exitCode: number) => void

/** Lazily resolve node-pty so importing this module never loads the binding. */
function defaultSpawn(opts: PtySpawnOptions): PtyProcess {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pty = require('node-pty') as {
    spawn: (
      file: string,
      args: string[],
      options: {
        name: string
        cols: number
        rows: number
        cwd: string
        env: Record<string, string>
      },
    ) => PtyProcess
  }
  return pty.spawn(opts.shell, opts.args, {
    name: 'xterm-256color',
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env,
  })
}

let idCounter = 0

export class TerminalManager {
  private readonly spawnFn: PtySpawnFn
  private readonly platform: NodeJS.Platform
  private readonly env: Record<string, string | undefined>
  private readonly defaultCwd: string
  private readonly generateId: () => string
  private readonly terminals = new Map<string, TerminalEntry>()
  private readonly dataListeners = new Set<DataListener>()
  private readonly exitListeners = new Set<ExitListener>()
  /** Monotonic per-shell-kind counter for default tab titles. */
  private created = 0

  constructor(opts: TerminalManagerOptions = {}) {
    this.spawnFn = opts.spawn ?? defaultSpawn
    this.platform = opts.platform ?? process.platform
    this.env = opts.env ?? process.env
    this.defaultCwd = opts.defaultCwd ?? safeCwd() ?? homedir()
    this.generateId =
      opts.generateId ?? (() => `term-${Date.now()}-${++idCounter}`)
  }

  // ─── Listener registration ─────────────────────────────────────────────────

  onData(listener: DataListener): () => void {
    this.dataListeners.add(listener)
    return () => this.dataListeners.delete(listener)
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Spawn a PTY-backed terminal tab and return its metadata. */
  create(input: CreateTerminalInput = {}): TerminalSessionInfo {
    const resolved = resolveDefaultShell(this.platform, this.env, input.shell)
    const cwd = input.cwd && input.cwd.trim() ? input.cwd : this.defaultCwd
    const cols = clampCols(input.cols)
    const rows = clampRows(input.rows)
    const id = this.generateId()
    this.created += 1

    const info = makeSessionInfo({
      id,
      resolved,
      cwd,
      cols,
      rows,
      title: input.title,
      index: this.created,
    })

    const pty = this.spawnFn({
      shell: resolved.shell,
      args: resolved.args,
      cwd,
      cols,
      rows,
      env: buildEnv(this.env),
    })

    pty.onData(data => {
      for (const listener of this.dataListeners) listener(id, data)
    })
    pty.onExit(({ exitCode }) => {
      const entry = this.terminals.get(id)
      if (entry) entry.info = { ...entry.info, status: 'exited', exitCode }
      for (const listener of this.exitListeners) listener(id, exitCode)
    })

    this.terminals.set(id, { info, pty })
    return info
  }

  /** Forward user/AI keystrokes to a terminal's stdin. */
  write(id: string, data: string): boolean {
    const entry = this.terminals.get(id)
    if (!entry || entry.info.status === 'exited') return false
    entry.pty.write(data)
    return true
  }

  /** Resize a terminal's PTY (clamped to sane bounds). */
  resize(id: string, cols: number, rows: number): boolean {
    const entry = this.terminals.get(id)
    if (!entry || entry.info.status === 'exited') return false
    const c = clampCols(cols)
    const r = clampRows(rows)
    entry.pty.resize(c, r)
    entry.info = { ...entry.info, cols: c, rows: r }
    return true
  }

  /** Kill a terminal's PTY and drop it from the registry. */
  kill(id: string): boolean {
    const entry = this.terminals.get(id)
    if (!entry) return false
    try {
      entry.pty.kill()
    } catch {
      // Already dead; removal below is still correct.
    }
    this.terminals.delete(id)
    return true
  }

  /** Snapshot of all live terminal tabs. */
  list(): TerminalSessionInfo[] {
    return Array.from(this.terminals.values()).map(e => ({ ...e.info }))
  }

  get(id: string): TerminalSessionInfo | undefined {
    const entry = this.terminals.get(id)
    return entry ? { ...entry.info } : undefined
  }

  /** Tear down every PTY (called on window close / re-registration). */
  killAll(): void {
    for (const [id] of this.terminals) this.kill(id)
  }
}

function safeCwd(): string | null {
  try {
    return process.cwd()
  } catch {
    return null
  }
}

/** Build the PTY environment, forcing a sane TERM for ANSI colour support. */
function buildEnv(
  source: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') env[key] = value
  }
  env.TERM = env.TERM || 'xterm-256color'
  env.COLORTERM = env.COLORTERM || 'truecolor'
  return env
}

export function initTerminalManager(
  opts: TerminalManagerOptions = {},
): TerminalManager {
  return new TerminalManager(opts)
}
