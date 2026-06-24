/**
 * NexaWork Sidebar — Apple-level navigation
 * Features: Brand area, main nav, task list, spaces, user section
 * Supports collapse/expand with smooth 250ms animation
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Plus,
  MessageSquare,
  FolderOpen,
  Users,
  Zap,
  Grid3X3,
  Search,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Circle,
  ChevronDown,
  ChevronRight,
  Bell,
  HelpCircle,
  BookOpen,
  Lightbulb,
  Settings,
  Sparkles,
  Shield,
  PlayCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type NavigationId =
  | 'assistant'
  | 'projects'
  | 'experts'
  | 'skills'
  | 'replay'
  | 'automation'
  | 'security'
  | 'more'
  | 'library'
  | 'inspiration'
  | 'settings';

export interface TaskItem {
  id: string;
  title: string;
  time: string;
  status: 'active' | 'completed' | 'paused';
}

export interface SpaceItem {
  id: string;
  name: string;
  color: string;
  children?: { id: string; name: string }[];
}

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
  activeNav: NavigationId;
  activeSessionId: string | null;
  recentTasks?: TaskItem[];
  spaces?: SpaceItem[];
  userName?: string;
  userAvatar?: string;
  notificationCount?: number;
}

// ─── Navigation Items ─────────────────────────────────────────
interface NavItemConfig {
  id: NavigationId;
  label: string;
  icon: React.ReactNode;
  children?: { id: NavigationId; label: string; icon: React.ReactNode }[];
}

const navItems: NavItemConfig[] = [
  { id: 'assistant', label: '助理', icon: <MessageSquare size={18} /> },
  { id: 'projects', label: '项目', icon: <FolderOpen size={18} /> },
  { id: 'experts', label: '专家', icon: <Users size={18} /> },
  { id: 'skills', label: '技能', icon: <Sparkles size={18} /> },
  { id: 'replay', label: '回放', icon: <PlayCircle size={18} /> },
  { id: 'automation', label: '自动化', icon: <Zap size={18} /> },
  { id: 'security', label: '安全', icon: <Shield size={18} /> },
  {
    id: 'more',
    label: '更多',
    icon: <Grid3X3 size={18} />,
    children: [
      { id: 'library' as NavigationId, label: '资料库', icon: <BookOpen size={16} /> },
      { id: 'inspiration' as NavigationId, label: '灵感', icon: <Lightbulb size={16} /> },
    ],
  },
];

// ─── Default Data ─────────────────────────────────────────────
const defaultTasks: TaskItem[] = [
  { id: 'task-1', title: '分析Q4销售数据报表', time: '2分钟前', status: 'active' },
  { id: 'task-2', title: '生成产品需求文档', time: '1小时前', status: 'completed' },
  { id: 'task-3', title: '代码审查 - PR #142', time: '3小时前', status: 'completed' },
  { id: 'task-4', title: '翻译技术文档到英文', time: '昨天', status: 'paused' },
];

const defaultSpaces: SpaceItem[] = [
  {
    id: 'space-1',
    name: '产品开发',
    color: '#3b82f6',
    children: [
      { id: 'sub-1', name: '前端重构' },
      { id: 'sub-2', name: 'API设计' },
    ],
  },
  {
    id: 'space-2',
    name: '市场营销',
    color: '#10b981',
    children: [{ id: 'sub-3', name: '内容策略' }],
  },
  {
    id: 'space-3',
    name: '个人笔记',
    color: '#f59e0b',
  },
];

// ─── Status Indicator ─────────────────────────────────────────
function StatusDot({ status }: { status: TaskItem['status'] }) {
  const colors: Record<TaskItem['status'], string> = {
    active: 'var(--color-accent-green)',
    completed: 'var(--color-text-tertiary)',
    paused: 'var(--color-accent-orange)',
  };
  return <Circle size={6} className="flex-shrink-0" style={{ fill: colors[status], color: colors[status] }} />;
}

// ─── Tooltip (for collapsed mode) ────────────────────────────
function Tooltip({ children, label, show }: { children: React.ReactNode; label: string; show: boolean }) {
  if (!show) return <>{children}</>;
  return (
    <div className="group relative">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-[var(--z-tooltip)] ml-2 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-2 py-1 text-xs text-[var(--color-bg-primary)] opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100">
        {label}
      </div>
    </div>
  );
}

// ─── Main Sidebar Component ──────────────────────────────────
export function Sidebar({
  collapsed,
  onToggle,
  onNewSession,
  onSelectSession,
  onNavigate,
  activeNav,
  activeSessionId,
  recentTasks = defaultTasks,
  spaces = defaultSpaces,
  userName = 'User',
  notificationCount = 0,
}: SidebarProps) {
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set(['space-1']));
  const sidebarRef = useRef<HTMLElement>(null);

  // Auto-collapse on window resize
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      if (window.innerWidth < 768 && !collapsed) {
        onToggle();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [collapsed, onToggle]);

  const toggleSpace = useCallback((spaceId: string) => {
    setExpandedSpaces(prev => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  }, []);

  const handleNavClick = useCallback(
    (id: NavigationId) => {
      if (id === 'more') {
        setMoreExpanded(prev => !prev);
      } else {
        onNavigate(id);
      }
    },
    [onNavigate],
  );

  return (
    <aside
      ref={sidebarRef}
      className={`flex flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out)] ${
        collapsed ? 'w-[52px]' : 'w-[240px]'
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* ═══ Top: Brand + Search + Filter ═══ */}
      <div className="flex h-[var(--titlebar-height)] items-center gap-1 border-b border-[var(--color-border)] px-2">
        <button
          onClick={onToggle}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {!collapsed && (
          <>
            <span className="flex-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">NexaWork</span>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              aria-label="Search"
            >
              <Search size={14} />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              aria-label="Filter"
            >
              <SlidersHorizontal size={14} />
            </button>
          </>
        )}
      </div>

      {/* ═══ New Task Button ═══ */}
      <div className="px-2 pt-2">
        <Tooltip label="新建任务" show={collapsed}>
          <button
            onClick={onNewSession}
            className={`flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] transition-all duration-[var(--duration-fast)] hover:opacity-90 active:scale-[0.98] ${
              collapsed ? 'h-9 w-9 justify-center' : 'h-9 w-full px-3'
            }`}
            aria-label="New task"
          >
            <Plus size={16} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">新建任务</span>}
          </button>
        </Tooltip>
      </div>

      {/* ═══ Main Navigation ═══ */}
      <nav className="mt-2 flex flex-col gap-0.5 px-2" aria-label="Primary navigation">
        {navItems.map(item => (
          <div key={item.id}>
            <Tooltip label={item.label} show={collapsed}>
              <button
                onClick={() => handleNavClick(item.id)}
                className={`relative flex h-9 w-full items-center gap-3 rounded-[var(--radius-md)] px-2 text-left transition-all duration-[var(--duration-fast)] ${
                  activeNav === item.id
                    ? 'bg-[var(--color-bg-hover)] font-medium text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
                } ${collapsed ? 'justify-center' : ''}`}
                aria-current={activeNav === item.id ? 'page' : undefined}
              >
                {/* Active indicator — left border */}
                {activeNav === item.id && (
                  <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-text-primary)]" />
                )}
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-sm">{item.label}</span>
                    {item.children && (
                      <ChevronDown
                        size={12}
                        className={`text-[var(--color-text-tertiary)] transition-transform duration-[var(--duration-fast)] ${
                          item.id === 'more' && moreExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </>
                )}
              </button>
            </Tooltip>

            {/* Sub-menu for "More" */}
            {item.children && moreExpanded && !collapsed && (
              <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
                {item.children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => onNavigate(child.id)}
                    className={`flex h-8 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-left transition-colors duration-[var(--duration-fast)] ${
                      activeNav === child.id
                        ? 'bg-[var(--color-bg-hover)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {child.icon}
                    <span className="text-xs">{child.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* ═══ Divider ═══ */}
      <div className="mx-3 my-2 border-t border-[var(--color-border)]" />

      {/* ═══ Recent Tasks ═══ */}
      {!collapsed && (
        <div className="flex flex-col gap-0.5 px-2">
          <span className="px-2 py-1 text-xs font-medium text-[var(--color-text-tertiary)]">最近任务</span>
          {recentTasks.slice(0, 5).map(task => (
            <button
              key={task.id}
              onClick={() => onSelectSession(task.id)}
              className={`flex h-8 items-center gap-2 rounded-[var(--radius-md)] px-2 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] ${
                activeSessionId === task.id ? 'bg-[var(--color-bg-hover)]' : ''
              }`}
            >
              <StatusDot status={task.status} />
              <span className="flex-1 truncate text-xs text-[var(--color-text-primary)]">{task.title}</span>
              <span className="flex-shrink-0 text-[10px] text-[var(--color-text-quaternary)]">{task.time}</span>
            </button>
          ))}
        </div>
      )}

      {/* ═══ Divider ═══ */}
      {!collapsed && <div className="mx-3 my-2 border-t border-[var(--color-border)]" />}

      {/* ═══ Spaces ═══ */}
      {!collapsed && (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
          <span className="px-2 py-1 text-xs font-medium text-[var(--color-text-tertiary)]">空间</span>
          {spaces.map(space => (
            <div key={space.id}>
              <button
                onClick={() => toggleSpace(space.id)}
                className="flex h-8 w-full items-center gap-2 rounded-[var(--radius-md)] px-2 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
              >
                {space.children && space.children.length > 0 ? (
                  <ChevronRight
                    size={12}
                    className={`flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-[var(--duration-fast)] ${
                      expandedSpaces.has(space.id) ? 'rotate-90' : ''
                    }`}
                  />
                ) : (
                  <span className="w-3" />
                )}
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: space.color }} />
                <span className="flex-1 truncate text-xs text-[var(--color-text-primary)]">{space.name}</span>
              </button>

              {/* Space children */}
              {space.children && expandedSpaces.has(space.id) && (
                <div className="ml-7 flex flex-col gap-0.5">
                  {space.children.map(child => (
                    <button
                      key={child.id}
                      className="flex h-7 items-center rounded-[var(--radius-sm)] px-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Spacer for collapsed mode */}
      {collapsed && <div className="flex-1" />}

      {/* ═══ Bottom: User Section ═══ */}
      <div className="border-t border-[var(--color-border)] p-2">
        <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
          {/* User Avatar */}
          <Tooltip label={userName} show={collapsed}>
            <button className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]">
              {userName.charAt(0).toUpperCase()}
            </button>
          </Tooltip>

          {!collapsed && <span className="flex-1 truncate text-xs text-[var(--color-text-secondary)]">{userName}</span>}

          {/* Notification Bell */}
          <Tooltip label={`通知${notificationCount > 0 ? ` (${notificationCount})` : ''}`} show={collapsed}>
            <button
              className="relative flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              aria-label="Notifications"
            >
              <Bell size={14} />
              {notificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--color-accent-red)] px-1 text-[9px] font-bold text-white">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
          </Tooltip>

          {/* Settings (expanded mode) */}
          {!collapsed && (
            <button
              onClick={() => onNavigate('settings')}
              className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] ${
                activeNav === 'settings'
                  ? 'text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
              aria-label="Settings"
            >
              <Settings size={14} />
            </button>
          )}

          {/* Help */}
          {!collapsed && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              aria-label="Help"
            >
              <HelpCircle size={14} />
            </button>
          )}

          {/* Settings (collapsed mode) */}
          {collapsed && (
            <Tooltip label="设置" show={true}>
              <button
                onClick={() => onNavigate('settings')}
                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
                aria-label="Settings"
              >
                <Settings size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </aside>
  );
}
