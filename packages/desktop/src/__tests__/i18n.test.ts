/**
 * i18n (N21) — translation lookup, dictionary completeness, and the
 * subscribable language singleton.
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getLanguage,
  MESSAGE_KEYS,
  setLanguage,
  subscribeLanguage,
  t,
  translate,
} from '../renderer/i18n'
import { LANGUAGE_CODES } from '../shared/settings'

describe('translate', () => {
  test('returns language-specific strings', () => {
    expect(translate('zh-CN', 'nav.system')).toBe('系统设置')
    expect(translate('en', 'nav.system')).toBe('System')
    expect(translate('ja', 'nav.system')).toBe('システム設定')
  })
  test('falls back to zh-CN for an unknown language', () => {
    // @ts-expect-error intentionally invalid language code
    expect(translate('fr', 'nav.system')).toBe('系统设置')
  })
})

describe('dictionary completeness', () => {
  test('every language defines every message key', () => {
    for (const lang of LANGUAGE_CODES) {
      for (const key of MESSAGE_KEYS) {
        const value = translate(lang, key)
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      }
    }
  })
  test('exposes a non-trivial key set', () => {
    expect(MESSAGE_KEYS.length).toBeGreaterThanOrEqual(30)
    // The 10 nav items must all be present.
    for (const k of [
      'nav.account',
      'nav.system',
      'nav.agent',
      'nav.memory',
      'nav.model',
      'nav.assistant',
      'nav.personalization',
      'nav.data',
      'nav.security',
      'nav.help',
    ] as const) {
      expect(MESSAGE_KEYS).toContain(k)
    }
  })
})

describe('language singleton', () => {
  beforeEach(() => {
    setLanguage('zh-CN')
  })

  test('getLanguage reflects setLanguage', () => {
    expect(getLanguage()).toBe('zh-CN')
    setLanguage('en')
    expect(getLanguage()).toBe('en')
  })

  test('t() is bound to the current language', () => {
    setLanguage('ja')
    expect(t('nav.memory')).toBe('メモリ')
    setLanguage('en')
    expect(t('nav.memory')).toBe('Memory')
  })

  test('subscribers fire on change and not on no-op set', () => {
    let calls = 0
    const unsub = subscribeLanguage(() => {
      calls++
    })
    setLanguage('en')
    expect(calls).toBe(1)
    setLanguage('en') // same value → no notify
    expect(calls).toBe(1)
    setLanguage('ja')
    expect(calls).toBe(2)
    unsub()
    setLanguage('zh-CN')
    expect(calls).toBe(2)
  })
})
