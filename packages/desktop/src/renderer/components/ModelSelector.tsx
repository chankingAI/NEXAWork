/**
 * NexaWork ModelSelector — Multi-model selection panel
 * Features: Max mode toggle, built-in models with capability/speed labels,
 * custom model configuration, provider integration
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Check, Plus, ChevronDown, Zap, Brain, Gauge, Settings } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type ModelCapability = 'high' | 'medium' | 'low';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek' | 'local' | 'auto';

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderId;
  capability: ModelCapability;
  speed: number; // Relative speed (1.0 = baseline)
  apiModel: string; // Actual API model identifier
  maxTokens: number;
  supportsExtendedThinking: boolean;
  isCustom?: boolean;
}

export interface ModelSelectorProps {
  activeModelId: string;
  maxMode: boolean;
  onModelChange: (modelId: string) => void;
  onMaxModeChange: (enabled: boolean) => void;
  onConfigureCustom?: () => void;
  customModels?: ModelConfig[];
}

// ─── Built-in Models ──────────────────────────────────────────
export const builtinModels: ModelConfig[] = [
  {
    id: 'auto',
    name: 'Auto',
    provider: 'auto',
    capability: 'high',
    speed: 1.0,
    apiModel: 'auto',
    maxTokens: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    capability: 'high',
    speed: 1.0,
    apiModel: 'claude-sonnet-4-20250514',
    maxTokens: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    provider: 'anthropic',
    capability: 'medium',
    speed: 1.8,
    apiModel: 'claude-haiku-4-20250514',
    maxTokens: 200000,
    supportsExtendedThinking: false,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    capability: 'high',
    speed: 1.2,
    apiModel: 'gpt-4o',
    maxTokens: 128000,
    supportsExtendedThinking: false,
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek-V3',
    provider: 'deepseek',
    capability: 'high',
    speed: 2.0,
    apiModel: 'deepseek-chat',
    maxTokens: 128000,
    supportsExtendedThinking: true,
  },
  {
    id: 'gemini-2',
    name: 'Gemini 2.0',
    provider: 'google',
    capability: 'medium',
    speed: 1.5,
    apiModel: 'gemini-2.0-flash',
    maxTokens: 1000000,
    supportsExtendedThinking: false,
  },
  {
    id: 'grok',
    name: 'Grok',
    provider: 'xai',
    capability: 'medium',
    speed: 1.3,
    apiModel: 'grok-3',
    maxTokens: 131072,
    supportsExtendedThinking: false,
  },
];

// ─── Provider Brand Colors ────────────────────────────────────
export const providerColors: Record<ProviderId, string> = {
  anthropic: '#D97757',
  openai: '#10A37F',
  google: '#4285F4',
  xai: '#1DA1F2',
  deepseek: '#4D6BFE',
  local: '#6B7280',
  auto: '#1A1A1A',
};

// ─── Capability Badge ─────────────────────────────────────────
function CapabilityBadge({ capability }: { capability: ModelCapability }) {
  const styles: Record<ModelCapability, { bg: string; text: string; label: string }> = {
    high: {
      bg: 'bg-[var(--color-accent-green)]/10',
      text: 'text-[var(--color-accent-green)]',
      label: 'High',
    },
    medium: {
      bg: 'bg-[var(--color-bg-tertiary)]',
      text: 'text-[var(--color-text-tertiary)]',
      label: 'Medium',
    },
    low: {
      bg: 'bg-[var(--color-accent-orange)]/10',
      text: 'text-[var(--color-accent-orange)]',
      label: 'Low',
    },
  };
  const style = styles[capability];

  return (
    <span className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[9px] font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

// ─── Speed Indicator ──────────────────────────────────────────
function SpeedIndicator({ speed }: { speed: number }) {
  if (speed <= 1.0) return null;
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-text-quaternary)]">
      <Zap size={8} />
      {speed.toFixed(1)}x
    </span>
  );
}

// ─── Provider Icon ────────────────────────────────────────────
function ProviderIcon({ provider }: { provider: ProviderId }) {
  const color = providerColors[provider];
  return (
    <span
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[10px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {provider === 'auto' && '⚡'}
      {provider === 'anthropic' && 'A'}
      {provider === 'openai' && 'O'}
      {provider === 'google' && 'G'}
      {provider === 'xai' && 'X'}
      {provider === 'deepseek' && 'D'}
      {provider === 'local' && 'L'}
    </span>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────
function ToggleSwitch({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-[var(--duration-fast)] ${
        enabled ? 'bg-[var(--color-text-primary)]' : 'bg-[var(--color-border)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-fast)] ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ─── ModelSelector Component ──────────────────────────────────
export function ModelSelector({
  activeModelId,
  maxMode,
  onModelChange,
  onMaxModeChange,
  onConfigureCustom,
  customModels = [],
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const allModels = [...builtinModels, ...customModels];
  const activeModel = allModels.find(m => m.id === activeModelId) ?? builtinModels[0];

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const handleSelect = useCallback(
    (modelId: string) => {
      onModelChange(modelId);
      setIsOpen(false);
    },
    [onModelChange],
  );

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-xs text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select model"
      >
        <ProviderIcon provider={activeModel.provider} />
        <span className="font-medium">{activeModel.name}</span>
        {maxMode && (
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-accent-purple)]/10 px-1 py-0.5 text-[9px] font-medium text-[var(--color-accent-purple)]">
            Max
          </span>
        )}
        <ChevronDown
          size={12}
          className={`text-[var(--color-text-tertiary)] transition-transform duration-[var(--duration-fast)] ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute bottom-full left-0 z-[var(--z-dropdown)] mb-1 w-72 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-dropdown)]"
          role="listbox"
          aria-label="Model selection"
        >
          {/* Max Mode Toggle */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-[var(--color-accent-purple)]" />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-[var(--color-text-primary)]">Max 模式</span>
                <span className="text-[9px] text-[var(--color-text-tertiary)]">Extended Thinking · 更深推理</span>
              </div>
            </div>
            <ToggleSwitch enabled={maxMode} onChange={onMaxModeChange} label="Toggle Max mode" />
          </div>

          {/* Built-in Models */}
          <div className="p-1">
            <div className="px-2 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-quaternary)]">
                内置模型
              </span>
            </div>

            {builtinModels.map(model => (
              <button
                key={model.id}
                role="option"
                aria-selected={activeModelId === model.id}
                onClick={() => handleSelect(model.id)}
                className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors duration-[var(--duration-fast)] ${
                  activeModelId === model.id ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                <ProviderIcon provider={model.provider} />
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">{model.name}</span>
                  {model.id === 'auto' && (
                    <span className="text-[9px] text-[var(--color-text-tertiary)]">自动选择最佳模型</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <CapabilityBadge capability={model.capability} />
                  <SpeedIndicator speed={model.speed} />
                  {activeModelId === model.id && <Check size={14} className="text-[var(--color-accent-green)]" />}
                </div>
              </button>
            ))}

            {/* Custom Models */}
            {customModels.length > 0 && (
              <>
                <div className="mx-2 my-1 border-t border-[var(--color-border)]" />
                <div className="px-2 py-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-quaternary)]">
                    自定义模型
                  </span>
                </div>
                {customModels.map(model => (
                  <button
                    key={model.id}
                    role="option"
                    aria-selected={activeModelId === model.id}
                    onClick={() => handleSelect(model.id)}
                    className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors duration-[var(--duration-fast)] ${
                      activeModelId === model.id ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'
                    }`}
                  >
                    <ProviderIcon provider={model.provider} />
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{model.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CapabilityBadge capability={model.capability} />
                      {activeModelId === model.id && <Check size={14} className="text-[var(--color-accent-green)]" />}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Configure Custom Model */}
          <div className="border-t border-[var(--color-border)] p-1">
            <button
              onClick={() => {
                onConfigureCustom?.();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] text-[var(--color-text-tertiary)]">
                <Plus size={12} />
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">配置自定义模型</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hook for model state management ──────────────────────────
export interface ModelState {
  modelId: string;
  maxMode: boolean;
  model: ModelConfig;
  setModel: (id: string) => void;
  setMaxMode: (enabled: boolean) => void;
  getApiModel: () => string;
  getProvider: () => ProviderId;
}

export function useModel(initialModelId: string = 'auto'): ModelState {
  const [modelId, setModelId] = useState<string>(initialModelId);
  const [maxMode, setMaxMode] = useState(false);

  const model = builtinModels.find(m => m.id === modelId) ?? builtinModels[0];

  const setModel = useCallback((id: string) => {
    setModelId(id);
  }, []);

  const getApiModel = useCallback(() => {
    if (model.id === 'auto') {
      return 'claude-sonnet-4-20250514';
    }
    return model.apiModel;
  }, [model]);

  const getProvider = useCallback((): ProviderId => {
    if (model.id === 'auto') return 'anthropic';
    return model.provider;
  }, [model]);

  return { modelId, maxMode, model, setModel, setMaxMode, getApiModel, getProvider };
}
