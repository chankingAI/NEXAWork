/**
 * Settings schema (N21) — pure coercion / validation / live-apply descriptors.
 */
import { describe, test, expect } from 'bun:test'
import {
  AVAILABLE_TOOLS,
  clampFontSize,
  clampMemoryRetention,
  coerceSettings,
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  isLanguageCode,
  isMemoryFrequency,
  isReplyStyle,
  isSendKey,
  isThemeMode,
  LANGUAGE_CODES,
  MAX_TOKENS_MAX,
  MAX_TOKENS_MIN,
  MEMORY_FREQUENCIES,
  MEMORY_RETENTION_MAX,
  MEMORY_RETENTION_MIN,
  REPLY_STYLES,
  SEND_KEYS,
  settingsToDocumentAttrs,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
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

describe('N22 schema defaults', () => {
  test('agent/assistant/memory/model defaults match spec', () => {
    expect(DEFAULT_SETTINGS.temperature).toBeGreaterThanOrEqual(TEMPERATURE_MIN)
    expect(DEFAULT_SETTINGS.temperature).toBeLessThanOrEqual(TEMPERATURE_MAX)
    expect(DEFAULT_SETTINGS.maxTokens).toBeGreaterThanOrEqual(MAX_TOKENS_MIN)
    expect(DEFAULT_SETTINGS.maxTokens).toBeLessThanOrEqual(MAX_TOKENS_MAX)
    expect(typeof DEFAULT_SETTINGS.systemPrompt).toBe('string')
    expect(DEFAULT_SETTINGS.enabledTools).toEqual([...AVAILABLE_TOOLS])
    expect(DEFAULT_SETTINGS.assistantName.length).toBeGreaterThan(0)
    expect(DEFAULT_SETTINGS.assistantAvatar.length).toBeGreaterThan(0)
    expect(DEFAULT_SETTINGS.assistantGreeting.length).toBeGreaterThan(0)
    expect(REPLY_STYLES).toContain(DEFAULT_SETTINGS.replyStyle)
    expect(DEFAULT_SETTINGS.memoryEnabled).toBe(true)
    expect(MEMORY_FREQUENCIES).toContain(DEFAULT_SETTINGS.memoryFrequency)
    expect(DEFAULT_SETTINGS.memoryRetentionDays).toBe(30)
    expect(DEFAULT_SETTINGS.customEndpoint).toBe('')
  })
})

describe('N22 type guards', () => {
  test('isReplyStyle', () => {
    for (const s of REPLY_STYLES) expect(isReplyStyle(s)).toBe(true)
    expect(isReplyStyle('sarcastic')).toBe(false)
    expect(isReplyStyle(1)).toBe(false)
  })
  test('isMemoryFrequency', () => {
    for (const f of MEMORY_FREQUENCIES) expect(isMemoryFrequency(f)).toBe(true)
    expect(isMemoryFrequency('hourly')).toBe(false)
    expect(isMemoryFrequency(null)).toBe(false)
  })
})

describe('clampMemoryRetention', () => {
  test('clamps to bounds', () => {
    expect(clampMemoryRetention(0)).toBe(MEMORY_RETENTION_MIN)
    expect(clampMemoryRetention(99999)).toBe(MEMORY_RETENTION_MAX)
  })
  test('falls back to default for non-finite', () => {
    expect(clampMemoryRetention('abc')).toBe(
      DEFAULT_SETTINGS.memoryRetentionDays,
    )
  })
})

describe('coerceSettings — N22 fields', () => {
  test('valid N22 overrides are kept', () => {
    const out = coerceSettings({
      systemPrompt: 'be concise',
      temperature: 0.5,
      maxTokens: 4096,
      enabledTools: ['file_read', 'bash'],
      assistantName: 'Ada',
      assistantAvatar: '🦊',
      assistantGreeting: 'hi',
      replyStyle: 'friendly',
      memoryEnabled: false,
      memoryFrequency: 'always',
      memoryRetentionDays: 90,
      customEndpoint: 'https://example.com/v1',
    })
    expect(out.systemPrompt).toBe('be concise')
    expect(out.temperature).toBe(0.5)
    expect(out.maxTokens).toBe(4096)
    expect(out.enabledTools).toEqual(['file_read', 'bash'])
    expect(out.assistantName).toBe('Ada')
    expect(out.assistantAvatar).toBe('🦊')
    expect(out.replyStyle).toBe('friendly')
    expect(out.memoryEnabled).toBe(false)
    expect(out.memoryFrequency).toBe('always')
    expect(out.memoryRetentionDays).toBe(90)
    expect(out.customEndpoint).toBe('https://example.com/v1')
  })
  test('invalid N22 values fall back to defaults / clamps', () => {
    const out = coerceSettings({
      temperature: 5,
      maxTokens: 1,
      replyStyle: 'rude',
      memoryFrequency: 'never',
      enabledTools: ['bogus_tool', 'bash'],
    })
    expect(out.temperature).toBe(TEMPERATURE_MAX)
    expect(out.maxTokens).toBe(MAX_TOKENS_MIN)
    expect(out.replyStyle).toBe(DEFAULT_SETTINGS.replyStyle)
    expect(out.memoryFrequency).toBe(DEFAULT_SETTINGS.memoryFrequency)
    expect(out.enabledTools).toEqual(['bash'])
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
