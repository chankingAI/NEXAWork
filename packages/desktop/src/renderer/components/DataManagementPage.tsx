/**
 * NexaWork DataManagementPage (N23)
 * =================================
 * Apple-grade 数据管理 (Data Management) tab: live statistics plus four
 * sub-sections — Export (JSON / Markdown, scoped), Import (validated, with
 * conflict handling), Clear (sessions with two-step confirmation, cache,
 * reset settings), and Backup / Restore (one-click full backup + lossless
 * restore). All operations go through `window.nexawork.data.*` and the page
 * refreshes its stats whenever the main process broadcasts a data change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Download, HardDrive, MessageSquare, RotateCcw, Trash2, Upload, Wrench } from 'lucide-react';
import type { ConflictStrategy, DataStats, ExportFormat, ExportScope, ImportStats } from '../../shared/ipc-channels';
import type { MessageKey } from '../i18n';
import { useI18n } from '../hooks/useI18n';

// ─── Section model (exported for tests) ───────────────────────
export type DataSectionId = 'export' | 'import' | 'clear' | 'backup';

export interface DataSection {
  id: DataSectionId;
  labelKey: MessageKey;
}

/** The four data-management sub-sections, in display order. */
export const DATA_SECTIONS: DataSection[] = [
  { id: 'export', labelKey: 'data.section.export' },
  { id: 'import', labelKey: 'data.section.import' },
  { id: 'clear', labelKey: 'data.section.clear' },
  { id: 'backup', labelKey: 'data.section.backup' },
];

// ─── Helpers ──────────────────────────────────────────────────
const EXPORT_SCOPES: ExportScope[] = ['all', 'dateRange', 'sessions'];
const EXPORT_FORMATS: ExportFormat[] = ['json', 'markdown'];

/** Human-readable byte size (B / KB / MB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${exp === 0 ? value : value.toFixed(1)} ${units[exp]}`;
}

/** Trigger a browser download of text content. */
function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Fill `{placeholder}` tokens in a translated string. */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

// ─── Shared primitives ────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
        {icon}
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-1"
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
              active
                ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ─── Export section ───────────────────────────────────────────
function ExportSection() {
  const { t } = useI18n();
  const [scope, setScope] = useState<ExportScope>('all');
  const [format, setFormat] = useState<ExportFormat>('json');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState('');

  async function handleExport() {
    setMessage('');
    const result = await window.nexawork?.data.export({
      scope,
      format,
      startDate: scope === 'dateRange' ? startDate || undefined : undefined,
      endDate: scope === 'dateRange' ? endDate || undefined : undefined,
    });
    if (!result) return;
    downloadText(result.filename, result.content);
    setMessage(interpolate(t('data.export.success'), { count: result.byteLength }));
  }

  return (
    <Section title={t('data.export.title')} description={t('data.export.desc')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('data.export.scope.label')}</span>
          <SegmentedControl
            ariaLabel={t('data.export.scope.label')}
            value={scope}
            onChange={setScope}
            options={EXPORT_SCOPES.map(s => ({
              value: s,
              label: t(`data.export.scope.${s}` as MessageKey),
            }))}
          />
        </label>

        {scope === 'dateRange' ? (
          <div className="flex gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                {t('data.export.startDate')}
              </span>
              <input
                type="date"
                value={startDate}
                aria-label={t('data.export.startDate')}
                onChange={e => setStartDate(e.target.value)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('data.export.endDate')}</span>
              <input
                type="date"
                value={endDate}
                aria-label={t('data.export.endDate')}
                onChange={e => setEndDate(e.target.value)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
              />
            </label>
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('data.export.format.label')}
          </span>
          <SegmentedControl
            ariaLabel={t('data.export.format.label')}
            value={format}
            onChange={setFormat}
            options={EXPORT_FORMATS.map(f => ({
              value: f,
              label: t(`data.export.format.${f}` as MessageKey),
            }))}
          />
        </label>

        <div className="flex items-center gap-3">
          <PrimaryButton onClick={() => void handleExport()}>
            <Download size={15} />
            {t('data.export.button')}
          </PrimaryButton>
          {message ? <span className="text-xs text-[var(--color-accent-green)]">{message}</span> : null}
        </div>
      </div>
    </Section>
  );
}

// ─── Import section ───────────────────────────────────────────
function ImportSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    setMessage('');
    setError('');
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    try {
      const result = await window.nexawork?.data.import({ content, strategy });
      const stats: ImportStats | undefined = result?.stats;
      if (stats) {
        setMessage(
          interpolate(t('data.import.success'), {
            sessions: stats.importedSessions,
            skills: stats.importedSkills,
          }),
        );
        onChanged();
      }
    } catch {
      setError(t('data.import.invalid'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <Section title={t('data.import.title')} description={t('data.import.desc')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('data.import.strategy.label')}
          </span>
          <SegmentedControl
            ariaLabel={t('data.import.strategy.label')}
            value={strategy}
            onChange={setStrategy}
            options={(['skip', 'overwrite'] as ConflictStrategy[]).map(s => ({
              value: s,
              label: t(`data.import.strategy.${s}` as MessageKey),
            }))}
          />
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          aria-label={t('data.import.button')}
          onChange={e => void handleFile(e)}
          className="hidden"
        />
        <div className="flex items-center gap-3">
          <PrimaryButton onClick={() => inputRef.current?.click()}>
            <Upload size={15} />
            {t('data.import.button')}
          </PrimaryButton>
          {message ? <span className="text-xs text-[var(--color-accent-green)]">{message}</span> : null}
          {error ? <span className="text-xs text-[var(--color-accent-red,#e5484d)]">{error}</span> : null}
        </div>
      </div>
    </Section>
  );
}

// ─── Clear section ────────────────────────────────────────────
function DangerRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
          {icon}
          {label}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{description}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function DangerButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-md)] border border-[var(--color-accent-red,#e5484d)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-red,#e5484d)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-red,#e5484d)] hover:text-white"
    >
      {children}
    </button>
  );
}

function ClearSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  // 0 = idle, 1 = first confirm, 2 = final confirm
  const [clearStep, setClearStep] = useState(0);
  const [confirmCache, setConfirmCache] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function clearSessions() {
    await window.nexawork?.data.clearSessions();
    setClearStep(0);
    onChanged();
  }

  async function clearCache() {
    await window.nexawork?.data.clearCache();
    setConfirmCache(false);
    onChanged();
  }

  async function resetSettings() {
    await window.nexawork?.data.resetSettings();
    setConfirmReset(false);
    onChanged();
  }

  return (
    <Section title={t('data.clear.title')} description="">
      <div className="divide-y divide-[var(--color-border)]">
        <DangerRow
          icon={<Trash2 size={14} className="text-[var(--color-accent-red,#e5484d)]" />}
          label={t('data.clear.sessions.label')}
          description={
            clearStep === 1
              ? t('data.clear.sessions.confirm1')
              : clearStep === 2
                ? t('data.clear.sessions.confirm2')
                : t('data.clear.sessions.desc')
          }
        >
          {clearStep === 0 ? (
            <DangerButton onClick={() => setClearStep(1)}>{t('data.clear.sessions.button')}</DangerButton>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setClearStep(0)}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => (clearStep === 1 ? setClearStep(2) : void clearSessions())}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent-red,#e5484d)] px-3 py-1.5 text-xs font-medium text-white"
              >
                {clearStep === 1 ? t('data.confirm.continue') : t('data.clear.sessions.button')}
              </button>
            </>
          )}
        </DangerRow>

        <DangerRow
          icon={<Wrench size={14} className="text-[var(--color-text-tertiary)]" />}
          label={t('data.clear.cache.label')}
          description={t('data.clear.cache.desc')}
        >
          {confirmCache ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmCache(false)}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void clearCache()}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent-red,#e5484d)] px-3 py-1.5 text-xs font-medium text-white"
              >
                {t('data.confirm.continue')}
              </button>
            </>
          ) : (
            <DangerButton onClick={() => setConfirmCache(true)}>{t('data.clear.cache.button')}</DangerButton>
          )}
        </DangerRow>

        <DangerRow
          icon={<RotateCcw size={14} className="text-[var(--color-text-tertiary)]" />}
          label={t('data.clear.reset.label')}
          description={confirmReset ? t('data.clear.reset.confirm') : t('data.clear.reset.desc')}
        >
          {confirmReset ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void resetSettings()}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent-red,#e5484d)] px-3 py-1.5 text-xs font-medium text-white"
              >
                {t('data.confirm.continue')}
              </button>
            </>
          ) : (
            <DangerButton onClick={() => setConfirmReset(true)}>{t('data.clear.reset.button')}</DangerButton>
          )}
        </DangerRow>
      </div>
    </Section>
  );
}

// ─── Backup / Restore section ─────────────────────────────────
function BackupSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setMessage('');
    setError('');
    const result = await window.nexawork?.data.backup();
    if (!result) return;
    downloadText(result.filename, result.content);
    setMessage(interpolate(t('data.backup.success'), { count: result.byteLength }));
  }

  async function handleRestore(event: React.ChangeEvent<HTMLInputElement>) {
    setMessage('');
    setError('');
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    try {
      const result = await window.nexawork?.data.restore({ content });
      if (result?.success) {
        setMessage(t('data.restore.success'));
        onChanged();
      }
    } catch {
      setError(t('data.import.invalid'));
    } finally {
      setConfirmRestore(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <Section title={t('data.backup.title')} description={t('data.backup.desc')}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <PrimaryButton onClick={() => void handleBackup()}>
            <Archive size={15} />
            {t('data.backup.button')}
          </PrimaryButton>
          {message ? <span className="text-xs text-[var(--color-accent-green)]">{message}</span> : null}
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{t('data.restore.label')}</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t('data.restore.desc')}</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            aria-label={t('data.restore.button')}
            onChange={e => void handleRestore(e)}
            className="hidden"
          />
          <div className="mt-3 flex items-center gap-2">
            {confirmRestore ? (
              <>
                <span className="text-xs text-[var(--color-text-secondary)]">{t('data.restore.confirm')}</span>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  {t('data.confirm.continue')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestore(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRestore(true)}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                <Upload size={14} />
                {t('data.restore.button')}
              </button>
            )}
          </div>
          {error ? <p className="mt-2 text-xs text-[var(--color-accent-red,#e5484d)]">{error}</p> : null}
        </div>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export function DataManagementPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<DataStats | null>(null);
  const [section, setSection] = useState<DataSectionId>('export');

  const refresh = useCallback(async () => {
    const result = await window.nexawork?.data.stats();
    if (result) setStats(result);
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = window.nexawork?.data.onChanged(() => {
      void refresh();
    });
    return () => {
      unsubscribe?.();
    };
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 py-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('data.title')}</h2>

      {/* Statistics */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('data.stats.title')}</h3>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <StatCard
            icon={<MessageSquare size={13} />}
            label={t('data.stats.sessions')}
            value={String(stats?.sessionCount ?? 0)}
          />
          <StatCard
            icon={<MessageSquare size={13} />}
            label={t('data.stats.messages')}
            value={String(stats?.messageCount ?? 0)}
          />
          <StatCard icon={<Wrench size={13} />} label={t('data.stats.skills')} value={String(stats?.skillCount ?? 0)} />
          <StatCard
            icon={<HardDrive size={13} />}
            label={t('data.stats.disk')}
            value={formatBytes(stats?.diskUsageBytes ?? 0)}
          />
        </div>
      </div>

      {/* Section tabs */}
      <div className="mt-6">
        <SegmentedControl
          ariaLabel={t('data.title')}
          value={section}
          onChange={setSection}
          options={DATA_SECTIONS.map(s => ({ value: s.id, label: t(s.labelKey) }))}
        />
      </div>

      <div className="mt-4">
        {section === 'export' ? <ExportSection /> : null}
        {section === 'import' ? <ImportSection onChanged={() => void refresh()} /> : null}
        {section === 'clear' ? <ClearSection onChanged={() => void refresh()} /> : null}
        {section === 'backup' ? <BackupSection onChanged={() => void refresh()} /> : null}
      </div>
    </div>
  );
}
