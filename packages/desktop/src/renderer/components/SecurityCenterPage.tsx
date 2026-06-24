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
import {
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
import type { RuleCategory } from '../../shared/security-rules';
import { Card, Dropdown, Row, StatusTag, Toggle } from './security/primitives';
import { SecurityRulesPage } from './security/SecurityRulesPage';
import { RuntimeManagerPage } from './security/RuntimeManagerPage';
import { AuditDetailPage } from './security/AuditDetailPage';

/** Which security view is currently shown (home or a N33–N35 sub-page). */
type SecurityView = 'home' | RuleCategory | 'runtime' | 'audit';

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

// ─── Page ─────────────────────────────────────────────────────

export function SecurityCenterPage() {
  const { t } = useI18n();
  const { available, config, auditLog, busy, updateConfig, clearAudit, exportAudit } = useSecurityCenter();

  const [view, setView] = useState<SecurityView>('home');
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

  // N33–N35 sub-pages.
  const back = () => setView('home');
  if (view === 'file' || view === 'command' || view === 'network') {
    return <SecurityRulesPage category={view} onBack={back} />;
  }
  if (view === 'runtime') return <RuntimeManagerPage onBack={back} />;
  if (view === 'audit') return <AuditDetailPage onBack={back} />;

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
              onClick={() => setView('file')}
              control={
                <div className="flex items-center gap-3">
                  <span onClick={e => e.stopPropagation()}>
                    <Toggle
                      checked={sandbox.fileSecurity}
                      disabled={!sandbox.enabled}
                      onChange={v => updateConfig({ sandbox: { fileSecurity: v } })}
                      label={t('security.sandbox.file')}
                    />
                  </span>
                  <ChevronRight size={16} className="text-[var(--color-text-quaternary)]" />
                </div>
              }
            />
            <Row
              label={t('security.sandbox.command')}
              description={t('security.sandbox.commandDesc')}
              onClick={() => setView('command')}
              control={
                <div className="flex items-center gap-3">
                  <span onClick={e => e.stopPropagation()}>
                    <Toggle
                      checked={sandbox.commandSecurity}
                      disabled={!sandbox.enabled}
                      onChange={v => updateConfig({ sandbox: { commandSecurity: v } })}
                      label={t('security.sandbox.command')}
                    />
                  </span>
                  <ChevronRight size={16} className="text-[var(--color-text-quaternary)]" />
                </div>
              }
            />
            <Row
              label={t('security.sandbox.network')}
              description={t('security.sandbox.networkDesc')}
              onClick={() => setView('network')}
              control={
                <div className="flex items-center gap-3">
                  <span onClick={e => e.stopPropagation()}>
                    <Toggle
                      checked={sandbox.networkSecurity}
                      disabled={!sandbox.enabled}
                      onChange={v => updateConfig({ sandbox: { networkSecurity: v } })}
                      label={t('security.sandbox.network')}
                    />
                  </span>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView('runtime')}
                  className="flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                >
                  {t('security.subpage.manage')}
                  <ChevronRight size={14} />
                </button>
                <Toggle
                  checked={runtimes.enabled}
                  onChange={v => updateConfig({ runtimes: { enabled: v } })}
                  label={t('security.runtimes.title')}
                />
              </div>
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
                  onClick={() => setView('audit')}
                  className="flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                >
                  {t('security.subpage.detail')}
                  <ChevronRight size={14} />
                </button>
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
