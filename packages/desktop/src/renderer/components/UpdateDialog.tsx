/**
 * NexaWork UpdateDialog — the N36 auto-update modal.
 *
 * Surfaced by `useAutoUpdate` whenever there is an actionable update state:
 *   available    → release notes + 「立即更新」(start background download)
 *   downloading  → live progress bar (percent / speed / transferred-of-total)
 *   downloaded   → 「重启更新」(quit & install)
 *   error        → failure notice (current version is unaffected) + 「重试」
 *
 * It is purely presentational — all updater work happens in the main process and
 * is reached through the hook's IPC-backed actions.
 */
import { AlertTriangle, Download, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { formatBytes, formatSpeed } from '../../shared/auto-updater';
import { useI18n } from '../hooks/useI18n';
import type { UseAutoUpdateResult } from '../hooks/useAutoUpdate';

export interface UpdateDialogProps {
  update: UseAutoUpdateResult;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, value), template);
}

export function UpdateDialog({ update }: UpdateDialogProps) {
  const { t } = useI18n();
  const { state, visible } = update;
  if (!visible) return null;

  const version = state.availableVersion ?? '';
  const progress = state.progress;
  const percent = progress ? progress.percent : 0;

  const titleKey =
    state.status === 'downloaded'
      ? 'update.title.downloaded'
      : state.status === 'downloading'
        ? 'update.title.downloading'
        : state.status === 'error'
          ? 'update.title.error'
          : 'update.title.available';

  const accent = 'text-[var(--color-accent-red)]';

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey)}
    >
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
            {state.status === 'error' ? (
              <AlertTriangle size={15} className={accent} />
            ) : state.status === 'downloading' ? (
              <Loader2 size={15} className={`${accent} animate-spin`} />
            ) : (
              <Sparkles size={15} className={accent} />
            )}
            {t(titleKey)}
          </span>
          <button
            type="button"
            onClick={update.dismiss}
            aria-label={t('update.button.later')}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-4">
          {state.status === 'available' && (
            <>
              <p className="text-sm text-[var(--color-text-primary)]">
                {interpolate(t('update.available.desc'), { version })}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {interpolate(t('update.current'), {
                  version: state.currentVersion,
                })}
              </p>
              {state.releaseNotes && (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
                    {t('update.releaseNotes')}
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                    {state.releaseNotes}
                  </pre>
                </div>
              )}
            </>
          )}

          {state.status === 'downloading' && (
            <>
              <p className="text-sm text-[var(--color-text-primary)]">{t('update.downloading.status')}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
                <div
                  className="h-full rounded-full bg-[var(--color-text-primary)] transition-[width] duration-[var(--duration-fast)]"
                  style={{ width: `${percent}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-[var(--color-text-tertiary)]">
                <span>{percent.toFixed(1)}%</span>
                {progress && progress.total > 0 && (
                  <span>
                    {formatBytes(progress.transferred)} / {formatBytes(progress.total)} ·{' '}
                    {formatSpeed(progress.bytesPerSecond)}
                  </span>
                )}
              </div>
            </>
          )}

          {state.status === 'downloaded' && (
            <p className="text-sm text-[var(--color-text-primary)]">
              {interpolate(t('update.downloaded.desc'), { version })}
            </p>
          )}

          {state.status === 'error' && (
            <>
              <p className="text-sm text-[var(--color-text-primary)]">{t('update.error.desc')}</p>
              {state.error && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{state.error}</p>}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--color-border)] px-4 py-3">
          {state.status === 'available' && (
            <>
              <button
                type="button"
                onClick={() => void update.download()}
                disabled={!update.canDownload}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:opacity-40"
              >
                <Download size={13} />
                {t('update.button.download')}
              </button>
              <button
                type="button"
                onClick={update.dismiss}
                className="flex h-9 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                {t('update.button.later')}
              </button>
            </>
          )}

          {state.status === 'downloading' && (
            <button
              type="button"
              onClick={update.dismiss}
              className="flex h-9 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              {t('update.button.background')}
            </button>
          )}

          {state.status === 'downloaded' && (
            <>
              <button
                type="button"
                onClick={() => void update.install()}
                disabled={!update.canInstall}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:opacity-40"
              >
                <RotateCcw size={13} />
                {t('update.button.restart')}
              </button>
              <button
                type="button"
                onClick={update.dismiss}
                className="flex h-9 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                {t('update.button.later')}
              </button>
            </>
          )}

          {state.status === 'error' && (
            <>
              <button
                type="button"
                onClick={() => void update.download()}
                disabled={!update.canDownload}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:opacity-40"
              >
                <RotateCcw size={13} />
                {t('update.button.retry')}
              </button>
              <button
                type="button"
                onClick={update.dismiss}
                className="flex h-9 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                {t('update.button.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
