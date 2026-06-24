/**
 * NexaWork RecordConfigPanel — pre-recording configuration (N25).
 *
 * Shown when the user clicks the record button while idle. Lets them pick the
 * recording mode (browser / desktop / hybrid), screenshot cadence, password
 * masking, a window filter, the mouse-trail toggle, and advanced options
 * (element capture / operation merging / max duration). The "开始录制" button
 * runs a 3-second countdown and then starts the recording.
 *
 * Each change is persisted immediately via `onChangeConfig` (IPC → recorder),
 * so the panel is purely a controlled view over the live {@link RecordingConfig}.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import { ChevronDown, Chrome, Layers, Monitor, Plus, X } from 'lucide-react';
import type { RecordMode, RecordingConfig, ScreenshotFrequency } from '../../shared/ipc-channels';
import { useI18n } from '../hooks/useI18n';
import type { MessageKey } from '../i18n';

export interface RecordConfigPanelProps {
  config: RecordingConfig;
  onChangeConfig: (patch: Partial<RecordingConfig>) => void;
  onStart: () => void;
  onClose: () => void;
  /** Countdown length in seconds before recording begins (default 3). */
  countdownSeconds?: number;
}

const MODES: { mode: RecordMode; icon: typeof Chrome }[] = [
  { mode: 'cdp', icon: Chrome },
  { mode: 'desktop', icon: Monitor },
  { mode: 'hybrid', icon: Layers },
];

const SCREENSHOT_FREQUENCIES: ScreenshotFrequency[] = ['on-action', 'every-3s', 'every-5s'];

/** Minute presets for the max-duration selector (0 = unlimited). */
const DURATION_PRESETS_MIN = [0, 5, 10, 30, 60];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-[26px] w-[44px] flex-shrink-0 rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] data-[state=checked]:bg-[var(--color-accent-green)]"
    >
      <RSwitch.Thumb className="block h-[22px] w-[22px] translate-x-[2px] rounded-[var(--radius-full)] bg-white shadow-sm transition-transform duration-[var(--duration-fast)] will-change-transform data-[state=checked]:translate-x-[20px]" />
    </RSwitch.Root>
  );
}

/** A labelled row with an optional description and a trailing control. */
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-[var(--color-text-primary)]">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{desc}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function RecordConfigPanel({
  config,
  onChangeConfig,
  onStart,
  onClose,
  countdownSeconds = 3,
}: RecordConfigPanelProps) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [filterDraft, setFilterDraft] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const beginCountdown = useCallback(() => {
    clearTimer();
    setCountdown(countdownSeconds);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearTimer();
          onStart();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer, countdownSeconds, onStart]);

  const cancelCountdown = useCallback(() => {
    clearTimer();
    setCountdown(null);
  }, [clearTimer]);

  const counting = countdown !== null;

  const addFilter = useCallback(() => {
    const value = filterDraft.trim();
    if (!value) return;
    if (config.windowFilter.includes(value)) {
      setFilterDraft('');
      return;
    }
    onChangeConfig({ windowFilter: [...config.windowFilter, value] });
    setFilterDraft('');
  }, [filterDraft, config.windowFilter, onChangeConfig]);

  const removeFilter = useCallback(
    (value: string) => {
      onChangeConfig({
        windowFilter: config.windowFilter.filter(w => w !== value),
      });
    },
    [config.windowFilter, onChangeConfig],
  );

  const durationLabel = useMemo(() => {
    if (config.maxDurationMs <= 0) return t('record.config.maxDuration.unlimited');
    const minutes = Math.round(config.maxDurationMs / 60_000);
    return t('record.config.maxDuration.minutes').replace('{count}', String(minutes));
  }, [config.maxDurationMs, t]);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('record.config.title')}
    >
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t('record.config.title')}</div>
            <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t('record.config.subtitle')}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('record.config.cancel')}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {/* Mode selection */}
          <div className="py-1">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {t('record.config.mode.label')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(({ mode, icon: Icon }) => {
                const active = config.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChangeConfig({ mode })}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1.5 rounded-[var(--radius-lg)] border px-2 py-3 text-center transition-colors duration-[var(--duration-fast)] ${
                      active
                        ? 'border-[var(--color-text-primary)] bg-[var(--color-bg-secondary)]'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                    }`}
                  >
                    <Icon
                      size={18}
                      className={active ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}
                    />
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                      {t(`record.config.mode.${mode}` as MessageKey)}
                    </span>
                    <span className="text-[10px] leading-tight text-[var(--color-text-tertiary)]">
                      {t(`record.config.mode.${mode}.desc` as MessageKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2 divide-y divide-[var(--color-border)]">
            {/* Screenshot frequency */}
            <Row label={t('record.config.screenshot.label')}>
              <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
                {SCREENSHOT_FREQUENCIES.map(freq => {
                  const active = config.screenshotFrequency === freq;
                  return (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => onChangeConfig({ screenshotFrequency: freq })}
                      aria-pressed={active}
                      className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
                        active
                          ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      {t(`record.config.screenshot.${freq}` as MessageKey)}
                    </button>
                  );
                })}
              </div>
            </Row>

            {/* Password masking */}
            <Row label={t('record.config.maskPasswords.label')} desc={t('record.config.maskPasswords.desc')}>
              <Switch
                checked={config.maskPasswords}
                onChange={v => onChangeConfig({ maskPasswords: v })}
                label={t('record.config.maskPasswords.label')}
              />
            </Row>

            {/* Window filter */}
            <div className="py-2.5">
              <div className="text-sm text-[var(--color-text-primary)]">{t('record.config.windowFilter.label')}</div>
              <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                {t('record.config.windowFilter.desc')}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={filterDraft}
                  onChange={e => setFilterDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addFilter();
                    }
                  }}
                  placeholder={t('record.config.windowFilter.placeholder')}
                  className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-blue)]"
                />
                <button
                  type="button"
                  onClick={addFilter}
                  className="flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                >
                  <Plus size={13} />
                  {t('record.config.windowFilter.add')}
                </button>
              </div>
              {config.windowFilter.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {config.windowFilter.map(w => (
                    <span
                      key={w}
                      className="flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--color-bg-secondary)] py-1 pl-2.5 pr-1.5 text-xs text-[var(--color-text-secondary)]"
                    >
                      {w}
                      <button
                        type="button"
                        onClick={() => removeFilter(w)}
                        aria-label={`${t('record.config.windowFilter.label')}: ${w}`}
                        className="flex h-4 w-4 items-center justify-center rounded-[var(--radius-full)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                  {t('record.config.windowFilter.empty')}
                </div>
              )}
            </div>

            {/* Mouse trail */}
            <Row label={t('record.config.mouseTrail.label')} desc={t('record.config.mouseTrail.desc')}>
              <Switch
                checked={config.captureMouseTrail}
                onChange={v => onChangeConfig({ captureMouseTrail: v })}
                label={t('record.config.mouseTrail.label')}
              />
            </Row>
          </div>

          {/* Advanced options (collapsible) */}
          <div className="mt-2 border-t border-[var(--color-border)] pt-1">
            <button
              type="button"
              onClick={() => setAdvancedOpen(o => !o)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text-primary)]"
            >
              {t('record.config.advanced')}
              <ChevronDown
                size={15}
                className={`transition-transform duration-[var(--duration-fast)] ${advancedOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {advancedOpen && (
              <div className="divide-y divide-[var(--color-border)]">
                <Row label={t('record.config.elementCapture.label')} desc={t('record.config.elementCapture.desc')}>
                  <Switch
                    checked={config.elementCapture}
                    onChange={v => onChangeConfig({ elementCapture: v })}
                    label={t('record.config.elementCapture.label')}
                  />
                </Row>
                <Row label={t('record.config.mergeOperations.label')} desc={t('record.config.mergeOperations.desc')}>
                  <Switch
                    checked={config.mergeOperations}
                    onChange={v => onChangeConfig({ mergeOperations: v })}
                    label={t('record.config.mergeOperations.label')}
                  />
                </Row>
                <Row label={t('record.config.maxDuration.label')} desc={t('record.config.maxDuration.desc')}>
                  <select
                    value={config.maxDurationMs}
                    onChange={e => onChangeConfig({ maxDurationMs: Number(e.target.value) })}
                    aria-label={t('record.config.maxDuration.label')}
                    className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
                  >
                    {DURATION_PRESETS_MIN.map(min => (
                      <option key={min} value={min * 60_000}>
                        {min === 0
                          ? t('record.config.maxDuration.unlimited')
                          : t('record.config.maxDuration.minutes').replace('{count}', String(min))}
                      </option>
                    ))}
                  </select>
                </Row>
              </div>
            )}
          </div>
        </div>

        {/* Footer: start button + countdown */}
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          {counting ? (
            <button
              type="button"
              onClick={cancelCountdown}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-accent-red)] font-mono text-xs tabular-nums text-white">
                {countdown}
              </span>
              {t('record.config.countdown').replace('{count}', String(countdown))}
              <span className="text-[var(--color-text-tertiary)]">·</span>
              <span className="text-[var(--color-text-tertiary)]">{t('record.config.cancel')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={beginCountdown}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-text-primary)] text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
            >
              <span className="h-2.5 w-2.5 rounded-[var(--radius-full)] bg-[var(--color-accent-red)]" />
              {t('record.config.start')}
              <span className="text-[var(--color-text-tertiary)] opacity-70">·</span>
              <span className="font-normal opacity-70">{durationLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
