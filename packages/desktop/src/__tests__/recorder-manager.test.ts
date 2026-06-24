/**
 * RecorderManager (N24) — lifecycle, timer precision, event counting,
 * and JSON persistence unit tests. Uses an injectable clock + null dir so the
 * manager runs fully in-memory under bun:test.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  RecorderManager,
  initRecorderManager,
  getRecorderManager,
} from '../main/backend/recorder-manager'
import {
  DEFAULT_RECORDING_CONFIG,
  MASK_PLACEHOLDER,
} from '../shared/recording-config'

/** A controllable clock so elapsed-time assertions are deterministic. */
function makeClock(start = 1_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
    set: (ms: number) => {
      t = ms
    },
  }
}

describe('RecorderManager lifecycle', () => {
  test('starts idle', () => {
    const r = new RecorderManager({ dir: null })
    const status = r.getStatus()
    expect(status.state).toBe('idle')
    expect(status.sessionId).toBeNull()
    expect(status.eventCount).toBe(0)
    expect(status.elapsedMs).toBe(0)
    expect(r.isActive()).toBe(false)
  })

  test('start transitions to recording with a session id', () => {
    const clock = makeClock()
    const r = new RecorderManager({ dir: null, now: clock.now })
    const status = r.start({ taskDescription: 'demo' })
    expect(status.state).toBe('recording')
    expect(status.sessionId).toBeTruthy()
    expect(r.isActive()).toBe(true)
  })

  test('start throws if already recording', () => {
    const r = new RecorderManager({ dir: null })
    r.start()
    expect(() => r.start()).toThrow()
  })

  test('stop throws when idle', () => {
    const r = new RecorderManager({ dir: null })
    expect(() => r.stop()).toThrow()
  })

  test('pause / resume are no-ops in the wrong state', () => {
    const r = new RecorderManager({ dir: null })
    expect(r.pause().state).toBe('idle')
    expect(r.resume().state).toBe('idle')
    r.start()
    // resume while already recording is a no-op
    expect(r.resume().state).toBe('recording')
  })
})

describe('RecorderManager timer precision', () => {
  test('elapsed tracks wall clock while recording', () => {
    const clock = makeClock()
    const r = new RecorderManager({ dir: null, now: clock.now })
    r.start()
    clock.advance(3_200)
    expect(r.getStatus().elapsedMs).toBe(3_200)
  })

  test('paused spans are excluded from elapsed time', () => {
    const clock = makeClock()
    const r = new RecorderManager({ dir: null, now: clock.now })
    r.start()
    clock.advance(2_000) // recording
    r.pause()
    clock.advance(5_000) // paused — must not count
    expect(r.getStatus().elapsedMs).toBe(2_000)
    r.resume()
    clock.advance(1_000) // recording again
    expect(r.getStatus().elapsedMs).toBe(3_000)
  })

  test('duration on stop excludes paused spans', () => {
    const clock = makeClock()
    const r = new RecorderManager({ dir: null, now: clock.now })
    r.start()
    clock.advance(1_500)
    r.pause()
    clock.advance(10_000)
    r.resume()
    clock.advance(2_500)
    const result = r.stop()
    expect(result.durationMs).toBe(4_000)
  })
})

describe('RecorderManager event counting', () => {
  test('counts only actions captured while recording', () => {
    const clock = makeClock()
    const r = new RecorderManager({ dir: null, now: clock.now })
    r.start()
    r.recordAction('click', 'btn')
    r.recordAction('type', 'hello')
    expect(r.getStatus().eventCount).toBe(2)
    r.pause()
    r.recordAction('click', 'ignored-while-paused')
    expect(r.getStatus().eventCount).toBe(2)
    r.resume()
    r.recordAction('scroll')
    expect(r.getStatus().eventCount).toBe(3)
    const result = r.stop()
    expect(result.eventCount).toBe(3)
  })

  test('actions after stop are ignored', () => {
    const r = new RecorderManager({ dir: null })
    r.start()
    r.recordAction('click')
    r.stop()
    r.recordAction('click') // idle now
    expect(r.getStatus().eventCount).toBe(0)
  })
})

describe('RecorderManager persistence', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexawork-rec-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('stop writes a JSON file with the captured session', () => {
    const clock = makeClock()
    const r = new RecorderManager({
      dir,
      now: clock.now,
      generateId: () => 'rec_fixed',
    })
    r.start({ taskDescription: 'persist me' })
    r.recordAction('click', 'a')
    clock.advance(1_000)
    const result = r.stop()

    expect(result.outputPath).toBe(join(dir, 'rec_fixed.json'))
    expect(existsSync(result.outputPath as string)).toBe(true)
    const parsed = JSON.parse(
      readFileSync(result.outputPath as string, 'utf-8'),
    )
    expect(parsed.id).toBe('rec_fixed')
    expect(parsed.eventCount).toBe(1)
    expect(parsed.taskDescription).toBe('persist me')
    expect(Array.isArray(parsed.events)).toBe(true)
    expect(parsed.events[0].action).toBe('click')
  })

  test('discard deletes the persisted recording', () => {
    const r = new RecorderManager({ dir, generateId: () => 'rec_del' })
    r.start()
    const result = r.stop()
    expect(existsSync(result.outputPath as string)).toBe(true)
    expect(r.discard('rec_del')).toBe(true)
    expect(existsSync(result.outputPath as string)).toBe(false)
  })

  test('discard returns false for an unknown id', () => {
    const r = new RecorderManager({ dir })
    expect(r.discard('rec_missing')).toBe(false)
  })

  test('in-memory mode (null dir) returns a null output path', () => {
    const r = new RecorderManager({ dir: null })
    r.start()
    const result = r.stop()
    expect(result.outputPath).toBeNull()
  })
})

describe('RecorderManager configuration (N25)', () => {
  test('defaults to the factory config when nothing is persisted', () => {
    const r = new RecorderManager({ dir: null })
    expect(r.getConfig()).toEqual(DEFAULT_RECORDING_CONFIG)
  })

  test('getConfig returns a defensive copy of the window filter', () => {
    const r = new RecorderManager({ dir: null })
    r.setConfig({ windowFilter: ['Chrome'] })
    const a = r.getConfig()
    a.windowFilter.push('mutated')
    expect(r.getConfig().windowFilter).toEqual(['Chrome'])
  })

  test('setConfig merges a partial patch and normalizes it', () => {
    const r = new RecorderManager({ dir: null })
    r.setConfig({ mode: 'hybrid' })
    r.setConfig({ maskPasswords: false, windowFilter: [' Slack ', 'Slack'] })
    const c = r.getConfig()
    expect(c.mode).toBe('hybrid')
    expect(c.maskPasswords).toBe(false)
    expect(c.windowFilter).toEqual(['Slack'])
  })

  test('config persists across manager instances pointing at the same dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexawork-cfg-'))
    try {
      const a = new RecorderManager({ dir })
      a.setConfig({ mode: 'desktop', maxDurationMs: 30_000 })
      const b = new RecorderManager({ dir })
      expect(b.getConfig().mode).toBe('desktop')
      expect(b.getConfig().maxDurationMs).toBe(30_000)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('active recording snapshots config — later edits do not affect it', () => {
    const r = new RecorderManager({ dir: null })
    r.setConfig({ captureMouseTrail: false })
    r.start()
    // Flip the persisted config mid-recording.
    r.setConfig({ captureMouseTrail: true })
    r.recordAction('mouse_move', '10,20')
    // The active snapshot still drops mouse_move.
    expect(r.getStatus().eventCount).toBe(0)
  })

  test('drops mouse_move events unless the active config opts in', () => {
    const trail = new RecorderManager({ dir: null })
    trail.setConfig({ captureMouseTrail: true })
    trail.start()
    trail.recordAction('mouse_move', '1,2')
    trail.recordAction('click', 'btn')
    expect(trail.getStatus().eventCount).toBe(2)

    const noTrail = new RecorderManager({ dir: null })
    noTrail.setConfig({ captureMouseTrail: false })
    noTrail.start()
    noTrail.recordAction('mouse_move', '1,2')
    noTrail.recordAction('click', 'btn')
    expect(noTrail.getStatus().eventCount).toBe(1)
  })

  test('masks sensitive detail when password protection is on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexawork-mask-'))
    try {
      const r = new RecorderManager({ dir, generateId: () => 'rec_mask' })
      r.setConfig({ maskPasswords: true })
      r.start()
      r.recordAction('type', 'hunter2', { sensitive: true })
      r.recordAction('type', 'visible', { sensitive: false })
      const result = r.stop()
      const parsed = JSON.parse(
        readFileSync(result.outputPath as string, 'utf-8'),
      )
      expect(parsed.events[0].detail).toBe(MASK_PLACEHOLDER)
      expect(parsed.events[1].detail).toBe('visible')
      expect(parsed.config.maskPasswords).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('keeps sensitive detail intact when masking is off', () => {
    const r = new RecorderManager({ dir: null })
    r.setConfig({ maskPasswords: false })
    r.start()
    r.recordAction('type', 'hunter2', { sensitive: true })
    expect(r.getStatus().eventCount).toBe(1)
  })

  test('shouldAutoStop honors the configured max duration', () => {
    const clock = makeClock()
    const r = new RecorderManager({ dir: null, now: clock.now })
    r.setConfig({ maxDurationMs: 5_000 })
    expect(r.shouldAutoStop()).toBe(false) // idle
    r.start()
    clock.advance(4_000)
    expect(r.shouldAutoStop()).toBe(false)
    clock.advance(1_000)
    expect(r.shouldAutoStop()).toBe(true)
  })

  test('shouldAutoStop is always false without a limit', () => {
    const clock = makeClock()
    const r = new RecorderManager({ dir: null, now: clock.now })
    r.setConfig({ maxDurationMs: 0 })
    r.start()
    clock.advance(10_000_000)
    expect(r.shouldAutoStop()).toBe(false)
  })
})

describe('RecorderManager singleton', () => {
  test('initRecorderManager replaces the singleton', () => {
    const a = initRecorderManager({ dir: null })
    expect(getRecorderManager()).toBe(a)
    const b = initRecorderManager({ dir: null })
    expect(getRecorderManager()).toBe(b)
    expect(b).not.toBe(a)
  })

  test('getLastResult returns the most recent stop result', () => {
    const r = initRecorderManager({ dir: null, generateId: () => 'rec_last' })
    expect(r.getLastResult()).toBeNull()
    r.start()
    r.stop()
    expect(r.getLastResult()?.id).toBe('rec_last')
  })
})
