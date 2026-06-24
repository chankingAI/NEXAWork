/**
 * Shared Apple-aesthetic primitives for the security center + its sub-pages
 * (N32–N35). Extracted so the main page and the file / command / network /
 * runtime / audit sub-pages render with one consistent visual language.
 */
import type React from 'react';
import * as RSelect from '@radix-ui/react-select';
import * as RSwitch from '@radix-ui/react-switch';
import { Check, ChevronDown, ChevronLeft } from 'lucide-react';

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-[26px] w-[44px] flex-shrink-0 rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-[var(--color-accent-green)]"
    >
      <RSwitch.Thumb className="block h-[22px] w-[22px] translate-x-[2px] rounded-[var(--radius-full)] bg-white shadow-sm transition-transform duration-[var(--duration-fast)] will-change-transform data-[state=checked]:translate-x-[20px]" />
    </RSwitch.Root>
  );
}

export function Dropdown({
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

/** A pill that reads 已开启 / 已关闭 with the matching tone. */
export function StatusTag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] font-medium"
      style={{
        backgroundColor: on ? 'rgba(52,199,89,0.12)' : 'var(--color-bg-tertiary)',
        color: on ? '#34C759' : 'var(--color-text-tertiary)',
      }}
    >
      {on ? <Check size={11} /> : null}
      {label}
    </span>
  );
}

export function Card({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
            {description ? <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children ? <div className="border-t border-[var(--color-border)] px-5">{children}</div> : null}
    </section>
  );
}

export function Row({
  label,
  description,
  control,
  onClick,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between gap-6 border-b border-[var(--color-border)] py-3.5 last:border-b-0 ${
        interactive ? 'cursor-pointer rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-hover)]' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm text-[var(--color-text-primary)]">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{description}</p> : null}
      </div>
      {control}
    </div>
  );
}

/** Sub-page header with a back button (N33–N35). */
export function SubPageHeader({
  icon,
  title,
  subtitle,
  backLabel,
  onBack,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-4">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-sm text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <ChevronLeft size={18} />
        {backLabel}
      </button>
      <span className="h-5 w-px bg-[var(--color-border)]" />
      <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {subtitle ? <p className="text-xs text-[var(--color-text-tertiary)]">{subtitle}</p> : null}
      </div>
    </header>
  );
}
