/**
 * NexaWork FileBrowser — project file-tree side panel (N30).
 *
 * A header with a fuzzy filename search + new-file/new-folder/refresh actions
 * sits above a recursively expand/collapse-able tree. Files carry an
 * extension-coloured Lucide icon; clicking a file opens it in the Monaco editor
 * (N28), double-clicking a folder toggles it. A right-click menu offers new
 * file/folder, rename, delete and copy-path; entries can be drag-moved between
 * folders. All disk IO is delegated to {@link useFileBrowser} over IPC.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Binary,
  Braces,
  ChevronRight,
  Copy,
  File as FileIcon,
  FileCode,
  FilePlus,
  FileText,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Image as ImageIcon,
  Lock,
  Music,
  Palette,
  Pencil,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  SquareTerminal,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  type FileEntry,
  type FileIconCategory,
  type TreeNode,
  fileIconCategory,
  fileIconColor,
} from '../../shared/file-tree';
import { useFileBrowser } from '../hooks/useFileBrowser';
import { useI18n } from '../hooks/useI18n';

interface FileBrowserProps {
  /** Open a file path in the editor (wired to the N28 editor session). */
  onOpenFile: (path: string) => void;
  /** Currently-focused file path (highlighted in the tree). */
  activePath?: string | null;
}

const CATEGORY_ICON: Record<
  FileIconCategory,
  React.ComponentType<{ size?: number; color?: string; className?: string }>
> = {
  directory: Folder,
  code: FileCode,
  script: SquareTerminal,
  style: Palette,
  markup: FileCode,
  json: Braces,
  config: SettingsIcon,
  markdown: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
  archive: Archive,
  pdf: FileText,
  font: Type,
  lock: Lock,
  git: GitBranch,
  binary: Binary,
  text: FileText,
};

function EntryIcon({ entry, expanded }: { entry: FileEntry; expanded: boolean }) {
  const color = fileIconColor(entry.name, entry.kind);
  if (entry.kind === 'directory') {
    const Icon = expanded ? FolderOpen : Folder;
    return <Icon size={15} color={color} className="flex-shrink-0" />;
  }
  const category = fileIconCategory(entry.name, entry.kind);
  const Icon = CATEGORY_ICON[category] ?? FileIcon;
  return <Icon size={15} color={color} className="flex-shrink-0" />;
}

type EditState =
  | { mode: 'rename'; path: string; initial: string }
  | { mode: 'create-file' | 'create-folder'; parent: string; initial: string };

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode;
}

export function FileBrowser({ onOpenFile, activePath }: FileBrowserProps) {
  const { t } = useI18n();
  const {
    available,
    root,
    rows,
    loading,
    error,
    search,
    setSearch,
    searchResults,
    searching,
    toggle,
    loadMore,
    refresh,
    createEntry,
    rename,
    remove,
    move,
  } = useFileBrowser();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close the context menu on any outside interaction / Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (edit) editInputRef.current?.focus();
  }, [edit]);

  const beginEdit = useCallback((state: EditState) => {
    setContextMenu(null);
    setEdit(state);
    setEditValue(state.mode === 'rename' ? state.initial : '');
  }, []);

  const commitEdit = useCallback(() => {
    if (!edit) return;
    const value = editValue.trim();
    if (value) {
      if (edit.mode === 'rename') {
        void rename(edit.path, value);
      } else {
        void createEntry(edit.parent, value, edit.mode === 'create-folder' ? 'directory' : 'file');
      }
    }
    setEdit(null);
    setEditValue('');
  }, [edit, editValue, rename, createEntry]);

  const targetDirFor = useCallback(
    (node: TreeNode | null): string => {
      if (!node) return root ?? '';
      return node.entry.kind === 'directory' ? node.entry.path : node.entry.path.replace(/[\\/][^\\/]+$/, '');
    },
    [root],
  );

  const onRowClick = useCallback(
    (node: TreeNode) => {
      setSelectedPath(node.entry.path);
      if (node.entry.kind === 'directory') {
        toggle(node);
      } else {
        onOpenFile(node.entry.path);
      }
    },
    [toggle, onOpenFile],
  );

  const copyPath = useCallback((path: string) => {
    setContextMenu(null);
    void navigator.clipboard?.writeText(path).catch(() => {});
  }, []);

  if (!available) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]">
        <Folder size={26} className="opacity-60" />
        <p className="text-xs">{t('files.unavailable')}</p>
      </div>
    );
  }

  const selectedNode = selectedPath ? (rows.find(r => r.entry.path === selectedPath) ?? null) : null;
  const newTargetDir = targetDirFor(selectedNode);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
      {/* Header: title + actions */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
        <span className="flex-1 truncate px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('files.title')}
        </span>
        <button
          onClick={() => beginEdit({ mode: 'create-file', parent: newTargetDir, initial: '' })}
          aria-label={t('files.newFile')}
          title={t('files.newFile')}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <FilePlus size={14} />
        </button>
        <button
          onClick={() =>
            beginEdit({
              mode: 'create-folder',
              parent: newTargetDir,
              initial: '',
            })
          }
          aria-label={t('files.newFolder')}
          title={t('files.newFolder')}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <FolderPlus size={14} />
        </button>
        <button
          onClick={() => void refresh()}
          aria-label={t('files.refresh')}
          title={t('files.refresh')}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-[var(--color-border)] px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-md bg-[var(--color-bg-primary)] px-2 py-1">
          <Search size={13} className="flex-shrink-0 text-[var(--color-text-tertiary)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('files.searchPlaceholder')}
            className="w-full bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-quaternary)] focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label={t('files.clearSearch')}
              className="flex-shrink-0 rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Inline create / rename input */}
      {edit && (
        <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5">
          {edit.mode === 'create-folder' ? (
            <FolderPlus size={14} className="text-[var(--color-accent-blue,#60A5FA)]" />
          ) : edit.mode === 'create-file' ? (
            <FilePlus size={14} className="text-[var(--color-text-tertiary)]" />
          ) : (
            <Pencil size={13} className="text-[var(--color-text-tertiary)]" />
          )}
          <input
            ref={editInputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit();
              else if (e.key === 'Escape') {
                setEdit(null);
                setEditValue('');
              }
            }}
            onBlur={commitEdit}
            placeholder={
              edit.mode === 'rename'
                ? t('files.renamePlaceholder')
                : edit.mode === 'create-folder'
                  ? t('files.newFolderPlaceholder')
                  : t('files.newFilePlaceholder')
            }
            className="w-full bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-quaternary)] focus:outline-none"
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-1">
        {error && (
          <div className="mx-2 my-1 rounded bg-[var(--color-accent-red,#EF4444)]/10 px-2 py-1 text-[11px] text-[var(--color-accent-red,#EF4444)]">
            {error}
          </div>
        )}

        {searchResults !== null ? (
          // ─── Search results (flat list) ─────────────────────────────────────
          <div className="flex flex-col">
            {searching && (
              <div className="px-3 py-2 text-[11px] text-[var(--color-text-tertiary)]">{t('files.searching')}</div>
            )}
            {!searching && searchResults.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-[var(--color-text-tertiary)]">{t('files.noResults')}</div>
            )}
            {searchResults.map(entry => (
              <button
                key={entry.path}
                onClick={() => {
                  setSelectedPath(entry.path);
                  if (entry.kind === 'file') onOpenFile(entry.path);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-[var(--color-bg-hover)] ${
                  activePath === entry.path ? 'bg-[var(--color-bg-hover)] font-medium' : ''
                }`}
                title={entry.path}
              >
                <EntryIcon entry={entry} expanded={false} />
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
          </div>
        ) : (
          // ─── Tree ────────────────────────────────────────────────────────────
          <div className="flex flex-col">
            {rows.length === 0 && !loading && (
              <div className="px-3 py-2 text-[11px] text-[var(--color-text-tertiary)]">{t('files.empty')}</div>
            )}
            {rows.map(node => {
              const isDir = node.entry.kind === 'directory';
              const isActive = activePath === node.entry.path;
              const isSelected = selectedPath === node.entry.path;
              return (
                <div key={node.entry.path}>
                  <div
                    role="treeitem"
                    aria-expanded={isDir ? node.expanded : undefined}
                    aria-selected={isSelected}
                    tabIndex={0}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/nexa-path', node.entry.path);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={e => {
                      if (!isDir) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOver(node.entry.path);
                    }}
                    onDragLeave={() => {
                      setDragOver(cur => (cur === node.entry.path ? null : cur));
                    }}
                    onDrop={e => {
                      setDragOver(null);
                      if (!isDir) return;
                      e.preventDefault();
                      const src = e.dataTransfer.getData('text/nexa-path');
                      if (src && src !== node.entry.path) {
                        void move(src, node.entry.path);
                      }
                    }}
                    onClick={() => onRowClick(node)}
                    onDoubleClick={() => {
                      if (isDir) toggle(node);
                    }}
                    onContextMenu={e => {
                      e.preventDefault();
                      setSelectedPath(node.entry.path);
                      setContextMenu({ x: e.clientX, y: e.clientY, node });
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onRowClick(node);
                    }}
                    className={`group flex cursor-pointer items-center gap-1.5 py-1 pr-2 text-xs transition-colors ${
                      isActive || isSelected
                        ? 'bg-[var(--color-bg-hover)] font-medium'
                        : 'hover:bg-[var(--color-bg-hover)]'
                    } ${dragOver === node.entry.path ? 'ring-1 ring-inset ring-[var(--color-accent-blue,#60A5FA)]' : ''}`}
                    style={{ paddingLeft: `${8 + node.depth * 14}px` }}
                    title={node.entry.path}
                  >
                    {isDir ? (
                      <ChevronRight
                        size={13}
                        className={`flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform ${
                          node.expanded ? 'rotate-90' : ''
                        }`}
                      />
                    ) : (
                      <span className="w-[13px] flex-shrink-0" />
                    )}
                    <EntryIcon entry={node.entry} expanded={node.expanded} />
                    <span className="truncate">{node.entry.name}</span>
                    {node.loading && (
                      <RefreshCw
                        size={11}
                        className="ml-auto flex-shrink-0 animate-spin text-[var(--color-text-tertiary)]"
                      />
                    )}
                  </div>

                  {/* Lazy "load more" affordance for big directories */}
                  {isDir && node.expanded && node.hasMore && (
                    <button
                      onClick={() => void loadMore(node.entry.path)}
                      className="flex w-full items-center text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                      style={{ paddingLeft: `${8 + (node.depth + 1) * 14}px` }}
                    >
                      {t('files.loadMore')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[var(--z-tooltip,9999)] min-w-[176px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <MenuItem
            icon={<FilePlus size={13} />}
            label={t('files.newFile')}
            onClick={() =>
              beginEdit({
                mode: 'create-file',
                parent: targetDirFor(contextMenu.node),
                initial: '',
              })
            }
          />
          <MenuItem
            icon={<FolderPlus size={13} />}
            label={t('files.newFolder')}
            onClick={() =>
              beginEdit({
                mode: 'create-folder',
                parent: targetDirFor(contextMenu.node),
                initial: '',
              })
            }
          />
          <div className="my-1 border-t border-[var(--color-border)]" />
          <MenuItem
            icon={<Pencil size={13} />}
            label={t('files.rename')}
            onClick={() =>
              beginEdit({
                mode: 'rename',
                path: contextMenu.node.entry.path,
                initial: contextMenu.node.entry.name,
              })
            }
          />
          <MenuItem
            icon={<Copy size={13} />}
            label={t('files.copyPath')}
            onClick={() => copyPath(contextMenu.node.entry.path)}
          />
          <div className="my-1 border-t border-[var(--color-border)]" />
          <MenuItem
            icon={<Trash2 size={13} />}
            label={t('files.delete')}
            danger
            onClick={() => {
              const path = contextMenu.node.entry.path;
              setContextMenu(null);
              void remove(path);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-bg-hover)] ${
        danger ? 'text-[var(--color-accent-red,#EF4444)]' : 'text-[var(--color-text-primary)]'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
