/**
 * N25 recording-config pure-helper tests:
 *  - coerceRecordingConfig (defensive normalization + partial merge)
 *  - maskSensitive (password redaction)
 *  - isOverMaxDuration (auto-stop threshold)
 *  - record.config.* i18n key resolution across all languages.
 */
import { describe, test, expect } from 'bun:test'
import {
  DEFAULT_RECORDING_CONFIG,
  MASK_PLACEHOLDER,
  coerceRecordingConfig,
  isOverMaxDuration,
  maskSensitive,
} from '../shared/recording-config'
import { translate, type MessageKey } from '../renderer/i18n'
import type { LanguageCode } from '../shared/settings'

describe('coerceRecordingConfig', () => {
  test('returns the default for empty / nullish input', () => {
    expect(coerceRecordingConfig(undefined)).toEqual(DEFAULT_RECORDING_CONFIG)
    expect(coerceRecordingConfig(null)).toEqual(DEFAULT_RECORDING_CONFIG)
    expect(coerceRecordingConfig({})).toEqual(DEFAULT_RECORDING_CONFIG)
  })

  test('keeps valid enum values and rejects invalid ones', () => {
    expect(coerceRecordingConfig({ mode: 'desktop' }).mode).toBe('desktop')
    expect(coerceRecordingConfig({ mode: 'hybrid' }).mode).toBe('hybrid')
    expect(coerceRecordingConfig({ mode: 'nope' }).mode).toBe(
      DEFAULT_RECORDING_CONFIG.mode,
    )
    expect(
      coerceRecordingConfig({ screenshotFrequency: 'every-5s' })
        .screenshotFrequency,
    ).toBe('every-5s')
    expect(
      coerceRecordingConfig({ screenshotFrequency: 'hourly' })
        .screenshotFrequency,
    ).toBe(DEFAULT_RECORDING_CONFIG.screenshotFrequency)
  })

  test('coerces boolean fields and ignores non-booleans', () => {
    const c = coerceRecordingConfig({
      maskPasswords: false,
      captureMouseTrail: true,
      elementCapture: false,
      // @ts-expect-error intentionally wrong type
      mergeOperations: 'yes',
    })
    expect(c.maskPasswords).toBe(false)
    expect(c.captureMouseTrail).toBe(true)
    expect(c.elementCapture).toBe(false)
    expect(c.mergeOperations).toBe(DEFAULT_RECORDING_CONFIG.mergeOperations)
  })

  test('normalizes the window filter: trims, drops blanks, de-dupes', () => {
    const c = coerceRecordingConfig({
      // @ts-expect-error mixed array on purpose
      windowFilter: ['  Chrome ', 'Chrome', '', '   ', 'Slack', 42],
    })
    expect(c.windowFilter).toEqual(['Chrome', 'Slack'])
  })

  test('clamps maxDurationMs to a non-negative integer', () => {
    expect(coerceRecordingConfig({ maxDurationMs: 30_000 }).maxDurationMs).toBe(
      30_000,
    )
    expect(coerceRecordingConfig({ maxDurationMs: -5 }).maxDurationMs).toBe(
      DEFAULT_RECORDING_CONFIG.maxDurationMs,
    )
    expect(coerceRecordingConfig({ maxDurationMs: 12.9 }).maxDurationMs).toBe(
      12,
    )
    expect(
      coerceRecordingConfig({ maxDurationMs: Number.POSITIVE_INFINITY })
        .maxDurationMs,
    ).toBe(DEFAULT_RECORDING_CONFIG.maxDurationMs)
  })

  test('merges a partial patch onto an explicit base', () => {
    const base = coerceRecordingConfig({
      mode: 'hybrid',
      maskPasswords: false,
      windowFilter: ['Chrome'],
    })
    const merged = coerceRecordingConfig({ captureMouseTrail: true }, base)
    expect(merged.mode).toBe('hybrid')
    expect(merged.maskPasswords).toBe(false)
    expect(merged.windowFilter).toEqual(['Chrome'])
    expect(merged.captureMouseTrail).toBe(true)
  })

  test('preserves the base window filter when the patch omits it', () => {
    const base = coerceRecordingConfig({ windowFilter: ['A', 'B'] })
    const merged = coerceRecordingConfig({ mode: 'desktop' }, base)
    expect(merged.windowFilter).toEqual(['A', 'B'])
    // returns a fresh array, not the base reference
    expect(merged.windowFilter).not.toBe(base.windowFilter)
  })
})

describe('maskSensitive', () => {
  test('redacts non-empty input when masking is on', () => {
    expect(maskSensitive('hunter2', true)).toBe(MASK_PLACEHOLDER)
  })

  test('passes input through untouched when masking is off', () => {
    expect(maskSensitive('hunter2', false)).toBe('hunter2')
  })

  test('leaves empty / absent detail alone even when masking', () => {
    expect(maskSensitive('', true)).toBe('')
    expect(maskSensitive(undefined, true)).toBeUndefined()
  })
})

describe('isOverMaxDuration', () => {
  test('false when no limit is configured', () => {
    expect(isOverMaxDuration(10_000_000, 0)).toBe(false)
  })

  test('true once elapsed reaches the limit', () => {
    expect(isOverMaxDuration(59_999, 60_000)).toBe(false)
    expect(isOverMaxDuration(60_000, 60_000)).toBe(true)
    expect(isOverMaxDuration(60_001, 60_000)).toBe(true)
  })
})

describe('record.config.* i18n keys', () => {
  const langs: LanguageCode[] = ['zh-CN', 'en', 'ja']
  const keys: MessageKey[] = [
    'record.config.title',
    'record.config.subtitle',
    'record.config.mode.label',
    'record.config.mode.cdp',
    'record.config.mode.cdp.desc',
    'record.config.mode.desktop',
    'record.config.mode.desktop.desc',
    'record.config.mode.hybrid',
    'record.config.mode.hybrid.desc',
    'record.config.screenshot.label',
    'record.config.screenshot.on-action',
    'record.config.screenshot.every-3s',
    'record.config.screenshot.every-5s',
    'record.config.maskPasswords.label',
    'record.config.windowFilter.label',
    'record.config.mouseTrail.label',
    'record.config.advanced',
    'record.config.elementCapture.label',
    'record.config.mergeOperations.label',
    'record.config.maxDuration.label',
    'record.config.maxDuration.unlimited',
    'record.config.maxDuration.minutes',
    'record.config.start',
    'record.config.countdown',
    'record.config.cancel',
  ]

  test('every config key resolves to a non-empty string in every language', () => {
    for (const lang of langs) {
      for (const key of keys) {
        const value = translate(lang, key)
        expect(value.length).toBeGreaterThan(0)
        expect(value).not.toBe(key)
      }
    }
  })

  test('countdown / minutes templates carry the {count} placeholder', () => {
    for (const lang of langs) {
      expect(translate(lang, 'record.config.countdown')).toContain('{count}')
      expect(translate(lang, 'record.config.maxDuration.minutes')).toContain(
        '{count}',
      )
    }
  })
})
