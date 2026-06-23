/**
 * SkillItem — a single row in the skill list (N15).
 * 36px circular coloured icon + name (14px bold) + description (12px gray).
 * Clicking opens the skill detail panel.
 */
import { Check } from 'lucide-react';
import type { SkillInfo } from './skillCatalog';

export interface SkillItemProps {
  skill: SkillInfo;
  active: boolean;
  onSelect: (id: string) => void;
}

export function SkillItem({ skill, active, onSelect }: SkillItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(skill.id)}
      aria-pressed={active}
      className={`group flex w-full items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-2.5 text-left transition-all duration-[var(--duration-fast)] active:scale-[0.99] ${
        active
          ? 'border-[var(--color-text-tertiary)] bg-[var(--color-bg-hover)]'
          : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
      }`}
    >
      {/* 36px circular coloured icon */}
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base"
        style={{ backgroundColor: `${skill.color ?? '#64748B'}1A`, color: skill.color ?? '#64748B' }}
        aria-hidden
      >
        {skill.icon ?? '🧩'}
      </span>

      {/* Name + description */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{skill.name}</span>
          {skill.enabled && skill.installed && (
            <Check size={12} className="flex-shrink-0 text-[var(--color-accent-green)]" aria-label="已启用" />
          )}
        </span>
        <span className="truncate text-xs text-[var(--color-text-tertiary)]">{skill.description}</span>
      </span>

      {/* Status pill */}
      {!skill.installed ? (
        <span className="flex-shrink-0 rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
          可安装
        </span>
      ) : (
        <span
          className={`flex-shrink-0 rounded-[var(--radius-full)] px-2 py-0.5 text-[10px] ${
            skill.enabled
              ? 'bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)]'
              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
          }`}
        >
          {skill.enabled ? '已启用' : '已禁用'}
        </span>
      )}
    </button>
  );
}
