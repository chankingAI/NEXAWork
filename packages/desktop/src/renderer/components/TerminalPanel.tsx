/**
 * NexaWork TerminalPanel — multi-tab PTY terminal surface (N29).
 *
 * A header strip lists open shell tabs (active highlight, exit badge, close
 * button) plus a "new terminal" action; the body stacks one {@link TerminalView}
 * per tab (kept mounted so scrollback survives switching) and shows an empty
 * state when no shells are open. Tab-list state is owned by {@link useTerminal};
 * each TerminalView owns its own xterm instance and PTY streaming.
 */
import { Plus, TerminalSquare, X } from 'lucide-react';
import { useTerminal } from '../hooks/useTerminal';
import { useI18n } from '../hooks/useI18n';
import { TerminalView } from './TerminalView';
import { TERMINAL_THEME } from '../../shared/terminal';

export function TerminalPanel() {
  const { t } = useI18n();
  const { sessions, activeId, available, create, close, setActive } = useTerminal();

  if (!available) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)]">
        <TerminalSquare size={28} className="mb-3 opacity-60" />
        <p className="text-sm">{t('terminal.unavailable')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-bg-primary)]">
      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
        <div className="mr-1 flex items-center gap-1.5 px-1 text-sm font-medium text-[var(--color-text-primary)]">
          <TerminalSquare size={16} />
          {t('terminal.title')}
        </div>

        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map(session => {
            const isActive = session.id === activeId;
            const exited = session.status === 'exited';
            return (
              <button
                key={session.id}
                onClick={() => setActive(session.id)}
                className={`group flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  isActive
                    ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-secondary)]'
                }`}
                title={session.shell}
              >
                <span className="max-w-[140px] truncate">{session.title}</span>
                {exited && (
                  <span className="rounded bg-[var(--color-bg-primary)] px-1 text-[10px] text-[var(--color-text-tertiary)]">
                    {t('terminal.exited').replace('{code}', String(session.exitCode ?? 0))}
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t('terminal.closeTab')}
                  onClick={e => {
                    e.stopPropagation();
                    void close(session.id);
                  }}
                  className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--color-bg-primary)] group-hover:opacity-100"
                >
                  <X size={11} />
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => void create()}
          aria-label={t('terminal.newTab')}
          title={t('terminal.newTab')}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden" style={{ backgroundColor: TERMINAL_THEME.background }}>
        {sessions.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-[var(--color-text-tertiary)]">
            <TerminalSquare size={32} className="opacity-50" />
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">{t('terminal.empty.title')}</p>
              <p className="mt-0.5 text-xs">{t('terminal.empty.desc')}</p>
            </div>
            <button
              onClick={() => void create()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-text-primary)] px-3 py-1.5 text-xs text-[var(--color-bg-primary)] transition-opacity hover:opacity-90"
            >
              <Plus size={14} />
              {t('terminal.empty.create')}
            </button>
          </div>
        ) : (
          sessions.map(session => (
            <div key={session.id} className="absolute inset-0">
              <TerminalView session={session} active={session.id === activeId} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
