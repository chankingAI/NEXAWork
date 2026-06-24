/**
 * NexaWork ReplayPanel — recording replay surface (N26).
 *
 * Three-column layout faithful to the prompt:
 *  - Left: the step list (index + action icon + description + status badge).
 *    The current step is highlighted; failed steps are red and carry their
 *    recovery-strategy label.
 *  - Top: a progress bar with elapsed + estimated-remaining time and the
 *    play / pause / stop / single-step controls plus the speed selector
 *    (0.5x / 1x / 2x / 5x).
 *  - Right: the screenshot preview (recorded vs. current). Recordings in this
 *    build do not embed frames, so the preview degrades to an informative
 *    placeholder rather than a blank box.
 *
 * Live status flows in over IPC: green while executing cleanly, an orange
 * "recovering…" banner during self-heal, red on failure. When a run finishes a
 * quality report overlay summarises totals, the 0–100 score and timing.
 *
 * The panel is a controlled view over {@link useReplay}; it owns no replay
 * state of its own beyond which recording the user has selected.
 */
import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  MousePointerClick,
  Move,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  SkipForward,
  Square,
  Type as TypeIcon,
  XCircle,
} from 'lucide-react';
import type {
  RecordingSummary,
  ReplayReport,
  ReplayStatus,
  ReplayStep,
  ReplayStepStatus,
} from '../../shared/ipc-channels';
import { REPLAY_SPEEDS } from '../../shared/replay';
import { useI18n } from '../hooks/useI18n';
import type { MessageKey } from '../i18n';
import { useReplay } from '../hooks/useReplay';

/** Map a recorded action keyword to a representative icon. */
function actionIcon(action: string): typeof MousePointerClick {
  const a = action.toLowerCase();
  if (a.includes('type') || a.includes('input')) return TypeIcon;
  if (a.includes('key') || a.includes('press')) return Keyboard;
  if (a.includes('scroll')) return ScrollText;
  if (a.includes('move') || a.includes('drag')) return Move;
  if (a.includes('click') || a.includes('tap')) return MousePointerClick;
  return Circle;
}

const STATUS_STYLES: Record<ReplayStepStatus, { dot: string; text: string }> = {
  pending: {
    dot: 'bg-[var(--color-text-quaternary)]',
    text: 'text-[var(--color-text-tertiary)]',
  },
  executing: {
    dot: 'bg-[var(--color-accent-blue)]',
    text: 'text-[var(--color-accent-blue)]',
  },
  success: {
    dot: 'bg-[var(--color-accent-green)]',
    text: 'text-[var(--color-accent-green)]',
  },
  recovered: {
    dot: 'bg-[var(--color-accent-orange)]',
    text: 'text-[var(--color-accent-orange)]',
  },
  failed: {
    dot: 'bg-[var(--color-accent-red)]',
    text: 'text-[var(--color-accent-red)]',
  },
  skipped: {
    dot: 'bg-[var(--color-text-quaternary)]',
    text: 'text-[var(--color-text-quaternary)]',
  },
};

/** Format ms as m:ss (or s for sub-minute durations). */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const STATUS_LABEL_KEY: Record<ReplayStepStatus, MessageKey> = {
  pending: 'replay.step.pending',
  executing: 'replay.step.executing',
  success: 'replay.step.success',
  recovered: 'replay.step.recovered',
  failed: 'replay.step.failed',
  skipped: 'replay.step.skipped',
};

function StepRow({ step, active, label }: { step: ReplayStep; active: boolean; label: string }) {
  const Icon = actionIcon(step.action);
  const style = STATUS_STYLES[step.status];
  return (
    <div
      aria-current={active ? 'step' : undefined}
      className={`flex items-start gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 transition-colors duration-[var(--duration-fast)] ${
        active
          ? 'border-[var(--color-text-primary)] bg-[var(--color-bg-secondary)]'
          : step.status === 'failed'
            ? 'border-[var(--color-accent-red)]/40 bg-[var(--color-accent-red)]/5'
            : 'border-transparent hover:bg-[var(--color-bg-hover)]'
      }`}
    >
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-[10px] font-mono tabular-nums text-[var(--color-text-tertiary)]">
        {step.index + 1}
      </span>
      <span className="mt-0.5 flex-shrink-0 text-[var(--color-text-tertiary)]">
        {step.status === 'executing' ? (
          <Loader2 size={14} className="animate-spin text-[var(--color-accent-blue)]" />
        ) : (
          <Icon size={14} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-[var(--color-text-primary)]">{step.description}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] ${style.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {label}
          </span>
          {step.status === 'recovered' && step.recoveryStrategy && (
            <span className="rounded-[var(--radius-full)] bg-[var(--color-accent-orange)]/15 px-1.5 py-0.5 text-[10px] text-[var(--color-accent-orange)]">
              {step.recoveryStrategy}
            </span>
          )}
          {step.status === 'failed' && step.error && (
            <span className="truncate rounded-[var(--radius-full)] bg-[var(--color-accent-red)]/15 px-1.5 py-0.5 text-[10px] text-[var(--color-accent-red)]">
              {step.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportOverlay({
  report,
  onClose,
  t,
}: {
  report: ReplayReport;
  onClose: () => void;
  t: (key: MessageKey) => string;
}) {
  const statusKey = `replay.report.status.${report.status}` as MessageKey;
  const scoreColor =
    report.qualityScore >= 80
      ? 'text-[var(--color-accent-green)]'
      : report.qualityScore >= 50
        ? 'text-[var(--color-accent-orange)]'
        : 'text-[var(--color-accent-red)]';
  const stats: { key: MessageKey; value: number; color: string }[] = [
    { key: 'replay.report.total', value: report.totalSteps, color: 'text-[var(--color-text-primary)]' },
    { key: 'replay.report.success', value: report.successCount, color: 'text-[var(--color-accent-green)]' },
    { key: 'replay.report.recovered', value: report.recoveredCount, color: 'text-[var(--color-accent-orange)]' },
    { key: 'replay.report.failed', value: report.failedCount, color: 'text-[var(--color-accent-red)]' },
    { key: 'replay.report.skipped', value: report.skippedCount, color: 'text-[var(--color-text-tertiary)]' },
  ];
  return (
    <div
      className="absolute inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('replay.report.title')}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="border-b border-[var(--color-border)] px-5 py-4 text-center">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t('replay.report.title')}</div>
          <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t(statusKey)}</div>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-col items-center">
            <div className={`text-4xl font-semibold tabular-nums ${scoreColor}`}>{report.qualityScore}</div>
            <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('replay.report.quality')}</div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2 text-center">
            {stats.map(s => (
              <div key={s.key}>
                <div className={`text-base font-medium tabular-nums ${s.color}`}>{s.value}</div>
                <div className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">{t(s.key)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs">
            <span className="text-[var(--color-text-tertiary)]">{t('replay.report.duration')}</span>
            <span className="font-mono tabular-nums text-[var(--color-text-primary)]">
              {formatDuration(report.totalDurationMs)}
            </span>
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-full rounded-[var(--radius-lg)] bg-[var(--color-text-primary)] text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          >
            {t('replay.report.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReplayPanel() {
  const { t } = useI18n();
  const replay = useReplay();
  const { status, recordings, report } = replay;
  const loaded = status.recordingId !== null;
  const playing = status.state === 'playing';
  const finished = status.state === 'completed' || status.state === 'failed' || status.state === 'aborted';

  const current = useMemo(
    () => (status.currentStep >= 0 ? status.steps[status.currentStep] : null),
    [status.currentStep, status.steps],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <div>
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t('replay.panel.title')}</div>
          <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
            {status.recordingLabel ?? t('replay.panel.subtitle')}
          </div>
        </div>
        <RecordingPicker
          recordings={recordings}
          activeId={status.recordingId}
          loading={replay.loadingList}
          onSelect={id => void replay.load(id)}
          onRefresh={() => void replay.refreshRecordings()}
          t={t}
        />
      </div>

      {!loaded ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <ImageIcon size={28} className="text-[var(--color-text-quaternary)]" />
          <div className="text-sm text-[var(--color-text-secondary)]">
            {recordings.length === 0 ? t('replay.empty.title') : t('replay.list.title')}
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)]">{t('replay.empty.desc')}</div>
        </div>
      ) : (
        <>
          {/* Progress + controls */}
          <div className="border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)]">
                <div
                  className={`h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--duration-normal)] ${
                    status.state === 'failed'
                      ? 'bg-[var(--color-accent-red)]'
                      : status.recovering
                        ? 'bg-[var(--color-accent-orange)]'
                        : 'bg-[var(--color-accent-green)]'
                  }`}
                  style={{ width: `${Math.round(status.progress * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-mono tabular-nums text-[var(--color-text-secondary)]">
                {Math.round(status.progress * 100)}%
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {t('replay.progress.elapsed')}
                  <span className="font-mono tabular-nums text-[var(--color-text-secondary)]">
                    {formatDuration(status.elapsedMs)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  {t('replay.progress.remaining')}
                  <span className="font-mono tabular-nums text-[var(--color-text-secondary)]">
                    {formatDuration(status.estimatedRemainingMs)}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Speed selector */}
                <div className="mr-1 flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
                  {REPLAY_SPEEDS.map(speed => {
                    const active = status.speed === speed;
                    return (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => void replay.setSpeed(speed)}
                        aria-pressed={active}
                        aria-label={`${t('replay.controls.speed')} ${speed}x`}
                        className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] tabular-nums transition-colors duration-[var(--duration-fast)] ${
                          active
                            ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                        }`}
                      >
                        {speed}x
                      </button>
                    );
                  })}
                </div>

                <ControlButton
                  label={playing ? t('replay.controls.pause') : t('replay.controls.play')}
                  onClick={() => (playing ? void replay.pause() : void replay.play())}
                  disabled={finished}
                  primary
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </ControlButton>
                <ControlButton label={t('replay.controls.step')} onClick={() => void replay.step()} disabled={finished}>
                  <SkipForward size={15} />
                </ControlButton>
                <ControlButton label={t('replay.controls.stop')} onClick={() => void replay.stop()} disabled={finished}>
                  <Square size={14} />
                </ControlButton>
                <ControlButton
                  label={t('replay.list.refresh')}
                  onClick={() => status.recordingId && void replay.load(status.recordingId)}
                >
                  <RotateCcw size={14} />
                </ControlButton>
              </div>
            </div>

            {/* Recovery / failure banner */}
            {status.recovering && (
              <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent-orange)]/10 px-3 py-2 text-xs text-[var(--color-accent-orange)]">
                <Loader2 size={13} className="animate-spin" />
                {t('replay.status.recovering')}
                {status.recoveryStrategy && <span className="font-medium">· {status.recoveryStrategy}</span>}
              </div>
            )}
            {status.state === 'failed' && current?.error && (
              <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent-red)]/10 px-3 py-2 text-xs text-[var(--color-accent-red)]">
                <AlertTriangle size={13} />
                {t('replay.status.failed')}
                <span className="truncate font-medium">· {current.error}</span>
              </div>
            )}
          </div>

          {/* Body: step list (left) + preview (right) */}
          <div className="flex flex-1 overflow-hidden">
            <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
              <div className="px-5 py-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {t('replay.steps.title')} · {status.totalSteps}
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                <div className="flex flex-col gap-1">
                  {status.steps.map(step => (
                    <StepRow
                      key={step.index}
                      step={step}
                      active={step.index === status.currentStep && !finished}
                      label={t(STATUS_LABEL_KEY[step.status])}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Screenshot preview */}
            <div className="flex w-1/2 flex-col">
              <div className="px-5 py-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {t('replay.preview.title')}
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5">
                <PreviewBox label={t('replay.preview.recorded')} step={current} t={t} />
                <PreviewBox label={t('replay.preview.current')} step={current} highlight={status.recovering} t={t} />
              </div>
            </div>
          </div>
        </>
      )}

      {report && <ReportOverlay report={report} onClose={replay.clearReport} t={t} />}
    </div>
  );
}

function RecordingPicker({
  recordings,
  activeId,
  loading,
  onSelect,
  onRefresh,
  t,
}: {
  recordings: RecordingSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  t: (key: MessageKey) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={activeId ?? ''}
        onChange={e => e.target.value && onSelect(e.target.value)}
        aria-label={t('replay.list.title')}
        className="h-8 max-w-[220px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
      >
        <option value="" disabled>
          {loading ? t('replay.list.loading') : t('replay.list.title')}
        </option>
        {recordings.map(r => (
          <option key={r.id} value={r.id}>
            {(r.taskDescription || r.id) + ` · ${t('replay.list.steps').replace('{count}', String(r.eventCount))}`}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRefresh}
        aria-label={t('replay.list.refresh')}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
  primary,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] hover:opacity-90'
          : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

function PreviewBox({
  label,
  step,
  highlight,
  t,
}: {
  label: string;
  step: ReplayStep | null;
  highlight?: boolean;
  t: (key: MessageKey) => string;
}) {
  const Icon = step ? actionIcon(step.action) : ImageIcon;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
        <ChevronRight size={11} />
        {label}
      </div>
      <div
        className={`flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border bg-[var(--color-bg-secondary)] ${
          highlight ? 'border-[var(--color-accent-orange)]' : 'border-[var(--color-border)]'
        }`}
      >
        {step ? (
          <>
            {step.status === 'success' ? (
              <CheckCircle2 size={22} className="text-[var(--color-accent-green)]" />
            ) : step.status === 'failed' ? (
              <XCircle size={22} className="text-[var(--color-accent-red)]" />
            ) : (
              <Icon size={22} className="text-[var(--color-text-tertiary)]" />
            )}
            <div className="px-4 text-center text-xs text-[var(--color-text-secondary)]">{step.description}</div>
          </>
        ) : (
          <>
            <ImageIcon size={22} className="text-[var(--color-text-quaternary)]" />
            <div className="text-xs text-[var(--color-text-tertiary)]">{t('replay.preview.empty')}</div>
          </>
        )}
      </div>
    </div>
  );
}
