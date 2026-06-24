/**
 * Replay subsystem tests (N26).
 *
 * Two layers, both Electron-free so they run under `bun test`:
 *  1. The pure helpers in `shared/replay` (speed coercion, progress, remaining
 *     time, quality score, action description, pacing).
 *  2. The `ReplayManager` state machine driven by an injectable clock + a
 *     scripted executor, covering load / play+tick / pause / single-step /
 *     stop / speed change and the completion report.
 */
import { describe, expect, test } from 'bun:test'
import {
  coerceReplaySpeed,
  computeProgress,
  computeQualityScore,
  DEFAULT_REPLAY_SPEED,
  describeAction,
  estimateRemainingMs,
  REPLAY_SPEEDS,
  stepDelayForSpeed,
} from '../shared/replay'
import {
  type ReplayExecutor,
  ReplayManager,
} from '../main/backend/replay-manager'
import type { RecordingFile } from '../main/backend/recorder-manager'
import { DEFAULT_RECORDING_CONFIG } from '../shared/recording-config'

// ─── Fixtures ─────────────────────────────────────────────────
function makeRecording(actions: string[], id = 'rec_1'): RecordingFile {
  return {
    id,
    startTime: 0,
    endTime: actions.length * 100,
    durationMs: actions.length * 100,
    eventCount: actions.length,
    taskDescription: 'Demo task',
    config: DEFAULT_RECORDING_CONFIG,
    events: actions.map((action, i) => ({
      action,
      timestamp: i * 100,
      detail: `detail-${i}`,
    })),
  }
}

/** A controllable clock that callers advance explicitly. */
function fakeClock(start = 0): {
  now: () => number
  advance: (ms: number) => void
} {
  let t = start
  return {
    now: () => t,
    advance: ms => {
      t += ms
    },
  }
}

// ─── Pure helpers ─────────────────────────────────────────────
describe('coerceReplaySpeed', () => {
  test('accepts every supported speed verbatim', () => {
    for (const s of REPLAY_SPEEDS) {
      expect(coerceReplaySpeed(s)).toBe(s)
    }
  })

  test('falls back to default for unsupported / invalid input', () => {
    expect(coerceReplaySpeed(3)).toBe(DEFAULT_REPLAY_SPEED)
    expect(coerceReplaySpeed(0)).toBe(DEFAULT_REPLAY_SPEED)
    expect(coerceReplaySpeed(Number.NaN)).toBe(DEFAULT_REPLAY_SPEED)
    expect(coerceReplaySpeed('2')).toBe(DEFAULT_REPLAY_SPEED)
    expect(coerceReplaySpeed(undefined)).toBe(DEFAULT_REPLAY_SPEED)
  })
})

describe('computeProgress', () => {
  test('is 0 when there are no steps', () => {
    expect(computeProgress(0, 0)).toBe(0)
  })

  test('returns the completed fraction', () => {
    expect(computeProgress(2, 4)).toBe(0.5)
    expect(computeProgress(4, 4)).toBe(1)
  })

  test('clamps out-of-range completed counts', () => {
    expect(computeProgress(-3, 4)).toBe(0)
    expect(computeProgress(9, 4)).toBe(1)
  })
})

describe('estimateRemainingMs', () => {
  test('is 0 once all steps are done', () => {
    expect(estimateRemainingMs(4, 4, [100, 100], 600)).toBe(0)
  })

  test('uses the observed average when available', () => {
    // 2 left, avg of [100, 300] = 200 → 400
    expect(estimateRemainingMs(2, 4, [100, 300], 600)).toBe(400)
  })

  test('falls back to the configured pacing with no observations', () => {
    expect(estimateRemainingMs(0, 3, [], 600)).toBe(1800)
  })
})

describe('computeQualityScore', () => {
  test('is 100 for an all-success run', () => {
    expect(
      computeQualityScore({
        successCount: 4,
        recoveredCount: 0,
        skippedCount: 0,
        executedCount: 4,
        totalSteps: 4,
      }),
    ).toBe(100)
  })

  test('penalizes recovery but keeps most credit', () => {
    const score = computeQualityScore({
      successCount: 3,
      recoveredCount: 1,
      skippedCount: 0,
      executedCount: 4,
      totalSteps: 4,
    })
    expect(score).toBeGreaterThan(90)
    expect(score).toBeLessThan(100)
  })

  test('scales down by coverage for partial runs', () => {
    // 2 success out of 4, only 2 executed → (200/4) * (2/4) = 25
    expect(
      computeQualityScore({
        successCount: 2,
        recoveredCount: 0,
        skippedCount: 0,
        executedCount: 2,
        totalSteps: 4,
      }),
    ).toBe(25)
  })

  test('is 0 when there are no steps', () => {
    expect(
      computeQualityScore({
        successCount: 0,
        recoveredCount: 0,
        skippedCount: 0,
        executedCount: 0,
        totalSteps: 0,
      }),
    ).toBe(0)
  })
})

describe('describeAction', () => {
  test('appends detail when present', () => {
    expect(describeAction('click', 'Submit')).toBe('click · Submit')
  })

  test('returns the bare action when detail is blank', () => {
    expect(describeAction('scroll', '   ')).toBe('scroll')
    expect(describeAction('scroll')).toBe('scroll')
  })
})

describe('stepDelayForSpeed', () => {
  test('divides the base delay by the speed', () => {
    expect(stepDelayForSpeed(600, 1)).toBe(600)
    expect(stepDelayForSpeed(600, 2)).toBe(300)
    expect(stepDelayForSpeed(600, 0.5)).toBe(1200)
  })
})

// ─── ReplayManager state machine ──────────────────────────────
describe('ReplayManager.load', () => {
  test('builds one pending step per recorded event', () => {
    const m = new ReplayManager({ generateId: () => 'sess_1' })
    const status = m.load(makeRecording(['click', 'type', 'scroll']))
    expect(status.recordingId).toBe('rec_1')
    expect(status.recordingLabel).toBe('Demo task')
    expect(status.totalSteps).toBe(3)
    expect(status.state).toBe('idle')
    expect(status.currentStep).toBe(-1)
    expect(status.steps.every(s => s.status === 'pending')).toBe(true)
    expect(status.steps[1].description).toBe('type · detail-1')
  })

  test('resets state when a new recording is loaded', () => {
    const m = new ReplayManager()
    m.load(makeRecording(['click']))
    m.step()
    const status = m.load(makeRecording(['a', 'b'], 'rec_2'))
    expect(status.recordingId).toBe('rec_2')
    expect(status.currentStep).toBe(-1)
    expect(status.progress).toBe(0)
    expect(m.getReport()).toBeNull()
  })
})

describe('ReplayManager play + tick', () => {
  test('advances one step per due tick and completes', () => {
    const clock = fakeClock()
    const m = new ReplayManager({ now: clock.now, baseStepDelayMs: 100 })
    m.load(makeRecording(['click', 'type']))
    m.play()
    expect(m.getStatus().state).toBe('playing')

    expect(m.tick()).toBe(true) // step 0
    expect(m.getStatus().currentStep).toBe(0)
    expect(m.getStatus().steps[0].status).toBe('success')

    // Not due yet.
    expect(m.tick()).toBe(false)
    clock.advance(100)
    expect(m.tick()).toBe(true) // step 1 → completes
    const status = m.getStatus()
    expect(status.state).toBe('completed')
    expect(status.progress).toBe(1)
  })

  test('tick is a no-op while paused', () => {
    const clock = fakeClock()
    const m = new ReplayManager({ now: clock.now, baseStepDelayMs: 100 })
    m.load(makeRecording(['click', 'type']))
    m.play()
    m.tick()
    m.pause()
    expect(m.getStatus().state).toBe('paused')
    expect(m.tick()).toBe(false)
  })

  test('throws when play is called with nothing loaded', () => {
    const m = new ReplayManager()
    expect(() => m.play()).toThrow('No recording loaded')
  })
})

describe('ReplayManager single-step', () => {
  test('executes exactly one step then pauses', () => {
    const m = new ReplayManager()
    m.load(makeRecording(['click', 'type', 'scroll']))
    const s1 = m.step()
    expect(s1.state).toBe('paused')
    expect(s1.currentStep).toBe(0)
    expect(s1.steps[0].status).toBe('success')
    expect(s1.steps[1].status).toBe('pending')

    const s2 = m.step()
    expect(s2.currentStep).toBe(1)
  })

  test('finalizes after stepping through the last step', () => {
    const m = new ReplayManager()
    m.load(makeRecording(['click']))
    const status = m.step()
    expect(status.state).toBe('completed')
    expect(m.getReport()?.status).toBe('completed')
  })
})

describe('ReplayManager recovery + failure', () => {
  test('marks recovered steps and surfaces the strategy while playing', () => {
    const executor: ReplayExecutor = (_step, _event, index) =>
      index === 0
        ? { result: 'recovered', recoveryStrategy: 'visual-match' }
        : { result: 'success' }
    const clock = fakeClock()
    const m = new ReplayManager({
      now: clock.now,
      baseStepDelayMs: 100,
      executor,
    })
    m.load(makeRecording(['click', 'type']))
    m.play()
    m.tick() // step 0 recovered
    const status = m.getStatus()
    expect(status.steps[0].status).toBe('recovered')
    expect(status.steps[0].recoveryStrategy).toBe('visual-match')
    expect(status.recovering).toBe(true)
    expect(status.recoveryStrategy).toBe('visual-match')
  })

  test('a failed step yields a failed terminal state + error text', () => {
    const executor: ReplayExecutor = (_step, _event, index) =>
      index === 0
        ? { result: 'failed', error: 'element not found' }
        : { result: 'success' }
    const m = new ReplayManager({ executor })
    m.load(makeRecording(['click', 'type']))
    m.step()
    m.step()
    const status = m.getStatus()
    expect(status.state).toBe('failed')
    expect(status.steps[0].error).toBe('element not found')
    const report = m.getReport()
    expect(report?.status).toBe('partial')
    expect(report?.failedCount).toBe(1)
    expect(report?.successCount).toBe(1)
  })
})

describe('ReplayManager.stop', () => {
  test('skips remaining steps and produces an aborted report', () => {
    const m = new ReplayManager()
    m.load(makeRecording(['click', 'type', 'scroll']))
    m.step() // step 0 success
    const status = m.stop()
    expect(status.state).toBe('aborted')
    expect(status.steps[1].status).toBe('skipped')
    expect(status.steps[2].status).toBe('skipped')
    const report = m.getReport()
    expect(report?.status).toBe('aborted')
    expect(report?.skippedCount).toBe(2)
    expect(report?.successCount).toBe(1)
  })

  test('is a no-op once the run is already terminal', () => {
    const m = new ReplayManager()
    m.load(makeRecording(['click']))
    m.step() // completes
    const before = m.getStatus()
    const after = m.stop()
    expect(after.state).toBe(before.state)
    expect(after.state).toBe('completed')
  })
})

describe('ReplayManager.setSpeed', () => {
  test('coerces and stores the chosen speed', () => {
    const m = new ReplayManager()
    m.load(makeRecording(['click']))
    expect(m.setSpeed(2).speed).toBe(2)
    expect(m.setSpeed(99).speed).toBe(DEFAULT_REPLAY_SPEED)
  })

  test('higher speed shortens the pacing between auto-steps', () => {
    const clock = fakeClock()
    const m = new ReplayManager({ now: clock.now, baseStepDelayMs: 100 })
    m.load(makeRecording(['a', 'b', 'c']))
    m.play()
    m.tick() // step 0 at t=0
    m.setSpeed(2) // next due in 50ms
    expect(m.tick()).toBe(false)
    clock.advance(50)
    expect(m.tick()).toBe(true)
    expect(m.getStatus().currentStep).toBe(1)
  })
})

describe('ReplayManager report', () => {
  test('reports totals, quality and timing for a clean run', () => {
    const m = new ReplayManager()
    m.load(makeRecording(['click', 'type']))
    m.step()
    m.step()
    const report = m.getReport()
    expect(report).not.toBeNull()
    expect(report?.totalSteps).toBe(2)
    expect(report?.successCount).toBe(2)
    expect(report?.qualityScore).toBe(100)
    expect(report?.steps).toHaveLength(2)
    expect(report?.completedAt).toBeTruthy()
  })
})
