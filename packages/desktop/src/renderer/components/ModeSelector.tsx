/**
 * NexaWork ModeSelector — Craft/Ask/Plan mode dropdown
 * Controls AI behavior: full tools (Craft), text only (Ask), plan mode (Plan)
 * Includes "Summon Expert" sub-menu entry
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { PenLine, HelpCircle, FileText, Users, ChevronDown, ChevronRight, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type ChatMode = 'craft' | 'ask' | 'plan';

export interface ModeConfig {
  id: ChatMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  toolsEnabled: boolean;
  planMode: boolean;
}

export interface ExpertItem {
  id: string;
  name: string;
  specialty: string;
}

export interface ModeSelectorProps {
  activeMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onSummonExpert?: (expertId: string) => void;
  experts?: ExpertItem[];
}

// ─── Mode Configurations ──────────────────────────────────────
export const modeConfigs: ModeConfig[] = [
  {
    id: 'craft',
    label: 'Craft',
    description: '深度创作与开发',
    icon: <PenLine size={16} />,
    toolsEnabled: true,
    planMode: false,
  },
  {
    id: 'ask',
    label: 'Ask',
    description: '快速问答',
    icon: <HelpCircle size={16} />,
    toolsEnabled: false,
    planMode: false,
  },
  {
    id: 'plan',
    label: 'Plan',
    description: '任务规划',
    icon: <FileText size={16} />,
    toolsEnabled: true,
    planMode: true,
  },
];

// ─── Default Experts ──────────────────────────────────────────
const defaultExperts: ExpertItem[] = [
  { id: 'frontend', name: '前端专家', specialty: 'React/Vue/CSS' },
  { id: 'backend', name: '后端专家', specialty: 'Node/Python/Go' },
  { id: 'data', name: '数据专家', specialty: 'SQL/ML/Analytics' },
  { id: 'design', name: '设计专家', specialty: 'UI/UX/Figma' },
  { id: 'devops', name: 'DevOps专家', specialty: 'CI/CD/K8s' },
];

// ─── Persistence ──────────────────────────────────────────────
function loadPersistedMode(): ChatMode {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('nexawork-chat-mode');
    if (stored === 'craft' || stored === 'ask' || stored === 'plan') {
      return stored;
    }
  }
  return 'craft';
}

function persistMode(mode: ChatMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('nexawork-chat-mode', mode);
  }
}

// ─── ModeSelector Component ──────────────────────────────────
export function ModeSelector({
  activeMode,
  onModeChange,
  onSummonExpert,
  experts = defaultExperts,
}: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showExperts, setShowExperts] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowExperts(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowExperts(false);
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const handleModeSelect = useCallback(
    (mode: ChatMode) => {
      onModeChange(mode);
      persistMode(mode);
      setIsOpen(false);
      setShowExperts(false);
    },
    [onModeChange],
  );

  const handleExpertSelect = useCallback(
    (expertId: string) => {
      onSummonExpert?.(expertId);
      setIsOpen(false);
      setShowExperts(false);
    },
    [onSummonExpert],
  );

  const currentMode = modeConfigs.find(m => m.id === activeMode) ?? modeConfigs[0];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-1">
          {currentMode.icon}
          <span>{currentMode.label}</span>
        </span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-[var(--duration-fast)] ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute bottom-full left-0 z-[var(--z-dropdown)] mb-1 w-56 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-dropdown)]"
          role="listbox"
          aria-activedescendant={`mode-${activeMode}`}
        >
          {/* Mode Options */}
          <div className="p-1">
            {modeConfigs.map(mode => (
              <button
                key={mode.id}
                id={`mode-${mode.id}`}
                role="option"
                aria-selected={activeMode === mode.id}
                onClick={() => handleModeSelect(mode.id)}
                className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)] ${
                  activeMode === mode.id ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                  {mode.icon}
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">{mode.label}</span>
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">{mode.description}</span>
                </div>
                {activeMode === mode.id && (
                  <Check size={14} className="flex-shrink-0 text-[var(--color-text-primary)]" />
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-2 border-t border-[var(--color-border)]" />

          {/* Summon Expert */}
          <div className="p-1">
            <button
              onClick={() => setShowExperts(!showExperts)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                <Users size={16} />
              </span>
              <div className="flex flex-1 flex-col">
                <span className="text-xs font-medium text-[var(--color-text-primary)]">召唤专家</span>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">选择领域专家协助</span>
              </div>
              <ChevronRight
                size={14}
                className={`flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-[var(--duration-fast)] ${
                  showExperts ? 'rotate-90' : ''
                }`}
              />
            </button>

            {/* Expert Sub-menu */}
            {showExperts && (
              <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-2">
                {experts.map(expert => (
                  <button
                    key={expert.id}
                    onClick={() => handleExpertSelect(expert.id)}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-[9px] font-medium text-[var(--color-text-secondary)]">
                      {expert.name.charAt(0)}
                    </span>
                    <div className="flex flex-1 flex-col">
                      <span className="text-[11px] font-medium text-[var(--color-text-primary)]">{expert.name}</span>
                      <span className="text-[9px] text-[var(--color-text-quaternary)]">{expert.specialty}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hook for mode state management ──────────────────────────
export interface ModeState {
  mode: ChatMode;
  config: ModeConfig;
  setMode: (mode: ChatMode) => void;
  isToolsEnabled: () => boolean;
  isPlanMode: () => boolean;
}

export function useMode(initialMode?: ChatMode): ModeState {
  const [mode, setModeState] = useState<ChatMode>(initialMode ?? loadPersistedMode());

  const config = modeConfigs.find(m => m.id === mode) ?? modeConfigs[0];

  const setMode = useCallback((newMode: ChatMode) => {
    setModeState(newMode);
    persistMode(newMode);
  }, []);

  const isToolsEnabled = useCallback(() => config.toolsEnabled, [config]);
  const isPlanMode = useCallback(() => config.planMode, [config]);

  return { mode, config, setMode, isToolsEnabled, isPlanMode };
}
