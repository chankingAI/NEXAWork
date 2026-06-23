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
