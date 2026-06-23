/**
 * NexaWork PermissionSelector — Permission mode dropdown (N17, WorkBuddy 截图5)
 * Toolbar "默认权限 ▾" dropdown: 默认权限 (shield) / 完全访问权限 (warning).
 * Switching to 完全访问 shows a confirmation dialog.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, ChevronDown, Check, X } from 'lucide-react';
import type { DesktopPermissionMode } from '../../shared/ipc-channels';

// ─── Mode Metadata ────────────────────────────────────────────
export interface PermissionModeConfig {
  id: DesktopPermissionMode;
  label: string;
  description: string;
  requiresConfirm: boolean;
}

export const permissionModeConfigs: PermissionModeConfig[] = [
  {
    id: 'default',
    label: '默认权限',
    description: '沙箱内安全操作，危险操作需确认',
    requiresConfirm: false,
  },
  {
    id: 'full',
    label: '完全访问权限',
    description: '完整系统访问，跳过权限提示',
    requiresConfirm: true,
  },
];

export function getModeConfig(mode: DesktopPermissionMode): PermissionModeConfig {
  return permissionModeConfigs.find(m => m.id === mode) ?? permissionModeConfigs[0];
}

/** Whether switching from `from` to `to` requires a confirmation dialog. */
export function needsConfirm(from: DesktopPermissionMode, to: DesktopPermissionMode): boolean {
  return to !== from && getModeConfig(to).requiresConfirm;
}

// ─── Props ────────────────────────────────────────────────────
export interface PermissionSelectorProps {
  mode: DesktopPermissionMode;
  bypassAvailable: boolean;
  onModeChange: (mode: DesktopPermissionMode) => void;
}

// ─── Component ────────────────────────────────────────────────
export function PermissionSelector({ mode, bypassAvailable, onModeChange }: PermissionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<DesktopPermissionMode | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSelect = useCallback(
    (target: DesktopPermissionMode) => {
      setIsOpen(false);
      if (target === mode) return;
      if (needsConfirm(mode, target)) {
        setConfirmTarget(target);
      } else {
        onModeChange(target);
      }
    },
    [mode, onModeChange],
  );

  const current = getModeConfig(mode);
  const isFull = mode === 'full';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-medium transition-colors duration-[var(--duration-fast)] ${
          isFull
            ? 'text-[var(--color-accent-orange)] hover:bg-[var(--color-accent-orange)]/10'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        {isFull ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
        <span>{current.label}</span>
        <ChevronDown
          size={10}
          className={`transition-transform duration-[var(--duration-fast)] ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-0 z-[var(--z-dropdown)] mb-1 w-60 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-1 shadow-[var(--shadow-dropdown)]"
          role="listbox"
        >
          {permissionModeConfigs.map(cfg => {
            const disabled = cfg.id === 'full' && !bypassAvailable;
            return (
              <button
                key={cfg.id}
                role="option"
                aria-selected={mode === cfg.id}
                disabled={disabled}
                onClick={() => handleSelect(cfg.id)}
                className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === cfg.id ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${
                    cfg.id === 'full'
                      ? 'bg-[var(--color-accent-orange)]/10 text-[var(--color-accent-orange)]'
                      : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  {cfg.id === 'full' ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">{cfg.label}</span>
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    {disabled ? '当前环境不可用' : cfg.description}
                  </span>
                </div>
                {mode === cfg.id && <Check size={14} className="flex-shrink-0 text-[var(--color-text-primary)]" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Switch-to-full confirmation */}
      {confirmTarget && (
        <FullAccessConfirm
          onConfirm={() => {
            onModeChange(confirmTarget);
            setConfirmTarget(null);
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Full Access Confirmation Dialog ──────────────────────────
function FullAccessConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-accent-orange)]">
            <AlertTriangle size={15} />
            切换到完全访问权限
          </span>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          完全访问权限将<strong className="text-[var(--color-text-primary)]">跳过所有权限确认</strong>，AI
          可直接读写文件、执行命令和访问网络。请仅在受信任的任务中启用。
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            onClick={onCancel}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="h-8 rounded-[var(--radius-md)] bg-[var(--color-accent-orange)] px-4 text-xs font-medium text-white transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          >
            确认开启
          </button>
        </div>
      </div>
    </div>
  );
}
