/**
 * N24 record UI pure-helper tests:
 *  - formatElapsed (RecordingStatusBar / RecordButton timer formatting)
 *  - buildCompletionDesc (RecordingCompletionDialog description interpolation)
 *  - i18n key resolution for the record.* namespace across all languages.
 */
import { describe, test, expect } from 'bun:test'
import { formatElapsed } from '../renderer/components/RecordingStatusBar'
import { buildCompletionDesc } from '../renderer/components/RecordingCompletionDialog'
import { translate, type MessageKey } from '../renderer/i18n'
import type { LanguageCode } from '../shared/settings'

describe('formatElapsed', () => {
  test('formats sub-minute durations as MM:SS', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(5_000)).toBe('00:05')
    expect(formatElapsed(32_000)).toBe('00:32')
  })

  test('rolls over into minutes', () => {
    expect(formatElapsed(60_000)).toBe('01:00')
    expect(formatElapsed(95_000)).toBe('01:35')
  })

  test('switches to HH:MM:SS past one hour', () => {
    expect(formatElapsed(3_600_000)).toBe('01:00:00')
    expect(formatElapsed(3_661_000)).toBe('01:01:01')
  })

  test('floors partial seconds and clamps negatives', () => {
    expect(formatElapsed(1_999)).toBe('00:01')
    expect(formatElapsed(-500)).toBe('00:00')
  })
})

describe('buildCompletionDesc', () => {
  test('interpolates event count and formatted duration', () => {
    const out = buildCompletionDesc(
      '已捕获 {count} 个事件，时长 {duration}。是否生成技能？',
      14,
      32_000,
    )
    expect(out).toBe('已捕获 14 个事件，时长 00:32。是否生成技能？')
  })

  test('works with the english template', () => {
    const out = buildCompletionDesc(
      'Captured {count} events over {duration}. Generate a skill?',
      3,
      65_000,
    )
    expect(out).toBe('Captured 3 events over 01:05. Generate a skill?')
  })
})

describe('record.* i18n keys', () => {
  const langs: LanguageCode[] = ['zh-CN', 'en', 'ja']
  const keys: MessageKey[] = [
    'record.button.record',
    'record.button.recording',
    'record.statusbar.rec',
    'record.statusbar.events',
    'record.statusbar.pause',
    'record.statusbar.resume',
    'record.statusbar.stop',
    'record.completion.title',
    'record.completion.desc',
    'record.completion.generateSkill',
    'record.completion.saveRecording',
    'record.completion.discard',
  ]

  test('every record key resolves to a non-empty string in every language', () => {
    for (const lang of langs) {
      for (const key of keys) {
        const value = translate(lang, key)
        expect(value.length).toBeGreaterThan(0)
        expect(value).not.toBe(key)
      }
    }
  })

  test('events + desc templates carry interpolation placeholders', () => {
    for (const lang of langs) {
      expect(translate(lang, 'record.statusbar.events')).toContain('{count}')
      const desc = translate(lang, 'record.completion.desc')
      expect(desc).toContain('{count}')
      expect(desc).toContain('{duration}')
    }
  })
})
