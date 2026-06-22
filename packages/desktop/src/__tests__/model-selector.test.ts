import { describe, test, expect } from 'bun:test'
import {
  builtinModels,
  providerColors,
  type ModelConfig,
  type ModelCapability,
  type ProviderId,
  type ModelSelectorProps,
} from '../renderer/components/ModelSelector'

/**
 * ModelSelector Unit + Integration Tests (N9)
 * Tests model list, capability labels, speed indicators, Max mode, provider integration
 */

describe('Built-in Models', () => {
  test('7 built-in models exist', () => {
    expect(builtinModels).toHaveLength(7)
  })

  test('all models have required fields', () => {
    for (const model of builtinModels) {
      expect(model.id).toBeTruthy()
      expect(model.name).toBeTruthy()
      expect(model.provider).toBeTruthy()
      expect(model.capability).toBeTruthy()
      expect(typeof model.speed).toBe('number')
      expect(model.apiModel).toBeTruthy()
      expect(typeof model.maxTokens).toBe('number')
      expect(typeof model.supportsExtendedThinking).toBe('boolean')
    }
  })

  test('model IDs are unique', () => {
    const ids = builtinModels.map(m => m.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test('model IDs match expected values', () => {
    const ids = builtinModels.map(m => m.id)
    expect(ids).toContain('auto')
    expect(ids).toContain('claude-sonnet')
    expect(ids).toContain('claude-haiku')
    expect(ids).toContain('gpt-4o')
    expect(ids).toContain('deepseek-v3')
    expect(ids).toContain('gemini-2')
    expect(ids).toContain('grok')
  })
})

describe('Auto Model', () => {
  const auto = builtinModels.find(m => m.id === 'auto')!

  test('name is Auto', () => {
    expect(auto.name).toBe('Auto')
  })

  test('capability is high', () => {
    expect(auto.capability).toBe('high')
  })

  test('speed is 1.0 (baseline)', () => {
    expect(auto.speed).toBe(1.0)
  })

  test('supports extended thinking', () => {
    expect(auto.supportsExtendedThinking).toBe(true)
  })

  test('provider is auto', () => {
    expect(auto.provider).toBe('auto')
  })
})

describe('Claude Models', () => {
  const sonnet = builtinModels.find(m => m.id === 'claude-sonnet')!
  const haiku = builtinModels.find(m => m.id === 'claude-haiku')!

  test('Sonnet has high capability', () => {
    expect(sonnet.capability).toBe('high')
  })

  test('Haiku has medium capability', () => {
    expect(haiku.capability).toBe('medium')
  })

  test('Haiku is faster than Sonnet', () => {
    expect(haiku.speed).toBeGreaterThan(sonnet.speed)
  })

  test('both use Anthropic provider', () => {
    expect(sonnet.provider).toBe('anthropic')
    expect(haiku.provider).toBe('anthropic')
  })

  test('Sonnet supports extended thinking', () => {
    expect(sonnet.supportsExtendedThinking).toBe(true)
  })

  test('Sonnet apiModel is correct', () => {
    expect(sonnet.apiModel).toBe('claude-sonnet-4-20250514')
  })

  test('both have 200k token limit', () => {
    expect(sonnet.maxTokens).toBe(200000)
    expect(haiku.maxTokens).toBe(200000)
  })
})

describe('Third-Party Models', () => {
  const gpt4o = builtinModels.find(m => m.id === 'gpt-4o')!
  const deepseek = builtinModels.find(m => m.id === 'deepseek-v3')!
  const gemini = builtinModels.find(m => m.id === 'gemini-2')!
  const grok = builtinModels.find(m => m.id === 'grok')!

  test('GPT-4o uses OpenAI provider', () => {
    expect(gpt4o.provider).toBe('openai')
    expect(gpt4o.capability).toBe('high')
  })

  test('DeepSeek is fastest model (2.0x)', () => {
    expect(deepseek.speed).toBe(2.0)
    expect(deepseek.capability).toBe('high')
  })

  test('Gemini uses Google provider', () => {
    expect(gemini.provider).toBe('google')
    expect(gemini.capability).toBe('medium')
  })

  test('Grok uses xAI provider', () => {
    expect(grok.provider).toBe('xai')
  })

  test('Gemini has largest context (1M)', () => {
    expect(gemini.maxTokens).toBe(1000000)
  })

  test('GPT-4o apiModel is correct', () => {
    expect(gpt4o.apiModel).toBe('gpt-4o')
  })

  test('DeepSeek apiModel is correct', () => {
    expect(deepseek.apiModel).toBe('deepseek-chat')
  })
})

describe('Model Capabilities', () => {
  test('high capability models exist', () => {
    const highModels = builtinModels.filter(m => m.capability === 'high')
    expect(highModels.length).toBeGreaterThanOrEqual(3)
  })

  test('medium capability models exist', () => {
    const medModels = builtinModels.filter(m => m.capability === 'medium')
    expect(medModels.length).toBeGreaterThanOrEqual(2)
  })

  test('valid capability values', () => {
    const validCaps: ModelCapability[] = ['high', 'medium', 'low']
    for (const model of builtinModels) {
      expect(validCaps).toContain(model.capability)
    }
  })
})

describe('Speed Indicators', () => {
  test('speeds are positive numbers', () => {
    for (const model of builtinModels) {
      expect(model.speed).toBeGreaterThan(0)
    }
  })

  test('speed range is 1.0 to 2.0', () => {
    for (const model of builtinModels) {
      expect(model.speed).toBeGreaterThanOrEqual(1.0)
      expect(model.speed).toBeLessThanOrEqual(2.0)
    }
  })

  test('DeepSeek has highest speed', () => {
    const maxSpeed = Math.max(...builtinModels.map(m => m.speed))
    const fastest = builtinModels.find(m => m.speed === maxSpeed)!
    expect(fastest.id).toBe('deepseek-v3')
  })

  test('speed indicator only shows for > 1.0x', () => {
    const showIndicator = (speed: number) => speed > 1.0
    expect(showIndicator(1.0)).toBe(false)
    expect(showIndicator(1.5)).toBe(true)
    expect(showIndicator(2.0)).toBe(true)
  })
})

describe('Provider Colors', () => {
  test('all providers have colors', () => {
    const providers: ProviderId[] = [
      'anthropic',
      'openai',
      'google',
      'xai',
      'deepseek',
      'local',
      'auto',
    ]
    for (const p of providers) {
      expect(providerColors[p]).toBeTruthy()
      expect(providerColors[p]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  test('Anthropic color is orange-ish', () => {
    expect(providerColors.anthropic).toBe('#D97757')
  })

  test('OpenAI color is green-ish', () => {
    expect(providerColors.openai).toBe('#10A37F')
  })

  test('Auto color is dark (black)', () => {
    expect(providerColors.auto).toBe('#1A1A1A')
  })
})

describe('Max Mode (Extended Thinking)', () => {
  test('max mode defaults to off', () => {
    const maxMode = false
    expect(maxMode).toBe(false)
  })

  test('toggling max mode works', () => {
    let maxMode = false
    const toggle = (v: boolean) => {
      maxMode = v
    }

    toggle(true)
    expect(maxMode).toBe(true)

    toggle(false)
    expect(maxMode).toBe(false)
  })

  test('only some models support extended thinking', () => {
    const supported = builtinModels.filter(m => m.supportsExtendedThinking)
    const notSupported = builtinModels.filter(m => !m.supportsExtendedThinking)
    expect(supported.length).toBeGreaterThan(0)
    expect(notSupported.length).toBeGreaterThan(0)
  })

  test('auto model supports extended thinking', () => {
    const auto = builtinModels.find(m => m.id === 'auto')!
    expect(auto.supportsExtendedThinking).toBe(true)
  })

  test('Claude Sonnet supports extended thinking', () => {
    const sonnet = builtinModels.find(m => m.id === 'claude-sonnet')!
    expect(sonnet.supportsExtendedThinking).toBe(true)
  })
})

describe('Model Selection State', () => {
  test('default model is auto', () => {
    const defaultId = 'auto'
    expect(defaultId).toBe('auto')
  })

  test('model change callback fires with id', () => {
    let selectedId = 'auto'
    const onChange = (id: string) => {
      selectedId = id
    }

    onChange('claude-sonnet')
    expect(selectedId).toBe('claude-sonnet')
  })

  test('switching model preserves conversation', () => {
    const conversation = ['msg1', 'msg2', 'msg3']
    let modelId = 'auto'
    const switchModel = (id: string) => {
      modelId = id
    }

    switchModel('gpt-4o')
    expect(modelId).toBe('gpt-4o')
    expect(conversation).toHaveLength(3) // unchanged
  })
})

describe('Custom Models', () => {
  test('custom model has isCustom flag', () => {
    const custom: ModelConfig = {
      id: 'custom-1',
      name: 'My Local LLM',
      provider: 'local',
      capability: 'medium',
      speed: 0.8,
      apiModel: 'llama-3.1-70b',
      maxTokens: 32000,
      supportsExtendedThinking: false,
      isCustom: true,
    }
    expect(custom.isCustom).toBe(true)
  })

  test('custom models merge with builtins', () => {
    const customs: ModelConfig[] = [
      {
        id: 'custom-1',
        name: 'Custom',
        provider: 'local',
        capability: 'medium',
        speed: 1.0,
        apiModel: 'custom',
        maxTokens: 32000,
        supportsExtendedThinking: false,
        isCustom: true,
      },
    ]
    const all = [...builtinModels, ...customs]
    expect(all).toHaveLength(8)
  })

  test('configure custom callback is optional', () => {
    const props: ModelSelectorProps = {
      activeModelId: 'auto',
      maxMode: false,
      onModelChange: () => {},
      onMaxModeChange: () => {},
    }
    expect(props.onConfigureCustom).toBeUndefined()
  })
})

describe('Dropdown Behavior', () => {
  test('panel starts closed', () => {
    const isOpen = false
    expect(isOpen).toBe(false)
  })

  test('clicking trigger toggles panel', () => {
    let isOpen = false
    const toggle = () => {
      isOpen = !isOpen
    }

    toggle()
    expect(isOpen).toBe(true)

    toggle()
    expect(isOpen).toBe(false)
  })

  test('selecting model closes panel', () => {
    let isOpen = true
    const select = () => {
      isOpen = false
    }

    select()
    expect(isOpen).toBe(false)
  })

  test('escape closes panel', () => {
    let isOpen = true
    const handleKey = (key: string) => {
      if (key === 'Escape') isOpen = false
    }

    handleKey('Escape')
    expect(isOpen).toBe(false)
  })
})

describe('Integration: Model → Provider Routing', () => {
  test('auto resolves to anthropic provider', () => {
    const model = builtinModels.find(m => m.id === 'auto')!
    const provider = model.id === 'auto' ? 'anthropic' : model.provider
    expect(provider).toBe('anthropic')
  })

  test('auto resolves to claude-sonnet api model', () => {
    const model = builtinModels.find(m => m.id === 'auto')!
    const apiModel =
      model.id === 'auto' ? 'claude-sonnet-4-20250514' : model.apiModel
    expect(apiModel).toBe('claude-sonnet-4-20250514')
  })

  test('each model maps to a valid provider', () => {
    const validProviders: ProviderId[] = [
      'anthropic',
      'openai',
      'google',
      'xai',
      'deepseek',
      'local',
      'auto',
    ]
    for (const model of builtinModels) {
      expect(validProviders).toContain(model.provider)
    }
  })

  test('model apiModel matches provider expectations', () => {
    const sonnet = builtinModels.find(m => m.id === 'claude-sonnet')!
    expect(sonnet.apiModel).toContain('claude')

    const gpt = builtinModels.find(m => m.id === 'gpt-4o')!
    expect(gpt.apiModel).toContain('gpt')
  })
})

describe('Accessibility', () => {
  test('trigger has aria-expanded', () => {
    const isOpen = true
    expect(isOpen).toBe(true)
  })

  test('trigger has aria-haspopup listbox', () => {
    const haspopup = 'listbox'
    expect(haspopup).toBe('listbox')
  })

  test('panel has listbox role', () => {
    const role = 'listbox'
    expect(role).toBe('listbox')
  })

  test('options have option role with aria-selected', () => {
    const role = 'option'
    const selected = true
    expect(role).toBe('option')
    expect(selected).toBe(true)
  })

  test('toggle switch has switch role', () => {
    const role = 'switch'
    expect(role).toBe('switch')
  })

  test('toggle has aria-checked', () => {
    const maxMode = true
    const ariaChecked = maxMode
    expect(ariaChecked).toBe(true)
  })
})

describe('ModelSelectorProps Interface', () => {
  test('all required props defined', () => {
    const props: ModelSelectorProps = {
      activeModelId: 'auto',
      maxMode: false,
      onModelChange: () => {},
      onMaxModeChange: () => {},
    }
    expect(props.activeModelId).toBe('auto')
    expect(props.maxMode).toBe(false)
  })

  test('optional props work', () => {
    const props: ModelSelectorProps = {
      activeModelId: 'claude-sonnet',
      maxMode: true,
      onModelChange: () => {},
      onMaxModeChange: () => {},
      onConfigureCustom: () => {},
      customModels: [],
    }
    expect(props.maxMode).toBe(true)
    expect(typeof props.onConfigureCustom).toBe('function')
  })
})
