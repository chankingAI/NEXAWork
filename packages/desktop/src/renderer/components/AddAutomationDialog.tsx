/**
 * NexaWork AddAutomationDialog (N19)
 * ==================================
 * Modal form to create a scheduled automation (WorkBuddy 截图12):
 *  - 名称 (required) / 工作空间 (optional) / 提示词 (required, multiline)
 *  - 连接器 (optional MCP connector dropdown)
 *  - 执行频率 tabs: 周期 (day/week + time) / 按间隔 (n + unit) / 单次 (datetime)
 *  - 生效日期区间 (start / end date pickers)
 *  - 取消 (outline) / 添加 (solid black)
 *
 * The selected frequency is serialized via schedule.ts and submitted through
 * the `automation:create` IPC channel.
 */
import { useState, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  serializeSchedule,
  type ScheduleConfig,
  type ScheduleKind,
  type IntervalUnit,
  isValidTime,
} from '../../shared/schedule';
import type { AutomationCreateInput } from '../../shared/ipc-channels';

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
];

const INTERVAL_UNITS: { value: IntervalUnit; label: string }[] = [
  { value: 'minute', label: '分钟' },
  { value: 'hour', label: '小时' },
  { value: 'day', label: '天' },
];

// ─── Form state ───────────────────────────────────────────────
export interface AutomationFormState {
  name: string;
  workspace: string;
  prompt: string;
  connector: string;
  kind: ScheduleKind;
  periodicUnit: 'day' | 'week';
  weekday: number;
  time: string;
  intervalEvery: number;
  intervalUnit: IntervalUnit;
  onceAt: string;
  startDate: string;
  endDate: string;
}

export function emptyForm(): AutomationFormState {
  return {
    name: '',
    workspace: '',
    prompt: '',
    connector: '',
    kind: 'periodic',
    periodicUnit: 'day',
    weekday: 1,
    time: '08:00',
    intervalEvery: 1,
    intervalUnit: 'hour',
    onceAt: '',
    startDate: '',
    endDate: '',
  };
}

// ─── Pure helpers (exported for tests) ────────────────────────
/** Build a ScheduleConfig from the current form, or null if invalid. */
export function buildScheduleConfig(form: AutomationFormState): ScheduleConfig | null {
  switch (form.kind) {
    case 'periodic':
      if (!isValidTime(form.time)) return null;
      return form.periodicUnit === 'week'
        ? {
            type: 'periodic',
            unit: 'week',
            weekday: form.weekday,
            time: form.time,
          }
        : { type: 'periodic', unit: 'day', time: form.time };
    case 'interval':
      if (!Number.isFinite(form.intervalEvery) || form.intervalEvery <= 0) return null;
      return {
        type: 'interval',
        every: form.intervalEvery,
        unit: form.intervalUnit,
      };
    case 'once': {
      if (!form.onceAt) return null;
      const at = new Date(form.onceAt);
      if (Number.isNaN(at.getTime())) return null;
      return { type: 'once', at: at.toISOString() };
    }
  }
}

export interface FormErrors {
  name?: string;
  prompt?: string;
  schedule?: string;
}

/** Validate the form. Returns a map of field → message (empty when valid). */
export function validateAutomationForm(form: AutomationFormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = '请输入任务名称';
  if (!form.prompt.trim()) errors.prompt = '请输入提示词';
  if (!buildScheduleConfig(form)) errors.schedule = '请正确设置执行频率';
  return errors;
}

/** Convert a valid form into the IPC create payload. */
export function toCreateInput(form: AutomationFormState): AutomationCreateInput | null {
  const config = buildScheduleConfig(form);
  if (!config) return null;
  return {
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    cron: serializeSchedule(config),
    workspace: form.workspace.trim(),
    connector: form.connector.trim() || undefined,
    startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
    endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
  };
}

// ─── UI primitives ────────────────────────────────────────────
const fieldLabel = 'text-[13px] font-medium text-[var(--color-text-secondary)]';
const inputBase =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-text-primary)]';

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────
export function AddAutomationDialog({
  open,
  onClose,
  onCreated,
  initialForm,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialForm?: Partial<AutomationFormState>;
}) {
  const [form, setForm] = useState<AutomationFormState>(() => ({
    ...emptyForm(),
    ...initialForm,
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = useCallback(<K extends keyof AutomationFormState>(key: K, value: AutomationFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const validation = validateAutomationForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const payload = toCreateInput(form);
    if (!payload) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await window.nexawork?.automation.create(payload);
      setForm(emptyForm());
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [form, onCreated]);

  const hasError = useMemo(() => Object.keys(errors).length > 0, [errors]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">添加自动化任务</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* 名称 */}
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel}>
              名称 <span className="text-[var(--color-accent-red,#EF4444)]">*</span>
            </label>
            <input
              className={inputBase}
              placeholder="例如：每日早报"
              value={form.name}
              onChange={e => update('name', e.target.value)}
            />
            {errors.name && <span className="text-[12px] text-[var(--color-accent-red,#EF4444)]">{errors.name}</span>}
          </div>

          {/* 工作空间 */}
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel}>工作空间</label>
            <input
              className={inputBase}
              placeholder="可选，关联的项目 / 目录"
              value={form.workspace}
              onChange={e => update('workspace', e.target.value)}
            />
          </div>

          {/* 提示词 */}
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel}>
              提示词 <span className="text-[var(--color-accent-red,#EF4444)]">*</span>
            </label>
            <textarea
              className={`${inputBase} resize-none`}
              style={{ height: 120 }}
              placeholder="描述这个自动化任务要做什么…"
              value={form.prompt}
              onChange={e => update('prompt', e.target.value)}
            />
            {errors.prompt && (
              <span className="text-[12px] text-[var(--color-accent-red,#EF4444)]">{errors.prompt}</span>
            )}
          </div>

          {/* 连接器 */}
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel}>连接器</label>
            <input
              className={inputBase}
              placeholder="可选，MCP 连接器名称"
              value={form.connector}
              onChange={e => update('connector', e.target.value)}
            />
          </div>

          {/* 执行频率 */}
          <div className="flex flex-col gap-2">
            <label className={fieldLabel}>执行频率</label>
            <div className="flex gap-1 rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)] p-1">
              <TabButton active={form.kind === 'periodic'} onClick={() => update('kind', 'periodic')}>
                周期
              </TabButton>
              <TabButton active={form.kind === 'interval'} onClick={() => update('kind', 'interval')}>
                按间隔
              </TabButton>
              <TabButton active={form.kind === 'once'} onClick={() => update('kind', 'once')}>
                单次
              </TabButton>
            </div>

            {form.kind === 'periodic' && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={`${inputBase} w-auto flex-none`}
                  value={form.periodicUnit}
                  onChange={e => update('periodicUnit', e.target.value as 'day' | 'week')}
                >
                  <option value="day">每天</option>
                  <option value="week">每周</option>
                </select>
                {form.periodicUnit === 'week' && (
                  <select
                    className={`${inputBase} w-auto flex-none`}
                    value={form.weekday}
                    onChange={e => update('weekday', Number(e.target.value))}
                  >
                    {WEEKDAYS.map(d => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="time"
                  className={`${inputBase} w-auto flex-none`}
                  value={form.time}
                  onChange={e => update('time', e.target.value)}
                />
              </div>
            )}

            {form.kind === 'interval' && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--color-text-secondary)]">每</span>
                <input
                  type="number"
                  min={1}
                  className={`${inputBase} w-20 flex-none`}
                  value={form.intervalEvery}
                  onChange={e => update('intervalEvery', Number(e.target.value))}
                />
                <select
                  className={`${inputBase} w-auto flex-none`}
                  value={form.intervalUnit}
                  onChange={e => update('intervalUnit', e.target.value as IntervalUnit)}
                >
                  {INTERVAL_UNITS.map(u => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.kind === 'once' && (
              <input
                type="datetime-local"
                className={inputBase}
                value={form.onceAt}
                onChange={e => update('onceAt', e.target.value)}
              />
            )}
            {errors.schedule && (
              <span className="text-[12px] text-[var(--color-accent-red,#EF4444)]">{errors.schedule}</span>
            )}
          </div>

          {/* 生效日期区间 */}
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel}>生效日期区间</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className={inputBase}
                value={form.startDate}
                onChange={e => update('startDate', e.target.value)}
              />
              <span className="text-[var(--color-text-tertiary)]">~</span>
              <input
                type="date"
                className={inputBase}
                value={form.endDate}
                onChange={e => update('endDate', e.target.value)}
              />
            </div>
          </div>

          {submitError && (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-accent-red,#EF4444)]/10 px-3 py-2 text-[12px] text-[var(--color-accent-red,#EF4444)]">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || hasError}
            className="rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '添加中…' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
