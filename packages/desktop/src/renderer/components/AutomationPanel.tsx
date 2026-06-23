/**
 * NexaWork AutomationPanel (N18)
 * ==============================
 * Scheduled-automation management surface (WorkBuddy 截图11):
 *  - Header: title "自动化" + description + "添加" / "从模板添加" buttons
 *  - 已安排 (scheduled): status dot (green=running / yellow=paused), name,
 *    workspace, frequency, valid range, live countdown to next run
 *  - 已完成 (completed): result tag (success green / failure red) + delete (X)
 *
 * Data is fetched over IPC and auto-refreshes on the `automation:changed`
 * push event; the countdown re-renders every second.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, LayoutTemplate, Pause, Play, X, Zap, Clock } from 'lucide-react';
import type { AutomationInfo } from '../../shared/ipc-channels';
import { formatScheduleString, formatCountdown, formatDateRange } from '../../shared/schedule';
import { AddAutomationDialog } from './AddAutomationDialog';

// ─── Pure helpers (exported for tests) ────────────────────────
export interface SplitAutomations {
  scheduled: AutomationInfo[];
  completed: AutomationInfo[];
}

/** Partition automations into the 已安排 (active/paused) and 已完成 lists. */
export function splitAutomations(list: AutomationInfo[]): SplitAutomations {
  return {
    scheduled: list.filter(a => a.status === 'active' || a.status === 'paused'),
    completed: list.filter(a => a.status === 'completed'),
  };
}

/** Status-dot color for the scheduled list. */
export function statusDotColor(status: AutomationInfo['status']): string {
  switch (status) {
    case 'active':
      return 'var(--color-accent-green, #10B981)';
    case 'paused':
      return 'var(--color-accent-yellow, #F59E0B)';
    case 'completed':
      return 'var(--color-text-tertiary, #9CA3AF)';
  }
}

export interface ResultTag {
  label: string;
  color: string;
}

/** Result label/color for a completed automation's last run. */
export function resultTag(status?: 'success' | 'failure'): ResultTag {
  if (status === 'failure') {
    return { label: '失败', color: 'var(--color-accent-red, #EF4444)' };
  }
  return { label: '成功', color: 'var(--color-accent-green, #10B981)' };
}

// ─── Scheduled row ────────────────────────────────────────────
function ScheduledItem({
  automation,
  now,
  onPause,
  onResume,
}: {
  automation: AutomationInfo;
  now: Date;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const isActive = automation.status === 'active';
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 transition-colors hover:bg-[var(--color-bg-hover)]">
      <span
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: statusDotColor(automation.status) }}
        aria-label={isActive ? '运行中' : '已暂停'}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{automation.name}</span>
          {automation.workspace && (
            <span className="truncate rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
              {automation.workspace}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--color-text-tertiary)]">
          <span>{formatScheduleString(automation.cron)}</span>
          <span>{formatDateRange(automation.validFrom, automation.validTo)}</span>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="flex items-center gap-1 text-[12px] text-[var(--color-text-secondary)]">
          <Clock size={12} />
          {isActive ? formatCountdown(automation.nextRun, now) : '已暂停'}
        </span>
        <button
          onClick={() => (isActive ? onPause(automation.id) : onResume(automation.id))}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          title={isActive ? '暂停' : '恢复'}
        >
          {isActive ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Completed row ────────────────────────────────────────────
function CompletedItem({ automation, onDelete }: { automation: AutomationInfo; onDelete: (id: string) => void }) {
  const tag = resultTag(automation.lastRunStatus);
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3">
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{automation.name}</span>
          {automation.workspace && (
            <span className="truncate rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
              {automation.workspace}
            </span>
          )}
        </div>
        <span className="text-[12px] text-[var(--color-text-tertiary)]">
          {automation.lastRun ? new Date(automation.lastRun).toLocaleString('zh-CN') : '—'}
        </span>
      </div>
      <span
        className="flex-shrink-0 rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-medium text-white"
        style={{ backgroundColor: tag.color }}
      >
        {tag.label}
      </span>
      <button
        onClick={() => onDelete(automation.id)}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-accent-red,#EF4444)] hover:text-white"
        title="删除"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 mt-6 flex items-center gap-2 first:mt-0">
      <h2 className="text-[13px] font-semibold text-[var(--color-text-secondary)]">{title}</h2>
      <span className="rounded-full bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
        {count}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export function AutomationPanel() {
  const [automations, setAutomations] = useState<AutomationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    const api = window.nexawork;
    if (!api) {
      setLoading(false);
      return;
    }
    const result = await api.automation.list({});
    setAutomations(result.automations);
    setLoading(false);
  }, []);

  // Initial load + live refresh on push events.
  useEffect(() => {
    void refresh();
    const api = window.nexawork;
    const unsub = api?.automation.onChanged(() => void refresh());
    return () => unsub?.();
  }, [refresh]);

  // Tick the countdown once per second.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handlePause = useCallback(
    async (id: string) => {
      await window.nexawork?.automation.pause({ id });
      void refresh();
    },
    [refresh],
  );

  const handleResume = useCallback(
    async (id: string) => {
      await window.nexawork?.automation.resume({ id });
      void refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await window.nexawork?.automation.delete({ id });
      void refresh();
    },
    [refresh],
  );

  const { scheduled, completed } = useMemo(() => splitAutomations(automations), [automations]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
            <Zap size={20} />
            自动化
          </h1>
          <p className="text-[13px] text-[var(--color-text-tertiary)]">
            设定定时任务，让 AI 按计划自动执行你的工作流。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
          >
            <LayoutTemplate size={15} />
            从模板添加
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            添加
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-tertiary)]">加载中…</div>
        ) : automations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]">
              <Zap size={26} />
            </div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">还没有自动化任务</p>
            <p className="max-w-xs text-[13px] text-[var(--color-text-tertiary)]">
              点击「添加」创建你的第一个定时任务。
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-1 flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-bg-primary)] transition-opacity hover:opacity-90"
            >
              <Plus size={15} />
              添加自动化
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            {scheduled.length > 0 && (
              <>
                <SectionHeading title="已安排" count={scheduled.length} />
                <div className="flex flex-col gap-2">
                  {scheduled.map(a => (
                    <ScheduledItem key={a.id} automation={a} now={now} onPause={handlePause} onResume={handleResume} />
                  ))}
                </div>
              </>
            )}
            {completed.length > 0 && (
              <>
                <SectionHeading title="已完成" count={completed.length} />
                <div className="flex flex-col gap-2">
                  {completed.map(a => (
                    <CompletedItem key={a.id} automation={a} onDelete={handleDelete} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <AddAutomationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}
