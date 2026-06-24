/**
 * NexaWork GitPanel — Git status panel + diff viewer (N31).
 *
 * Apple-clean, white-bg / black-text source-control surface:
 *   • Left rail: current branch + branch switcher, unstaged + staged change
 *     lists with M/A/D/R status glyphs, stage/unstage (single + all), and a
 *     commit area with "Commit" + "Commit & Push" plus branch operations
 *     (new / switch / merge / pull / push).
 *   • Right pane: a side-by-side Monaco DiffEditor (old ← → new) for the
 *     selected file, with per-hunk stage / unstage actions.
 *
 * All git work runs in the main process via {@link useGit} → IPC; this is a
 * pure presentation layer.
 */
import { useCallback, useMemo, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  FileDiff,
  FileMinus2,
  FilePen,
  FilePlus2,
  GitBranch as GitBranchIcon,
  GitMerge,
  GitPullRequestArrow,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { DiffHunk, GitChangeStatus, GitFileState } from '../../shared/ipc-channels';
import {
  buildHunkPatch,
  GIT_TONE_COLOR,
  isValidCommitMessage,
  statusBadge,
  statusTone,
  validateBranchName,
} from '../../shared/git-panel';
import { useGit } from '../hooks/useGit';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import type { MessageKey } from '../i18n';

type TFn = (key: MessageKey) => string;

/** Status glyph + tint for a change row. */
function statusVisual(status: GitChangeStatus): {
  Icon: typeof FileDiff;
  color: string;
} {
  const tone = statusTone(status);
  const color = GIT_TONE_COLOR[tone];
  switch (tone) {
    case 'added':
      return { Icon: FilePlus2, color };
    case 'deleted':
      return { Icon: FileMinus2, color };
    case 'renamed':
      return { Icon: FilePen, color };
    default:
      return { Icon: FileDiff, color };
  }
}

interface ChangeRowProps {
  file: GitFileState;
  active: boolean;
  staged: boolean;
  onOpen: () => void;
  onToggleStage: () => void;
  onDiscard?: () => void;
  busy: boolean;
  t: TFn;
}

function ChangeRow({ file, active, staged, onOpen, onToggleStage, onDiscard, busy, t }: ChangeRowProps) {
  const { Icon, color } = statusVisual(file.status);
  return (
    <div
      className={`group flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors ${
        active
          ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        title={file.path}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Icon size={13} style={{ color }} className="flex-shrink-0" />
        <span className="truncate">{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</span>
      </button>
      <span
        className="flex-shrink-0 font-mono text-[10px] font-semibold"
        style={{ color }}
        aria-label={`status-${statusBadge(file)}`}
      >
        {statusBadge(file)}
      </span>
      {!staged && onDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          aria-label={t('git.discard')}
          title={t('git.discard')}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--color-error)] group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}
      <button
        type="button"
        onClick={onToggleStage}
        disabled={busy}
        aria-label={staged ? t('git.unstage') : t('git.stage')}
        title={staged ? t('git.unstage') : t('git.stage')}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--color-bg-primary)] hover:text-[var(--color-text-primary)] group-hover:opacity-100"
      >
        {staged ? <Minus size={12} /> : <Plus size={12} />}
      </button>
    </div>
  );
}

export function GitPanel() {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const git = useGit();

  const [message, setMessage] = useState('');
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const canCommit = isValidCommitMessage(message) && git.staged.length > 0 && !git.busy;

  const handleCommit = useCallback(
    async (push: boolean) => {
      if (!isValidCommitMessage(message)) return;
      const result = push ? await git.commitAndPush(message) : await git.commit(message);
      if (result.success) setMessage('');
    },
    [git, message],
  );

  const handleCreateBranch = useCallback(async () => {
    if (validateBranchName(newBranchName) !== null) return;
    const result = await git.createBranch(newBranchName.trim());
    if (result.success) {
      setNewBranchName('');
      setNewBranchOpen(false);
    }
  }, [git, newBranchName]);

  const branchNameError = useMemo(() => (newBranchName ? validateBranchName(newBranchName) : null), [newBranchName]);

  if (!git.available) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-tertiary)]">
        {t('git.unavailable')}
      </div>
    );
  }

  if (git.repoRoot === null && !git.loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)]">
        <GitBranchIcon size={40} className="opacity-40" />
        <p className="text-sm">{t('git.noRepo')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-bg-primary)]">
      {/* ─── Left rail: branch + changes + commit ─── */}
      <div className="flex w-80 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        {/* Branch header */}
        <div className="relative border-b border-[var(--color-border)] px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBranchMenuOpen(o => !o)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-md)] px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
            >
              <GitBranchIcon size={14} className="flex-shrink-0 text-[var(--color-text-secondary)]" />
              <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {git.branch ?? t('git.detached')}
              </span>
              {(git.ahead > 0 || git.behind > 0) && (
                <span className="ml-1 flex-shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  {git.ahead > 0 ? `↑${git.ahead}` : ''}
                  {git.behind > 0 ? `↓${git.behind}` : ''}
                </span>
              )}
              <ChevronDown size={12} className="flex-shrink-0 text-[var(--color-text-tertiary)]" />
            </button>
            <button
              type="button"
              onClick={() => void git.refresh()}
              aria-label={t('git.refresh')}
              title={t('git.refresh')}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
            >
              <RefreshCw size={13} className={git.loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Branch dropdown */}
          {branchMenuOpen && (
            <div className="absolute left-3 right-3 top-full z-[var(--z-dropdown)] mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-lg">
              {git.branches.map(b => (
                <button
                  type="button"
                  key={b.name}
                  onClick={() => {
                    setBranchMenuOpen(false);
                    if (!b.current) void git.checkout(b.name);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
                >
                  <Check size={12} className="flex-shrink-0" style={{ opacity: b.current ? 1 : 0 }} />
                  <span className="truncate">{b.name}</span>
                  {!b.current && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={t('git.merge')}
                      title={t('git.merge')}
                      className="ml-auto flex-shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                      onClick={e => {
                        e.stopPropagation();
                        setBranchMenuOpen(false);
                        void git.merge(b.name);
                      }}
                    >
                      <GitMerge size={12} />
                    </span>
                  )}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--color-border)]" />
              <button
                type="button"
                onClick={() => {
                  setBranchMenuOpen(false);
                  setNewBranchOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
              >
                <Plus size={12} />
                {t('git.newBranch')}
              </button>
            </div>
          )}
        </div>

        {/* New-branch inline input */}
        {newBranchOpen && (
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <input
              autoFocus
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleCreateBranch();
                if (e.key === 'Escape') {
                  setNewBranchOpen(false);
                  setNewBranchName('');
                }
              }}
              placeholder={t('git.newBranchPlaceholder')}
              aria-label={t('git.newBranchPlaceholder')}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
            {branchNameError && (
              <p className="mt-1 text-[10px] text-[var(--color-error)]">
                {t(`git.branchError.${branchNameError}` as MessageKey)}
              </p>
            )}
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => void handleCreateBranch()}
                disabled={branchNameError !== null || !newBranchName.trim()}
                className="rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {t('git.create')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewBranchOpen(false);
                  setNewBranchName('');
                }}
                className="rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
              >
                {t('git.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Sync actions */}
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-3 py-1.5">
          <button
            type="button"
            onClick={() => void git.pull()}
            disabled={git.busy}
            className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
          >
            <ArrowDownToLine size={12} />
            {t('git.pull')}
          </button>
          <button
            type="button"
            onClick={() => void git.push()}
            disabled={git.busy}
            className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
          >
            <ArrowUpFromLine size={12} />
            {t('git.push')}
          </button>
        </div>

        {/* Change lists */}
        <div className="flex-1 overflow-y-auto">
          {/* Staged */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {t('git.staged')} ({git.staged.length})
            </span>
            {git.staged.length > 0 && (
              <button
                type="button"
                onClick={() => void git.unstageAll()}
                disabled={git.busy}
                className="text-[10px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
              >
                {t('git.unstageAll')}
              </button>
            )}
          </div>
          {git.staged.map(file => (
            <ChangeRow
              key={`staged-${file.path}`}
              file={file}
              staged
              busy={git.busy}
              active={git.selection?.path === file.path && git.selection?.staged}
              onOpen={() => void git.selectFile(file.path, true)}
              onToggleStage={() => void git.unstage([file.path])}
              t={t}
            />
          ))}

          {/* Unstaged */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {t('git.changes')} ({git.unstaged.length})
            </span>
            {git.unstaged.length > 0 && (
              <button
                type="button"
                onClick={() => void git.stageAll()}
                disabled={git.busy}
                className="text-[10px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
              >
                {t('git.stageAll')}
              </button>
            )}
          </div>
          {git.unstaged.map(file => (
            <ChangeRow
              key={`unstaged-${file.path}`}
              file={file}
              staged={false}
              busy={git.busy}
              active={git.selection?.path === file.path && !git.selection?.staged}
              onOpen={() => void git.selectFile(file.path, false)}
              onToggleStage={() => void git.stage([file.path])}
              onDiscard={() => void git.discard(file.path)}
              t={t}
            />
          ))}

          {git.staged.length === 0 && git.unstaged.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">{t('git.clean')}</div>
          )}
        </div>

        {/* Commit area */}
        <div className="border-t border-[var(--color-border)] p-2">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t('git.messagePlaceholder')}
            aria-label={t('git.messagePlaceholder')}
            rows={2}
            className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
          {git.error && <p className="mt-1 line-clamp-2 text-[10px] text-[var(--color-error)]">{git.error}</p>}
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => void handleCommit(false)}
              disabled={!canCommit}
              className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Check size={12} />
              {t('git.commit')}
            </button>
            <button
              type="button"
              onClick={() => void handleCommit(true)}
              disabled={!canCommit}
              className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
            >
              <Upload size={12} />
              {t('git.commitPush')}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Right pane: diff ─── */}
      <DiffPane git={git} resolvedTheme={resolved} t={t} />
    </div>
  );
}

interface DiffPaneProps {
  git: ReturnType<typeof useGit>;
  resolvedTheme: 'light' | 'dark';
  t: TFn;
}

function DiffPane({ git, resolvedTheme, t }: DiffPaneProps) {
  const { diff, diffHunks, selection } = git;

  const handleHunk = useCallback(
    (hunk: DiffHunk) => {
      if (!diffHunks) return;
      const patch = buildHunkPatch(diffHunks.fileHeader, hunk);
      if (selection?.staged) void git.unstageHunk(patch);
      else void git.stageHunk(patch);
    },
    [git, diffHunks, selection],
  );

  if (!selection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--color-text-tertiary)]">
        <FileDiff size={40} className="opacity-40" />
        <p className="text-sm">{t('git.pickFile')}</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5">
        <span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">
          {selection.path}
          <span className="ml-2 text-[10px] text-[var(--color-text-tertiary)]">
            {selection.staged ? t('git.viewStaged') : t('git.viewUnstaged')}
          </span>
        </span>
        <button
          type="button"
          onClick={git.clearSelection}
          aria-label={t('git.close')}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {diff ? (
            <DiffEditor
              key={`${selection.path}-${selection.staged}`}
              height="100%"
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              language={diff.language}
              original={diff.original}
              modified={diff.modified}
              options={{
                readOnly: true,
                renderSideBySide: true,
                fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
                fontSize: 13,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
              {t('git.loadingDiff')}
            </div>
          )}
        </div>

        {/* Per-hunk staging rail */}
        {diffHunks && diffHunks.hunks.length > 0 && (
          <div className="flex w-56 flex-shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {t('git.hunks')} ({diffHunks.hunks.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {diffHunks.hunks.map((hunk, i) => (
                <div
                  key={`${hunk.header}-${i}`}
                  className="group flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[10px] text-[var(--color-text-secondary)]">{hunk.header}</p>
                    <p className="mt-0.5 font-mono text-[10px]">
                      <span style={{ color: GIT_TONE_COLOR.added }}>+{hunk.additions}</span>{' '}
                      <span style={{ color: GIT_TONE_COLOR.deleted }}>-{hunk.deletions}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleHunk(hunk)}
                    disabled={git.busy}
                    className="flex-shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
                  >
                    {selection.staged ? t('git.unstageHunk') : t('git.stageHunk')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom sync bar (mirrors common git GUIs) */}
      <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1 text-[10px] text-[var(--color-text-tertiary)]">
        <GitPullRequestArrow size={11} />
        <span>{git.branch ?? ''}</span>
      </div>
    </div>
  );
}
