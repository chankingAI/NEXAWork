/**
 * NexaWork RecordButton — record entry point in the title bar (N24).
 *  - idle:      red circle + "录制"
 *  - recording: pulsing red dot + live timer + event count, click to stop
 *  - paused:    gray pause glyph + timer, click to stop
 */
import { Circle, Pause } from 'lucide-react';
import type { RecorderStatus } from '../../shared/ipc-channels';
import { useI18n } from '../hooks/useI18n';
import { formatElapsed } from './RecordingStatusBar';

export interface RecordButtonProps {
  status: RecorderStatus;
  onStart: () => void;
  onStop: () => void;
}

export function RecordButton({ status, onStart, onStop }: RecordButtonProps) {
  const { t } = useI18n();
  const idle = status.state === 'idle';
  const recording = status.state === 'recording';

  if (idle) {
    return (
      <button
        type="button"
        onClick={onStart}
        title={t('record.button.tooltip.start')}
        aria-label={t('record.button.tooltip.start')}
        className="titlebar-no-drag flex items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <Circle size={12} fill="var(--color-accent-red)" className="text-[var(--color-accent-red)]" />
        {t('record.button.record')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStop}
      title={t('record.button.tooltip.stop')}
      aria-label={t('record.button.tooltip.stop')}
      className="titlebar-no-drag flex items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
    >
      {recording ? (
        <span className="h-2.5 w-2.5 animate-record-pulse rounded-[var(--radius-full)] bg-[var(--color-accent-red)]" />
      ) : (
        <Pause size={12} className="text-[var(--color-text-tertiary)]" />
      )}
      <span className="font-mono tabular-nums">{formatElapsed(status.elapsedMs)}</span>
      <span className="text-[var(--color-text-tertiary)]">·</span>
      <span className="text-[var(--color-text-secondary)]">
        {t('record.statusbar.events').replace('{count}', String(status.eventCount))}
      </span>
    </button>
  );
}
