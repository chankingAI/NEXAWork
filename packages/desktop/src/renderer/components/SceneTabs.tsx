/**
 * NexaWork SceneTabs — Scene switching tabs
 * 4 scenes: 日常办公 / 代码开发 / 设计创意 / Record/Replay
 * Selected state: black bg, white text, pill shape (border-radius: 20px)
 * Each scene has sub-tags (quick filters)
 */
import { useState, useCallback } from 'react';
import {
  FileText,
  Code2,
  Palette,
  Circle,
  Globe,
  Terminal,
  GitBranch,
  Image,
  PenTool,
  Monitor,
  Play,
  Sparkles,
  Database,
  Server,
  Container,
  Layout,
  Bot,
  MoreHorizontal,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type SceneId = 'office' | 'coding' | 'design' | 'record';

export interface SubTag {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SceneConfig {
  id: SceneId;
  label: string;
  icon: React.ReactNode;
  description: string;
  subTags: SubTag[];
  tools: string[];
}

export interface SceneTabsProps {
  activeScene: SceneId;
  activeSubTag: string | null;
  onSceneChange: (scene: SceneId) => void;
  onSubTagChange: (tag: string | null) => void;
}

// ─── Scene Configurations ─────────────────────────────────────
export const sceneConfigs: SceneConfig[] = [
  {
    id: 'office',
    label: '日常办公',
    icon: <FileText size={14} />,
    description: '对话 + 文档 + 搜索',
    subTags: [
      { id: 'daily', label: '日常开发' },
      { id: 'website', label: '网站开发' },
      { id: 'agent', label: 'Agent 应用' },
      { id: 'more-office', label: '更多' },
    ],
    tools: ['chat', 'document', 'search', 'translate', 'summarize'],
  },
  {
    id: 'coding',
    label: '代码开发',
    icon: <Code2 size={14} />,
    description: '编辑器 + 终端 + Git',
    subTags: [
      { id: 'frontend', label: '前端' },
      { id: 'backend', label: '后端' },
      { id: 'database', label: '数据库' },
      { id: 'devops', label: 'DevOps' },
    ],
    tools: ['editor', 'terminal', 'git', 'debug', 'test'],
  },
  {
    id: 'design',
    label: '设计创意',
    icon: <Palette size={14} />,
    description: '图片生成 + 设计工具',
    subTags: [
      { id: 'image-gen', label: '图片生成' },
      { id: 'ui-design', label: 'UI设计' },
      { id: 'prototype', label: '原型' },
      { id: 'assets', label: '素材' },
    ],
    tools: ['image-gen', 'design', 'prototype', 'export'],
  },
  {
    id: 'record',
    label: 'Record/Replay',
    icon: <Circle size={8} className="fill-[var(--color-accent-red)] text-[var(--color-accent-red)]" />,
    description: '录制 + 回放 + 技能',
    subTags: [
      { id: 'browser-record', label: '浏览器录制' },
      { id: 'desktop-record', label: '桌面录制' },
      { id: 'skill-replay', label: '技能回放' },
    ],
    tools: ['record', 'replay', 'skill-gen', 'schedule'],
  },
];

// ─── SceneTabs Component ──────────────────────────────────────
export function SceneTabs({ activeScene, activeSubTag, onSceneChange, onSubTagChange }: SceneTabsProps) {
  const currentConfig = sceneConfigs.find(s => s.id === activeScene) ?? sceneConfigs[0];

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 pb-2 pt-3">
      {/* ═══ Main Scene Tabs ═══ */}
      <div className="flex items-center gap-1.5" role="tablist" aria-label="Scene tabs">
        {sceneConfigs.map(scene => (
          <button
            key={scene.id}
            role="tab"
            aria-selected={activeScene === scene.id}
            aria-controls={`scene-panel-${scene.id}`}
            onClick={() => onSceneChange(scene.id)}
            className={`flex items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-xs font-medium transition-all duration-[var(--duration-fast)] ${
              activeScene === scene.id
                ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] shadow-sm'
                : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <span className="flex-shrink-0">{scene.icon}</span>
            <span>{scene.label}</span>
          </button>
        ))}
      </div>

      {/* ═══ Sub Tags (Quick Filters) ═══ */}
      <div className="flex items-center gap-1" role="toolbar" aria-label="Quick filters">
        {currentConfig.subTags.map(tag => (
          <button
            key={tag.id}
            onClick={() => onSubTagChange(activeSubTag === tag.id ? null : tag.id)}
            className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[11px] transition-all duration-[var(--duration-fast)] ${
              activeSubTag === tag.id
                ? 'bg-[var(--color-bg-tertiary)] font-medium text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Hook for scene state management ──────────────────────────
export interface SceneState {
  activeScene: SceneId;
  activeSubTag: string | null;
  currentConfig: SceneConfig;
  setScene: (scene: SceneId) => void;
  setSubTag: (tag: string | null) => void;
  getTools: () => string[];
}

export function useScene(initialScene: SceneId = 'office'): SceneState {
  const [activeScene, setActiveScene] = useState<SceneId>(initialScene);
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);

  const currentConfig = sceneConfigs.find(s => s.id === activeScene) ?? sceneConfigs[0];

  const setScene = useCallback((scene: SceneId) => {
    setActiveScene(scene);
    setActiveSubTag(null); // Reset sub-tag on scene change
  }, []);

  const setSubTag = useCallback((tag: string | null) => {
    setActiveSubTag(tag);
  }, []);

  const getTools = useCallback(() => {
    return currentConfig.tools;
  }, [currentConfig]);

  return {
    activeScene,
    activeSubTag,
    currentConfig,
    setScene,
    setSubTag,
    getTools,
  };
}
