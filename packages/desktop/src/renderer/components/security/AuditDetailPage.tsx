/**
 * NexaWork AuditDetailPage (N35)
 * ===============================
 * The audit-center detail sub-page: the full audit log with category / decision
 * filters, a time-range window, free-text search, an entry detail view, and an
 * export with a JSON / CSV format choice. Filtering uses the shared pure
 * `filterAuditLog`; the export is performed in the main process (honouring the
 * same filter) so the downloaded file matches what is on screen.
 */
import { useMemo, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useSecurityCenter } from '../../hooks/useSecurityCenter';
import {
  AUDIT_DECISION_COLOR,
  AUDIT_EXPORT_FORMATS,
  type AuditCategory,
  type AuditDecision,
  type AuditExportFormat,
  type AuditFilter,
  type AuditLogEntry,
  filterAuditLog,
  summarizeAudit,
} from '../../../shared/security-center';
import { auditCategoryLabelKey, auditDecisionLabelKey, formatAuditTime } from '../SecurityCenterPage';
import { Card, Dropdown, SubPageHeader } from './primitives';

const CATEGORIES: (AuditCategory | 'all')[] = ['all', 'file', 'command', 'network', 'policy', 'runtime', 'data'];
const DECISIONS: (AuditDecision | 'all')[] = ['all', 'allow', 'deny', 'intercept'];

/** Convert a `datetime-local` value to an ISO string (empty → undefined). */
function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/** Trigger a browser download of text content with a format-aware mime type. */
function downloadText(filename: string, content: string, format: AuditExportFormat): void {
  const mime = format === 'csv' ? 'text/csv' : 'application/json';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function DetailRow({ entry, expanded, onToggle }: { entry: AuditLogEntry; expanded: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const color = AUDIT_DECISION_COLOR[entry.decision];
  return (
    <li className="rounded-[var(--radius-sm)] border border-transparent hover:border-[var(--color-border)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 text-left hover:bg-[var(--color-bg-hover)]"
      >
        <span
          className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {t(auditDecisionLabelKey(entry.decision))}
        </span>
        <span className="truncate text-xs font-medium text-[var(--color-text-primary)]">{entry.action}</span>
        <span className="rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
          {t(auditCategoryLabelKey(entry.category))}
        </span>
        <span className="ml-auto flex-shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {formatAuditTime(entry.timestamp)}
        </span>
      </button>
      {expanded ? (
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 px-3 pb-3 pt-1 text-[11px]">
          <dt className="text-[var(--color-text-tertiary)]">{t('security.auditDetail.timestamp')}</dt>
          <dd className="font-mono text-[var(--color-text-secondary)]">{entry.timestamp}</dd>
          <dt className="text-[var(--color-text-tertiary)]">{t('security.auditDetail.riskLevel')}</dt>
          <dd className="text-[var(--color-text-secondary)]">{entry.riskLevel}</dd>
          <dt className="text-[var(--color-text-tertiary)]">{t('security.audit.detail')}</dt>
          <dd className="break-words font-mono text-[var(--color-text-secondary)]">{entry.detail || '—'}</dd>
        </dl>
      ) : null}
    </li>
  );
}

export function AuditDetailPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const { auditLog, clearAudit, exportAudit, busy } = useSecurityCenter();

  const [category, setCategory] = useState<AuditCategory | 'all'>('all');
  const [decision, setDecision] = useState<AuditDecision | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<AuditExportFormat>('json');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filter = useMemo<AuditFilter>(
    () => ({ category, decision, from: localToIso(from), to: localToIso(to), search }),
    [category, decision, from, to, search],
  );
  const filtered = useMemo(() => filterAuditLog(auditLog, filter), [auditLog, filter]);
  const summary = useMemo(() => summarizeAudit(filtered), [filtered]);

  const onExport = async () => {
    const result = await exportAudit({ format, filter });
    if (result) downloadText(result.filename, result.content, format);
  };

  const resetFilters = () => {
    setCategory('all');
    setDecision('all');
    setFrom('');
    setTo('');
    setSearch('');
  };

  const inputCls =
    'h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-xs text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      <SubPageHeader
        icon={<ScrollText size={15} />}
        title={t('security.auditDetail.title')}
        subtitle={t('security.auditDetail.desc')}
        backLabel={t('security.subpage.back')}
        onBack={onBack}
      />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Card icon={<ScrollText size={16} />} title={t('security.auditDetail.title')}>
            {/* Filters */}
            <div className="flex flex-col gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    {t('security.auditDetail.filter.category')}
                  </span>
                  <Dropdown
                    ariaLabel={t('security.auditDetail.filter.category')}
                    value={category}
                    onChange={v => setCategory(v as AuditCategory | 'all')}
                    options={CATEGORIES.map(c => ({
                      value: c,
                      label: c === 'all' ? t('security.audit.filter.all') : t(auditCategoryLabelKey(c)),
                    }))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    {t('security.auditDetail.filter.decision')}
                  </span>
                  <Dropdown
                    ariaLabel={t('security.auditDetail.filter.decision')}
                    value={decision}
                    onChange={v => setDecision(v as AuditDecision | 'all')}
                    options={DECISIONS.map(d => ({
                      value: d,
                      label: d === 'all' ? t('security.audit.filter.all') : t(auditDecisionLabelKey(d)),
                    }))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    {t('security.auditDetail.filter.from')}
                  </span>
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={e => setFrom(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    {t('security.auditDetail.filter.to')}
                  </span>
                  <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  {t('security.auditDetail.filter.search')}
                </span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('security.auditDetail.filter.searchPlaceholder')}
                  className={inputCls}
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                >
                  {t('security.auditDetail.filter.reset')}
                </button>
                <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)]">
                  {t('security.auditDetail.showing')} {filtered.length} {t('security.auditDetail.of')} {auditLog.length}
                </span>
              </div>
            </div>
          </Card>

          {/* Export bar */}
          <Card icon={<Download size={16} />} title={t('security.audit.export')}>
            <div className="flex items-center gap-2 py-4">
              <span className="text-xs text-[var(--color-text-secondary)]">{t('security.auditDetail.format')}</span>
              <Dropdown
                ariaLabel={t('security.auditDetail.format')}
                value={format}
                onChange={v => setFormat(v as AuditExportFormat)}
                options={AUDIT_EXPORT_FORMATS.map(f => ({ value: f, label: f.toUpperCase() }))}
              />
              <button
                type="button"
                onClick={onExport}
                disabled={filtered.length === 0}
                className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Download size={13} />
                {t('security.audit.export')}
              </button>
              <button
                type="button"
                onClick={() => void clearAudit()}
                disabled={busy || auditLog.length === 0}
                className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent-red)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('security.audit.clear')}
              </button>
            </div>
          </Card>

          {/* Entries */}
          <Card icon={<ScrollText size={16} />} title={`${t('security.audit.total')} ${summary.total}`}>
            <div className="py-3">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">
                  {t('security.audit.empty')}
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filtered.map(entry => (
                    <DetailRow
                      key={entry.id}
                      entry={entry}
                      expanded={expanded === entry.id}
                      onToggle={() => setExpanded(prev => (prev === entry.id ? null : entry.id))}
                    />
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
