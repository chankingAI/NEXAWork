/**
 * NexaWork CodeEditor — multi-tab Monaco editor surface (N28).
 *
 * - A tab strip (open files, dirty dot, close button) sits above a single
 *   Monaco editor bound to the active tab.
 * - Syntax highlighting is driven by the detected language; the theme follows
 *   the app's resolved light/dark mode.
 * - Ctrl/Cmd+S flushes the active buffer to disk (autosave also runs after 1s
 *   idle, owned by {@link useCodeEditor}).
 * - A right-click "Ask AI about this" action forwards the current selection to
 *   the assistant via {@link onAskAi}.
 * - When the AI rewrites a file, the changed line ranges flash-highlight.
 */
import { useEffect, useRef } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { Circle, FileCode, X } from 'lucide-react';
import { DEFAULT_EDITOR_CONFIG, buildAskAiPrompt } from '../../shared/editor';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import type { UseCodeEditorReturn } from '../hooks/useCodeEditor';
import { setupMonaco } from '../lib/monaco-setup';

export interface CodeEditorProps {
  editor: UseCodeEditorReturn;
  /** Forward a built prompt (selection + provenance) to the chat assistant. */
  onAskAi?: (prompt: string) => void;
}

export function CodeEditor({ editor, onAskAi }: CodeEditorProps) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const { tabs, activePath, activeTab, error, highlights, select, close, edit, save, clearHighlight } = editor;

  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // Keep the latest callbacks reachable from Monaco command closures (which are
  // bound once on mount) without re-binding on every render.
  const saveRef = useRef(save);
  const askRef = useRef(onAskAi);
  const activeTabRef = useRef(activeTab);
  saveRef.current = save;
  askRef.current = onAskAi;
  activeTabRef.current = activeTab;

  useEffect(() => {
    setupMonaco();
  }, []);

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;

    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveRef.current();
    });

    instance.addAction({
      id: 'nexawork.askAi',
      label: t('editor.askAi'),
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: ed => {
        const tab = activeTabRef.current;
        const selection = ed.getSelection();
        if (!tab || !selection) return;
        const text = ed.getModel()?.getValueInRange(selection) ?? '';
        if (!text.trim()) return;
        askRef.current?.(buildAskAiPrompt(tab.path, tab.language, text));
      },
    });
  };

  // Flash-highlight the lines an AI edit just rewrote, then fade + clear.
  useEffect(() => {
    const instance = editorRef.current;
    const monaco = monacoRef.current;
    if (!instance || !monaco || !activePath) return;
    const ranges = highlights[activePath];
    if (!ranges || ranges.length === 0) return;

    decorationsRef.current = instance.deltaDecorations(
      decorationsRef.current,
      ranges.map(r => ({
        range: new monaco.Range(r.startLine, 1, r.endLine, 1),
        options: {
          isWholeLine: true,
          className: 'nexa-ai-edit-line',
          glyphMarginClassName: 'nexa-ai-edit-glyph',
        },
      })),
    );
    instance.revealLineInCenterIfOutsideViewport(ranges[0].startLine);

    const timer = setTimeout(() => {
      if (editorRef.current) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      }
      clearHighlight(activePath);
    }, 2400);
    return () => clearTimeout(timer);
  }, [highlights, activePath, clearHighlight]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-bg-primary)]">
      {/* Tab strip */}
      <div className="flex items-center overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        {tabs.length === 0 ? (
          <div className="px-4 py-2 text-xs text-[var(--color-text-tertiary)]">{t('editor.noOpenFiles')}</div>
        ) : (
          tabs.map(tab => {
            const isActive = tab.path === activePath;
            return (
              <div
                key={tab.path}
                onClick={() => select(tab.path)}
                title={tab.path}
                className={`group flex max-w-[220px] flex-shrink-0 cursor-pointer items-center gap-2 border-r border-[var(--color-border)] px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                <FileCode size={13} className="flex-shrink-0 opacity-70" />
                <span className="truncate">{tab.name}</span>
                {tab.dirty && (
                  <Circle
                    size={7}
                    className="flex-shrink-0"
                    style={{
                      fill: 'var(--color-accent)',
                      color: 'var(--color-accent)',
                    }}
                  />
                )}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    close(tab.path);
                  }}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--color-bg-tertiary)] group-hover:opacity-100"
                  aria-label={t('editor.closeTab')}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Editor body */}
      <div className="relative flex-1 overflow-hidden">
        {error && (
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg bg-[var(--color-error)] px-3 py-1.5 text-xs text-white shadow-md">
            {error}
          </div>
        )}
        {activeTab ? (
          <Editor
            key={activeTab.path}
            height="100%"
            theme={resolved === 'dark' ? 'vs-dark' : 'light'}
            language={activeTab.language}
            value={activeTab.content}
            onMount={handleMount}
            onChange={value => {
              if (activePath) edit(activePath, value ?? '');
            }}
            options={{
              fontFamily: DEFAULT_EDITOR_CONFIG.fontFamily,
              fontSize: DEFAULT_EDITOR_CONFIG.fontSize,
              tabSize: DEFAULT_EDITOR_CONFIG.tabSize,
              minimap: { enabled: DEFAULT_EDITOR_CONFIG.minimap },
              readOnly: activeTab.readOnly,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              glyphMargin: true,
              fontLigatures: true,
              smoothScrolling: true,
              renderWhitespace: 'selection',
              padding: { top: 10 },
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-tertiary)]">
            <FileCode size={40} className="opacity-40" />
            <p className="text-sm">{t('editor.emptyHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
