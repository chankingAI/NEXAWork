/**
 * NexaWork ExpertListPage — AI Expert marketplace
 * Features: tabs, search, featured scenarios, category filters, expert grid
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  User,
  Users,
  Star,
  ChevronRight,
  Sparkles,
  Code2,
  BarChart3,
  Scale,
  Building2,
  Palette,
  Shield,
  Briefcase,
  GraduationCap,
  Megaphone,
  Flame,
  Clock,
  Grid3X3,
  Zap,
  Plug,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type ExpertCategory =
  | 'all'
  | 'hot'
  | 'new'
  | 'product'
  | 'engineering'
  | 'finance'
  | 'design'
  | 'legal'
  | 'marketing'
  | 'education';

export type MarketplaceTab = 'experts' | 'skills' | 'connectors';

export interface Expert {
  id: string;
  name: string;
  role: string;
  avatar: string; // emoji or initial
  description: string;
  tags: string[];
  category: ExpertCategory;
  usageCount: number;
  isCustom?: boolean;
  systemPrompt?: string;
}

export interface FeaturedScenario {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  expertNames: string[];
}

export interface ExpertListPageProps {
  activeTab: MarketplaceTab;
  onTabChange: (tab: MarketplaceTab) => void;
  onSelectExpert: (expertId: string) => void;
  onMyExperts: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

// ─── Featured Scenarios ───────────────────────────────────────
export const featuredScenarios: FeaturedScenario[] = [
  {
    id: 'content',
    title: '内容创作',
    description: '文案、博客、社媒内容一站式创作',
    color: '#F59E0B',
    icon: <Sparkles size={20} />,
    expertNames: ['创意总监', '文案专家', 'SEO 顾问'],
  },
  {
    id: 'investment',
    title: '投资分析',
    description: '市场研究、数据分析、投资策略',
    color: '#10B981',
    icon: <BarChart3 size={20} />,
    expertNames: ['量化分析师', '行业研究员', '风控专家'],
  },
  {
    id: 'legal',
    title: '法律咨询',
    description: '合同审核、法规解读、合规检查',
    color: '#6366F1',
    icon: <Scale size={20} />,
    expertNames: ['合同律师', '知识产权顾问', '合规专家'],
  },
  {
    id: 'startup',
    title: '小微企业',
    description: '运营管理、财务规划、市场拓展',
    color: '#EC4899',
    icon: <Building2 size={20} />,
    expertNames: ['运营顾问', '财务规划师', '增长黑客'],
  },
];

// ─── Category Tags ────────────────────────────────────────────
export const categoryTags: { id: ExpertCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: '全部', icon: <Grid3X3 size={12} /> },
  { id: 'hot', label: '最热', icon: <Flame size={12} /> },
  { id: 'new', label: '最新', icon: <Clock size={12} /> },
  { id: 'product', label: '产品设计', icon: <Palette size={12} /> },
  { id: 'engineering', label: '技术工程', icon: <Code2 size={12} /> },
  { id: 'finance', label: '金融投资', icon: <BarChart3 size={12} /> },
  { id: 'design', label: '设计创意', icon: <Sparkles size={12} /> },
  { id: 'legal', label: '法律合规', icon: <Scale size={12} /> },
  { id: 'marketing', label: '市场营销', icon: <Megaphone size={12} /> },
  { id: 'education', label: '教育培训', icon: <GraduationCap size={12} /> },
];

// ─── Default Experts ──────────────────────────────────────────
export const defaultExperts: Expert[] = [
  {
    id: 'frontend-expert',
    name: '前端架构师',
    role: '资深前端工程师',
    avatar: '🎨',
    description: '精通 React/Vue/Angular，擅长性能优化和组件设计',
    tags: ['React', 'TypeScript', 'CSS'],
    category: 'engineering',
    usageCount: 12580,
  },
  {
    id: 'backend-expert',
    name: '后端架构师',
    role: '全栈后端专家',
    avatar: '⚙️',
    description: '精通分布式系统、微服务架构和数据库设计',
    tags: ['Node.js', 'Python', 'Go'],
    category: 'engineering',
    usageCount: 10240,
  },
  {
    id: 'data-scientist',
    name: '数据科学家',
    role: '数据分析与 AI 专家',
    avatar: '📊',
    description: '精通数据分析、机器学习和深度学习模型',
    tags: ['Python', 'ML', '数据分析'],
    category: 'engineering',
    usageCount: 8960,
  },
  {
    id: 'ui-designer',
    name: 'UI 设计师',
    role: '视觉与交互设计专家',
    avatar: '🎯',
    description: '精通 Figma、设计系统和用户体验优化',
    tags: ['Figma', 'UI/UX', '设计系统'],
    category: 'design',
    usageCount: 7800,
  },
  {
    id: 'devops-expert',
    name: 'DevOps 工程师',
    role: '云架构与运维专家',
    avatar: '🚀',
    description: '精通 K8s、Docker、CI/CD 和云原生架构',
    tags: ['K8s', 'Docker', 'AWS'],
    category: 'engineering',
    usageCount: 6340,
  },
  {
    id: 'product-manager',
    name: '产品经理',
    role: '产品策略与用户体验',
    avatar: '💡',
    description: '擅长需求分析、产品规划和 PRD 撰写',
    tags: ['PRD', '用户研究', '产品策略'],
    category: 'product',
    usageCount: 9120,
  },
  {
    id: 'copywriter',
    name: '文案专家',
    role: '内容创作与品牌传播',
    avatar: '✍️',
    description: '精通品牌文案、社媒内容和 SEO 写作',
    tags: ['文案', 'SEO', '品牌'],
    category: 'marketing',
    usageCount: 11200,
  },
  {
    id: 'financial-analyst',
    name: '财务分析师',
    role: '财务规划与投资分析',
    avatar: '💰',
    description: '精通财务建模、估值分析和投资策略',
    tags: ['财务模型', '估值', '投资'],
    category: 'finance',
    usageCount: 5680,
  },
  {
    id: 'security-expert',
    name: '安全专家',
    role: '网络安全与合规',
    avatar: '🛡️',
    description: '精通渗透测试、安全审计和合规检查',
    tags: ['安全审计', '合规', '渗透测试'],
    category: 'engineering',
    usageCount: 4200,
  },
  {
    id: 'legal-advisor',
    name: '法律顾问',
    role: '合同审核与法规解读',
    avatar: '⚖️',
    description: '精通合同法、知识产权和企业合规',
    tags: ['合同', '知识产权', '合规'],
    category: 'legal',
    usageCount: 3800,
  },
  {
    id: 'growth-hacker',
    name: '增长专家',
    role: '用户增长与数据驱动',
    avatar: '📈',
    description: '精通增长策略、A/B 测试和转化优化',
    tags: ['增长', 'A/B测试', '转化'],
    category: 'marketing',
    usageCount: 7200,
  },
  {
    id: 'educator',
    name: '教育导师',
    role: '教学设计与课程开发',
    avatar: '🎓',
    description: '精通课程设计、教学方法和知识传递',
    tags: ['教学', '课程', '培训'],
    category: 'education',
    usageCount: 3100,
  },
];

// ─── ExpertCard Component ─────────────────────────────────────
function ExpertCard({ expert, onSelect }: { expert: Expert; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3.5 text-left transition-all duration-[var(--duration-fast)] hover:border-[var(--color-text-tertiary)] hover:shadow-[var(--shadow-sm)] active:scale-[0.98]"
    >
      {/* Header: avatar + name + role */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-lg">
          {expert.avatar}
        </span>
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{expert.name}</span>
          <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">{expert.role}</span>
        </div>
        {expert.isCustom && (
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-accent-purple)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-accent-purple)]">
            自建
          </span>
        )}
      </div>

      {/* Description */}
      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">{expert.description}</p>

      {/* Tags + Usage */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {expert.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-tertiary)]"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-text-quaternary)]">
          <Zap size={8} />
          {expert.usageCount >= 10000
            ? `${(expert.usageCount / 1000).toFixed(1)}k`
            : expert.usageCount.toLocaleString()}
        </span>
      </div>
    </button>
  );
}

// ─── FeaturedCard Component ───────────────────────────────────
function FeaturedCard({ scenario }: { scenario: FeaturedScenario }) {
  return (
    <div
      className="flex h-40 w-[250px] flex-shrink-0 flex-col justify-between rounded-[var(--radius-lg)] p-4 text-white"
      style={{ backgroundColor: scenario.color }}
    >
      <div className="flex items-center gap-2">
        {scenario.icon}
        <span className="text-sm font-semibold">{scenario.title}</span>
      </div>
      <p className="text-xs opacity-90">{scenario.description}</p>
      <div className="flex flex-wrap gap-1">
        {scenario.expertNames.map(name => (
          <span key={name} className="rounded-[var(--radius-sm)] bg-white/20 px-1.5 py-0.5 text-[9px]">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Marketplace Tabs ─────────────────────────────────────────
const marketplaceTabs: { id: MarketplaceTab; label: string; icon: React.ReactNode }[] = [
  { id: 'experts', label: '专家', icon: <Users size={14} /> },
  { id: 'skills', label: '技能', icon: <Zap size={14} /> },
  { id: 'connectors', label: '连接器', icon: <Plug size={14} /> },
];

// ─── ExpertListPage Component ─────────────────────────────────
export function ExpertListPage({
  activeTab,
  onTabChange,
  onSelectExpert,
  onMyExperts,
  searchQuery,
  onSearchChange,
}: ExpertListPageProps) {
  const [activeCategory, setActiveCategory] = useState<ExpertCategory>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter experts
  const filteredExperts = useMemo(() => {
    let results = [...defaultExperts];

    // Category filter
    if (activeCategory === 'hot') {
      results.sort((a, b) => b.usageCount - a.usageCount);
    } else if (activeCategory === 'new') {
      results.reverse();
    } else if (activeCategory !== 'all') {
      results = results.filter(e => e.category === activeCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      results = results.filter(
        e =>
          e.name.toLowerCase().includes(lower) ||
          e.role.toLowerCase().includes(lower) ||
          e.description.toLowerCase().includes(lower) ||
          e.tags.some(t => t.toLowerCase().includes(lower)),
      );
    }

    return results;
  }, [activeCategory, searchQuery]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab Bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center gap-0.5">
          {marketplaceTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
                activeTab === tab.id
                  ? 'bg-[var(--color-text-primary)] text-white'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search + My Experts */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-quaternary)]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索专家..."
            className="h-8 w-full rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] pl-8 pr-3 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-quaternary)] outline-none transition-colors duration-[var(--duration-fast)] focus:bg-[var(--color-bg-primary)] focus:ring-1 focus:ring-[var(--color-border-focus)]"
            aria-label="Search experts"
          />
        </div>
        <button
          onClick={onMyExperts}
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <User size={13} />
          我的专家
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Featured Scenarios */}
        {!searchQuery && (
          <div className="px-4 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-primary)]">精选场景</span>
              <button className="flex items-center gap-0.5 text-[10px] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text-primary)]">
                查看全部
                <ChevronRight size={10} />
              </button>
            </div>
            <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {featuredScenarios.map(scenario => (
                <FeaturedCard key={scenario.id} scenario={scenario} />
              ))}
            </div>
          </div>
        )}

        {/* Category Tags */}
        <div
          className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] px-4 pb-2 pt-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {categoryTags.map(tag => (
            <button
              key={tag.id}
              onClick={() => setActiveCategory(tag.id)}
              className={`flex flex-shrink-0 items-center gap-1 rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] transition-colors duration-[var(--duration-fast)] ${
                activeCategory === tag.id
                  ? 'bg-[var(--color-text-primary)] font-medium text-white'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tag.icon}
              {tag.label}
            </button>
          ))}
        </div>

        {/* Expert Grid */}
        <div className="grid grid-cols-3 gap-3 p-4">
          {filteredExperts.map(expert => (
            <ExpertCard key={expert.id} expert={expert} onSelect={() => onSelectExpert(expert.id)} />
          ))}
        </div>

        {/* Empty State */}
        {filteredExperts.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Users size={24} className="text-[var(--color-text-quaternary)]" />
            <span className="text-sm text-[var(--color-text-tertiary)]">
              {searchQuery ? '没有匹配的专家' : '暂无专家'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
