/**
 * NexaWork AddAutomationDialog — Add-automation form modal (N19, WorkBuddy 截图12)
 *
 * 弹窗标题「添加自动化任务」，字段：
 * - 名称（必填）
 * - 工作空间（可选，下拉 + 新建）
 * - 提示词（多行 200px + 底部工具栏：模型 / 技能 / 召唤专家 / 权限）
 * - 连接器（MCP Server 下拉）
 * - 执行频率（Tab：周期 / 按间隔 / 单次）
 * - 生效日期区间
 * - 底部：取消（灰描边）/ 添加（黑实心）
 *
 * Apple-level 白底黑字。Schedule→cron 转换与校验在 shared/automation-schedule.ts
 * （纯函数，便于测试）。
 */
import { useMemo, useState } from 'react';
import {
  X,
  Plus,
  ChevronDown,
  Sparkles,
  Wand2,
  Users,
  ShieldCheck,
  AlertTriangle,
  Plug,
  Repeat,
  Timer,
  CalendarClock,
} from 'lucide-react';
import type { AutomationCreateInput, DesktopPermissionMode } from '../../shared/ipc-channels';
import {
  type ScheduleMode,
  type RecurringUnit,
  type IntervalUnit,
  type ScheduleSpec,
  buildCron,
  validateSchedule,
  WEEKDAY_LABELS,
} from '../../shared/automation-schedule';
import { builtinModels } from './ModelSelector';
import { defaultSkills } from './SkillSearchPanel';
import { defaultExperts } from './ExpertListPage';
import { permissionModeConfigs } from './PermissionSelector';

// ─── Connectors (MCP Server list) ─────────────────────────────
export interface ConnectorOption {
  id: string;
  name: string;
}

export const availableConnectors: ConnectorOption[] = [
  { id: '', name: '不使用连接器' },
  { id: 'filesystem', name: '文件系统' },
  { id: 'github', name: 'GitHub' },
  { id: 'database', name: '数据库' },
  { id: 'web-search', name: 'Web 搜索' },
  { id: 'slack', name: 'Slack' },
];

// ─── Form model ───────────────────────────────────────────────
export interface AddAutomationForm {
  name: string;
  workspace: string;
  prompt: string;
  connector: string;
  model: string;
  skill: string;
  expert: string;
  permissionMode: DesktopPermissionMode;
  scheduleMode: ScheduleMode;
  recurringUnit: RecurringUnit;
  weekdays: number[];
  time: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  onceDate: string;
  onceTime: string;
  startDate: string;
  endDate: string;
}

export const emptyAddForm: AddAutomationForm = {
  name: '',
  workspace: '',
  prompt: '',
  connector: '',
  model: 'auto',
  skill: '',
  expert: '',
  permissionMode: 'default',
  scheduleMode: 'recurring',
  recurringUnit: 'daily',
  weekdays: [1, 2, 3, 4, 5],
  time: '08:00',
  intervalValue: 1,
  intervalUnit: 'hour',
  onceDate: '',
  onceTime: '09:00',
  startDate: '',
  endDate: '',
};

export const DEFAULT_WORKSPACES = ['产品开发', '市场营销', '运维', '个人'];

/** Expand a cron day-of-week field (e.g. "1-5", "1,3", "*") into weekday numbers. */
function expandDow(field: string): number[] {
  if (field === '*') return [];
  const days = new Set<number>();
  for (const part of field.split(',')) {
    const [a, b] = part.split('-');
    const start = Number.parseInt(a, 10);
    const end = b !== undefined ? Number.parseInt(b, 10) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let d = start; d <= end; d++) days.add(d % 7);
  }
  return Array.from(days).sort((x, y) => x - y);
}

/** Prefill an add-automation form from a template's recurring cron expression. */
export function templateToAddForm(tpl: {
  name: string;
  prompt: string;
  workspace: string;
  cron: string;
}): AddAutomationForm {
  const fields = tpl.cron.trim().split(/\s+/);
  const base: AddAutomationForm = {
    ...emptyAddForm,
    name: tpl.name,
    prompt: tpl.prompt,
    workspace: tpl.workspace,
  };
  if (fields.length !== 5) return base;
  const [min, hour, , , dow] = fields;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    base.time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  const weekdays = expandDow(dow);
  if (weekdays.length > 0) {
    base.recurringUnit = 'weekly';
    base.weekdays = weekdays;
  } else {
    base.recurringUnit = 'daily';
  }
  return base;
}

function toSpec(form: AddAutomationForm): ScheduleSpec {
  return {
    mode: form.scheduleMode,
    recurringUnit: form.recurringUnit,
    weekdays: form.weekdays,
    time: form.time,
    intervalValue: form.intervalValue,
    intervalUnit: form.intervalUnit,
    onceDate: form.onceDate,
    onceTime: form.onceTime,
  };
}

/** Returns a list of validation error messages (empty = valid). */
export function validateAddForm(form: AddAutomationForm): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('请填写任务名称');
  if (!form.prompt.trim()) errors.push('请填写提示词');
  const scheduleError = validateSchedule(toSpec(form));
  if (scheduleError) errors.push(scheduleError);
  return errors;
}

export function isAddFormValid(form: AddAutomationForm): boolean {
  return validateAddForm(form).length === 0;
}

/** Build the create payload sent over IPC. Assumes the form is valid. */
export function addFormToCreateInput(form: AddAutomationForm): AutomationCreateInput {
  const cron = buildCron(toSpec(form)) ?? '0 8 * * *';
  const input: AutomationCreateInput = {
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    cron,
    workspace: form.workspace.trim() || '默认工作区',
  };
  if (form.scheduleMode === 'once') {
    input.startDate = form.onceDate || undefined;
    input.endDate = form.onceDate || undefined;
  } else {
    input.startDate = form.startDate || undefined;
    input.endDate = form.endDate || undefined;
  }
  if (form.connector) input.connector = form.connector;
  if (form.model && form.model !== 'auto') input.model = form.model;
  if (form.skill) input.skill = form.skill;
  if (form.expert) input.expert = form.expert;
  if (form.permissionMode !== 'default') input.permissionMode = form.permissionMode;
  return input;
}

// ─── Generic compact dropdown (toolbar / connector) ───────────
interface DropdownOption {
  value: string;
  label: string;
}

function InlineDropdown({
  icon,
  value,
  options,
  onChange,
  ariaLabel,
  danger,
}: {
  icon: React.ReactNode;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find(o => o.value === value) ?? options[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-medium transition-colors duration-[var(--duration-fast)] ${
          danger
            ? 'text-[var(--color-accent-orange)] hover:bg-[var(--color-accent-orange)]/10'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        {icon}
        <span className="max-w-[120px] truncate">{active?.label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[var(--z-dropdown)]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute bottom-full left-0 z-[var(--z-dropdown)] mb-1 max-h-60 w-52 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-1 shadow-[var(--shadow-dropdown)]"
            role="listbox"
            aria-label={ariaLabel}
          >
            {options.map(opt => (
              <button
                key={opt.value || '__none__'}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-xs transition-colors duration-[var(--duration-fast)] ${
                  opt.value === value
                    ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const FREQUENCY_TABS: { id: ScheduleMode; label: string; icon: React.ReactNode }[] = [
  { id: 'recurring', label: '周期', icon: <Repeat size={13} /> },
  { id: 'interval', label: '按间隔', icon: <Timer size={13} /> },
  { id: 'once', label: '单次', icon: <CalendarClock size={13} /> },
];

const INTERVAL_UNITS: { id: IntervalUnit; label: string }[] = [
  { id: 'minute', label: '分钟' },
  { id: 'hour', label: '小时' },
  { id: 'day', label: '天' },
];

const fieldClass =
  'h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-text-primary)]';

// ─── Dialog ───────────────────────────────────────────────────
export interface AddAutomationDialogProps {
  initial: AddAutomationForm;
  workspaces?: string[];
  onCancel: () => void;
  onSubmit: (input: AutomationCreateInput) => void;
}

export function AddAutomationDialog({ initial, workspaces, onCancel, onSubmit }: AddAutomationDialogProps) {
  const [form, setForm] = useState<AddAutomationForm>(initial);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const errors = useMemo(() => validateAddForm(form), [form]);
  const valid = errors.length === 0;

  const set = <K extends keyof AddAutomationForm>(key: K, value: AddAutomationForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const workspaceOptions = useMemo(() => {
    const base = workspaces && workspaces.length > 0 ? workspaces : DEFAULT_WORKSPACES;
    return Array.from(new Set([form.workspace, ...base].filter(Boolean)));
  }, [workspaces, form.workspace]);

  const toggleWeekday = (day: number) =>
    setForm(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(day) ? prev.weekdays.filter(d => d !== day) : [...prev.weekdays, day],
    }));

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="添加自动化任务"
    >
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">添加自动化任务</span>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* 名称 */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              名称<span className="text-[var(--color-accent-red)]">*</span>
            </span>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="例如：每日销售报表"
              className={fieldClass}
              aria-label="任务名称"
            />
          </label>

          {/* 工作空间 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">工作空间</span>
            {creatingWorkspace ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={form.workspace}
                  onChange={e => set('workspace', e.target.value)}
                  placeholder="输入新工作空间名称"
                  className={`${fieldClass} flex-1`}
                  aria-label="新工作空间名称"
                />
                <button
                  type="button"
                  onClick={() => setCreatingWorkspace(false)}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                >
                  完成
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={form.workspace}
                  onChange={e => set('workspace', e.target.value)}
                  className={`${fieldClass} flex-1`}
                  aria-label="选择工作空间"
                >
                  <option value="">（可选）选择工作空间</option>
                  {workspaceOptions.map(ws => (
                    <option key={ws} value={ws}>
                      {ws}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    set('workspace', '');
                    setCreatingWorkspace(true);
                  }}
                  className="flex h-9 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                >
                  <Plus size={13} />
                  添加
                </button>
              </div>
            )}
          </div>

          {/* 提示词 + 工具栏 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              提示词<span className="text-[var(--color-accent-red)]">*</span>
            </span>
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] focus-within:border-[var(--color-text-primary)]">
              <textarea
                value={form.prompt}
                onChange={e => set('prompt', e.target.value)}
                placeholder="描述要自动执行的任务，例如：汇总昨日核心数据并生成可视化报表"
                style={{ height: 200 }}
                className="w-full resize-none bg-transparent px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none"
                aria-label="提示词"
              />
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5">
                <InlineDropdown
                  ariaLabel="选择模型"
                  icon={<Sparkles size={12} />}
                  value={form.model}
                  onChange={v => set('model', v)}
                  options={builtinModels.map(m => ({ value: m.id, label: m.name }))}
                />
                <InlineDropdown
                  ariaLabel="选择技能"
                  icon={<Wand2 size={12} />}
                  value={form.skill}
                  onChange={v => set('skill', v)}
                  options={[{ value: '', label: '技能' }, ...defaultSkills.map(s => ({ value: s.id, label: s.name }))]}
                />
                <InlineDropdown
                  ariaLabel="召唤专家"
                  icon={<Users size={12} />}
                  value={form.expert}
                  onChange={v => set('expert', v)}
                  options={[
                    { value: '', label: '召唤专家' },
                    ...defaultExperts.map(e => ({ value: e.id, label: e.name })),
                  ]}
                />
                <div className="ml-auto">
                  <InlineDropdown
                    ariaLabel="权限模式"
                    danger={form.permissionMode === 'full'}
                    icon={form.permissionMode === 'full' ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                    value={form.permissionMode}
                    onChange={v => set('permissionMode', v as DesktopPermissionMode)}
                    options={permissionModeConfigs.map(c => ({ value: c.id, label: c.label }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 连接器 */}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
              <Plug size={12} />
              连接器
            </span>
            <select
              value={form.connector}
              onChange={e => set('connector', e.target.value)}
              className={fieldClass}
              aria-label="选择连接器"
            >
              {availableConnectors.map(c => (
                <option key={c.id || '__none__'} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {/* 执行频率 */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">执行频率</span>
            <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] p-1">
              {FREQUENCY_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => set('scheduleMode', tab.id)}
                  aria-pressed={form.scheduleMode === tab.id}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-1.5 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
                    form.scheduleMode === tab.id
                      ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 周期 */}
            {form.scheduleMode === 'recurring' && (
              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex items-center gap-2">
                  <select
                    value={form.recurringUnit}
                    onChange={e => set('recurringUnit', e.target.value as RecurringUnit)}
                    className={`${fieldClass} flex-1`}
                    aria-label="周期单位"
                  >
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                  </select>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => set('time', e.target.value)}
                    className={`${fieldClass} flex-1`}
                    aria-label="执行时间"
                  />
                </div>
                {form.recurringUnit === 'weekly' && (
                  <div className="flex gap-1.5">
                    {WEEKDAY_LABELS.map((label, day) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeekday(day)}
                        aria-pressed={form.weekdays.includes(day)}
                        aria-label={`周${label}`}
                        className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
                          form.weekdays.includes(day)
                            ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                            : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 按间隔 */}
            {form.scheduleMode === 'interval' && (
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">每</span>
                <input
                  type="number"
                  min={1}
                  value={form.intervalValue}
                  onChange={e => set('intervalValue', Number.parseInt(e.target.value, 10) || 0)}
                  className={`${fieldClass} w-20`}
                  aria-label="间隔数值"
                />
                <select
                  value={form.intervalUnit}
                  onChange={e => set('intervalUnit', e.target.value as IntervalUnit)}
                  className={`${fieldClass} flex-1`}
                  aria-label="间隔单位"
                >
                  {INTERVAL_UNITS.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--color-text-tertiary)]">执行一次</span>
              </div>
            )}

            {/* 单次 */}
            {form.scheduleMode === 'once' && (
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <input
                  type="date"
                  value={form.onceDate}
                  onChange={e => set('onceDate', e.target.value)}
                  className={`${fieldClass} flex-1`}
                  aria-label="执行日期"
                />
                <input
                  type="time"
                  value={form.onceTime}
                  onChange={e => set('onceTime', e.target.value)}
                  className={`${fieldClass} flex-1`}
                  aria-label="执行时间"
                />
              </div>
            )}
          </div>

          {/* 生效日期区间（周期 / 间隔） */}
          {form.scheduleMode !== 'once' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">生效日期</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className={`${fieldClass} flex-1`}
                  aria-label="生效开始日期"
                />
                <span className="text-xs text-[var(--color-text-tertiary)]">至</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => set('endDate', e.target.value)}
                  className={`${fieldClass} flex-1`}
                  aria-label="生效结束日期"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit(addFormToCreateInput(form))}
            className="h-9 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-5 text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
