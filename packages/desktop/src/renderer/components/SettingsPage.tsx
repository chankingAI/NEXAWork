/**
 * NexaWork SettingsPage (N21)
 * ===========================
 * Apple-grade system settings panel: a 10-item left navigation rail plus a
 * right content area. The first item (系统设置 / System) is fully implemented
 * with eight live, persisted controls built on Radix UI primitives
 * (Switch / Slider / Select). All changes apply instantly and are written to
 * `settings.json` in the main process via the `useSettings` hook.
 */
import { useEffect, useState } from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import * as RSlider from '@radix-ui/react-slider';
import * as RSelect from '@radix-ui/react-select';
import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  Cpu,
  Database,
  Eye,
  EyeOff,
  HelpCircle,
  type LucideIcon,
  Palette,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import {
  type AppSettings,
  ASSISTANT_AVATARS,
  AVAILABLE_TOOLS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LANGUAGE_CODES,
  MAX_TOKENS_MAX,
  MAX_TOKENS_MIN,
  MAX_TOKENS_STEP,
  MEMORY_FREQUENCIES,
  MEMORY_RETENTION_MAX,
  MEMORY_RETENTION_MIN,
  REPLY_STYLES,
  SEND_KEYS,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  TEMPERATURE_STEP,
} from '../../shared/settings';
import type { ModelInfo } from '../../shared/ipc-channels';
import type { MessageKey } from '../i18n';
import { useI18n } from '../hooks/useI18n';
import { useMemory } from '../hooks/useMemory';
import { useSettings } from '../hooks/useSettings';
import { DataManagementPage } from './DataManagementPage';

// ─── Navigation model (exported for tests) ────────────────────
export type SettingsNavId =
  | 'account'
  | 'system'
  | 'agent'
  | 'memory'
  | 'model'
  | 'assistant'
  | 'personalization'
  | 'data'
  | 'security'
  | 'help';

export interface SettingsNavItem {
  id: SettingsNavId;
  labelKey: MessageKey;
  icon: LucideIcon;
}

/** The 10 left-navigation items, in display order. */
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'account', labelKey: 'nav.account', icon: User },
  { id: 'system', labelKey: 'nav.system', icon: SettingsIcon },
  { id: 'agent', labelKey: 'nav.agent', icon: Bot },
  { id: 'memory', labelKey: 'nav.memory', icon: Brain },
  { id: 'model', labelKey: 'nav.model', icon: Cpu },
  { id: 'assistant', labelKey: 'nav.assistant', icon: Sparkles },
  { id: 'personalization', labelKey: 'nav.personalization', icon: Palette },
  { id: 'data', labelKey: 'nav.data', icon: Database },
  { id: 'security', labelKey: 'nav.security', icon: Shield },
  { id: 'help', labelKey: 'nav.help', icon: HelpCircle },
];

// ─── System-settings control model (exported for tests) ───────
export type SystemControlKind = 'select-language' | 'slider-fontsize' | 'switch' | 'select-sendkey';

export interface SystemControl {
  key: keyof AppSettings;
  labelKey: MessageKey;
  descKey: MessageKey;
  kind: SystemControlKind;
}

/** The eight controls of the 系统设置 tab, in display order. */
export const SYSTEM_CONTROLS: SystemControl[] = [
  {
    key: 'language',
    labelKey: 'system.language.label',
    descKey: 'system.language.desc',
    kind: 'select-language',
  },
  {
    key: 'fontSize',
    labelKey: 'system.fontSize.label',
    descKey: 'system.fontSize.desc',
    kind: 'slider-fontsize',
  },
  {
    key: 'readingMode',
    labelKey: 'system.readingMode.label',
    descKey: 'system.readingMode.desc',
    kind: 'switch',
  },
  {
    key: 'sendKey',
    labelKey: 'system.sendKey.label',
    descKey: 'system.sendKey.desc',
    kind: 'select-sendkey',
  },
  {
    key: 'skillAutoUpdate',
    labelKey: 'system.skillAutoUpdate.label',
    descKey: 'system.skillAutoUpdate.desc',
    kind: 'switch',
  },
  {
    key: 'skillAutoInstall',
    labelKey: 'system.skillAutoInstall.label',
    descKey: 'system.skillAutoInstall.desc',
    kind: 'switch',
  },
  {
    key: 'lockScreenRemote',
    labelKey: 'system.lockScreenRemote.label',
    descKey: 'system.lockScreenRemote.desc',
    kind: 'switch',
  },
  {
    key: 'confirmDefaultStorage',
    labelKey: 'system.confirmDefaultStorage.label',
    descKey: 'system.confirmDefaultStorage.desc',
    kind: 'switch',
  },
];

// ─── N22 control catalogs (exported for tests) ────────────────
export const AGENT_CONTROL_KEYS = [
  'systemPrompt',
  'temperature',
  'maxTokens',
  'enabledTools',
] as const satisfies readonly (keyof AppSettings)[];

export const ASSISTANT_CONTROL_KEYS = [
  'assistantName',
  'assistantAvatar',
  'assistantGreeting',
  'replyStyle',
] as const satisfies readonly (keyof AppSettings)[];

export const MEMORY_CONTROL_KEYS = [
  'memoryEnabled',
  'memoryFrequency',
  'memoryRetentionDays',
] as const satisfies readonly (keyof AppSettings)[];

/** API-key providers exposed in the model tab (matches engine providers). */
export interface ModelApiProvider {
  id: string;
  label: string;
}
export const MODEL_API_PROVIDERS: ModelApiProvider[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'grok', label: 'xAI Grok' },
  { id: 'bedrock', label: 'AWS Bedrock' },
  { id: 'vertex', label: 'Google Vertex' },
];

// ─── Radix-based primitives (Apple aesthetic) ─────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-[26px] w-[44px] flex-shrink-0 rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] data-[state=checked]:bg-[var(--color-accent-green)]"
    >
      <RSwitch.Thumb className="block h-[22px] w-[22px] translate-x-[2px] rounded-[var(--radius-full)] bg-white shadow-sm transition-transform duration-[var(--duration-fast)] will-change-transform data-[state=checked]:translate-x-[20px]" />
    </RSwitch.Root>
  );
}

function FontSizeSlider({
  value,
  onChange,
  smallLabel,
  largeLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  smallLabel: string;
  largeLabel: string;
}) {
  return (
    <div className="flex w-[260px] items-center gap-3">
      <span className="text-xs text-[var(--color-text-tertiary)]">{smallLabel}</span>
      <RSlider.Root
        className="relative flex h-5 flex-1 touch-none select-none items-center"
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step={FONT_SIZE_STEP}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label="Font size"
      >
        <RSlider.Track className="relative h-1 flex-1 rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)]">
          <RSlider.Range className="absolute h-full rounded-[var(--radius-full)] bg-[var(--color-text-primary)]" />
        </RSlider.Track>
        <RSlider.Thumb className="block h-4 w-4 rounded-[var(--radius-full)] border border-[var(--color-border)] bg-white shadow-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] active:scale-95" />
      </RSlider.Root>
      <span className="text-base text-[var(--color-text-tertiary)]">{largeLabel}</span>
      <span className="w-9 text-right text-xs tabular-nums text-[var(--color-text-secondary)]">{value}px</span>
    </div>
  );
}

function ValueSlider({
  value,
  onChange,
  min,
  max,
  step,
  format,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  ariaLabel: string;
}) {
  return (
    <div className="flex w-[260px] items-center gap-3">
      <RSlider.Root
        className="relative flex h-5 flex-1 touch-none select-none items-center"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={ariaLabel}
      >
        <RSlider.Track className="relative h-1 flex-1 rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)]">
          <RSlider.Range className="absolute h-full rounded-[var(--radius-full)] bg-[var(--color-text-primary)]" />
        </RSlider.Track>
        <RSlider.Thumb className="block h-4 w-4 rounded-[var(--radius-full)] border border-[var(--color-border)] bg-white shadow-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] active:scale-95" />
      </RSlider.Root>
      <span className="w-12 text-right text-xs tabular-nums text-[var(--color-text-secondary)]">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  type?: 'text' | 'password';
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={e => onChange(e.target.value)}
      className="h-9 w-[260px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-[var(--color-text-tertiary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
    />
  );
}

function TextAreaField({
  value,
  onChange,
  ariaLabel,
  rows = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      aria-label={ariaLabel}
      rows={rows}
      onChange={e => onChange(e.target.value)}
      className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-[var(--color-text-tertiary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
    />
  );
}

function Dropdown({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <RSelect.Root value={value} onValueChange={onChange}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className="inline-flex h-9 min-w-[140px] items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] data-[state=open]:bg-[var(--color-bg-hover)]"
      >
        <RSelect.Value />
        <RSelect.Icon>
          <ChevronDown size={14} className="text-[var(--color-text-tertiary)]" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="z-[var(--z-popover,50)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg"
        >
          <RSelect.Viewport className="p-1">
            {options.map(opt => (
              <RSelect.Item
                key={opt.value}
                value={opt.value}
                className="relative flex h-8 cursor-pointer select-none items-center rounded-[var(--radius-sm)] pl-7 pr-3 text-sm text-[var(--color-text-primary)] outline-none data-[highlighted]:bg-[var(--color-bg-hover)] data-[state=checked]:font-medium"
              >
                <RSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check size={13} className="text-[var(--color-text-primary)]" />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{opt.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

// ─── Setting row ──────────────────────────────────────────────
function SettingRow({ label, description, control }: { label: string; description: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{description}</p>
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

/** A stacked row: label/description above a full-width control. */
function SettingBlock({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
      <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Section wrapper matching SystemSettingsTab's card styling. */
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[680px] px-8 py-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <div className="mt-4 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5">
        {children}
      </div>
    </div>
  );
}

// ─── System settings tab ──────────────────────────────────────
function SystemSettingsTab() {
  const { t } = useI18n();
  const { settings, setSetting } = useSettings();

  const languageOptions = LANGUAGE_CODES.map(code => ({
    value: code,
    label: t(`lang.${code}` as MessageKey),
  }));
  const sendKeyOptions = SEND_KEYS.map(key => ({
    value: key,
    label: t(`sendKey.${key}` as MessageKey),
  }));

  function renderControl(control: SystemControl): React.ReactNode {
    switch (control.kind) {
      case 'select-language':
        return (
          <Dropdown
            ariaLabel={t(control.labelKey)}
            value={settings.language}
            options={languageOptions}
            onChange={v => setSetting('language', v as AppSettings['language'])}
          />
        );
      case 'slider-fontsize':
        return (
          <FontSizeSlider
            value={settings.fontSize}
            smallLabel={t('system.fontSize.small')}
            largeLabel={t('system.fontSize.large')}
            onChange={v => setSetting('fontSize', v)}
          />
        );
      case 'select-sendkey':
        return (
          <Dropdown
            ariaLabel={t(control.labelKey)}
            value={settings.sendKey}
            options={sendKeyOptions}
            onChange={v => setSetting('sendKey', v as AppSettings['sendKey'])}
          />
        );
      default:
        return (
          <Toggle
            label={t(control.labelKey)}
            checked={Boolean(settings[control.key])}
            onChange={v => setSetting(control.key, v as never)}
          />
        );
    }
  }

  return (
    <div className="mx-auto w-full max-w-[680px] px-8 py-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('system.title')}</h2>
      <div className="mt-4 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5">
        {SYSTEM_CONTROLS.map(control => (
          <SettingRow
            key={control.key}
            label={t(control.labelKey)}
            description={t(control.descKey)}
            control={renderControl(control)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Agent settings tab (N22) ─────────────────────────────────
function AgentSettingsTab() {
  const { t } = useI18n();
  const { settings, setSetting } = useSettings();

  function toggleTool(tool: string, on: boolean) {
    const next = on ? [...new Set([...settings.enabledTools, tool])] : settings.enabledTools.filter(x => x !== tool);
    setSetting('enabledTools', next);
  }

  return (
    <SettingsSection title={t('agent.title')}>
      <SettingBlock label={t('agent.systemPrompt.label')} description={t('agent.systemPrompt.desc')}>
        <TextAreaField
          ariaLabel={t('agent.systemPrompt.label')}
          value={settings.systemPrompt}
          rows={6}
          onChange={v => setSetting('systemPrompt', v)}
        />
      </SettingBlock>
      <SettingRow
        label={t('agent.temperature.label')}
        description={t('agent.temperature.desc')}
        control={
          <ValueSlider
            ariaLabel={t('agent.temperature.label')}
            value={settings.temperature}
            min={TEMPERATURE_MIN}
            max={TEMPERATURE_MAX}
            step={TEMPERATURE_STEP}
            format={v => v.toFixed(1)}
            onChange={v => setSetting('temperature', v)}
          />
        }
      />
      <SettingRow
        label={t('agent.maxTokens.label')}
        description={t('agent.maxTokens.desc')}
        control={
          <ValueSlider
            ariaLabel={t('agent.maxTokens.label')}
            value={settings.maxTokens}
            min={MAX_TOKENS_MIN}
            max={MAX_TOKENS_MAX}
            step={MAX_TOKENS_STEP}
            onChange={v => setSetting('maxTokens', v)}
          />
        }
      />
      <SettingBlock label={t('agent.enabledTools.label')} description={t('agent.enabledTools.desc')}>
        <div className="grid grid-cols-3 gap-2">
          {AVAILABLE_TOOLS.map(tool => {
            const on = settings.enabledTools.includes(tool);
            return (
              <button
                key={tool}
                type="button"
                onClick={() => toggleTool(tool, !on)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-xs transition-colors duration-[var(--duration-fast)] ${
                  on
                    ? 'border-[var(--color-text-primary)] bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] border ${
                    on
                      ? 'border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-white'
                      : 'border-[var(--color-border)]'
                  }`}
                >
                  {on ? <Check size={11} /> : null}
                </span>
                <span className="truncate font-mono">{tool}</span>
              </button>
            );
          })}
        </div>
      </SettingBlock>
    </SettingsSection>
  );
}

// ─── Assistant settings tab (N22) ─────────────────────────────
function AssistantSettingsTab() {
  const { t } = useI18n();
  const { settings, setSetting } = useSettings();

  const replyStyleOptions = REPLY_STYLES.map(style => ({
    value: style,
    label: t(`replyStyle.${style}` as MessageKey),
  }));

  return (
    <SettingsSection title={t('assistant.title')}>
      <SettingRow
        label={t('assistant.name.label')}
        description={t('assistant.name.desc')}
        control={
          <TextField
            ariaLabel={t('assistant.name.label')}
            value={settings.assistantName}
            onChange={v => setSetting('assistantName', v)}
          />
        }
      />
      <SettingBlock label={t('assistant.avatar.label')} description={t('assistant.avatar.desc')}>
        <div className="flex flex-wrap gap-2">
          {ASSISTANT_AVATARS.map(avatar => {
            const active = settings.assistantAvatar === avatar;
            return (
              <button
                key={avatar}
                type="button"
                onClick={() => setSetting('assistantAvatar', avatar)}
                aria-label={avatar}
                aria-pressed={active}
                className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border text-xl transition-colors duration-[var(--duration-fast)] ${
                  active
                    ? 'border-[var(--color-text-primary)] bg-[var(--color-bg-hover)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                {avatar}
              </button>
            );
          })}
        </div>
      </SettingBlock>
      <SettingBlock label={t('assistant.greeting.label')} description={t('assistant.greeting.desc')}>
        <TextAreaField
          ariaLabel={t('assistant.greeting.label')}
          value={settings.assistantGreeting}
          rows={3}
          onChange={v => setSetting('assistantGreeting', v)}
        />
      </SettingBlock>
      <SettingRow
        label={t('assistant.replyStyle.label')}
        description={t('assistant.replyStyle.desc')}
        control={
          <Dropdown
            ariaLabel={t('assistant.replyStyle.label')}
            value={settings.replyStyle}
            options={replyStyleOptions}
            onChange={v => setSetting('replyStyle', v as AppSettings['replyStyle'])}
          />
        }
      />
    </SettingsSection>
  );
}

// ─── Memory settings tab (N22) ────────────────────────────────
function MemorySettingsTab() {
  const { t, lang } = useI18n();
  const { settings, setSetting } = useSettings();
  const { entries, remove, clear } = useMemory();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const frequencyOptions = MEMORY_FREQUENCIES.map(freq => ({
    value: freq,
    label: t(`memoryFreq.${freq}` as MessageKey),
  }));

  return (
    <SettingsSection title={t('memory.title')}>
      <SettingRow
        label={t('memory.enabled.label')}
        description={t('memory.enabled.desc')}
        control={
          <Toggle
            label={t('memory.enabled.label')}
            checked={settings.memoryEnabled}
            onChange={v => setSetting('memoryEnabled', v)}
          />
        }
      />
      <SettingRow
        label={t('memory.frequency.label')}
        description={t('memory.frequency.desc')}
        control={
          <Dropdown
            ariaLabel={t('memory.frequency.label')}
            value={settings.memoryFrequency}
            options={frequencyOptions}
            onChange={v => setSetting('memoryFrequency', v as AppSettings['memoryFrequency'])}
          />
        }
      />
      <SettingRow
        label={t('memory.retention.label')}
        description={t('memory.retention.desc')}
        control={
          <ValueSlider
            ariaLabel={t('memory.retention.label')}
            value={settings.memoryRetentionDays}
            min={MEMORY_RETENTION_MIN}
            max={MEMORY_RETENTION_MAX}
            step={1}
            onChange={v => setSetting('memoryRetentionDays', v)}
          />
        }
      />
      <SettingBlock label={t('memory.list.label')} description="">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">{t('memory.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map(entry => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--color-text-primary)]">{entry.content}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                    {entry.category} · {new Date(entry.createdAt).toLocaleString(lang)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(entry.id)}
                  aria-label={`${t('memory.category')} ${entry.id}`}
                  className="flex-shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent-red,#e5484d)]"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-2">
          {confirmingClear ? (
            <>
              <span className="text-xs text-[var(--color-text-secondary)]">{t('memory.clearConfirm')}</span>
              <button
                type="button"
                onClick={() => {
                  void clear();
                  setConfirmingClear(false);
                }}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent-red,#e5484d)] px-3 py-1.5 text-xs font-medium text-white"
              >
                {t('memory.clearAll')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-accent-red,#e5484d)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-red,#e5484d)] transition-colors hover:bg-[var(--color-accent-red,#e5484d)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={13} />
              {t('memory.clearAll')}
            </button>
          )}
        </div>
      </SettingBlock>
    </SettingsSection>
  );
}

// ─── Model settings tab (N22) ─────────────────────────────────
type ApiKeyStatus = { configured: Record<string, boolean>; encryptionAvailable: boolean };
type TestState = 'idle' | 'testing' | 'success' | 'failure';

function ModelSettingsTab() {
  const { t } = useI18n();
  const { settings, setSetting } = useSettings();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<ApiKeyStatus>({
    configured: {},
    encryptionAvailable: true,
  });
  const [testState, setTestState] = useState<TestState>('idle');

  const refreshStatus = async () => {
    const api = window.nexawork?.model;
    if (!api) return;
    const s = await api.apiKeyStatus();
    setStatus(s);
  };

  useEffect(() => {
    const api = window.nexawork?.model;
    if (!api) return;
    void api.list().then(({ models: list }: { models: ModelInfo[] }) => {
      setModels(list.map((m: ModelInfo) => ({ value: m.id, label: m.name })));
    });
    void refreshStatus();
  }, []);

  async function saveKey(provider: string) {
    const apiKey = keyDrafts[provider]?.trim();
    if (!apiKey) return;
    await window.nexawork?.model.setApiKey({ provider, apiKey });
    setKeyDrafts(prev => ({ ...prev, [provider]: '' }));
    await refreshStatus();
  }

  async function deleteKey(provider: string) {
    await window.nexawork?.model.deleteApiKey({ provider });
    await refreshStatus();
  }

  async function testConnection() {
    setTestState('testing');
    try {
      const res = await window.nexawork?.model.test({ modelId: settings.model });
      setTestState(res?.available ? 'success' : 'failure');
    } catch {
      setTestState('failure');
    }
  }

  return (
    <SettingsSection title={t('model.title')}>
      <SettingRow
        label={t('model.default.label')}
        description={t('model.default.desc')}
        control={
          <Dropdown
            ariaLabel={t('model.default.label')}
            value={settings.model}
            options={models.length > 0 ? models : [{ value: settings.model, label: settings.model }]}
            onChange={v => {
              setSetting('model', v);
              void window.nexawork?.model.set({ modelId: v });
            }}
          />
        }
      />
      <SettingBlock
        label={t('model.apiKey.label')}
        description={status.encryptionAvailable ? t('model.apiKey.desc') : t('model.encryption.unavailable')}
      >
        <div className="flex flex-col gap-2">
          {MODEL_API_PROVIDERS.map(provider => {
            const configured = status.configured[provider.id] === true;
            return (
              <div key={provider.id} className="flex items-center gap-2">
                <span className="w-28 flex-shrink-0 text-xs text-[var(--color-text-secondary)]">{provider.label}</span>
                <div className="relative flex-1">
                  <TextField
                    ariaLabel={`${provider.label} ${t('model.apiKey.label')}`}
                    type={revealed[provider.id] ? 'text' : 'password'}
                    placeholder={
                      configured ? `••••••••  (${t('model.apiKey.configured')})` : t('model.apiKey.placeholder')
                    }
                    value={keyDrafts[provider.id] ?? ''}
                    onChange={v => setKeyDrafts(prev => ({ ...prev, [provider.id]: v }))}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRevealed(prev => ({
                        ...prev,
                        [provider.id]: !prev[provider.id],
                      }))
                    }
                    aria-label="toggle visibility"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                  >
                    {revealed[provider.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void saveKey(provider.id)}
                  disabled={!keyDrafts[provider.id]?.trim()}
                  className="flex-shrink-0 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteKey(provider.id)}
                  disabled={!configured}
                  aria-label={`${provider.label} delete`}
                  className="flex-shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </SettingBlock>
      <SettingRow
        label={t('model.customEndpoint.label')}
        description={t('model.customEndpoint.desc')}
        control={
          <TextField
            ariaLabel={t('model.customEndpoint.label')}
            value={settings.customEndpoint}
            placeholder="https://"
            onChange={v => setSetting('customEndpoint', v)}
          />
        }
      />
      <SettingRow
        label={t('model.test.label')}
        description={t('model.test.desc')}
        control={
          <div className="flex items-center gap-3">
            {testState === 'success' ? (
              <span className="text-xs font-medium text-[var(--color-accent-green)]">{t('model.test.success')}</span>
            ) : null}
            {testState === 'failure' ? (
              <span className="text-xs font-medium text-[var(--color-accent-red,#e5484d)]">
                {t('model.test.failure')}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={testState === 'testing'}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
            >
              {testState === 'testing' ? t('model.test.testing') : t('model.test.button')}
            </button>
          </div>
        }
      />
    </SettingsSection>
  );
}

// ─── Placeholder tab (other nav items) ────────────────────────
function PlaceholderTab({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <p className="text-sm text-[var(--color-text-tertiary)]">{t('common.comingSoon')}</p>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────
export function SettingsPage() {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<SettingsNavId>('system');

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Left settings navigation */}
      <nav
        className="flex w-[220px] flex-shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3"
        aria-label="Settings navigation"
      >
        <span className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('settings.title')}
        </span>
        {SETTINGS_NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex h-9 items-center gap-3 rounded-[var(--radius-md)] px-2.5 text-left text-sm transition-colors duration-[var(--duration-fast)] ${
                active
                  ? 'bg-[var(--color-bg-hover)] font-medium text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="truncate">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {/* Right content area */}
      <div className="flex-1 overflow-y-auto">
        {activeId === 'system' ? (
          <SystemSettingsTab />
        ) : activeId === 'agent' ? (
          <AgentSettingsTab />
        ) : activeId === 'assistant' ? (
          <AssistantSettingsTab />
        ) : activeId === 'memory' ? (
          <MemorySettingsTab />
        ) : activeId === 'model' ? (
          <ModelSettingsTab />
        ) : activeId === 'data' ? (
          <DataManagementPage />
        ) : (
          <PlaceholderTab title={t(SETTINGS_NAV_ITEMS.find(i => i.id === activeId)?.labelKey ?? 'nav.system')} />
        )}
      </div>
    </div>
  );
}
