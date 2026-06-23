/**
 * NexaWork AutomationPanel — Scheduled automation management (N18)
 *
 * WorkBuddy 截图11 对标：
 * - 头部：标题「自动化」+ 描述 + 「+ 添加」/「从模板添加」
 * - 已安排：状态点(绿/黄) + 任务名 + 空间 + 频率 + 生效期 + 距下次执行（实时倒计时）
 * - 已完成：状态点(红) + 任务名 + 空间 + 成功/失败标签 + 时间 + 删除
 *
 * Apple-level 白底黑字布局，全部状态来自 useAutomations（对接后端 Cron 系统）。
 */
import { useMemo, useState } from 'react';
import {
  Zap,
  Plus,
  LayoutTemplate,
  Play,
  Pause,
  Trash2,
  Clock,
  CalendarRange,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Circle,
  X,
} from 'lucide-react';
import type { AutomationInfo, AutomationCreateInput } from '../../shared/ipc-channels';
import { describeCron, formatCountdown, formatValidRange } from '../../shared/cron';

// ─── Pure helpers (testable) ──────────────────────────────────

export interface SplitAutomations {
  scheduled: AutomationInfo[];
  completed: AutomationInfo[];
}

/** Scheduled = active | paused; Completed = completed. */
export function splitAutomations(list: AutomationInfo[]): SplitAutomations {
  return {
    scheduled: list.filter(a => a.status === 'active' || a.status === 'paused'),
    completed: list.filter(a => a.status === 'completed'),
  };
}

/** Status dot color for the scheduled list (绿=运行中, 黄=等待). */
export function scheduledDotColor(status: AutomationInfo['status']): string {
  return status === 'active' ? 'var(--color-accent-green)' : 'var(--color-accent-orange)';
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  cron: string;
  workspace: string;
}

export const automationTemplates: AutomationTemplate[] = [
  {
    id: 'tpl-daily-report',
    name: '每日数据报表',
    description: '每天早上汇总关键指标生成报表',
    prompt: '汇总昨日核心业务数据并生成可视化报表',
    cron: '0 8 * * *',
    workspace: '产品开发',
  },
  {
    id: 'tpl-weekly-summary',
    name: '每周工作周报',
    description: '每周一自动整理上周进展',
    prompt: '整理上周工作进展，生成结构化周报',
    cron: '0 9 * * 1',
    workspace: '市场营销',
  },
  {
    id: 'tpl-db-backup',
    name: '数据库每日备份',
    description: '凌晨执行数据库全量备份',
    prompt: '执行数据库全量备份并校验完整性',
    cron: '0 2 * * *',
    workspace: '运维',
  },
  {
    id: 'tpl-news-digest',
    name: '行业资讯摘要',
    description: '工作日抓取并总结行业动态',
    prompt: '抓取行业最新资讯并生成要点摘要',
    cron: '30 18 * * 1-5',
    workspace: '市场营销',
  },
];

export interface AutomationForm {
  name: string;
  prompt: string;
  cron: string;
  workspace: string;
  startDate: string;
  endDate: string;
}

export const emptyForm: AutomationForm = {
  name: '',
  prompt: '',
  cron: '0 8 * * *',
  workspace: '',
  startDate: '',
  endDate: '',
};

/** Returns a list of validation error messages (empty = valid). */
export function validateAutomationForm(form: AutomationForm): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('请填写任务名称');
  if (!form.prompt.trim()) errors.push('请填写任务指令');
  if (form.cron.trim().split(/\s+/).length !== 5) errors.push('Cron 表达式需为 5 段');
  if (!form.workspace.trim()) errors.push('请选择关联空间');
  return errors;
}

export function isFormValid(form: AutomationForm): boolean {
  return validateAutomationForm(form).length === 0;
}

export function toCreateInput(form: AutomationForm): AutomationCreateInput {
  return {
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    cron: form.cron.trim(),
    workspace: form.workspace.trim(),
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
  };
}

function formatLastRun(iso?: string): string {
  if (!iso) return '尚未执行';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Props ────────────────────────────────────────────────────
export interface AutomationPanelProps {
  automations: AutomationInfo[];
  now: number;
  onCreate: (input: AutomationCreateInput) => void;
  onToggle: (id: string, status: 'active' | 'paused') => void;
  onDelete: (id: string) => void;
  onRunNow: (id: string) => void;
}

// ─── Scheduled row ────────────────────────────────────────────
function ScheduledItem({
  automation,
  now,
  onToggle,
  onRunNow,
  onDelete,
}: {
  automation: AutomationInfo;
  now: number;
  onToggle: (id: string, status: 'active' | 'paused') => void;
  onRunNow: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const paused = automation.status === 'paused';
  return (
    <div className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]">
      <Circle
        size={8}
        className="flex-shrink-0"
        style={{
          fill: scheduledDotColor(automation.status),
          color: scheduledDotColor(automation.status),
        }}
        aria-label={paused ? '等待中' : '运行中'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{automation.name}</span>
          {paused && (
            <span className="rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
              已暂停
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)]">
          <span className="flex items-center gap-1">
            <FolderOpen size={11} />
            {automation.workspace}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {describeCron(automation.cron)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarRange size={11} />
            {formatValidRange(automation.validFrom, automation.validTo)}
          </span>
        </div>
      </div>

      {/* Countdown */}
      <span className="flex-shrink-0 text-xs font-medium text-[var(--color-text-secondary)]">
        {paused ? '已暂停' : formatCountdown(automation.nextRun, new Date(now))}
      </span>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100">
        <button
          onClick={() => onRunNow(automation.id)}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          aria-label="立即运行"
          title="立即运行"
        >
          <Play size={13} />
        </button>
        <button
          onClick={() => onToggle(automation.id, paused ? 'active' : 'paused')}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          aria-label={paused ? '恢复' : '暂停'}
          title={paused ? '恢复' : '暂停'}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
        <button
          onClick={() => onDelete(automation.id)}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-accent-red)]"
          aria-label="删除"
          title="删除"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Completed row ────────────────────────────────────────────
function CompletedItem({ automation, onDelete }: { automation: AutomationInfo; onDelete: (id: string) => void }) {
  const failed = automation.lastRunStatus === 'failure';
  return (
    <div className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]">
      <Circle
        size={8}
        className="flex-shrink-0"
        style={{ fill: 'var(--color-accent-red)', color: 'var(--color-accent-red)' }}
        aria-label="已完成"
      />
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{automation.name}</span>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)]">
          <span className="flex items-center gap-1">
            <FolderOpen size={11} />
            {automation.workspace}
          </span>
          <span>{formatLastRun(automation.lastRun)}</span>
        </div>
      </div>

      {/* Result tag */}
      <span
        className={`flex flex-shrink-0 items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-[11px] font-medium ${
          failed
            ? 'bg-[color-mix(in_srgb,var(--color-accent-red)_14%,transparent)] text-[var(--color-accent-red)]'
            : 'bg-[color-mix(in_srgb,var(--color-accent-green)_14%,transparent)] text-[var(--color-accent-green)]'
        }`}
      >
        {failed ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
        {failed ? '失败' : '成功'}
      </span>

      <button
        onClick={() => onDelete(automation.id)}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] opacity-0 transition-opacity duration-[var(--duration-fast)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-accent-red)] group-hover:opacity-100"
        aria-label="删除记录"
        title="删除记录"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Create / Template modal ──────────────────────────────────
function CreateModal({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: AutomationForm;
  onCancel: () => void;
  onSubmit: (input: AutomationCreateInput) => void;
}) {
  const [form, setForm] = useState<AutomationForm>(initial);
  const errors = validateAutomationForm(form);
  const valid = errors.length === 0;

  const field = (key: keyof AutomationForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="添加自动化"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">添加自动化</span>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">任务名称</span>
            <input
              value={form.name}
              onChange={field('name')}
              placeholder="例如：每日销售报表"
              className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">任务指令</span>
            <textarea
              value={form.prompt}
              onChange={field('prompt')}
              placeholder="描述要自动执行的任务"
              rows={2}
              className="resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">频率 (Cron)</span>
              <input
                value={form.cron}
                onChange={field('cron')}
                placeholder="0 8 * * *"
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">关联空间</span>
              <input
                value={form.workspace}
                onChange={field('workspace')}
                placeholder="产品开发"
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
              />
            </label>
          </div>
          {form.cron.trim().split(/\s+/).length === 5 && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">预览：{describeCron(form.cron)}</span>
          )}
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">生效日期</span>
              <input
                type="date"
                value={form.startDate}
                onChange={field('startDate')}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">结束日期</span>
              <input
                type="date"
                value={form.endDate}
                onChange={field('endDate')}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            onClick={onCancel}
            className="h-9 rounded-[var(--radius-md)] px-4 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            取消
          </button>
          <button
            disabled={!valid}
            onClick={() => onSubmit(toCreateInput(form))}
            className="h-9 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-sm font-medium text-[var(--color-bg-primary)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template picker ──────────────────────────────────────────
function TemplatePicker({ onCancel, onPick }: { onCancel: () => void; onPick: (tpl: AutomationTemplate) => void }) {
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="从模板添加"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">从模板添加</span>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto p-3">
          {automationTemplates.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => onPick(tpl)}
              className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-2.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
            >
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{tpl.name}</span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">{tpl.description}</span>
              <span className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--color-text-quaternary)]">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {describeCron(tpl.cron)}
                </span>
                <span className="flex items-center gap-1">
                  <FolderOpen size={10} />
                  {tpl.workspace}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export function AutomationPanel({ automations, now, onCreate, onToggle, onDelete, onRunNow }: AutomationPanelProps) {
  const [modal, setModal] = useState<'none' | 'create' | 'template'>('none');
  const [initialForm, setInitialForm] = useState<AutomationForm>(emptyForm);
  const { scheduled, completed } = useMemo(() => splitAutomations(automations), [automations]);

  const openCreate = () => {
    setInitialForm(emptyForm);
    setModal('create');
  };

  const pickTemplate = (tpl: AutomationTemplate) => {
    setInitialForm({
      ...emptyForm,
      name: tpl.name,
      prompt: tpl.prompt,
      cron: tpl.cron,
      workspace: tpl.workspace,
    });
    setModal('create');
  };

  const submit = (input: AutomationCreateInput) => {
    onCreate(input);
    setModal('none');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
            <Zap size={18} />
            自动化
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)]">设定定时任务，让 NexaWork 自动为你执行重复性工作</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => setModal('template')}
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <LayoutTemplate size={15} />
            从模板添加
          </button>
          <button
            onClick={openCreate}
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          >
            <Plus size={15} />
            添加
          </button>
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Scheduled */}
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            已安排
            <span className="font-normal">({scheduled.length})</span>
          </h2>
          {scheduled.length === 0 ? (
            <EmptyHint text="还没有已安排的自动化，点击「添加」创建一个" />
          ) : (
            <div className="flex flex-col gap-2">
              {scheduled.map(a => (
                <ScheduledItem
                  key={a.id}
                  automation={a}
                  now={now}
                  onToggle={onToggle}
                  onRunNow={onRunNow}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </section>

        {/* Completed */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            已完成
            <span className="font-normal">({completed.length})</span>
          </h2>
          {completed.length === 0 ? (
            <EmptyHint text="暂无已完成的自动化记录" />
          ) : (
            <div className="flex flex-col gap-2">
              {completed.map(a => (
                <CompletedItem key={a.id} automation={a} onDelete={onDelete} />
              ))}
            </div>
          )}
        </section>
      </div>

      {modal === 'create' && <CreateModal initial={initialForm} onCancel={() => setModal('none')} onSubmit={submit} />}
      {modal === 'template' && <TemplatePicker onCancel={() => setModal('none')} onPick={pickTemplate} />}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-8 text-xs text-[var(--color-text-tertiary)]">
      {text}
    </div>
  );
}
