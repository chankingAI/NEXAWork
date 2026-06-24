/**
 * NexaWork SecurityCenterPage (N32)
 * ==================================
 * Apple-grade security center: sandbox security (master switch + file / command
 * / network sub-policies), data security (gateway + transport encryption),
 * system-level tools mode, built-in runtimes (Python / Node.js / Git Bash) with
 * detected versions, an audit center (intercept / allow records with JSON
 * export + clear) and experimental features (version management + delete
 * protection).
 *
 * All state lives in the main-process SecurityManager and is reached through the
 * `useSecurityCenter` hook (IPC only); this file is presentation + intent.
 */
import { useMemo, useState } from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import * as RSelect from '@radix-ui/react-select';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileCheck2,
  FlaskConical,
  Globe,
  HardDrive,
  Lock,
  ScrollText,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import type { MessageKey } from '../i18n';
import { useSecurityCenter } from '../hooks/useSecurityCenter';
import {
  type AuditCategory,
  type AuditDecision,
  AUDIT_DECISION_COLOR,
  type AuditFilter,
  type AuditLogEntry,
  filterAuditLog,
  summarizeAudit,
  type SystemToolsMode,
} from '../../shared/security-center';

// ─── Presentation helpers (testable) ──────────────────────────

export function auditDecisionLabelKey(decision: AuditDecision): MessageKey {
  return `security.audit.decision.${decision}` as MessageKey;
}

export function auditCategoryLabelKey(category: AuditCategory): MessageKey {
  return `security.audit.category.${category}` as MessageKey;
}

export function systemToolsModeLabelKey(mode: SystemToolsMode): MessageKey {
  return `security.systemTools.${mode}` as MessageKey;
}

/** Local time formatter for an audit timestamp (mm-dd hh:mm:ss). */
export function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Trigger a browser download of text content (matches DataManagementPage). */
function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ─── Primitives (Apple aesthetic, Radix-based) ────────────────

function Toggle({
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

/** A pill that reads 已开启 / 已关闭 with the matching tone. */
function StatusTag({ on, label }: { on: boolean; label: string }) {
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

function Card({
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

function Row({
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

// ─── Page ─────────────────────────────────────────────────────

export function SecurityCenterPage() {
  const { t } = useI18n();
  const { available, config, auditLog, busy, updateConfig, clearAudit, exportAudit } = useSecurityCenter();

  const [auditFilter, setAuditFilter] = useState<AuditFilter>({
    category: 'all',
    decision: 'all',
  });

  const filteredAudit = useMemo(() => filterAuditLog(auditLog, auditFilter), [auditLog, auditFilter]);
  const summary = useMemo(() => summarizeAudit(auditLog), [auditLog]);

  const statusLabel = (on: boolean) => (on ? t('security.status.on') : t('security.status.off'));

  const onExport = async () => {
    const result = await exportAudit();
    if (result) downloadText(result.filename, result.content);
  };

  if (!available) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
        {t('security.unavailable')}
      </div>
    );
  }

  const sandbox = config.sandbox;
  const runtimes = config.runtimes;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-4">
        <ShieldCheck size={20} className="text-[var(--color-text-primary)]" />
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{t('security.title')}</h2>
        <span className="rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-[11px] text-[var(--color-text-tertiary)]">
          {t('security.subtitle')}
        </span>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {/* Sandbox security */}
          <Card
            icon={<ShieldCheck size={16} />}
            title={t('security.sandbox.title')}
            description={t('security.sandbox.desc')}
            action={
              <Toggle
                checked={sandbox.enabled}
                onChange={v => updateConfig({ sandbox: { enabled: v } })}
                label={t('security.sandbox.title')}
              />
            }
          >
            <Row
              label={t('security.sandbox.file')}
              description={t('security.sandbox.fileDesc')}
              control={
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={sandbox.fileSecurity}
                    disabled={!sandbox.enabled}
                    onChange={v => updateConfig({ sandbox: { fileSecurity: v } })}
                    label={t('security.sandbox.file')}
                  />
                  <ChevronRight size={16} className="text-[var(--color-text-quaternary)]" />
                </div>
              }
            />
            <Row
              label={t('security.sandbox.command')}
              description={t('security.sandbox.commandDesc')}
              control={
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={sandbox.commandSecurity}
                    disabled={!sandbox.enabled}
                    onChange={v => updateConfig({ sandbox: { commandSecurity: v } })}
                    label={t('security.sandbox.command')}
                  />
                  <ChevronRight size={16} className="text-[var(--color-text-quaternary)]" />
                </div>
              }
            />
            <Row
              label={t('security.sandbox.network')}
              description={t('security.sandbox.networkDesc')}
              control={
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={sandbox.networkSecurity}
                    disabled={!sandbox.enabled}
                    onChange={v => updateConfig({ sandbox: { networkSecurity: v } })}
                    label={t('security.sandbox.network')}
                  />
                  <ChevronRight size={16} className="text-[var(--color-text-quaternary)]" />
                </div>
              }
            />
          </Card>

          {/* Data security */}
          <Card icon={<Lock size={16} />} title={t('security.dataSecurity.title')}>
            <Row
              label={t('security.dataSecurity.gateway')}
              control={
                <div className="flex items-center gap-3">
                  <StatusTag on={config.dataSecurity.gateway} label={statusLabel(config.dataSecurity.gateway)} />
                  <Toggle
                    checked={config.dataSecurity.gateway}
                    onChange={v => updateConfig({ dataSecurity: { gateway: v } })}
                    label={t('security.dataSecurity.gateway')}
                  />
                </div>
              }
            />
            <Row
              label={t('security.dataSecurity.encryption')}
              control={
                <div className="flex items-center gap-3">
                  <StatusTag on={config.dataSecurity.encryption} label={statusLabel(config.dataSecurity.encryption)} />
                  <Toggle
                    checked={config.dataSecurity.encryption}
                    onChange={v => updateConfig({ dataSecurity: { encryption: v } })}
                    label={t('security.dataSecurity.encryption')}
                  />
                </div>
              }
            />
          </Card>

          {/* System-level tools */}
          <Card
            icon={<HardDrive size={16} />}
            title={t('security.systemTools.title')}
            description={t('security.systemTools.desc')}
            action={
              <Dropdown
                ariaLabel={t('security.systemTools.title')}
                value={config.systemTools}
                onChange={v => updateConfig({ systemTools: v as SystemToolsMode })}
                options={(['disabled', 'readonly', 'full'] as SystemToolsMode[]).map(m => ({
                  value: m,
                  label: t(systemToolsModeLabelKey(m)),
                }))}
              />
            }
          />

          {/* Built-in runtimes */}
          <Card
            icon={<Terminal size={16} />}
            title={t('security.runtimes.title')}
            description={t('security.runtimes.desc')}
            action={
              <Toggle
                checked={runtimes.enabled}
                onChange={v => updateConfig({ runtimes: { enabled: v } })}
                label={t('security.runtimes.title')}
              />
            }
          >
            <Row
              label={t('security.runtimes.python')}
              description={runtimes.python.version ?? t('security.runtimes.versionUnknown')}
              control={
                <Toggle
                  checked={runtimes.python.enabled}
                  disabled={!runtimes.enabled}
                  onChange={v => updateConfig({ runtimes: { python: { enabled: v } } })}
                  label={t('security.runtimes.python')}
                />
              }
            />
            <Row
              label={t('security.runtimes.node')}
              description={runtimes.node.version ?? t('security.runtimes.versionUnknown')}
              control={
                <Toggle
                  checked={runtimes.node.enabled}
                  disabled={!runtimes.enabled}
                  onChange={v => updateConfig({ runtimes: { node: { enabled: v } } })}
                  label={t('security.runtimes.node')}
                />
              }
            />
            <Row
              label={t('security.runtimes.gitBash')}
              control={
                <Toggle
                  checked={runtimes.gitBash.enabled}
                  disabled={!runtimes.enabled}
                  onChange={v => updateConfig({ runtimes: { gitBash: { enabled: v } } })}
                  label={t('security.runtimes.gitBash')}
                />
              }
            />
          </Card>

          {/* Audit center */}
          <Card
            icon={<ScrollText size={16} />}
            title={t('security.audit.title')}
            description={t('security.audit.desc')}
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onExport}
                  disabled={auditLog.length === 0}
                  className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={13} />
                  {t('security.audit.export')}
                </button>
                <button
                  type="button"
                  onClick={() => void clearAudit()}
                  disabled={busy || auditLog.length === 0}
                  className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent-red)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={13} />
                  {t('security.audit.clear')}
                </button>
              </div>
            }
          >
            {/* Filter chips */}
            <div className="flex items-center gap-1.5 py-3">
              {(
                [
                  ['all', t('security.audit.filter.all')],
                  ['allow', t('security.audit.decision.allow')],
                  ['deny', t('security.audit.decision.deny')],
                  ['intercept', t('security.audit.decision.intercept')],
                ] as [AuditDecision | 'all', string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAuditFilter(f => ({ ...f, decision: id }))}
                  className={`rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] font-medium transition-colors duration-[var(--duration-fast)] ${
                    (auditFilter.decision ?? 'all') === id
                      ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                      : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)]">
                {t('security.audit.total')} {summary.total}
              </span>
            </div>

            {/* List */}
            <div className="max-h-[280px] overflow-y-auto pb-3">
              {filteredAudit.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">
                  {t('security.audit.empty')}
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filteredAudit.map(entry => (
                    <AuditRow key={entry.id} entry={entry} t={t} />
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Experimental features */}
          <Card icon={<FlaskConical size={16} />} title={t('security.experimental.title')}>
            <Row
              label={t('security.experimental.versionManagement')}
              description={t('security.experimental.versionManagementDesc')}
              control={
                <Toggle
                  checked={config.experimental.versionManagement}
                  onChange={v => updateConfig({ experimental: { versionManagement: v } })}
                  label={t('security.experimental.versionManagement')}
                />
              }
            />
            <Row
              label={t('security.experimental.deleteProtection')}
              description={t('security.experimental.deleteProtectionDesc')}
              control={
                <Toggle
                  checked={config.experimental.deleteProtection}
                  onChange={v => updateConfig({ experimental: { deleteProtection: v } })}
                  label={t('security.experimental.deleteProtection')}
                />
              }
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function AuditRow({ entry, t }: { entry: AuditLogEntry; t: (key: MessageKey) => string }) {
  const color = AUDIT_DECISION_COLOR[entry.decision];
  const Icon =
    entry.category === 'network'
      ? Globe
      : entry.category === 'command'
        ? Terminal
        : entry.category === 'file'
          ? FileCheck2
          : ScrollText;
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--color-bg-hover)]">
      <Icon size={14} className="text-[var(--color-text-tertiary)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-[var(--color-text-primary)]">{entry.action}</span>
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
            {t(auditCategoryLabelKey(entry.category))}
          </span>
        </div>
        <p className="truncate text-[10px] text-[var(--color-text-tertiary)]">{entry.detail}</p>
      </div>
      <span
        className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {t(auditDecisionLabelKey(entry.decision))}
      </span>
      <span className="w-[88px] flex-shrink-0 text-right font-mono text-[10px] text-[var(--color-text-tertiary)]">
        {formatAuditTime(entry.timestamp)}
      </span>
    </li>
  );
}
