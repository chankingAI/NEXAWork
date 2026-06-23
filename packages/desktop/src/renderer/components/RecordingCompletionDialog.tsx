/**
 * NexaWork RecordingCompletionDialog — shown after a recording stops (N24).
 * "录制完成！是否生成技能？" with three choices:
 *   生成技能 (generate skill) / 保存录制 (keep JSON) / 丢弃 (discard).
 */
import { Save, Sparkles, Trash2, X } from 'lucide-react';
import type { RecordStopResult } from '../../shared/ipc-channels';
import { useI18n } from '../hooks/useI18n';
import { formatElapsed } from './RecordingStatusBar';

/** Interpolate the completion description template with the recording stats. */
export function buildCompletionDesc(template: string, eventCount: number, durationMs: number): string {
  return template.replace('{count}', String(eventCount)).replace('{duration}', formatElapsed(durationMs));
}

export interface RecordingCompletionDialogProps {
  result: RecordStopResult;
  onGenerateSkill: () => void;
  onSaveRecording: () => void;
  onDiscard: () => void;
}

export function RecordingCompletionDialog({
  result,
  onGenerateSkill,
  onSaveRecording,
  onDiscard,
}: RecordingCompletionDialogProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
            <Sparkles size={15} className="text-[var(--color-accent-red)]" />
            {t('record.completion.title')}
          </span>
          <button
            type="button"
            onClick={onSaveRecording}
            aria-label={t('record.statusbar.stop')}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {buildCompletionDesc(t('record.completion.desc'), result.eventCount, result.durationMs)}
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            onClick={onGenerateSkill}
            className="flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          >
            <Sparkles size={13} />
            {t('record.completion.generateSkill')}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSaveRecording}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <Save size={13} />
              {t('record.completion.saveRecording')}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-accent-red)]/30 text-xs font-medium text-[var(--color-accent-red)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-red)]/10"
            >
              <Trash2 size={13} />
              {t('record.completion.discard')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
