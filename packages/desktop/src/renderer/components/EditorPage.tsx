/**
 * NexaWork EditorPage — host shell for the Monaco code editor + diff viewer (N28).
 *
 * Owns the shared {@link useCodeEditor} session (so tabs survive toggling to the
 * diff view and back) and exposes a header with a Code / Diff segmented control
 * plus an "open file by path" affordance (a full file browser arrives in N30).
 */
import { useCallback, useState } from 'react';
import { Columns2, FileCode, FolderOpen } from 'lucide-react';
import { CodeEditor } from './CodeEditor';
import { DiffViewer } from './DiffViewer';
import { useCodeEditor } from '../hooks/useCodeEditor';
import { useI18n } from '../hooks/useI18n';

type EditorView = 'code' | 'diff';

export interface EditorPageProps {
  /** Forward an "Ask AI about this" prompt to the chat assistant. */
  onAskAi?: (prompt: string) => void;
}

export function EditorPage({ onAskAi }: EditorPageProps) {
  const { t } = useI18n();
  const editor = useCodeEditor();
  const [view, setView] = useState<EditorView>('code');
  const [openPath, setOpenPath] = useState('');

  const handleOpen = useCallback(() => {
    const trimmed = openPath.trim();
    if (!trimmed) return;
    void editor.open(trimmed);
    setOpenPath('');
    setView('code');
  }, [openPath, editor]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
          <FileCode size={16} />
          {t('editor.title')}
        </div>

        {/* View toggle */}
        <div className="ml-2 flex items-center rounded-lg bg-[var(--color-bg-tertiary)] p-0.5">
          <button
            onClick={() => setView('code')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
              view === 'code'
                ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <FileCode size={13} />
            {t('editor.view.code')}
          </button>
          <button
            onClick={() => setView('diff')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
              view === 'diff'
                ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Columns2 size={13} />
            {t('editor.view.diff')}
          </button>
        </div>

        {/* Open file by path */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1">
            <FolderOpen size={13} className="text-[var(--color-text-tertiary)]" />
            <input
              value={openPath}
              onChange={e => setOpenPath(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleOpen();
              }}
              placeholder={t('editor.openPlaceholder')}
              className="w-64 bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            />
          </div>
          <button
            onClick={handleOpen}
            disabled={!openPath.trim()}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1 text-xs text-[var(--color-text-inverse)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('editor.open')}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {view === 'code' ? <CodeEditor editor={editor} onAskAi={onAskAi} /> : <DiffViewer />}
      </div>
    </div>
  );
}
