/**
 * NexaWork SessionList — Multi-session management UI
 * Features: session list, search, context menu, relative time, space grouping
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, Plus, MoreHorizontal, Pin, Archive, Trash2, Pencil, X, MessageSquare } from 'lucide-react';
import type { Session, SessionStatus, SceneType } from '../../shared/session-types';

// ─── Types ────────────────────────────────────────────────────
export interface SessionListProps {
  sessions: Session[];
  activeSessionId: string | null;
  searchQuery: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onSearchChange: (query: string) => void;
}

// ─── Relative Time ────────────────────────────────────────────
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const date = new Date(isoDate).getTime();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

// ─── Context Menu ─────────────────────────────────────────────
interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

function ContextMenu({
  state,
  session,
  onClose,
  onRename,
  onPin,
  onArchive,
  onDelete,
}: {
  state: ContextMenuState;
  session: Session;
  onClose: () => void;
  onRename: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const menuItems = [
    { icon: <Pencil size={13} />, label: '重命名', action: onRename },
    {
      icon: <Pin size={13} />,
      label: session.status === 'pinned' ? '取消置顶' : '置顶',
      action: onPin,
    },
    { icon: <Archive size={13} />, label: '归档', action: onArchive },
    { icon: <Trash2 size={13} />, label: '删除', action: onDelete, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[var(--z-modal)] min-w-[140px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-dropdown)]"
      style={{ left: state.x, top: state.y }}
      role="menu"
    >
      {menuItems.map(item => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            item.action();
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] ${
            'danger' in item && item.danger ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-secondary)]'
          }`}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Session Item ─────────────────────────────────────────────
function SessionItem({
  session,
  isActive,
  onSelect,
  onContextMenu,
}: {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`group flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)] ${
        isActive ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'
      }`}
      aria-current={isActive ? 'true' : undefined}
    >
      <MessageSquare
        size={13}
        className={`flex-shrink-0 ${
          isActive ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-quaternary)]'
        }`}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <span
          className={`truncate text-xs ${
            isActive ? 'font-medium text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
          }`}
        >
          {session.title}
        </span>
        <span className="text-[9px] text-[var(--color-text-quaternary)]">{formatRelativeTime(session.updatedAt)}</span>
      </div>
      {session.status === 'pinned' && <Pin size={10} className="flex-shrink-0 text-[var(--color-text-quaternary)]" />}
    </button>
  );
}

// ─── SessionList Component ────────────────────────────────────
export function SessionList({
  sessions,
  activeSessionId,
  searchQuery,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onPin,
  onArchive,
  onSearchChange,
}: SessionListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, []);

  const handleRenameStart = useCallback(
    (id: string) => {
      const session = sessions.find(s => s.id === id);
      if (session) {
        setRenamingId(id);
        setRenameValue(session.title);
      }
    },
    [sessions],
  );

  const handleRenameConfirm = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, onRename]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenameConfirm();
      } else if (e.key === 'Escape') {
        setRenamingId(null);
        setRenameValue('');
      }
    },
    [handleRenameConfirm],
  );

  // Separate pinned and regular sessions
  const pinnedSessions = sessions.filter(s => s.status === 'pinned');
  const regularSessions = sessions.filter(s => s.status !== 'pinned');

  return (
    <div className="flex flex-col gap-1">
      {/* Search + New */}
      <div className="flex items-center gap-1 px-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-quaternary)]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索会话..."
            className="h-7 w-full rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] pl-7 pr-6 text-[11px] text-[var(--color-text-primary)] placeholder-[var(--color-text-quaternary)] outline-none transition-colors duration-[var(--duration-fast)] focus:bg-[var(--color-bg-primary)] focus:ring-1 focus:ring-[var(--color-border-focus)]"
            aria-label="Search sessions"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)]"
            >
              <X size={10} />
            </button>
          )}
        </div>
        <button
          onClick={onNew}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label="New session"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Pinned Sessions */}
      {pinnedSessions.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1">
          <span className="px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-quaternary)]">
            置顶
          </span>
          {pinnedSessions.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={activeSessionId === session.id}
              onSelect={() => onSelect(session.id)}
              onContextMenu={e => handleContextMenu(e, session.id)}
            />
          ))}
        </div>
      )}

      {/* Regular Sessions */}
      <div className="flex flex-col gap-0.5 px-1">
        {pinnedSessions.length > 0 && regularSessions.length > 0 && (
          <span className="px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-quaternary)]">
            最近
          </span>
        )}
        {regularSessions.map(session =>
          renamingId === session.id ? (
            <div key={session.id} className="flex items-center gap-1 px-2">
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameConfirm}
                className="h-7 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-focus)] bg-[var(--color-bg-primary)] px-2 text-xs text-[var(--color-text-primary)] outline-none"
              />
            </div>
          ) : (
            <SessionItem
              key={session.id}
              session={session}
              isActive={activeSessionId === session.id}
              onSelect={() => onSelect(session.id)}
              onContextMenu={e => handleContextMenu(e, session.id)}
            />
          ),
        )}
      </div>

      {/* Empty State */}
      {sessions.length === 0 && (
        <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
          <MessageSquare size={20} className="text-[var(--color-text-quaternary)]" />
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            {searchQuery ? '没有匹配的会话' : '暂无会话'}
          </span>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          session={sessions.find(s => s.id === contextMenu.sessionId)!}
          onClose={() => setContextMenu(null)}
          onRename={() => handleRenameStart(contextMenu.sessionId)}
          onPin={() => onPin(contextMenu.sessionId)}
          onArchive={() => onArchive(contextMenu.sessionId)}
          onDelete={() => onDelete(contextMenu.sessionId)}
        />
      )}
    </div>
  );
}
