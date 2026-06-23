/**
 * Settings schema (N21) — pure coercion / validation / live-apply descriptors.
 */
import { describe, test, expect } from 'bun:test'
import {
  clampFontSize,
  coerceSettings,
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  isLanguageCode,
  isSendKey,
  isThemeMode,
  LANGUAGE_CODES,
  SEND_KEYS,
  settingsToDocumentAttrs,
} from '../shared/settings'

describe('DEFAULT_SETTINGS', () => {
  test('matches the N21 spec defaults', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('light')
    expect(DEFAULT_SETTINGS.language).toBe('zh-CN')
    expect(DEFAULT_SETTINGS.fontSize).toBe(14)
    expect(DEFAULT_SETTINGS.readingMode).toBe(false)
    expect(DEFAULT_SETTINGS.sendKey).toBe('Enter')
    expect(DEFAULT_SETTINGS.skillAutoUpdate).toBe(true)
    expect(DEFAULT_SETTINGS.skillAutoInstall).toBe(false)
    expect(DEFAULT_SETTINGS.lockScreenRemote).toBe(false)
    expect(DEFAULT_SETTINGS.confirmDefaultStorage).toBe(true)
  })
})

describe('type guards', () => {
  test('isLanguageCode', () => {
    for (const c of LANGUAGE_CODES) expect(isLanguageCode(c)).toBe(true)
    expect(isLanguageCode('fr')).toBe(false)
    expect(isLanguageCode(1)).toBe(false)
    expect(isLanguageCode(null)).toBe(false)
  })
  test('isSendKey', () => {
    for (const k of SEND_KEYS) expect(isSendKey(k)).toBe(true)
    expect(isSendKey('Shift+Enter')).toBe(false)
  })
  test('isThemeMode', () => {
    expect(isThemeMode('light')).toBe(true)
    expect(isThemeMode('dark')).toBe(true)
    expect(isThemeMode('system')).toBe(true)
    expect(isThemeMode('neon')).toBe(false)
  })
})

describe('clampFontSize', () => {
  test('clamps below/above bounds', () => {
    expect(clampFontSize(2)).toBe(FONT_SIZE_MIN)
    expect(clampFontSize(99)).toBe(FONT_SIZE_MAX)
  })
  test('rounds to nearest integer', () => {
    expect(clampFontSize(14.4)).toBe(14)
    expect(clampFontSize(15.6)).toBe(16)
  })
  test('coerces numeric strings', () => {
    expect(clampFontSize('16')).toBe(16)
  })
  test('falls back to default for non-finite', () => {
    expect(clampFontSize('abc')).toBe(DEFAULT_SETTINGS.fontSize)
    expect(clampFontSize(NaN)).toBe(DEFAULT_SETTINGS.fontSize)
    expect(clampFontSize(undefined)).toBe(DEFAULT_SETTINGS.fontSize)
  })
})

describe('coerceSettings', () => {
  test('null/undefined → full defaults', () => {
    expect(coerceSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(coerceSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })
  test('valid overrides are kept', () => {
    const out = coerceSettings({
      language: 'ja',
      fontSize: 18,
      readingMode: true,
      sendKey: 'Ctrl+Enter',
    })
    expect(out.language).toBe('ja')
    expect(out.fontSize).toBe(18)
    expect(out.readingMode).toBe(true)
    expect(out.sendKey).toBe('Ctrl+Enter')
  })
  test('invalid values fall back to defaults', () => {
    const out = coerceSettings({
      language: 'fr',
      sendKey: 'Tab',
      readingMode: 'yes',
      fontSize: 1000,
    })
    expect(out.language).toBe('zh-CN')
    expect(out.sendKey).toBe('Enter')
    expect(out.readingMode).toBe(false)
    expect(out.fontSize).toBe(FONT_SIZE_MAX)
  })
  test('unknown keys are ignored', () => {
    const out = coerceSettings({ bogus: 'x' } as Record<string, unknown>)
    expect('bogus' in out).toBe(false)
  })
})

describe('settingsToDocumentAttrs', () => {
  test('maps to DOM descriptors', () => {
    const attrs = settingsToDocumentAttrs({
      ...DEFAULT_SETTINGS,
      fontSize: 17,
      readingMode: true,
      language: 'en',
    })
    expect(attrs.fontSize).toBe('17px')
    expect(attrs.readingMode).toBe('on')
    expect(attrs.lang).toBe('en')
  })
  test('reading mode off', () => {
    const attrs = settingsToDocumentAttrs(DEFAULT_SETTINGS)
    expect(attrs.readingMode).toBe('off')
  })
})
