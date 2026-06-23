/**
 * NexaWork RecordingStatusBar — top status bar shown while recording (N24).
 * Renders: ● REC | 00:32 | 14 events | [暂停/继续] [停止]
 * The leading red dot pulses (0.5s) per the spec; hidden entirely when idle.
 */
import { Pause, Play, Square } from 'lucide-react';
import type { RecorderStatus } from '../../shared/ipc-channels';
import { useI18n } from '../hooks/useI18n';

/** Format elapsed milliseconds as MM:SS (or HH:MM:SS past one hour). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export interface RecordingStatusBarProps {
  status: RecorderStatus;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function RecordingStatusBar({ status, onPause, onResume, onStop }: RecordingStatusBarProps) {
  const { t } = useI18n();
  if (status.state === 'idle') return null;

  const recording = status.state === 'recording';

  return (
    <div
      className="titlebar-no-drag flex items-center gap-3 rounded-[var(--radius-full)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1 shadow-[var(--shadow-sm)]"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--color-accent-red)]">
        <span
          className={`h-2 w-2 rounded-[var(--radius-full)] bg-[var(--color-accent-red)] ${
            recording ? 'animate-record-pulse' : 'opacity-50'
          }`}
        />
        {t('record.statusbar.rec')}
      </span>

      <span className="font-mono text-xs tabular-nums text-[var(--color-text-primary)]">
        {formatElapsed(status.elapsedMs)}
      </span>

      <span className="text-xs text-[var(--color-text-secondary)]">
        {t('record.statusbar.events').replace('{count}', String(status.eventCount))}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={recording ? onPause : onResume}
          className="flex h-6 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label={recording ? t('record.statusbar.pause') : t('record.statusbar.resume')}
        >
          {recording ? <Pause size={12} /> : <Play size={12} />}
          {recording ? t('record.statusbar.pause') : t('record.statusbar.resume')}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="flex h-6 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-accent-red)] px-2 text-[11px] font-medium text-white transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          aria-label={t('record.statusbar.stop')}
        >
          <Square size={11} />
          {t('record.statusbar.stop')}
        </button>
      </div>
    </div>
  );
}
