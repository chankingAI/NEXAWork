/**
 * NexaWork PermissionLogView — Permission decision log (N17)
 * Independent list view; will be re-homed into SecurityCenter (N32) later.
 */
import { useMemo, useState } from 'react';
import { Shield, Check, X, Trash2, ChevronsUpDown } from 'lucide-react';
import type { PermissionLogEntry, PermissionRiskLevel } from '../../shared/ipc-channels';
import { getRiskMeta } from './PermissionConfirmDialog';

// ─── Formatting Helpers (testable) ────────────────────────────
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function scopeLabel(scope: PermissionLogEntry['scope']): string {
  switch (scope) {
    case 'once':
      return '本次';
    case 'session':
      return '会话';
    case 'auto':
      return '自动';
  }
}

export function modeLabel(mode: PermissionLogEntry['mode']): string {
  return mode === 'full' ? '完全访问' : '默认';
}

export type RiskFilter = 'all' | PermissionRiskLevel;

export function filterByRisk(entries: PermissionLogEntry[], filter: RiskFilter): PermissionLogEntry[] {
  if (filter === 'all') return entries;
  return entries.filter(e => e.riskLevel === filter);
}

// ─── Props ────────────────────────────────────────────────────
export interface PermissionLogViewProps {
  entries: PermissionLogEntry[];
  onClear: () => void;
}

const riskFilters: { id: RiskFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'HIGH', label: '高风险' },
  { id: 'MEDIUM', label: '中风险' },
  { id: 'LOW', label: '低风险' },
];

// ─── Component ────────────────────────────────────────────────
export function PermissionLogView({ entries, onClear }: PermissionLogViewProps) {
  const [filter, setFilter] = useState<RiskFilter>('all');
  const filtered = useMemo(() => filterByRisk(entries, filter), [entries, filter]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
          <Shield size={15} />
          权限日志
          <span className="text-xs font-normal text-[var(--color-text-tertiary)]">({entries.length})</span>
        </span>
        <button
          onClick={onClear}
          disabled={entries.length === 0}
          className="flex h-7 items-center gap-1 rounded-[var(--radius-md)] px-2 text-[11px] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={12} />
          清空
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-4 py-2">
        {riskFilters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] font-medium transition-colors duration-[var(--duration-fast)] ${
              filter === f.id
                ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ChevronsUpDown size={24} className="text-[var(--color-text-quaternary)]" />
            <span className="text-sm text-[var(--color-text-tertiary)]">暂无权限记录</span>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--color-bg-primary)] text-[10px] uppercase text-[var(--color-text-tertiary)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-2 font-medium">工具 / 操作</th>
                <th className="px-2 py-2 font-medium">模式</th>
                <th className="px-2 py-2 font-medium">风险</th>
                <th className="px-2 py-2 font-medium">结果</th>
                <th className="px-2 py-2 font-medium">作用域</th>
                <th className="px-4 py-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const meta = getRiskMeta(entry.riskLevel);
                const allowed = entry.decision === 'allow';
                return (
                  <tr key={entry.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]">
                    <td className="px-4 py-2">
                      <div className="font-medium text-[var(--color-text-primary)]">{entry.tool}</div>
                      <div className="truncate text-[10px] text-[var(--color-text-tertiary)]">{entry.inputSummary}</div>
                    </td>
                    <td className="px-2 py-2 text-[var(--color-text-secondary)]">{modeLabel(entry.mode)}</td>
                    <td className="px-2 py-2">
                      <span
                        className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`flex items-center gap-0.5 font-medium ${
                          allowed ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'
                        }`}
                      >
                        {allowed ? <Check size={12} /> : <X size={12} />}
                        {allowed ? '允许' : '拒绝'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-[var(--color-text-secondary)]">{scopeLabel(entry.scope)}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
