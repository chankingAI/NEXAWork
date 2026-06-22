import {
  Plus,
  MessageSquare,
  FolderOpen,
  Users,
  Zap,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Circle,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  activeSessionId: string | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'assistant', label: 'Assistant', icon: <MessageSquare size={18} /> },
  { id: 'projects', label: 'Projects', icon: <FolderOpen size={18} /> },
  { id: 'experts', label: 'Experts', icon: <Users size={18} /> },
  { id: 'automation', label: 'Automation', icon: <Zap size={18} /> },
  { id: 'more', label: 'More', icon: <MoreHorizontal size={18} /> },
];

export function Sidebar({ collapsed, onToggle, onNewSession, onSelectSession, activeSessionId }: SidebarProps) {
  return (
    <aside
      className={`flex flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] transition-all duration-[var(--duration-normal)] ${
        collapsed ? 'w-[52px]' : 'w-[200px]'
      }`}
    >
      {/* Top: Toggle + New */}
      <div className="flex items-center justify-between p-2">
        <button
          onClick={onToggle}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        {!collapsed && (
          <button
            onClick={onNewSession}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            aria-label="New session"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2">
        {navItems.map(item => (
          <button
            key={item.id}
            className="flex h-9 items-center gap-3 rounded-[var(--radius-md)] px-2 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            title={collapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate text-sm">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-2 my-2 border-t border-[var(--color-border)]" />

      {/* Session list */}
      {!collapsed && (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
          <span className="px-2 py-1 text-xs font-medium text-[var(--color-text-tertiary)]">Recent</span>
          {activeSessionId && (
            <button
              onClick={() => onSelectSession(activeSessionId)}
              className="flex h-8 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-hover)] px-2 text-left"
            >
              <Circle
                size={6}
                className="flex-shrink-0 fill-[var(--color-accent-green)] text-[var(--color-accent-green)]"
              />
              <span className="truncate text-xs text-[var(--color-text-primary)]">Current Session</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
