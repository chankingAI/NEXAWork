/**
 * NexaWork SettingsPage (N21)
 * ===========================
 * Apple-grade system settings panel: a 10-item left navigation rail plus a
 * right content area. The first item (系统设置 / System) is fully implemented
 * with eight live, persisted controls built on Radix UI primitives
 * (Switch / Slider / Select). All changes apply instantly and are written to
 * `settings.json` in the main process via the `useSettings` hook.
 */
import { useState } from 'react';
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
  HelpCircle,
  type LucideIcon,
  Palette,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import {
  type AppSettings,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LANGUAGE_CODES,
  SEND_KEYS,
} from '../../shared/settings';
import type { MessageKey } from '../i18n';
import { useI18n } from '../hooks/useI18n';
import { useSettings } from '../hooks/useSettings';

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
        ) : (
          <PlaceholderTab title={t(SETTINGS_NAV_ITEMS.find(i => i.id === activeId)?.labelKey ?? 'nav.system')} />
        )}
      </div>
    </div>
  );
}
