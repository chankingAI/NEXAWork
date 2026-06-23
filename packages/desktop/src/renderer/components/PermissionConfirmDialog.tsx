/**
 * NexaWork PermissionConfirmDialog — Tool execution permission prompt (N17)
 * Shown when a tool needs approval. Displays tool name + description + scope.
 * Buttons: 允许一次 / 本次会话始终允许 / 拒绝.
 */
import { ShieldAlert, FileWarning, Globe, Terminal, X } from 'lucide-react';
import type {
  PermissionDecisionAction,
  PermissionRequest,
  PermissionRiskLevel,
  PermissionScope,
} from '../../shared/ipc-channels';

// ─── Risk Metadata ────────────────────────────────────────────
export interface RiskMeta {
  label: string;
  color: string;
  icon: React.ReactNode;
}

export const riskMeta: Record<PermissionRiskLevel, RiskMeta> = {
  LOW: { label: '低风险', color: 'var(--color-accent-green)', icon: <Globe size={14} /> },
  MEDIUM: { label: '中风险', color: 'var(--color-accent-orange)', icon: <Terminal size={14} /> },
  HIGH: { label: '高风险', color: 'var(--color-accent-red)', icon: <FileWarning size={14} /> },
};

export function getRiskMeta(level: PermissionRiskLevel): RiskMeta {
  return riskMeta[level];
}

// ─── Props ────────────────────────────────────────────────────
export interface PermissionConfirmDialogProps {
  request: PermissionRequest;
  onRespond: (decision: PermissionDecisionAction, scope: PermissionScope) => void;
}

// ─── Component ────────────────────────────────────────────────
export function PermissionConfirmDialog({ request, onRespond }: PermissionConfirmDialogProps) {
  const meta = getRiskMeta(request.riskLevel);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
            <ShieldAlert size={15} />
            权限请求
          </span>
          <span
            className="flex items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
          >
            {meta.icon}
            {meta.label}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2.5 px-4 py-4">
          <Row label="工具" value={request.tool} mono />
          <Row label="操作" value={request.description} />
          <Row label="影响范围" value={request.affectedScope} mono />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            onClick={() => onRespond('allow', 'once')}
            className="h-9 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          >
            允许一次
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => onRespond('allow', 'session')}
              className="h-9 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              本次会话始终允许
            </button>
            <button
              onClick={() => onRespond('deny', 'once')}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-accent-red)]/30 text-xs font-medium text-[var(--color-accent-red)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-red)]/10"
            >
              <X size={13} />
              拒绝
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-[var(--color-text-tertiary)]">{label}</span>
      <span className={`text-sm text-[var(--color-text-primary)] ${mono ? 'break-all font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}
