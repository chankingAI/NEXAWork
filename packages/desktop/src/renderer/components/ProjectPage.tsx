/**
 * NexaWork ProjectPage (N20)
 * ==========================
 * Project management surface (WorkBuddy 截图7):
 *  - Header: title "项目 — 多人协同，打造超级团队" + description + search +
 *    "+ 新建项目" button
 *  - 我的项目: grid of project cards (icon + name + description + created time)
 *    with a right-click context menu (打开 / 重命名 / 删除)
 *  - 从模板创建: 3-column grid of 6 template cards; clicking seeds a new
 *    project from that template
 *  - 新建项目向导: 4 steps (模板 → 名称/描述 → 目录 → 初始化)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Search, FolderGit2, X } from 'lucide-react';
import type { ProjectInfo, ProjectTemplate, ProjectCreateInput } from '../../shared/ipc-channels';
import { PROJECT_TEMPLATES, getTemplate } from '../../shared/project-templates';

// ─── Pure helpers (exported for tests) ────────────────────────
/** Case-insensitive filter over project name + description. */
export function filterProjects(projects: ProjectInfo[], query: string): ProjectInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
}

export type WizardStep = 'template' | 'details' | 'directory' | 'init';
export const WIZARD_STEPS: WizardStep[] = ['template', 'details', 'directory', 'init'];

// ─── Context menu ─────────────────────────────────────────────
interface MenuState {
  project: ProjectInfo;
  x: number;
  y: number;
}

function ProjectCard({
  project,
  onContextMenu,
  onOpen,
}: {
  project: ProjectInfo;
  onContextMenu: (e: React.MouseEvent, p: ProjectInfo) => void;
  onOpen: (p: ProjectInfo) => void;
}) {
  return (
    <button
      onClick={() => onOpen(project)}
      onContextMenu={e => onContextMenu(e, project)}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-left transition-all hover:border-[var(--color-text-tertiary)] hover:shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-lg"
          style={{ backgroundColor: `${project.color ?? '#3B82F6'}1A` }}
        >
          {project.icon ?? '📁'}
        </span>
        <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{project.name}</span>
      </div>
      <p className="line-clamp-2 min-h-[2.5em] text-[12px] text-[var(--color-text-tertiary)]">
        {project.description || '暂无描述'}
      </p>
      <span className="text-[11px] text-[var(--color-text-tertiary)]">
        {new Date(project.createdAt).toLocaleDateString('zh-CN')} 创建
      </span>
    </button>
  );
}

function TemplateCard({ template, onClick }: { template: ProjectTemplate; onClick: (t: ProjectTemplate) => void }) {
  return (
    <button
      onClick={() => onClick(template)}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-left transition-all hover:border-[var(--color-text-tertiary)] hover:shadow-sm"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] text-2xl"
        style={{ backgroundColor: `${template.color}1A` }}
      >
        {template.icon}
      </span>
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{template.name}</span>
      <p className="line-clamp-2 text-[12px] text-[var(--color-text-tertiary)]">{template.description}</p>
    </button>
  );
}

// ─── New-project wizard ───────────────────────────────────────
function NewProjectWizard({
  open,
  initialTemplateId,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialTemplateId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<WizardStep>('template');
  const [templateId, setTemplateId] = useState<string>('blank');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [path, setPath] = useState('');
  const [initGit, setInitGit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the dialog opens (optionally pre-selecting a template).
  useEffect(() => {
    if (open) {
      const tpl = initialTemplateId ?? 'blank';
      setTemplateId(tpl);
      setName('');
      setDescription(initialTemplateId ? (getTemplate(initialTemplateId)?.description ?? '') : '');
      setPath('');
      setInitGit(true);
      setError(null);
      setStep(initialTemplateId ? 'details' : 'template');
    }
  }, [open, initialTemplateId]);

  const stepIndex = WIZARD_STEPS.indexOf(step);

  const next = useCallback(() => {
    setStep(WIZARD_STEPS[Math.min(stepIndex + 1, WIZARD_STEPS.length - 1)]);
  }, [stepIndex]);

  const back = useCallback(() => {
    setStep(WIZARD_STEPS[Math.max(stepIndex - 1, 0)]);
  }, [stepIndex]);

  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const payload: ProjectCreateInput = {
      name: name.trim(),
      description: description.trim(),
      template: templateId,
      path: path.trim() || undefined,
      icon: getTemplate(templateId)?.icon,
      color: getTemplate(templateId)?.color,
      initGit,
    };
    try {
      await window.nexawork?.project.create(payload);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建项目失败');
    } finally {
      setSubmitting(false);
    }
  }, [name, description, templateId, path, initGit, onCreated]);

  if (!open) return null;

  const canAdvance = step === 'details' ? name.trim().length > 0 : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header + step indicator */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">新建项目</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-5 py-3">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor: i <= stepIndex ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)',
              }}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-3">
          {step === 'template' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setTemplateId('blank');
                  next();
                }}
                className={`flex flex-col gap-1 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
                  templateId === 'blank'
                    ? 'border-[var(--color-text-primary)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                <span className="text-2xl">📄</span>
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">空白项目</span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">从零开始</span>
              </button>
              {PROJECT_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTemplateId(t.id);
                    setDescription(t.description);
                    next();
                  }}
                  className={`flex flex-col gap-1 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
                    templateId === t.id
                      ? 'border-[var(--color-text-primary)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{t.name}</span>
                  <span className="line-clamp-1 text-[11px] text-[var(--color-text-tertiary)]">{t.description}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'details' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">
                  项目名称 <span className="text-[var(--color-accent-red,#EF4444)]">*</span>
                </label>
                <input
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
                  placeholder="例如：移动端改版"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">描述</label>
                <textarea
                  className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
                  style={{ height: 80 }}
                  placeholder="简要描述项目目标"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </>
          )}

          {step === 'directory' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">本地目录</label>
              <input
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
                placeholder="可选，例如 /Users/me/projects/app"
                value={path}
                onChange={e => setPath(e.target.value)}
              />
              <p className="text-[11px] text-[var(--color-text-tertiary)]">
                留空则仅在应用内创建项目，不关联本地目录。
              </p>
            </div>
          )}

          {step === 'init' && (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                <input type="checkbox" checked={initGit} onChange={e => setInitGit(e.target.checked)} />
                在本地目录初始化 Git 仓库（git init）
              </label>
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-[12px] text-[var(--color-text-secondary)]">
                <div className="mb-1 font-semibold text-[var(--color-text-primary)]">{name || '未命名项目'}</div>
                <div>模板：{getTemplate(templateId)?.name ?? '空白项目'}</div>
                {path && <div>目录：{path}</div>}
              </div>
              {error && <span className="text-[12px] text-[var(--color-accent-red,#EF4444)]">{error}</span>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3.5">
          <button
            onClick={stepIndex === 0 ? onClose : back}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
          >
            {stepIndex === 0 ? '取消' : '上一步'}
          </button>
          {step === 'init' ? (
            <button
              onClick={handleCreate}
              disabled={submitting || !name.trim()}
              className="rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? '创建中…' : '创建项目'}
            </button>
          ) : (
            <button
              onClick={next}
              disabled={!canAdvance}
              className="rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export function ProjectPage() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTemplate, setWizardTemplate] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const renameRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const api = window.nexawork;
    if (!api) {
      setLoading(false);
      return;
    }
    const result = await api.project.list({});
    setProjects(result.projects);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Close the context menu on any outside click.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const openWizard = useCallback((templateId: string | null) => {
    setWizardTemplate(templateId);
    setWizardOpen(true);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, p: ProjectInfo) => {
    e.preventDefault();
    setMenu({ project: p, x: e.clientX, y: e.clientY });
  }, []);

  const handleRename = useCallback(
    async (p: ProjectInfo) => {
      renameRef.current = p.id;
      const nextName = window.prompt('重命名项目', p.name);
      renameRef.current = null;
      if (nextName && nextName.trim() && nextName !== p.name) {
        await window.nexawork?.project.update({
          id: p.id,
          name: nextName.trim(),
        });
        void refresh();
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (p: ProjectInfo) => {
      if (window.confirm(`确定删除项目「${p.name}」？`)) {
        await window.nexawork?.project.delete({ id: p.id });
        void refresh();
      }
    },
    [refresh],
  );

  const handleOpen = useCallback((p: ProjectInfo) => {
    // Opening a project is surfaced via a custom event the shell can route on.
    window.dispatchEvent(new CustomEvent('nexawork:open-project', { detail: p }));
  }, []);

  const filtered = useMemo(() => filterProjects(projects, query), [projects, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
              <FolderGit2 size={20} />
              项目 — 多人协同，打造超级团队
            </h1>
            <p className="text-[13px] text-[var(--color-text-tertiary)]">
              为每个目标创建项目空间，与 AI 协作沉淀产出。
            </p>
          </div>
          <button
            onClick={() => openWizard(null)}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            新建项目
          </button>
        </div>
        <div className="relative mt-3 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1.5 pl-9 pr-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
            placeholder="搜索项目"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* 我的项目 */}
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--color-text-secondary)]">我的项目</h2>
        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
            {query ? '没有匹配的项目' : '还没有项目，点击「新建项目」开始'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} onContextMenu={handleContextMenu} onOpen={handleOpen} />
            ))}
          </div>
        )}

        {/* 从模板创建 */}
        <h2 className="mb-2 mt-8 text-[13px] font-semibold text-[var(--color-text-secondary)]">从模板创建</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECT_TEMPLATES.map(t => (
            <TemplateCard key={t.id} template={t} onClick={tpl => openWizard(tpl.id)} />
          ))}
        </div>
      </div>

      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-50 min-w-[120px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: '打开', fn: () => handleOpen(menu.project) },
            { label: '重命名', fn: () => handleRename(menu.project) },
            { label: '删除', fn: () => handleDelete(menu.project), danger: true },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => {
                setMenu(null);
                void item.fn();
              }}
              className={`flex w-full items-center px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-tertiary)] ${
                item.danger ? 'text-[var(--color-accent-red,#EF4444)]' : 'text-[var(--color-text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <NewProjectWizard
        open={wizardOpen}
        initialTemplateId={wizardTemplate}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setWizardOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}
