/**
 * NexaWork DiffViewer — git change review via Monaco DiffEditor (N28).
 *
 * Left rail lists the working-tree changes (`git diff HEAD` + untracked) with a
 * status glyph; selecting one loads its HEAD vs working-tree contents into a
 * side-by-side Monaco DiffEditor. A lightweight inline-comment thread lets the
 * reviewer pin notes to a line (local-only stub pending a review backend).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiffEditor, type Monaco, type DiffOnMount } from '@monaco-editor/react';
import { FilePlus2, FileMinus2, FileDiff, FilePen, MessageSquarePlus, RefreshCw, X } from 'lucide-react';
import type { GitChange, GitChangeStatus, GitDiffData } from '../../shared/ipc-channels';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';

interface InlineComment {
  id: string;
  line: number;
  text: string;
}

/** Pick a status glyph + tint for a change row. */
function statusVisual(status: GitChangeStatus): {
  Icon: typeof FileDiff;
  color: string;
} {
  switch (status) {
    case 'added':
    case 'untracked':
      return { Icon: FilePlus2, color: 'var(--color-accent-green)' };
    case 'deleted':
      return { Icon: FileMinus2, color: 'var(--color-error)' };
    case 'renamed':
    case 'copied':
      return { Icon: FilePen, color: 'var(--color-accent-orange)' };
    default:
      return { Icon: FileDiff, color: 'var(--color-accent)' };
  }
}

export function DiffViewer() {
  const { t } = useI18n();
  const { resolved } = useTheme();

  const [changes, setChanges] = useState<GitChange[]>([]);
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Record<string, InlineComment[]>>({});

  const modifiedEditorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);

  const refresh = useCallback(async () => {
    const api = window.nexawork?.editor;
    if (!api) return;
    setLoading(true);
    try {
      const result = await api.gitChanges();
      setRepoRoot(result.repoRoot);
      setChanges(result.changes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDiff = useCallback(async (path: string) => {
    const api = window.nexawork?.editor;
    if (!api) return;
    setSelectedPath(path);
    setDiff(null);
    const result = await api.gitDiff({ path });
    setDiff(result);
  }, []);

  const handleMount: DiffOnMount = (editor, _monaco: Monaco) => {
    modifiedEditorRef.current = editor;
  };

  const addComment = useCallback(() => {
    const editor = modifiedEditorRef.current;
    if (!editor || !selectedPath) return;
    const position = editor.getModifiedEditor().getPosition();
    const line = position?.lineNumber ?? 1;
    const text = window.prompt(t('editor.diff.commentPrompt'));
    if (!text || !text.trim()) return;
    setComments(prev => ({
      ...prev,
      [selectedPath]: [...(prev[selectedPath] ?? []), { id: `c-${Date.now()}`, line, text: text.trim() }],
    }));
  }, [selectedPath, t]);

  const removeComment = useCallback((path: string, id: string) => {
    setComments(prev => ({
      ...prev,
      [path]: (prev[path] ?? []).filter(c => c.id !== id),
    }));
  }, []);

  const activeComments = useMemo(() => (selectedPath ? (comments[selectedPath] ?? []) : []), [comments, selectedPath]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Change list */}
      <div className="flex w-64 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('editor.diff.changes')} ({changes.length})
          </span>
          <button
            onClick={() => void refresh()}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
            aria-label={t('editor.diff.refresh')}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {changes.length === 0 ? (
            <div className="px-3 py-4 text-xs text-[var(--color-text-tertiary)]">
              {repoRoot ? t('editor.diff.clean') : t('editor.diff.noRepo')}
            </div>
          ) : (
            changes.map(change => {
              const { Icon, color } = statusVisual(change.status);
              const isActive = change.path === selectedPath;
              return (
                <button
                  key={change.path}
                  onClick={() => void openDiff(change.path)}
                  title={change.path}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                >
                  <Icon size={13} style={{ color }} className="flex-shrink-0" />
                  <span className="truncate">{change.path}</span>
                  <span className="ml-auto flex-shrink-0 font-mono text-[10px]" style={{ color }}>
                    {change.code}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Diff body */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {diff ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5">
              <span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{diff.path}</span>
              <button
                onClick={addComment}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              >
                <MessageSquarePlus size={13} />
                {t('editor.diff.addComment')}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <DiffEditor
                key={diff.path}
                height="100%"
                theme={resolved === 'dark' ? 'vs-dark' : 'light'}
                language={diff.language}
                original={diff.original}
                modified={diff.modified}
                onMount={handleMount}
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
            </div>
            {activeComments.length > 0 && (
              <div className="max-h-40 overflow-y-auto border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
                <p className="mb-1 text-[11px] font-medium text-[var(--color-text-tertiary)]">
                  {t('editor.diff.comments')} ({activeComments.length})
                </p>
                {activeComments.map(comment => (
                  <div
                    key={comment.id}
                    className="group flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-[var(--color-bg-hover)]"
                  >
                    <span className="flex-shrink-0 font-mono text-[var(--color-accent)]">L{comment.line}</span>
                    <span className="flex-1 text-[var(--color-text-secondary)]">{comment.text}</span>
                    <button
                      onClick={() => selectedPath && removeComment(selectedPath, comment.id)}
                      className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={t('editor.diff.removeComment')}
                    >
                      <X size={11} className="text-[var(--color-text-tertiary)]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-tertiary)]">
            <FileDiff size={40} className="opacity-40" />
            <p className="text-sm">{selectedPath ? t('editor.diff.loading') : t('editor.diff.pick')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
