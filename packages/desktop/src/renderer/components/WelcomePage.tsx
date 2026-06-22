/**
 * NexaWork WelcomePage — Brand showcase + scene selection + onboarding
 * Displays when no active session exists
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Code2,
  FileText,
  Palette,
  Video,
  Zap,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Layers,
  Bot,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type WelcomeScene = 'office' | 'coding' | 'design' | 'record';

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon: React.ReactNode;
}

export interface WelcomePageProps {
  activeScene: WelcomeScene;
  onSceneChange: (scene: WelcomeScene) => void;
  onQuickAction: (prompt: string) => void;
  onStartChat: (prompt: string) => void;
  isFirstTime?: boolean;
  onOnboardingComplete?: () => void;
}

// ─── Scene Quick Actions ──────────────────────────────────────
export const sceneQuickActions: Record<WelcomeScene, QuickAction[]> = {
  office: [
    { id: 'o1', label: '日常开发', prompt: '帮我规划今天的开发任务', icon: <Zap size={12} /> },
    { id: 'o2', label: '网站开发', prompt: '创建一个响应式网站', icon: <Layers size={12} /> },
    { id: 'o3', label: 'Agent 应用', prompt: '构建一个 AI Agent 应用', icon: <Bot size={12} /> },
    { id: 'o4', label: '文档写作', prompt: '帮我撰写技术文档', icon: <FileText size={12} /> },
  ],
  coding: [
    { id: 'c1', label: '前端', prompt: '创建一个 React 组件', icon: <Code2 size={12} /> },
    { id: 'c2', label: '后端', prompt: '设计 RESTful API 接口', icon: <Layers size={12} /> },
    { id: 'c3', label: '数据库', prompt: '设计数据库 schema', icon: <FileText size={12} /> },
    { id: 'c4', label: 'DevOps', prompt: '配置 CI/CD 流水线', icon: <Zap size={12} /> },
  ],
  design: [
    { id: 'd1', label: '图片生成', prompt: '生成一张产品概念图', icon: <Palette size={12} /> },
    { id: 'd2', label: 'UI 设计', prompt: '设计一个移动端界面', icon: <Layers size={12} /> },
    { id: 'd3', label: '原型', prompt: '创建交互原型', icon: <Sparkles size={12} /> },
    { id: 'd4', label: '素材', prompt: '生成品牌视觉素材', icon: <FileText size={12} /> },
  ],
  record: [
    { id: 'r1', label: '浏览器录制', prompt: '录制浏览器操作流程', icon: <Video size={12} /> },
    { id: 'r2', label: '桌面录制', prompt: '录制桌面操作步骤', icon: <Layers size={12} /> },
    { id: 'r3', label: '技能回放', prompt: '回放已保存的技能', icon: <Zap size={12} /> },
    { id: 'r4', label: '自动化', prompt: '创建自动化工作流', icon: <Bot size={12} /> },
  ],
};

// ─── Scene Tabs (inline, lightweight version for welcome) ─────
const sceneTabs: { id: WelcomeScene; label: string; icon: React.ReactNode }[] = [
  { id: 'office', label: '日常办公', icon: <FileText size={14} /> },
  { id: 'coding', label: '代码开发', icon: <Code2 size={14} /> },
  { id: 'design', label: '设计创意', icon: <Palette size={14} /> },
  { id: 'record', label: 'Record/Replay', icon: <Video size={14} /> },
];

// ─── Onboarding Steps ─────────────────────────────────────────
export interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

export const onboardingSteps: OnboardingStep[] = [
  {
    title: '选择场景',
    description: '根据当前工作选择日常办公、代码开发或设计创意场景',
    icon: <Layers size={20} />,
  },
  {
    title: '对话创作',
    description: '用自然语言描述你的需求，AI 会理解并帮你完成任务',
    icon: <MessageSquare size={20} />,
  },
  {
    title: '持续协作',
    description: '所有对话自动保存，随时继续未完成的工作',
    icon: <CheckCircle2 size={20} />,
  },
];

// ─── Onboarding Component ─────────────────────────────────────
function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const handleNext = useCallback(() => {
    if (step < onboardingSteps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  }, [step, onComplete]);

  const current = onboardingSteps[step];

  return (
    <div className="flex flex-col items-center gap-6 px-8 py-12">
      {/* Progress dots */}
      <div className="flex items-center gap-2">
        {onboardingSteps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-[var(--duration-normal)] ${
              i === step
                ? 'w-6 bg-[var(--color-text-primary)]'
                : i < step
                  ? 'w-1.5 bg-[var(--color-text-tertiary)]'
                  : 'w-1.5 bg-[var(--color-border)]'
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]">
          {current.icon}
        </span>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{current.title}</h3>
        <p className="max-w-xs text-sm text-[var(--color-text-secondary)]">{current.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="rounded-[var(--radius-md)] px-4 py-2 text-xs text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text-primary)]"
          >
            上一步
          </button>
        )}
        <button
          onClick={handleNext}
          className="flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-text-primary)] px-5 py-2 text-xs font-medium text-white transition-transform duration-[var(--duration-fast)] active:scale-95"
        >
          {step < onboardingSteps.length - 1 ? '下一步' : '开始使用'}
          <ArrowRight size={12} />
        </button>
      </div>

      {/* Skip */}
      <button
        onClick={onComplete}
        className="text-[10px] text-[var(--color-text-quaternary)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text-tertiary)]"
      >
        跳过引导
      </button>
    </div>
  );
}

// ─── WelcomePage Component ────────────────────────────────────
export function WelcomePage({
  activeScene,
  onSceneChange,
  onQuickAction,
  onStartChat,
  isFirstTime = false,
  onOnboardingComplete,
}: WelcomePageProps) {
  const [showOnboarding, setShowOnboarding] = useState(isFirstTime);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    onOnboardingComplete?.();
  }, [onOnboardingComplete]);

  if (showOnboarding) {
    return (
      <div className="flex h-full items-center justify-center">
        <Onboarding onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  const quickActions = sceneQuickActions[activeScene];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
      {/* Brand */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={28} className="text-[var(--color-text-primary)]" />
          <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-text-primary)]">NexaWork</h1>
        </div>
        <p className="text-base text-[var(--color-text-secondary)]">AI 全能办公助手</p>
      </div>

      {/* Scene Tabs */}
      <div className="flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--color-bg-secondary)] p-1">
        {sceneTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onSceneChange(tab.id)}
            className={`flex items-center gap-1.5 rounded-[var(--radius-full)] px-4 py-2 text-xs font-medium transition-all duration-[var(--duration-fast)] ${
              activeScene === tab.id
                ? 'bg-[var(--color-text-primary)] text-white shadow-sm'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {quickActions.map(action => (
          <button
            key={action.id}
            onClick={() => onQuickAction(action.prompt)}
            className="flex items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-all duration-[var(--duration-fast)] hover:border-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:shadow-sm active:scale-95"
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Hint */}
      <p className="text-[11px] text-[var(--color-text-quaternary)]">选择场景并输入你的需求，或点击快捷标签开始</p>
    </div>
  );
}

// ─── First-time detection hook ────────────────────────────────
const ONBOARDING_KEY = 'nexawork-onboarding-complete';

export function useOnboarding(): { isFirstTime: boolean; markComplete: () => void } {
  const [isFirstTime, setIsFirstTime] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(ONBOARDING_KEY) !== 'true';
  });

  const markComplete = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    }
    setIsFirstTime(false);
  }, []);

  return { isFirstTime, markComplete };
}
