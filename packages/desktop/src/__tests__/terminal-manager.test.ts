import { describe, test, expect, beforeEach } from 'bun:test'
import {
  TerminalManager,
  initTerminalManager,
  type PtyProcess,
  type PtySpawnOptions,
} from '../main/backend/terminal-manager'

/**
 * N29 TerminalManager tests. A fake PTY is injected via the spawn factory so the
 * native node-pty binding (which cannot load under `bun test`) is never touched,
 * mirroring the injectable-dependency pattern used by the other managers.
 */

class FakePty implements PtyProcess {
  written: string[] = []
  size: { cols: number; rows: number } | null = null
  killed = false
  killSignal: string | undefined
  private dataCb: ((data: string) => void) | null = null
  private exitCb: ((e: { exitCode: number; signal?: number }) => void) | null =
    null

  constructor(public readonly opts: PtySpawnOptions) {}

  write(data: string): void {
    this.written.push(data)
  }
  resize(cols: number, rows: number): void {
    this.size = { cols, rows }
  }
  kill(signal?: string): void {
    this.killed = true
    this.killSignal = signal
  }
  onData(cb: (data: string) => void): void {
    this.dataCb = cb
  }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void {
    this.exitCb = cb
  }

  // Test helpers to drive PTY events.
  emitData(data: string): void {
    this.dataCb?.(data)
  }
  emitExit(exitCode: number): void {
    this.exitCb?.({ exitCode })
  }
}

function makeManager() {
  const spawned: FakePty[] = []
  let n = 0
  const manager = new TerminalManager({
    spawn: opts => {
      const pty = new FakePty(opts)
      spawned.push(pty)
      return pty
    },
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    defaultCwd: '/work',
    generateId: () => `term-${++n}`,
  })
  return { manager, spawned }
}

describe('TerminalManager.create', () => {
  let ctx: ReturnType<typeof makeManager>
  beforeEach(() => {
    ctx = makeManager()
  })

  test('spawns a PTY and returns running session metadata', () => {
    const info = ctx.manager.create({ cols: 100, rows: 30 })
    expect(info.id).toBe('term-1')
    expect(info.status).toBe('running')
    expect(info.shell).toBe('/bin/bash')
    expect(info.kind).toBe('bash')
    expect(info.cwd).toBe('/work')
    expect(info.cols).toBe(100)
    expect(info.rows).toBe(30)
    expect(ctx.spawned).toHaveLength(1)
  })

  test('passes resolved shell/args/cwd and a coloured env to the PTY', () => {
    ctx.manager.create({})
    const pty = ctx.spawned[0]
    expect(pty.opts.shell).toBe('/bin/bash')
    expect(pty.opts.args).toEqual(['-l'])
    expect(pty.opts.cwd).toBe('/work')
    expect(pty.opts.env.TERM).toBe('xterm-256color')
    expect(pty.opts.env.COLORTERM).toBe('truecolor')
  })

  test('honours an explicit cwd and shell override', () => {
    const info = ctx.manager.create({ cwd: '/tmp/x', shell: '/usr/bin/zsh' })
    expect(info.cwd).toBe('/tmp/x')
    expect(info.kind).toBe('zsh')
  })

  test('increments the default tab title index per create', () => {
    expect(ctx.manager.create({}).title).toBe('bash 1')
    expect(ctx.manager.create({}).title).toBe('bash 2')
  })
})

describe('TerminalManager.write / resize / kill', () => {
  let ctx: ReturnType<typeof makeManager>
  beforeEach(() => {
    ctx = makeManager()
  })

  test('write forwards stdin to the right PTY', () => {
    const info = ctx.manager.create({})
    expect(ctx.manager.write(info.id, 'ls\n')).toBe(true)
    expect(ctx.spawned[0].written).toEqual(['ls\n'])
  })

  test('write returns false for unknown id', () => {
    expect(ctx.manager.write('nope', 'x')).toBe(false)
  })

  test('resize clamps dimensions, updates the PTY and the session info', () => {
    const info = ctx.manager.create({})
    expect(ctx.manager.resize(info.id, 0, 99999)).toBe(true)
    expect(ctx.spawned[0].size).toEqual({ cols: 2, rows: 1000 })
    expect(ctx.manager.get(info.id)).toMatchObject({ cols: 2, rows: 1000 })
  })

  test('kill terminates the PTY and drops it from the registry', () => {
    const info = ctx.manager.create({})
    expect(ctx.manager.kill(info.id)).toBe(true)
    expect(ctx.spawned[0].killed).toBe(true)
    expect(ctx.manager.get(info.id)).toBeUndefined()
    expect(ctx.manager.kill(info.id)).toBe(false)
  })

  test('write/resize are rejected after the PTY exits', () => {
    const info = ctx.manager.create({})
    ctx.spawned[0].emitExit(0)
    expect(ctx.manager.write(info.id, 'x')).toBe(false)
    expect(ctx.manager.resize(info.id, 80, 24)).toBe(false)
  })
})

describe('TerminalManager listeners', () => {
  let ctx: ReturnType<typeof makeManager>
  beforeEach(() => {
    ctx = makeManager()
  })

  test('onData forwards PTY output tagged with the terminal id', () => {
    const events: Array<{ id: string; data: string }> = []
    ctx.manager.onData((id, data) => events.push({ id, data }))
    const info = ctx.manager.create({})
    ctx.spawned[0].emitData('hello')
    expect(events).toEqual([{ id: info.id, data: 'hello' }])
  })

  test('onExit fires with the exit code and marks the session exited', () => {
    const exits: Array<{ id: string; code: number }> = []
    ctx.manager.onExit((id, code) => exits.push({ id, code }))
    const info = ctx.manager.create({})
    ctx.spawned[0].emitExit(137)
    expect(exits).toEqual([{ id: info.id, code: 137 }])
    expect(ctx.manager.get(info.id)).toMatchObject({
      status: 'exited',
      exitCode: 137,
    })
  })

  test('unsubscribe stops further data delivery', () => {
    const events: string[] = []
    const off = ctx.manager.onData((_id, data) => events.push(data))
    ctx.manager.create({})
    ctx.spawned[0].emitData('a')
    off()
    ctx.spawned[0].emitData('b')
    expect(events).toEqual(['a'])
  })
})

describe('TerminalManager.list / killAll', () => {
  test('list snapshots every live terminal', () => {
    const { manager } = makeManager()
    manager.create({})
    manager.create({})
    expect(manager.list().map(s => s.id)).toEqual(['term-1', 'term-2'])
  })

  test('killAll tears down every PTY', () => {
    const { manager, spawned } = makeManager()
    manager.create({})
    manager.create({})
    manager.killAll()
    expect(spawned.every(p => p.killed)).toBe(true)
    expect(manager.list()).toHaveLength(0)
  })

  test('initTerminalManager returns a usable instance', () => {
    const m = initTerminalManager({
      spawn: opts => new FakePty(opts),
      platform: 'linux',
      env: { SHELL: '/bin/bash' },
      defaultCwd: '/work',
    })
    expect(m).toBeInstanceOf(TerminalManager)
    expect(m.create({}).status).toBe('running')
  })
})
