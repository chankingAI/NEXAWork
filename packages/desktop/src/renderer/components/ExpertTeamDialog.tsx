/**
 * NexaWork ExpertTeamDialog — Expert team detail modal
 * Features: team info, member list, skills, summon action
 */
import { useState, useCallback } from 'react';
import { X, Users, User, Crown, Star, Zap, MessageSquare } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export type MemberRole = 'leader' | 'member';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  memberRole: MemberRole;
  specialties: string[];
}

export interface ExpertTeam {
  id: string;
  name: string;
  avatar: string;
  creator: string;
  usageCount: number;
  description: string;
  capabilities: string;
  skills: string[];
  members: TeamMember[];
  scenarios: string[];
}

export interface ExpertTeamDialogProps {
  team: ExpertTeam | null;
  isOpen: boolean;
  onClose: () => void;
  onSummon: (teamId: string) => void;
}

// ─── Default Teams ────────────────────────────────────────────
export const defaultTeams: ExpertTeam[] = [
  {
    id: 'team-fullstack',
    name: '全栈开发团队',
    avatar: '🚀',
    creator: 'NexaWork',
    usageCount: 28400,
    description: '高效全栈开发团队，涵盖前端、后端、运维全链路。',
    capabilities:
      '团队由资深架构师领衔，配合前端、后端和 DevOps 专家，能够完成从需求分析到产品上线的全流程开发工作。擅长微服务架构设计、React/Vue 前端开发、Node.js/Go 后端服务、CI/CD 流水线搭建等。',
    skills: ['React', 'Node.js', 'Go', 'Docker', 'K8s', 'CI/CD', 'TypeScript', '微服务'],
    members: [
      {
        id: 'fs-leader',
        name: '架构师 Alex',
        role: '技术架构师',
        avatar: '🏗️',
        memberRole: 'leader',
        specialties: ['系统设计', '技术选型', '代码审查'],
      },
      {
        id: 'fs-frontend',
        name: '前端 Sarah',
        role: '前端工程师',
        avatar: '🎨',
        memberRole: 'member',
        specialties: ['React', 'TypeScript', 'CSS'],
      },
      {
        id: 'fs-backend',
        name: '后端 Kevin',
        role: '后端工程师',
        avatar: '⚙️',
        memberRole: 'member',
        specialties: ['Node.js', 'Go', '数据库'],
      },
      {
        id: 'fs-devops',
        name: '运维 David',
        role: 'DevOps 工程师',
        avatar: '🔧',
        memberRole: 'member',
        specialties: ['Docker', 'K8s', 'AWS'],
      },
    ],
    scenarios: ['Web 应用开发', 'API 服务搭建', '系统架构设计'],
  },
  {
    id: 'team-content',
    name: '内容创作团队',
    avatar: '✍️',
    creator: 'NexaWork',
    usageCount: 19200,
    description: '专业内容创作团队，覆盖文案、设计、SEO 全流程。',
    capabilities:
      '团队由创意总监统筹，配合文案策划、视觉设计和 SEO 优化专家，能够产出高质量的品牌内容、社媒素材和营销方案。',
    skills: ['文案策划', '品牌传播', 'SEO', '社媒运营', '视觉设计', '短视频'],
    members: [
      {
        id: 'ct-leader',
        name: '总监 Luna',
        role: '创意总监',
        avatar: '💡',
        memberRole: 'leader',
        specialties: ['创意策略', '品牌定位', '团队管理'],
      },
      {
        id: 'ct-copywriter',
        name: '文案 Mia',
        role: '资深文案',
        avatar: '📝',
        memberRole: 'member',
        specialties: ['品牌文案', '广告词', '公众号'],
      },
      {
        id: 'ct-designer',
        name: '设计 Yuki',
        role: '视觉设计师',
        avatar: '🎯',
        memberRole: 'member',
        specialties: ['海报设计', '社媒素材', 'UI'],
      },
    ],
    scenarios: ['品牌内容策划', '社交媒体运营', '营销文案'],
  },
  {
    id: 'team-data',
    name: '数据分析团队',
    avatar: '📊',
    creator: 'NexaWork',
    usageCount: 15600,
    description: '数据驱动决策团队，擅长数据采集、分析和可视化。',
    capabilities:
      '团队由首席数据科学家带领，配合数据工程师和分析师，能够完成数据采集、清洗、建模、可视化的完整数据链路。擅长 Python 数据分析、机器学习模型和 BI 看板搭建。',
    skills: ['Python', 'SQL', '机器学习', '数据可视化', 'Pandas', 'TensorFlow'],
    members: [
      {
        id: 'da-leader',
        name: '首席 Dr. Chen',
        role: '首席数据科学家',
        avatar: '🔬',
        memberRole: 'leader',
        specialties: ['ML 建模', '统计分析', '研究设计'],
      },
      {
        id: 'da-engineer',
        name: '工程 Leo',
        role: '数据工程师',
        avatar: '🔩',
        memberRole: 'member',
        specialties: ['ETL', 'Spark', '数据仓库'],
      },
      {
        id: 'da-analyst',
        name: '分析 Amy',
        role: '数据分析师',
        avatar: '📈',
        memberRole: 'member',
        specialties: ['BI 看板', '报表', '可视化'],
      },
    ],
    scenarios: ['数据分析报告', '预测模型', '商业洞察'],
  },
];

// ─── Team Introduction Generator ──────────────────────────────
export function generateTeamIntro(team: ExpertTeam): string {
  const leaderNames = team.members.filter(m => m.memberRole === 'leader').map(m => m.name);
  const memberNames = team.members.filter(m => m.memberRole === 'member').map(m => `${m.name}(${m.role})`);

  return (
    `🎯 ${team.name}已就位！\n\n` +
    `${team.description}\n\n` +
    `👑 主理人：${leaderNames.join('、')}\n` +
    `👥 成员：${memberNames.join('、')}\n\n` +
    `请问有什么可以帮您的？`
  );
}

// ─── useTeamSummon Hook ───────────────────────────────────────
export interface TeamSummonState {
  activeTeamId: string | null;
  summon: (teamId: string) => void;
  dismiss: () => void;
  isTeamActive: boolean;
  getIntro: () => string | null;
}

export function useTeamSummon(): TeamSummonState {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  const summon = useCallback((teamId: string) => {
    setActiveTeamId(teamId);
  }, []);

  const dismiss = useCallback(() => {
    setActiveTeamId(null);
  }, []);

  const getIntro = useCallback((): string | null => {
    if (!activeTeamId) return null;
    const team = defaultTeams.find(t => t.id === activeTeamId);
    if (!team) return null;
    return generateTeamIntro(team);
  }, [activeTeamId]);

  return {
    activeTeamId,
    summon,
    dismiss,
    isTeamActive: activeTeamId !== null,
    getIntro,
  };
}

// ─── MemberItem Component ─────────────────────────────────────
function MemberItem({ member }: { member: TeamMember }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] p-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]">
      {/* Avatar */}
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-sm">
        {member.avatar}
      </span>

      {/* Info */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">{member.name}</span>
          {/* Role badge */}
          {member.memberRole === 'leader' ? (
            <span className="flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-[#3B82F6]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#3B82F6]">
              <Crown size={8} />
              主理人
            </span>
          ) : (
            <span className="rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-tertiary)]">
              成员
            </span>
          )}
        </div>
        <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">{member.role}</span>
      </div>

      {/* Specialties */}
      <div className="flex flex-shrink-0 gap-1">
        {member.specialties.slice(0, 2).map(s => (
          <span
            key={s}
            className="rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-quaternary)]"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── ExpertTeamDialog Component ───────────────────────────────
export function ExpertTeamDialog({ team, isOpen, onClose, onSummon }: ExpertTeamDialogProps) {
  if (!isOpen || !team) return null;

  const leaders = team.members.filter(m => m.memberRole === 'leader');
  const members = team.members.filter(m => m.memberRole === 'member');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[var(--z-modal)] bg-black/40 transition-opacity duration-[var(--duration-normal)]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[480px] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-xl)]"
        role="dialog"
        aria-modal="true"
        aria-label={`${team.name} 详情`}
      >
        {/* Scrollable content */}
        <div className="max-h-[calc(85vh-64px)] overflow-y-auto">
          {/* Header */}
          <div className="relative flex flex-col items-center px-6 pt-6 pb-4">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              aria-label="关闭"
            >
              <X size={16} />
            </button>

            {/* Team avatar */}
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-3xl">
              {team.avatar}
            </span>

            {/* Team name */}
            <h2 className="mt-3 text-lg font-semibold text-[var(--color-text-primary)]">{team.name}</h2>

            {/* Creator + Usage */}
            <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
              <span className="flex items-center gap-1">
                <User size={10} />
                {team.creator}
              </span>
              <span className="flex items-center gap-1">
                <Zap size={10} />
                {team.usageCount >= 10000
                  ? `${(team.usageCount / 1000).toFixed(1)}k`
                  : team.usageCount.toLocaleString()}{' '}
                次使用
              </span>
            </div>

            {/* Short description */}
            <p className="mt-2 text-center text-xs text-[var(--color-text-secondary)]">{team.description}</p>
          </div>

          {/* Capabilities */}
          <div className="px-6 py-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
              <Star size={12} />
              能力介绍
            </h3>
            <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">{team.capabilities}</p>
          </div>

          {/* Skills */}
          <div className="px-6 py-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
              <Zap size={12} />
              擅长领域
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {team.skills.map(skill => (
                <span
                  key={skill}
                  className="rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)]"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Team Members */}
          <div className="px-6 py-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
              <Users size={12} />
              团队成员
              <span className="text-[var(--color-text-quaternary)]">({team.members.length})</span>
            </h3>
            <div className="flex flex-col gap-0.5">
              {/* Leaders first */}
              {leaders.map(member => (
                <MemberItem key={member.id} member={member} />
              ))}
              {/* Then regular members */}
              {members.map(member => (
                <MemberItem key={member.id} member={member} />
              ))}
            </div>
          </div>

          {/* Scenarios */}
          {team.scenarios.length > 0 && (
            <div className="px-6 py-3">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
                <MessageSquare size={12} />
                适用场景
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {team.scenarios.map(scenario => (
                  <span
                    key={scenario}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)]"
                  >
                    {scenario}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Summon button */}
        <div className="border-t border-[var(--color-border)] px-6 py-4">
          <button
            onClick={() => onSummon(team.id)}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-text-primary)] py-2.5 text-sm font-medium text-white transition-all duration-[var(--duration-fast)] hover:opacity-90 active:scale-[0.98]"
          >
            <Users size={14} />
            召唤 {team.name}
          </button>
        </div>
      </div>
    </>
  );
}
