/**
 * NexaWork skill catalog — shared data + pure helpers for N15.
 *
 * The renderer keeps a deterministic default catalog that mirrors the
 * backend seed (src/main/ipc-handlers.ts → seedSkills). The store hydrates
 * from IPC (window.nexawork.skill.list) when available and falls back to this
 * catalog in degraded / test environments. Pure helpers here are unit-tested.
 */
import type {
  SkillInfo,
  SkillSource,
  SkillConfigParam,
} from '../../shared/ipc-channels'

export type { SkillInfo, SkillSource, SkillConfigParam }

// ─── Category tabs (the three N15 tiers) ──────────────────────
export interface SkillCategoryTab {
  id: SkillSource
  label: string
  /** Short helper text shown when the tab is empty. */
  emptyHint: string
}

export const skillCategoryTabs: SkillCategoryTab[] = [
  { id: 'builtin', label: '内置技能', emptyHint: '暂无内置技能' },
  { id: 'installed', label: '已安装', emptyHint: '尚未安装任何技能' },
  { id: 'available', label: '可用技能', emptyHint: '市场暂无可用技能' },
]

// ─── Default catalog (mirrors backend seed) ───────────────────
export const defaultSkills: SkillInfo[] = [
  // Builtin
  {
    id: 'skill-web-search',
    name: 'Web Search',
    description: 'Search the web for up-to-date information',
    category: 'tools',
    installed: true,
    enabled: true,
    version: '1.0.0',
    source: 'builtin',
    icon: '🔍',
    color: '#3B82F6',
    author: 'NexaWork',
    longDescription:
      'Query the web for current information and summarise the results inline. Backed by the WebSearch tool.',
    permissions: ['network'],
    config: [
      {
        key: 'maxResults',
        label: '最大结果数',
        type: 'number',
        value: 5,
        description: '每次搜索返回的结果数量',
      },
    ],
  },
  {
    id: 'skill-file-edit',
    name: 'File Edit',
    description: 'Read and edit files in the workspace',
    category: 'tools',
    installed: true,
    enabled: true,
    version: '1.0.0',
    source: 'builtin',
    icon: '📝',
    color: '#10B981',
    author: 'NexaWork',
    longDescription:
      'Read, create and modify files using the FileRead / FileEdit / FileWrite tools.',
    permissions: ['filesystem:read', 'filesystem:write'],
  },
  {
    id: 'skill-code-run',
    name: 'Code Runner',
    description: 'Execute code in a sandboxed shell',
    category: 'development',
    installed: true,
    enabled: true,
    version: '1.0.0',
    source: 'builtin',
    icon: '⚡',
    color: '#F59E0B',
    author: 'NexaWork',
    longDescription:
      'Run shell commands and scripts inside the sandbox runtime via the Bash tool.',
    permissions: ['shell', 'filesystem:read'],
  },
  {
    id: 'skill-creation-guide',
    name: '技能创建指南',
    description: 'Step-by-step guide for authoring new skills',
    category: 'guide',
    installed: true,
    enabled: true,
    version: '1.0.0',
    source: 'builtin',
    icon: '📚',
    color: '#8B5CF6',
    author: 'NexaWork',
    longDescription:
      'Walks through SKILL.md structure, frontmatter, allowed tools and packaging so you can publish your own skills.',
    permissions: [],
  },
  // Installed
  {
    id: 'skill-self-improving-agent',
    name: 'self-improving-agent',
    description: 'Agent that refines its own prompts from feedback',
    category: 'agent',
    installed: true,
    enabled: false,
    version: '0.3.0',
    source: 'installed',
    icon: '🤖',
    color: '#EC4899',
    author: '.claude/skills',
    longDescription:
      'Learns from operation memory to iteratively improve its instructions. Loaded from .claude/skills/.',
    permissions: ['filesystem:read', 'filesystem:write'],
    config: [
      {
        key: 'autoApply',
        label: '自动应用改进',
        type: 'boolean',
        value: false,
        description: '无需确认即应用自我改进',
      },
    ],
  },
  {
    id: 'skill-recorded-onboarding',
    name: '录制：新员工入职',
    description: 'Replayable workflow captured by the recorder',
    category: 'recorder',
    installed: true,
    enabled: true,
    version: '1.0.0',
    source: 'installed',
    icon: '🎬',
    color: '#06B6D4',
    author: 'Recorder',
    longDescription:
      'A recorded operation sequence promoted to a reusable skill. Replays the onboarding workflow.',
    permissions: ['filesystem:read'],
  },
  // Available
  {
    id: 'skill-brave-search-cli',
    name: 'Brave Search CLI',
    description: 'Privacy-first web search via the Brave API',
    category: 'tools',
    installed: false,
    enabled: false,
    version: '2.1.0',
    source: 'available',
    icon: '🦁',
    color: '#F97316',
    author: 'Community',
    longDescription:
      'Search the web through the Brave Search API. Requires an API key configured below.',
    permissions: ['network'],
    config: [
      {
        key: 'apiKey',
        label: 'Brave API Key',
        type: 'string',
        value: '',
        description: '从 brave.com/search/api 获取',
      },
    ],
  },
  {
    id: 'skill-github-pr-review',
    name: 'GitHub PR Review',
    description: 'Automated pull-request review and summaries',
    category: 'development',
    installed: false,
    enabled: false,
    version: '1.4.2',
    source: 'available',
    icon: '🐙',
    color: '#6366F1',
    author: 'Community',
    longDescription:
      'Fetches a pull request, reviews the diff and posts structured feedback.',
    permissions: ['network'],
  },
]

// ─── Pure helpers ─────────────────────────────────────────────

/**
 * Resolve which panel tier a skill belongs to. Honours the explicit
 * `source` field, otherwise derives it from `installed` (builtin/installed
 * are both installed; uninstalled → available).
 */
export function resolveSkillSource(skill: SkillInfo): SkillSource {
  if (skill.source) return skill.source
  return skill.installed ? 'installed' : 'available'
}

/**
 * Filter a skill list by active category tier and a free-text query.
 * Matches name / description / category / author / permissions.
 */
export function filterSkills(
  skills: SkillInfo[],
  category: SkillSource,
  query: string,
): SkillInfo[] {
  const byCategory = skills.filter(s => resolveSkillSource(s) === category)
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return byCategory
  return byCategory.filter(s => {
    const haystack = [
      s.name,
      s.description,
      s.longDescription ?? '',
      s.category,
      s.author ?? '',
      ...(s.permissions ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(trimmed)
  })
}

/** Count skills per category tier (used for tab badges). */
export function countByCategory(
  skills: SkillInfo[],
): Record<SkillSource, number> {
  const counts: Record<SkillSource, number> = {
    builtin: 0,
    installed: 0,
    available: 0,
  }
  for (const skill of skills) counts[resolveSkillSource(skill)] += 1
  return counts
}

/** Human-readable label for a permission key. */
const PERMISSION_LABELS: Record<string, string> = {
  network: '网络访问',
  shell: '执行 Shell 命令',
  'filesystem:read': '读取文件',
  'filesystem:write': '写入文件',
}

export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission
}
