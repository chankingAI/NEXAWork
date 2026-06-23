/**
 * SkillDetail — modal detail panel for a single skill (N15).
 * Shows full description, required permissions, enable/disable switch,
 * configurable parameters and an install action for marketplace skills.
 */
import { X, ShieldCheck, Download, Check } from 'lucide-react';
import type { SkillInfo } from './skillCatalog';
import { permissionLabel } from './skillCatalog';

export interface SkillDetailProps {
  skill: SkillInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onInstall?: (id: string) => void;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-[var(--duration-fast)] ${
        checked ? 'bg-[var(--color-accent-green)]' : 'bg-[var(--color-bg-tertiary)]'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-fast)] ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function SkillDetail({ skill, isOpen, onClose, onToggle, onInstall }: SkillDetailProps) {
  if (!isOpen || !skill) return null;

  const permissions = skill.permissions ?? [];
  const config = skill.config ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[var(--z-modal)] bg-black/40 transition-opacity duration-[var(--duration-normal)]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="fixed left-1/2 top-1/2 z-[var(--z-modal)] max-h-[85vh] w-[460px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-xl)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-xl)]"
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} 详情`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-6 py-5">
          <span
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-xl"
            style={{ backgroundColor: `${skill.color ?? '#64748B'}1A`, color: skill.color ?? '#64748B' }}
            aria-hidden
          >
            {skill.icon ?? '🧩'}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-semibold text-[var(--color-text-primary)]">{skill.name}</span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              v{skill.version}
              {skill.author ? ` · ${skill.author}` : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-6 py-5">
          {/* Description */}
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {skill.longDescription ?? skill.description}
          </p>

          {/* Enable / disable */}
          {skill.installed && (
            <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">启用技能</span>
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {skill.enabled ? '该技能当前已启用' : '该技能当前已禁用'}
                </span>
              </div>
              <Switch
                checked={skill.enabled}
                onChange={next => onToggle(skill.id, next)}
                label={`${skill.enabled ? '禁用' : '启用'} ${skill.name}`}
              />
            </div>
          )}

          {/* Permissions */}
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
              <ShieldCheck size={13} className="text-[var(--color-text-tertiary)]" />
              权限需求
            </span>
            {permissions.length === 0 ? (
              <span className="text-xs text-[var(--color-text-tertiary)]">无需特殊权限</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {permissions.map(p => (
                  <li
                    key={p}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]"
                  >
                    <Check size={12} className="flex-shrink-0 text-[var(--color-text-tertiary)]" />
                    {permissionLabel(p)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Config params */}
          {config.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-[var(--color-text-primary)]">配置参数</span>
              <ul className="flex flex-col gap-2">
                {config.map(param => (
                  <li
                    key={param.key}
                    className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
                  >
                    <span className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--color-text-primary)]">{param.label}</span>
                      <span className="text-[var(--color-text-tertiary)]">
                        {param.type === 'boolean' ? (param.value ? '开' : '关') : String(param.value) || '—'}
                      </span>
                    </span>
                    {param.description && (
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">{param.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Install action for marketplace skills */}
          {!skill.installed && onInstall && (
            <button
              type="button"
              onClick={() => onInstall(skill.id)}
              className="flex h-10 items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-text-primary)] text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 active:scale-[0.98]"
            >
              <Download size={15} />
              安装技能
            </button>
          )}
        </div>
      </div>
    </>
  );
}
