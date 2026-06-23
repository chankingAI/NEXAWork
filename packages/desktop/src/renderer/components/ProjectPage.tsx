/**
 * NexaWork ProjectPage — Project management (N20)
 *
 * WorkBuddy 截图7 对标：
 * - 标题「项目 — 多人协同，打造超级团队」+ 描述 + 搜索框 + 「+ 新建项目」
 * - 「我的项目」：项目卡片（图标 + 名称 + 描述 + 创建时间），右键菜单 打开/重命名/删除
 * - 「从模版创建」：3 列网格，6 个模板卡片（48px 图标 + 粗体名称 + 灰色描述）
 * - 新建项目向导（4 步）：选择模板/空白 → 名称·描述 → 选择本地目录 → 初始化(git init)
 *
 * Apple-level 白底黑字布局，状态来自 useProjects（对接后端 ProjectManager）。
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import {
  FolderKanban,
  Plus,
  Search,
  FolderOpen,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  BarChart3,
  BookOpen,
  PackageCheck,
  Bug,
  Repeat,
  FilePlus2,
  FolderGit2,
  type LucideIcon,
} from 'lucide-react';
import type { ProjectInfo, ProjectCreateInput } from '../../shared/ipc-channels';

// ─── Templates (testable static data) ─────────────────────────
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  /** Default project description prefilled into the wizard when chosen. */
  preset: string;
}

export const projectTemplates: ProjectTemplate[] = [
  {
    id: 'tpl-prd-flow',
    name: '产品需求全流程',
    description: '从需求收集、评审到开发交付的完整流程',
    preset: '管理产品从需求收集、评审、设计到开发交付的全流程协同',
  },
  {
    id: 'tpl-market-research',
    name: '市场调研与竞品分析',
    description: '系统化调研市场并对比竞品',
    preset: '系统化收集市场数据、分析竞品并输出调研报告',
  },
  {
    id: 'tpl-knowledge-base',
    name: '团队知识库',
    description: '沉淀团队文档与最佳实践',
    preset: '集中沉淀团队文档、规范与最佳实践，便于检索复用',
  },
  {
    id: 'tpl-delivery',
    name: '项目交付',
    description: '里程碑、任务与交付物管理',
    preset: '管理项目里程碑、任务分配与交付物验收',
  },
  {
    id: 'tpl-bug-tracking',
    name: 'Bug 跟踪 / 测试验收',
    description: '缺陷跟踪与测试验收闭环',
    preset: '跟踪缺陷、组织测试用例并完成验收闭环',
  },
  {
    id: 'tpl-sprint',
    name: '敏捷迭代管理',
    description: 'Sprint 规划与每日站会',
    preset: '规划 Sprint、管理迭代待办并组织每日站会',
  },
];

/** Icon mapping kept out of the pure template data so the data stays testable. */
const templateIcons: Record<string, LucideIcon> = {
  'tpl-prd-flow': ClipboardList,
  'tpl-market-research': BarChart3,
  'tpl-knowledge-base': BookOpen,
  'tpl-delivery': PackageCheck,
  'tpl-bug-tracking': Bug,
  'tpl-sprint': Repeat,
};

export function templateIcon(id?: string): LucideIcon {
  return (id && templateIcons[id]) || FolderOpen;
}

// ─── Wizard form (testable) ───────────────────────────────────
export interface WizardForm {
  /** Source template id, or undefined for a blank project. */
  template?: string;
  name: string;
  description: string;
  path: string;
  initGit: boolean;
}

export const emptyWizardForm: WizardForm = {
  template: undefined,
  name: '',
  description: '',
  path: '',
  initGit: true,
};

/** Build a wizard form prefilled from a template (description preset). */
export function templateToWizardForm(tpl: ProjectTemplate): WizardForm {
  return { ...emptyWizardForm, template: tpl.id, name: '', description: tpl.preset };
}

export const WIZARD_STEPS = ['选择模板', '名称与描述', '本地目录', '初始化'] as const;
export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

/** Whether the user may advance from / confirm a given 1-indexed step. */
export function isWizardStepValid(step: number, form: WizardForm): boolean {
  switch (step) {
    case 1:
      return true; // template OR blank both allowed
    case 2:
      return form.name.trim().length > 0;
    case 3:
      return form.path.trim().length > 0;
    case 4:
      return form.name.trim().length > 0 && form.path.trim().length > 0;
    default:
      return false;
  }
}

export function wizardToCreateInput(form: WizardForm): ProjectCreateInput {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    template: form.template,
    path: form.path.trim(),
    initGit: form.initGit,
  };
}

/** Client-side instant filter over the project list (name + description). */
export function filterProjects(projects: ProjectInfo[], query: string): ProjectInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
}

export function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Props ────────────────────────────────────────────────────
export interface ProjectPageProps {
  projects: ProjectInfo[];
  onCreate: (input: ProjectCreateInput) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onOpenProject?: (project: ProjectInfo) => void;
  /** Opens a native directory picker; returns the chosen path or null. */
  onPickDir?: () => Promise<string | null>;
}

// ─── Context menu ─────────────────────────────────────────────
interface MenuState {
  project: ProjectInfo;
  x: number;
  y: number;
}

// ─── Project card ─────────────────────────────────────────────
function ProjectCard({
  project,
  onContextMenu,
  onOpen,
}: {
  project: ProjectInfo;
  onContextMenu: (e: React.MouseEvent, project: ProjectInfo) => void;
  onOpen: (project: ProjectInfo) => void;
}) {
  const Icon = templateIcon(project.template);
  return (
    <button
      onDoubleClick={() => onOpen(project)}
      onContextMenu={e => onContextMenu(e, project)}
      className="group flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]">
        <Icon size={20} />
      </div>
      <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{project.name}</span>
      <span className="line-clamp-2 text-[11px] text-[var(--color-text-tertiary)]">
        {project.description || '暂无描述'}
      </span>
      <div className="mt-auto flex items-center gap-2 pt-1 text-[10px] text-[var(--color-text-quaternary)]">
        <span className="flex items-center gap-1">
          <FolderGit2 size={10} />
          {project.gitInitialized ? '已关联 Git' : '本地目录'}
        </span>
        <span>{formatCreatedAt(project.createdAt)}</span>
      </div>
    </button>
  );
}

// ─── Template card ────────────────────────────────────────────
function TemplateCard({ tpl, onPick }: { tpl: ProjectTemplate; onPick: (tpl: ProjectTemplate) => void }) {
  const Icon = templateIcon(tpl.id);
  return (
    <button
      onClick={() => onPick(tpl)}
      className="group flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] transition-colors group-hover:bg-[var(--color-text-primary)] group-hover:text-[var(--color-bg-primary)]">
        <Icon size={24} />
      </div>
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{tpl.name}</span>
      <span className="text-[11px] text-[var(--color-text-tertiary)]">{tpl.description}</span>
    </button>
  );
}

// ─── New project wizard ───────────────────────────────────────
function NewProjectWizard({
  initial,
  onCancel,
  onSubmit,
  onPickDir,
}: {
  initial: WizardForm;
  onCancel: () => void;
  onSubmit: (input: ProjectCreateInput) => void;
  onPickDir?: () => Promise<string | null>;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(initial);

  const stepValid = isWizardStepValid(step, form);
  const update = (patch: Partial<WizardForm>) => setForm(prev => ({ ...prev, ...patch }));

  const next = () => {
    if (step < WIZARD_STEP_COUNT && stepValid) setStep(step + 1);
  };
  const back = () => {
    if (step > 1) setStep(step - 1);
  };
  const confirm = () => {
    if (isWizardStepValid(WIZARD_STEP_COUNT, form)) onSubmit(wizardToCreateInput(form));
  };

  const pickDir = async () => {
    const path = await onPickDir?.();
    if (path) update({ path });
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="新建项目"
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        {/* Header + step indicator */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">新建项目</span>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pt-4">
          {WIZARD_STEPS.map((label, i) => {
            const idx = i + 1;
            const active = idx === step;
            const done = idx < step;
            return (
              <div key={label} className="flex flex-1 items-center gap-1.5">
                <div
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    active
                      ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                      : done
                        ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
                  }`}
                >
                  {done ? <Check size={11} /> : idx}
                </div>
                <span
                  className={`truncate text-[11px] ${active ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step body */}
        <div className="min-h-[260px] px-5 py-4">
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-[var(--color-text-tertiary)]">选择一个模板，或从空白项目开始</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => update({ template: undefined, description: '' })}
                  className={`flex items-center gap-2 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
                    form.template === undefined
                      ? 'border-[var(--color-text-primary)] bg-[var(--color-bg-hover)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                >
                  <FilePlus2 size={18} className="text-[var(--color-text-secondary)]" />
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">空白项目</span>
                </button>
                {projectTemplates.map(tpl => {
                  const Icon = templateIcon(tpl.id);
                  const selected = form.template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => update({ template: tpl.id, description: tpl.preset })}
                      className={`flex items-center gap-2 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[var(--color-text-primary)] bg-[var(--color-bg-hover)]'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                      }`}
                    >
                      <Icon size={18} className="flex-shrink-0 text-[var(--color-text-secondary)]" />
                      <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{tpl.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  项目名称<span className="text-[var(--color-accent-red)]">*</span>
                </span>
                <input
                  value={form.name}
                  onChange={e => update({ name: e.target.value })}
                  placeholder="例如：智能客服重构"
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">项目描述</span>
                <textarea
                  value={form.description}
                  onChange={e => update({ description: e.target.value })}
                  placeholder="简述项目目标与范围"
                  rows={4}
                  className="resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
                />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  本地目录<span className="text-[var(--color-accent-red)]">*</span>
                </span>
                <div className="flex gap-2">
                  <input
                    value={form.path}
                    onChange={e => update({ path: e.target.value })}
                    placeholder="~/Projects/my-app"
                    className="h-9 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
                  />
                  <button
                    onClick={pickDir}
                    className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                  >
                    <FolderOpen size={15} />
                    选择
                  </button>
                </div>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">项目将与该本地目录关联</span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-[var(--color-text-tertiary)]">确认项目信息并初始化</p>
              <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-xs">
                <Summary label="名称" value={form.name} />
                <Summary label="描述" value={form.description || '—'} />
                <Summary label="目录" value={form.path} />
                <Summary label="模板" value={projectTemplates.find(t => t.id === form.template)?.name ?? '空白项目'} />
              </div>
              <label className="flex cursor-pointer items-center gap-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.initGit}
                  onClick={() => update({ initGit: !form.initGit })}
                  className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                    form.initGit ? 'bg-[var(--color-text-primary)]' : 'bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-bg-primary)] transition-transform ${
                      form.initGit ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
                  <FolderGit2 size={14} />
                  初始化 Git 仓库（git init）
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
          <button
            onClick={back}
            disabled={step === 1}
            className="flex h-9 items-center gap-1 rounded-[var(--radius-md)] px-3 text-sm text-[var(--color-text-secondary)] enabled:hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            上一步
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            >
              取消
            </button>
            {step < WIZARD_STEP_COUNT ? (
              <button
                onClick={next}
                disabled={!stepValid}
                className="flex h-9 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-sm font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                下一步
                <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={confirm}
                disabled={!isWizardStepValid(WIZARD_STEP_COUNT, form)}
                className="flex h-9 items-center rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-sm font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                创建项目
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-10 flex-shrink-0 text-[var(--color-text-tertiary)]">{label}</span>
      <span className="truncate text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

// ─── Rename modal ─────────────────────────────────────────────
function RenameModal({
  project,
  onCancel,
  onConfirm,
}: {
  project: ProjectInfo;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(project.name);
  const valid = name.trim().length > 0;
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="重命名项目"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="border-b border-[var(--color-border)] px-5 py-3.5 text-sm font-semibold text-[var(--color-text-primary)]">
          重命名项目
        </div>
        <div className="px-5 py-4">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && valid) onConfirm(name.trim());
            }}
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <button
            onClick={onCancel}
            className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            取消
          </button>
          <button
            onClick={() => valid && onConfirm(name.trim())}
            disabled={!valid}
            className="flex h-9 items-center rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-sm font-medium text-[var(--color-bg-primary)] hover:opacity-90 disabled:opacity-40"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export function ProjectPage({ projects, onCreate, onRename, onDelete, onOpenProject, onPickDir }: ProjectPageProps) {
  const [query, setQuery] = useState('');
  const [wizard, setWizard] = useState<WizardForm | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<ProjectInfo | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterProjects(projects, query), [projects, query]);

  // Dismiss the context menu on any outside click / escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [menu]);

  const openContextMenu = (e: React.MouseEvent, project: ProjectInfo) => {
    e.preventDefault();
    setMenu({ project, x: e.clientX, y: e.clientY });
  };

  const submit = (input: ProjectCreateInput) => {
    void onCreate(input);
    setWizard(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
            <FolderKanban size={18} />
            项目 — 多人协同，打造超级团队
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            为每个目标创建项目空间，关联本地仓库并与 AI 协作推进
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索项目"
              className="h-9 w-44 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-8 pr-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
            />
          </div>
          <button
            onClick={() => setWizard(emptyWizardForm)}
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          >
            <Plus size={15} />
            新建项目
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* My projects */}
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            我的项目
            <span className="font-normal">({filtered.length})</span>
          </h2>
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-10 text-xs text-[var(--color-text-tertiary)]">
              {query ? '没有匹配的项目' : '还没有项目，点击「新建项目」或从下方模板创建'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onContextMenu={openContextMenu}
                  onOpen={proj => onOpenProject?.(proj)}
                />
              ))}
            </div>
          )}
        </section>

        {/* From template */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            从模板创建
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {projectTemplates.map(tpl => (
              <TemplateCard key={tpl.id} tpl={tpl} onPick={t => setWizard(templateToWizardForm(t))} />
            ))}
          </div>
        </section>
      </div>

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[var(--z-popover)] min-w-[140px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-lg)]"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <MenuItem
            icon={<FolderOpen size={14} />}
            label="打开"
            onClick={() => {
              onOpenProject?.(menu.project);
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Pencil size={14} />}
            label="重命名"
            onClick={() => {
              setRenaming(menu.project);
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Trash2 size={14} />}
            label="删除"
            danger
            onClick={() => {
              onDelete(menu.project.id);
              setMenu(null);
            }}
          />
        </div>
      )}

      {/* Wizard */}
      {wizard && (
        <NewProjectWizard initial={wizard} onCancel={() => setWizard(null)} onSubmit={submit} onPickDir={onPickDir} />
      )}

      {/* Rename */}
      {renaming && (
        <RenameModal
          project={renaming}
          onCancel={() => setRenaming(null)}
          onConfirm={name => {
            onRename(renaming.id, name);
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--color-bg-hover)] ${
        danger ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
