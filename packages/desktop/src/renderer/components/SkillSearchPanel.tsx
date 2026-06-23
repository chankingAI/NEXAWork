/**
 * NexaWork SkillSearchPanel — Skill search & browse (N15, WorkBuddy 截图4)
 * Features: instant search, grouped sections (内置/已安装/可用), skill detail, import
 */
import { useState, useCallback, useMemo } from 'react';
import {
  Search,
  Download,
  Shield,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  Sparkles,
  Wrench,
  Globe,
  FileText,
  Terminal,
  Bot,
  Database,
  Plug,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type SkillSource = 'bundled' | 'installed' | 'available';

export interface SkillPermission {
  type: 'file' | 'network' | 'command' | 'env';
  description: string;
}

export interface SkillConfigParam {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue?: string;
  required?: boolean;
}

export interface MarketSkill {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  color: string; // hex background for icon
  source: SkillSource;
  enabled: boolean;
  version: string;
  permissions: SkillPermission[];
  config?: SkillConfigParam[];
  fromRecorder?: boolean;
}

export interface SkillSearchPanelProps {
  skills?: MarketSkill[];
  onToggleSkill: (skillId: string, enabled: boolean) => void;
  onImportSkill: () => void;
  onConfigureSkill?: (skillId: string, config: Record<string, string>) => void;
}

// ─── Section Metadata ─────────────────────────────────────────
export const skillSections: { id: SkillSource; label: string; icon: React.ReactNode }[] = [
  { id: 'bundled', label: '内置技能', icon: <Sparkles size={12} /> },
  { id: 'installed', label: '已安装技能', icon: <Wrench size={12} /> },
  { id: 'available', label: '可用技能', icon: <Plug size={12} /> },
];

// ─── Default Skills ───────────────────────────────────────────
export const defaultSkills: MarketSkill[] = [
  {
    id: 'skill-creator',
    name: '技能创建指南',
    description: '引导式向导，帮助你从零创建自定义技能',
    icon: '🛠️',
    color: '#6366F1',
    source: 'bundled',
    enabled: true,
    version: '1.0.0',
    permissions: [{ type: 'file', description: '读写 .claude/skills/ 目录' }],
  },
  {
    id: 'self-improving-agent',
    name: 'self-improving-agent',
    description: '让 Agent 从历史操作中学习并自我优化',
    icon: '🧠',
    color: '#8B5CF6',
    source: 'bundled',
    enabled: true,
    version: '1.2.0',
    permissions: [{ type: 'file', description: '读取操作记忆' }],
  },
  {
    id: 'brave-search',
    name: 'Brave Search CLI',
    description: '通过 Brave 搜索引擎进行联网搜索',
    icon: '🔍',
    color: '#F97316',
    source: 'bundled',
    enabled: false,
    version: '0.9.1',
    permissions: [{ type: 'network', description: '访问 search.brave.com' }],
    config: [{ key: 'apiKey', label: 'API Key', type: 'string', required: true }],
  },
  {
    id: 'web-scraper',
    name: 'Web Scraper',
    description: '抓取网页内容并转换为结构化数据',
    icon: '🌐',
    color: '#0EA5E9',
    source: 'installed',
    enabled: true,
    version: '2.1.0',
    permissions: [
      { type: 'network', description: '访问任意 URL' },
      { type: 'file', description: '写入抓取结果' },
    ],
  },
  {
    id: 'pdf-tools',
    name: 'PDF 工具集',
    description: '合并、拆分、提取 PDF 文本与表格',
    icon: '📄',
    color: '#EF4444',
    source: 'installed',
    enabled: true,
    version: '1.4.2',
    permissions: [{ type: 'file', description: '读写 PDF 文件' }],
  },
  {
    id: 'sql-runner',
    name: 'SQL 查询执行器',
    description: '连接数据库并执行 SQL 查询',
    icon: '🗄️',
    color: '#10B981',
    source: 'available',
    enabled: false,
    version: '3.0.0',
    permissions: [
      { type: 'network', description: '连接数据库主机' },
      { type: 'env', description: '读取数据库凭据' },
    ],
    config: [
      { key: 'host', label: '主机', type: 'string', required: true },
      { key: 'port', label: '端口', type: 'number', defaultValue: '5432' },
    ],
  },
  {
    id: 'shell-runner',
    name: 'Shell 命令执行器',
    description: '在沙箱中执行 Shell 命令',
    icon: '⌨️',
    color: '#64748B',
    source: 'available',
    enabled: false,
    version: '1.0.0',
    permissions: [{ type: 'command', description: '执行任意 Shell 命令' }],
  },
];

// ─── Permission Icon Map ──────────────────────────────────────
export function permissionIcon(type: SkillPermission['type']): React.ReactNode {
  switch (type) {
    case 'file':
      return <FileText size={12} />;
    case 'network':
      return <Globe size={12} />;
    case 'command':
      return <Terminal size={12} />;
    case 'env':
      return <Database size={12} />;
  }
}

// ─── Pure Helpers (testable) ──────────────────────────────────
/**
 * Filter skills by free-text query against name + description.
 */
export function filterSkills(skills: MarketSkill[], query: string): MarketSkill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
}

/**
 * Group skills into the three display sections.
 */
export function groupSkills(skills: MarketSkill[]): Record<SkillSource, MarketSkill[]> {
  return {
    bundled: skills.filter(s => s.source === 'bundled'),
    installed: skills.filter(s => s.source === 'installed'),
    available: skills.filter(s => s.source === 'available'),
  };
}

/**
 * Count enabled skills across a list.
 */
export function countEnabled(skills: MarketSkill[]): number {
  return skills.filter(s => s.enabled).length;
}

// ─── SkillItem Component ──────────────────────────────────────
function SkillItem({ skill, onClick, onToggle }: { skill: MarketSkill; onClick: () => void; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] px-2.5 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]">
      <button onClick={onClick} className="flex flex-1 items-center gap-3 overflow-hidden text-left">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-base"
          style={{ backgroundColor: `${skill.color}1a`, color: skill.color }}
        >
          {skill.icon}
        </span>
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{skill.name}</span>
          <span className="truncate text-xs text-[var(--color-text-tertiary)]">{skill.description}</span>
        </div>
      </button>
      <button
        onClick={onToggle}
        aria-label={skill.enabled ? 'Disable skill' : 'Enable skill'}
        aria-pressed={skill.enabled}
        className="flex-shrink-0 text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text-primary)]"
      >
        {skill.enabled ? (
          <ToggleRight size={26} className="text-[var(--color-accent-green)]" />
        ) : (
          <ToggleLeft size={26} />
        )}
      </button>
    </div>
  );
}

// ─── SkillDetail Component ────────────────────────────────────
function SkillDetail({ skill, onBack, onToggle }: { skill: MarketSkill; onBack: () => void; onToggle: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
          aria-label="Back"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">技能详情</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-2xl"
            style={{ backgroundColor: `${skill.color}1a`, color: skill.color }}
          >
            {skill.icon}
          </span>
          <div className="flex flex-1 flex-col">
            <span className="text-base font-semibold text-[var(--color-text-primary)]">{skill.name}</span>
            <span className="text-xs text-[var(--color-text-tertiary)]">v{skill.version}</span>
          </div>
          <button
            onClick={onToggle}
            aria-label={skill.enabled ? 'Disable skill' : 'Enable skill'}
            aria-pressed={skill.enabled}
            className="text-[var(--color-text-tertiary)]"
          >
            {skill.enabled ? (
              <ToggleRight size={30} className="text-[var(--color-accent-green)]" />
            ) : (
              <ToggleLeft size={30} />
            )}
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">{skill.description}</p>

        {/* Permissions */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
            <Shield size={12} />
            权限需求
          </div>
          <div className="flex flex-col gap-1.5">
            {skill.permissions.map((p, i) => (
              <div
                key={`${p.type}-${i}`}
                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]"
              >
                <span className="text-[var(--color-text-tertiary)]">{permissionIcon(p.type)}</span>
                {p.description}
              </div>
            ))}
          </div>
        </div>

        {/* Config params */}
        {skill.config && skill.config.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium text-[var(--color-text-primary)]">配置参数</div>
            <div className="flex flex-col gap-2">
              {skill.config.map(param => (
                <div key={param.key} className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--color-text-secondary)]">
                    {param.label}
                    {param.required && <span className="ml-0.5 text-[var(--color-accent-red)]">*</span>}
                  </label>
                  <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    defaultValue={param.defaultValue}
                    className="h-8 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SkillSearchPanel Component ───────────────────────────────
export function SkillSearchPanel({
  skills = defaultSkills,
  onToggleSkill,
  onImportSkill,
  onConfigureSkill,
}: SkillSearchPanelProps) {
  void onConfigureSkill;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => filterSkills(skills, query), [skills, query]);
  const grouped = useMemo(() => groupSkills(filtered), [filtered]);

  const selectedSkill = useMemo(
    () => (selectedId ? (skills.find(s => s.id === selectedId) ?? null) : null),
    [selectedId, skills],
  );

  const handleToggle = useCallback(
    (skill: MarketSkill) => {
      onToggleSkill(skill.id, !skill.enabled);
    },
    [onToggleSkill],
  );

  if (selectedSkill) {
    return (
      <SkillDetail
        skill={selectedSkill}
        onBack={() => setSelectedId(null)}
        onToggle={() => handleToggle(selectedSkill)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search */}
      <div className="border-b border-[var(--color-border)] px-4 py-2.5">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-quaternary)]"
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索技能..."
            aria-label="Search skills"
            className="h-8 w-full rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] pl-8 pr-3 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-quaternary)] outline-none transition-colors duration-[var(--duration-fast)] focus:bg-[var(--color-bg-primary)] focus:ring-1 focus:ring-[var(--color-border-focus)]"
          />
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {skillSections.map(section => {
          const items = grouped[section.id];
          if (items.length === 0) return null;
          return (
            <div key={section.id} className="mb-3">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)]">
                {section.icon}
                {section.label}
                <span className="text-[var(--color-text-quaternary)]">({items.length})</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map(skill => (
                  <SkillItem
                    key={skill.id}
                    skill={skill}
                    onClick={() => setSelectedId(skill.id)}
                    onToggle={() => handleToggle(skill)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Bot size={24} className="text-[var(--color-text-quaternary)]" />
            <span className="text-sm text-[var(--color-text-tertiary)]">没有匹配的技能</span>
          </div>
        )}
      </div>

      {/* Import button */}
      <div className="border-t border-[var(--color-border)] p-3">
        <button
          onClick={onImportSkill}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <Download size={15} />
          导入技能
        </button>
      </div>
    </div>
  );
}
