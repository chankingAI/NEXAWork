/**
 * NexaWork ExpertSelector — Quick expert picker for input toolbar
 * Features: current expert display, recent experts, toolbar integration
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Users, Zap, Shield, Settings, ChevronRight, Clock } from 'lucide-react';
import type { Expert } from './ExpertListPage';
import { defaultExperts } from './ExpertListPage';

// ─── Types ────────────────────────────────────────────────────
export type PermissionLevel = 'default' | 'strict' | 'permissive';
export type SkillMode = 'auto' | 'manual' | 'disabled';

export interface ToolbarConfig {
  expertId: string | null;
  modelMode: string;
  skillMode: SkillMode;
  permission: PermissionLevel;
}

export interface ExpertSelectorProps {
  currentExpertId: string | null;
  recentExpertIds: string[];
  onSelectExpert: (expertId: string | null) => void;
  onOpenExpertList: () => void;
  toolbarConfig: ToolbarConfig;
  onToolbarChange: (config: Partial<ToolbarConfig>) => void;
}

// ─── Storage Key ──────────────────────────────────────────────
export const RECENT_EXPERTS_KEY = 'nexawork-recent-experts';
export const MAX_RECENT = 3;

// ─── useExpertSelector Hook ───────────────────────────────────
export interface ExpertSelectorState {
  currentExpertId: string | null;
  recentExpertIds: string[];
  toolbarConfig: ToolbarConfig;
  selectExpert: (expertId: string | null) => void;
  getExpert: (id: string) => Expert | undefined;
  getCurrentExpert: () => Expert | undefined;
  updateToolbar: (config: Partial<ToolbarConfig>) => void;
}

export function useExpertSelector(): ExpertSelectorState {
  const [currentExpertId, setCurrentExpertId] = useState<string | null>(null);
  const [recentExpertIds, setRecentExpertIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_EXPERTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT) as string[];
      }
    } catch {
      /* ignore */
    }
    return [];
  });
  const [toolbarConfig, setToolbarConfig] = useState<ToolbarConfig>({
    expertId: null,
    modelMode: '自动',
    skillMode: 'auto',
    permission: 'default',
  });

  const selectExpert = useCallback((expertId: string | null) => {
    setCurrentExpertId(expertId);
    setToolbarConfig(prev => ({ ...prev, expertId }));

    if (expertId) {
      setRecentExpertIds(prev => {
        const filtered = prev.filter(id => id !== expertId);
        const updated = [expertId, ...filtered].slice(0, MAX_RECENT);
        try {
          localStorage.setItem(RECENT_EXPERTS_KEY, JSON.stringify(updated));
        } catch {
          /* ignore */
        }
        return updated;
      });
    }
  }, []);

  const getExpert = useCallback((id: string): Expert | undefined => {
    return defaultExperts.find(e => e.id === id);
  }, []);

  const getCurrentExpert = useCallback((): Expert | undefined => {
    if (!currentExpertId) return undefined;
    return defaultExperts.find(e => e.id === currentExpertId);
  }, [currentExpertId]);

  const updateToolbar = useCallback((config: Partial<ToolbarConfig>) => {
    setToolbarConfig(prev => ({ ...prev, ...config }));
  }, []);

  return {
    currentExpertId,
    recentExpertIds,
    toolbarConfig,
    selectExpert,
    getExpert,
    getCurrentExpert,
    updateToolbar,
  };
}

// ─── Permission Labels ───────────────────────────────────────
const permissionLabels: Record<PermissionLevel, string> = {
  default: '默认权限',
  strict: '严格模式',
  permissive: '宽松模式',
};

const skillLabels: Record<SkillMode, string> = {
  auto: '自动',
  manual: '手动',
  disabled: '禁用',
};

// ─── ExpertSelector Component ─────────────────────────────────
export function ExpertSelector({
  currentExpertId,
  recentExpertIds,
  onSelectExpert,
  onOpenExpertList,
  toolbarConfig,
  onToolbarChange,
}: ExpertSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentExpert = useMemo(
    () => (currentExpertId ? defaultExperts.find(e => e.id === currentExpertId) : null),
    [currentExpertId],
  );

  const recentExperts = useMemo(
    () => recentExpertIds.map(id => defaultExperts.find(e => e.id === id)).filter((e): e is Expert => e !== undefined),
    [recentExpertIds],
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveDropdown(null);
      }
    };
    if (isOpen || activeDropdown) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, activeDropdown]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveDropdown(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback(
    (expertId: string | null) => {
      onSelectExpert(expertId);
      setIsOpen(false);
    },
    [onSelectExpert],
  );

  return (
    <div className="flex items-center gap-1 border-t border-[var(--color-border)] px-3 py-1.5">
      {/* Expert Trigger */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setActiveDropdown(null);
          }}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1 text-[11px] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
          aria-label="Select expert"
          aria-expanded={isOpen}
        >
          {currentExpert ? (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-[10px]">
                {currentExpert.avatar}
              </span>
              <span className="max-w-[80px] truncate text-[var(--color-text-primary)]">{currentExpert.name}</span>
            </>
          ) : (
            <>
              <Users size={12} className="text-[var(--color-text-tertiary)]" />
              <span className="text-[var(--color-text-tertiary)]">专家</span>
            </>
          )}
          <ChevronDown
            size={10}
            className={`text-[var(--color-text-quaternary)] transition-transform duration-[var(--duration-fast)] ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown Panel */}
        {isOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-56 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-lg)]">
            {/* Recent Experts Header */}
            {recentExperts.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-[var(--color-text-quaternary)]">
                  <Clock size={10} />
                  最近召唤专家
                </div>
                {recentExperts.map(expert => (
                  <button
                    key={expert.id}
                    onClick={() => handleSelect(expert.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-xs">
                      {expert.avatar}
                    </span>
                    <span className="flex-1 truncate text-xs text-[var(--color-text-primary)]">{expert.name}</span>
                    {currentExpertId === expert.id && (
                      <Check size={12} className="flex-shrink-0 text-[var(--color-accent-green)]" />
                    )}
                  </button>
                ))}
                <div className="mx-3 my-1 border-t border-[var(--color-border)]" />
              </>
            )}

            {/* No Expert Option */}
            <button
              onClick={() => handleSelect(null)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-xs">
                🤖
              </span>
              <span className="flex-1 text-xs text-[var(--color-text-primary)]">通用助手</span>
              {!currentExpertId && <Check size={12} className="flex-shrink-0 text-[var(--color-accent-green)]" />}
            </button>

            <div className="mx-3 my-1 border-t border-[var(--color-border)]" />

            {/* More + Summon Other */}
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenExpertList();
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              <span className="text-xs text-[var(--color-text-secondary)]">更多专家</span>
              <ChevronRight size={12} className="text-[var(--color-text-quaternary)]" />
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenExpertList();
              }}
              className="flex w-full items-center px-3 py-1.5 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              <span className="text-xs text-[var(--color-accent-blue)]">召唤其它专家</span>
            </button>
          </div>
        )}
      </div>

      {/* Toolbar Separator */}
      <div className="mx-0.5 h-3 w-px bg-[var(--color-border)]" />

      {/* Model Mode */}
      <div className="relative">
        <button
          onClick={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')}
          className="flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <Zap size={10} />
          {toolbarConfig.modelMode}
          <ChevronDown size={8} />
        </button>
      </div>

      <div className="mx-0.5 h-3 w-px bg-[var(--color-border)]" />

      {/* Skill Mode */}
      <div className="relative">
        <button
          onClick={() => setActiveDropdown(activeDropdown === 'skill' ? null : 'skill')}
          className="flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <Settings size={10} />
          {skillLabels[toolbarConfig.skillMode]}
          <ChevronDown size={8} />
        </button>

        {activeDropdown === 'skill' && (
          <div className="absolute bottom-full left-0 mb-1 w-32 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-md)]">
            {(Object.keys(skillLabels) as SkillMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => {
                  onToolbarChange({ skillMode: mode });
                  setActiveDropdown(null);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
              >
                <span className="text-[var(--color-text-primary)]">{skillLabels[mode]}</span>
                {toolbarConfig.skillMode === mode && <Check size={10} className="text-[var(--color-accent-green)]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mx-0.5 h-3 w-px bg-[var(--color-border)]" />

      {/* Permission Level */}
      <div className="relative">
        <button
          onClick={() => setActiveDropdown(activeDropdown === 'permission' ? null : 'permission')}
          className="flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <Shield size={10} />
          {permissionLabels[toolbarConfig.permission]}
          <ChevronDown size={8} />
        </button>

        {activeDropdown === 'permission' && (
          <div className="absolute bottom-full left-0 mb-1 w-32 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-md)]">
            {(Object.keys(permissionLabels) as PermissionLevel[]).map(level => (
              <button
                key={level}
                onClick={() => {
                  onToolbarChange({ permission: level });
                  setActiveDropdown(null);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
              >
                <span className="text-[var(--color-text-primary)]">{permissionLabels[level]}</span>
                {toolbarConfig.permission === level && <Check size={10} className="text-[var(--color-accent-green)]" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
