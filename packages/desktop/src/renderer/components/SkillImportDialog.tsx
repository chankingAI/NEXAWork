/**
 * SkillImportDialog — import an external skill from file / URL / repo (N15).
 */
import { useState } from 'react';
import { X, FileUp, Link2, GitBranch, Loader2 } from 'lucide-react';
import type { SkillImportSourceType } from '../../shared/ipc-channels';

export interface SkillImportDialogProps {
  isOpen: boolean;
  importing: boolean;
  onClose: () => void;
  onImport: (source: string, sourceType: SkillImportSourceType) => void;
}

const sourceTypes: {
  id: SkillImportSourceType;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
}[] = [
  { id: 'file', label: '文件', icon: <FileUp size={14} />, placeholder: '/path/to/skill.zip' },
  { id: 'url', label: '链接', icon: <Link2 size={14} />, placeholder: 'https://example.com/skill.json' },
  { id: 'repo', label: '仓库', icon: <GitBranch size={14} />, placeholder: 'https://github.com/owner/skill.git' },
];

export function SkillImportDialog({ isOpen, importing, onClose, onImport }: SkillImportDialogProps) {
  const [sourceType, setSourceType] = useState<SkillImportSourceType>('file');
  const [source, setSource] = useState('');

  if (!isOpen) return null;

  const activeType = sourceTypes.find(t => t.id === sourceType)!;
  const canSubmit = source.trim().length > 0 && !importing;

  const submit = () => {
    if (!canSubmit) return;
    onImport(source.trim(), sourceType);
    setSource('');
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[var(--z-modal)] bg-black/40 transition-opacity duration-[var(--duration-normal)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-xl)]"
        role="dialog"
        aria-modal="true"
        aria-label="导入技能"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">导入技能</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-5 py-5">
          {/* Source type tabs */}
          <div className="flex gap-1.5">
            {sourceTypes.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setSourceType(type.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
                  sourceType === type.id
                    ? 'border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                {type.icon}
                {type.label}
              </button>
            ))}
          </div>

          {/* Source input */}
          <input
            type="text"
            value={source}
            onChange={e => setSource(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={activeType.placeholder}
            className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-quaternary)] outline-none transition-colors duration-[var(--duration-fast)] focus:border-[var(--color-border-focus)] focus:bg-[var(--color-bg-primary)]"
            aria-label="技能来源"
          />

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {importing && <Loader2 size={14} className="animate-spin" />}
              导入
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
