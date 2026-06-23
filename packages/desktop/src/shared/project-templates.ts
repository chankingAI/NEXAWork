/**
 * NexaWork Project Templates (N20)
 * ================================
 * Canonical template catalog shared by the main-process handler
 * (`project:templates`, preset seeding) and the renderer ProjectPage grid.
 * Six templates rendered as a 3-column grid per the WorkBuddy reference.
 */
import type { ProjectTemplate } from './ipc-channels'

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'prd-flow',
    name: '产品需求全流程',
    description: '从需求收集、PRD 撰写到评审落地的完整流程',
    icon: '📋',
    color: '#3B82F6',
    presets: [
      '梳理目标用户与核心痛点',
      '撰写产品需求文档（PRD）',
      '拆解功能列表与优先级',
      '生成评审会议纪要',
    ],
  },
  {
    id: 'market-research',
    name: '市场调研与竞品分析',
    description: '行业研究、竞品对比、市场机会洞察',
    icon: '📊',
    color: '#10B981',
    presets: [
      '收集行业市场规模数据',
      '搭建竞品分析对比表',
      '提炼差异化定位建议',
    ],
  },
  {
    id: 'team-knowledge',
    name: '团队知识库',
    description: '沉淀团队文档、规范与最佳实践',
    icon: '📚',
    color: '#8B5CF6',
    presets: [
      '整理团队协作规范',
      '建立常见问题 FAQ',
      '归档技术决策记录（ADR）',
    ],
  },
  {
    id: 'project-delivery',
    name: '项目交付管理',
    description: '里程碑、任务分配与交付进度跟踪',
    icon: '🚀',
    color: '#F59E0B',
    presets: ['制定项目里程碑计划', '拆解并分配交付任务', '生成周报与进度汇总'],
  },
  {
    id: 'bug-tracking',
    name: 'Bug 跟踪与测试验收',
    description: '缺陷登记、复现、回归与验收流程',
    icon: '🐞',
    color: '#EF4444',
    presets: [
      '登记缺陷与复现步骤',
      '编写测试用例与验收标准',
      '汇总回归测试结果',
    ],
  },
  {
    id: 'content-workflow',
    name: '内容创作工作流',
    description: '选题、撰写、审校到多平台分发',
    icon: '✍️',
    color: '#EC4899',
    presets: ['策划内容选题日历', '撰写并润色稿件', '适配多平台分发文案'],
  },
]

export function getTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id)
}
