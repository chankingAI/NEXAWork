/**
 * SettingsPage (N21) — navigation + control catalog structural checks.
 * Verifies the 10-item nav and the 8 system controls match the spec and that
 * every label/description key resolves in all languages.
 */
import { describe, test, expect } from 'bun:test'
import {
  AGENT_CONTROL_KEYS,
  ASSISTANT_CONTROL_KEYS,
  MEMORY_CONTROL_KEYS,
  MODEL_API_PROVIDERS,
  SETTINGS_NAV_ITEMS,
  SYSTEM_CONTROLS,
} from '../renderer/components/SettingsPage'
import { translate } from '../renderer/i18n'
import { DEFAULT_SETTINGS, LANGUAGE_CODES } from '../shared/settings'

describe('SETTINGS_NAV_ITEMS', () => {
  test('has the 10 spec items in order', () => {
    expect(SETTINGS_NAV_ITEMS.map(i => i.id)).toEqual([
      'account',
      'system',
      'agent',
      'memory',
      'model',
      'assistant',
      'personalization',
      'data',
      'security',
      'help',
    ])
  })
  test('ids are unique and icons are defined', () => {
    const ids = SETTINGS_NAV_ITEMS.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of SETTINGS_NAV_ITEMS) {
      expect(item.icon).toBeDefined()
    }
  })
})

describe('SYSTEM_CONTROLS', () => {
  test('has the 8 spec controls in order', () => {
    expect(SYSTEM_CONTROLS.map(c => c.key)).toEqual([
      'language',
      'fontSize',
      'readingMode',
      'sendKey',
      'skillAutoUpdate',
      'skillAutoInstall',
      'lockScreenRemote',
      'confirmDefaultStorage',
    ])
  })

  test('every control key is a real AppSettings field', () => {
    for (const c of SYSTEM_CONTROLS) {
      expect(c.key in DEFAULT_SETTINGS).toBe(true)
    }
  })

  test('control kinds map to the right primitive', () => {
    const byKey = Object.fromEntries(SYSTEM_CONTROLS.map(c => [c.key, c.kind]))
    expect(byKey.language).toBe('select-language')
    expect(byKey.fontSize).toBe('slider-fontsize')
    expect(byKey.sendKey).toBe('select-sendkey')
    expect(byKey.readingMode).toBe('switch')
    expect(byKey.skillAutoUpdate).toBe('switch')
  })
})

describe('label/description keys resolve in every language', () => {
  test('nav + control keys are translatable', () => {
    for (const lang of LANGUAGE_CODES) {
      for (const item of SETTINGS_NAV_ITEMS) {
        expect(translate(lang, item.labelKey).length).toBeGreaterThan(0)
      }
      for (const c of SYSTEM_CONTROLS) {
        expect(translate(lang, c.labelKey).length).toBeGreaterThan(0)
        expect(translate(lang, c.descKey).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('N22 control catalogs', () => {
  test('agent/assistant/memory control keys are real AppSettings fields', () => {
    for (const key of [
      ...AGENT_CONTROL_KEYS,
      ...ASSISTANT_CONTROL_KEYS,
      ...MEMORY_CONTROL_KEYS,
    ]) {
      expect(key in DEFAULT_SETTINGS).toBe(true)
    }
  })

  test('agent tab covers system prompt, temperature, max tokens, tools', () => {
    expect([...AGENT_CONTROL_KEYS]).toEqual([
      'systemPrompt',
      'temperature',
      'maxTokens',
      'enabledTools',
    ])
  })

  test('assistant tab covers name, avatar, greeting, reply style', () => {
    expect([...ASSISTANT_CONTROL_KEYS]).toEqual([
      'assistantName',
      'assistantAvatar',
      'assistantGreeting',
      'replyStyle',
    ])
  })

  test('memory tab covers switch, frequency, retention', () => {
    expect([...MEMORY_CONTROL_KEYS]).toEqual([
      'memoryEnabled',
      'memoryFrequency',
      'memoryRetentionDays',
    ])
  })

  test('model tab exposes API-key inputs for the 6 providers', () => {
    expect(MODEL_API_PROVIDERS.map(p => p.id)).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'grok',
      'bedrock',
      'vertex',
    ])
    for (const p of MODEL_API_PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(0)
    }
  })
})

describe('N22 i18n section keys resolve in every language', () => {
  test('agent/assistant/memory/model labels and descriptions are translatable', () => {
    const keys = [
      'agent.title',
      'agent.systemPrompt.label',
      'agent.systemPrompt.desc',
      'agent.temperature.label',
      'agent.maxTokens.label',
      'agent.enabledTools.label',
      'assistant.title',
      'assistant.name.label',
      'assistant.avatar.label',
      'assistant.greeting.label',
      'assistant.replyStyle.label',
      'memory.title',
      'memory.enabled.label',
      'memory.frequency.label',
      'memory.retention.label',
      'memory.clearAll',
      'memory.clearConfirm',
      'memory.empty',
      'model.title',
      'model.default.label',
      'model.apiKey.label',
      'model.customEndpoint.label',
      'model.test.button',
      'model.test.success',
      'model.test.failure',
    ] as const
    for (const lang of LANGUAGE_CODES) {
      for (const key of keys) {
        expect(translate(lang, key).length).toBeGreaterThan(0)
      }
    }
  })
})
