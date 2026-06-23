import { FolderOpen, Zap, BookOpen, Lightbulb, Settings, Construction } from 'lucide-react';
import type { NavigationId } from './Sidebar';

interface ComingSoonViewProps {
  nav: NavigationId;
}

const navMeta: Partial<Record<NavigationId, { title: string; description: string; icon: React.ReactNode }>> = {
  projects: {
    title: '项目',
    description: '项目工作区与多文件协作即将上线',
    icon: <FolderOpen size={28} />,
  },
  automation: {
    title: '自动化',
    description: '定时任务与工作流编排即将上线',
    icon: <Zap size={28} />,
  },
  library: {
    title: '资料库',
    description: '知识库与素材管理即将上线',
    icon: <BookOpen size={28} />,
  },
  inspiration: {
    title: '灵感',
    description: '灵感收藏与创意板即将上线',
    icon: <Lightbulb size={28} />,
  },
  settings: {
    title: '设置',
    description: '偏好设置与账户管理即将上线',
    icon: <Settings size={28} />,
  },
};

/**
 * ComingSoonView — placeholder for navigation targets whose feature modules
 * (N18+) are not yet implemented. Keeps navigation coherent instead of
 * silently falling back to the welcome screen.
 */
export function ComingSoonView({ nav }: ComingSoonViewProps) {
  const meta = navMeta[nav] ?? {
    title: '即将上线',
    description: '该功能正在开发中',
    icon: <Construction size={28} />,
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]">
        {meta.icon}
      </div>
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">{meta.title}</h2>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">{meta.description}</p>
      <span className="rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] px-3 py-1 text-xs text-[var(--color-text-tertiary)]">
        即将上线
      </span>
    </div>
  );
}
