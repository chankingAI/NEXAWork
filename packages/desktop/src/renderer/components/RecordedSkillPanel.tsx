/**
 * NexaWork RecordedSkillPanel — recorded-skill management surface (N27).
 *
 * Two-pane layout faithful to the prompt:
 *  - Left: the skill list (icon + name + description + step count + last-used
 *    time) with a right-click menu (run / edit / duplicate / export / delete)
 *    and a fuzzy search box.
 *  - Right: the detail pane for the selected skill — a step preview, the
 *    variable list, execution history and the success-rate / run-count stats.
 *
 * Running a skill opens a parameter form generated from the skill's variables
 * (the same Zod schema that {@link buildSchemaSource} renders) and, once valid,
 * builds a replay file and starts playback over IPC.
 *
 * Edit mode turns the step preview into a drag-reorderable list with per-step
 * delete, an inline value editor and an "add wait step" affordance — every edit
 * is persisted immediately and re-broadcast to all windows.
 *
 * The panel is a controlled view over {@link useRecordedSkills}; it owns only
 * UI state (selection, the open modal, edit mode, the in-flight form).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  GripVertical,
  History,
  Keyboard,
  ListOrdered,
  MousePointerClick,
  Move,
  Pencil,
  Play,
  Plus,
  ScrollText,
  Search,
  Sparkles,
  Timer,
  Trash2,
  Type as TypeIcon,
  Variable,
  X,
} from 'lucide-react';
import type { RecordedSkill, SkillStep, SkillStepType, SkillSummary, SkillVariable } from '../../shared/ipc-channels';
import { computeSuccessRate, estimateExecutionTime, validateSkillParams } from '../../shared/skill';
import { useI18n } from '../hooks/useI18n';
import type { MessageKey } from '../i18n';
import { useRecordedSkills } from '../hooks/useRecordedSkills';

export interface RecordedSkillPanelProps {
  /** Invoked after a skill launches so the host can reveal the replay view. */
  onExecuted?: () => void;
}

/** Map a coarse step category to a representative icon. */
function stepIcon(type: SkillStepType): typeof MousePointerClick {
  switch (type) {
    case 'type':
      return TypeIcon;
    case 'key':
      return Keyboard;
    case 'scroll':
      return ScrollText;
    case 'move':
    case 'drag':
      return Move;
    case 'wait':
      return Timer;
    default:
      return MousePointerClick;
  }
}

/** Format ms as m:ss (or s for sub-minute durations). */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Format a past timestamp as a compact relative time. */
function formatRelative(ts: number | undefined, neverLabel: string): string {
  if (!ts) return neverLabel;
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

const VAR_TYPE_KEY: Record<SkillVariable['type'], MessageKey> = {
  string: 'skill.varType.string',
  number: 'skill.varType.number',
  date: 'skill.varType.date',
  email: 'skill.varType.email',
  url: 'skill.varType.url',
  boolean: 'skill.varType.boolean',
};

export function RecordedSkillPanel({ onExecuted }: RecordedSkillPanelProps) {
  const { t } = useI18n();
  const skills = useRecordedSkills();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordedSkill | null>(null);
  const [query, setQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [execTarget, setExecTarget] = useState<RecordedSkill | null>(null);

  // Keep the selection valid as the catalog changes; default to the first skill.
  useEffect(() => {
    if (skills.skills.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !skills.skills.some(s => s.id === selectedId)) {
      setSelectedId(skills.skills[0].id);
    }
  }, [skills.skills, selectedId]);

  // Load the full skill whenever the selection changes.
  const loadDetail = skills.get;
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    void loadDetail(selectedId).then(s => {
      if (active) {
        setDetail(s);
        setEditMode(false);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills.skills;
    return skills.skills.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(tag => tag.toLowerCase().includes(q)),
    );
  }, [skills.skills, query]);

  const handleDuplicate = useCallback(
    async (id: string) => {
      const dup = await skills.duplicate(id);
      if (dup) setSelectedId(dup.id);
    },
    [skills.duplicate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm(t('skill.confirmDelete'))) return;
      await skills.remove(id);
    },
    [skills.remove, t],
  );

  const handleExport = useCallback(
    async (id: string) => {
      const result = await skills.exportSkill(id);
      if (!result) return;
      const blob = new Blob([result.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    },
    [skills.exportSkill],
  );

  const openExecute = useCallback(
    async (id: string) => {
      const skill = (await skills.get(id)) ?? detail;
      if (skill) setExecTarget(skill);
    },
    [skills.get, detail],
  );

  return (
    <div className="flex flex-1 overflow-hidden bg-[var(--color-bg-primary)]">
      {/* ─── Left: list ─────────────────────────────────────────── */}
      <div className="flex w-[320px] flex-shrink-0 flex-col border-r border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t('skill.panel.title')}</div>
          <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t('skill.panel.subtitle')}</div>
          <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5">
            <Search size={14} className="flex-shrink-0 text-[var(--color-text-tertiary)]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('skill.list.search')}
              aria-label={t('skill.list.search')}
              className="h-8 flex-1 bg-transparent text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-quaternary)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <Sparkles size={26} className="text-[var(--color-text-quaternary)]" />
              <div className="text-sm text-[var(--color-text-secondary)]">{t('skill.empty.title')}</div>
              <div className="text-xs text-[var(--color-text-tertiary)]">{t('skill.empty.desc')}</div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map(skill => (
                <SkillListItem
                  key={skill.id}
                  skill={skill}
                  active={skill.id === selectedId}
                  onSelect={() => setSelectedId(skill.id)}
                  onContextMenu={(x, y) => setMenu({ id: skill.id, x, y })}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Right: detail ──────────────────────────────────────── */}
      {detail ? (
        <SkillDetail
          key={detail.id}
          skill={detail}
          editMode={editMode}
          onToggleEdit={() => setEditMode(v => !v)}
          onExecute={() => void openExecute(detail.id)}
          onDuplicate={() => void handleDuplicate(detail.id)}
          onExport={() => void handleExport(detail.id)}
          onDelete={() => void handleDelete(detail.id)}
          onPatch={setDetail}
          skillsApi={skills}
          t={t}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <ListOrdered size={28} className="text-[var(--color-text-quaternary)]" />
          <div className="text-sm text-[var(--color-text-secondary)]">{t('skill.detail.empty')}</div>
        </div>
      )}

      {/* ─── Right-click menu ───────────────────────────────────── */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { key: 'skill.menu.execute', icon: <Play size={13} />, onClick: () => void openExecute(menu.id) },
            {
              key: 'skill.menu.edit',
              icon: <Pencil size={13} />,
              onClick: () => {
                setSelectedId(menu.id);
                setEditMode(true);
              },
            },
            { key: 'skill.menu.duplicate', icon: <Copy size={13} />, onClick: () => void handleDuplicate(menu.id) },
            { key: 'skill.menu.export', icon: <Download size={13} />, onClick: () => void handleExport(menu.id) },
            {
              key: 'skill.menu.delete',
              icon: <Trash2 size={13} />,
              danger: true,
              onClick: () => void handleDelete(menu.id),
            },
          ]}
          t={t}
        />
      )}

      {/* ─── Execute (parameter form) ───────────────────────────── */}
      {execTarget && (
        <ExecuteDialog
          skill={execTarget}
          onClose={() => setExecTarget(null)}
          onRun={async params => {
            const startedAt = Date.now();
            let success = true;
            let error: string | undefined;
            try {
              await skills.execute(execTarget.id, params);
            } catch (e) {
              success = false;
              error = e instanceof Error ? e.message : String(e);
            }
            const finishedAt = Date.now();
            const updated = await skills.recordExecution(execTarget.id, {
              startedAt,
              finishedAt,
              durationMs: finishedAt - startedAt,
              success,
              params,
              error,
            });
            if (updated && updated.id === selectedId) setDetail(updated);
            setExecTarget(null);
            onExecuted?.();
          }}
          t={t}
        />
      )}
    </div>
  );
}

// ─── List item ────────────────────────────────────────────────────────────────

function SkillListItem({
  skill,
  active,
  onSelect,
  onContextMenu,
  t,
}: {
  skill: SkillSummary;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (x: number, y: number) => void;
  t: (key: MessageKey) => string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={e => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      aria-current={active ? 'true' : undefined}
      className={`group flex w-full items-start gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)] ${
        active
          ? 'border-[var(--color-text-primary)] bg-[var(--color-bg-secondary)]'
          : 'border-transparent hover:bg-[var(--color-bg-hover)]'
      }`}
    >
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-sm">
        {skill.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-[var(--color-text-primary)]">{skill.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">{skill.description}</div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-text-quaternary)]">
          <span className="flex items-center gap-0.5">
            <ListOrdered size={10} />
            {t('skill.list.steps').replace('{count}', String(skill.stepCount))}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock size={10} />
            {formatRelative(skill.lastUsedAt, t('skill.list.never'))}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Detail pane ────────────────────────────────────────────────────────────────

function SkillDetail({
  skill,
  editMode,
  onToggleEdit,
  onExecute,
  onDuplicate,
  onExport,
  onDelete,
  onPatch,
  skillsApi,
  t,
}: {
  skill: RecordedSkill;
  editMode: boolean;
  onToggleEdit: () => void;
  onExecute: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onPatch: (skill: RecordedSkill) => void;
  skillsApi: ReturnType<typeof useRecordedSkills>;
  t: (key: MessageKey) => string;
}) {
  const successRate = computeSuccessRate(skill.executions);
  const estimated = estimateExecutionTime(skill.steps);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const stats: { key: MessageKey; value: string }[] = [
    { key: 'skill.detail.successRate', value: `${Math.round(successRate * 100)}%` },
    { key: 'skill.detail.executions', value: String(skill.executions.length) },
    { key: 'skill.detail.estimated', value: formatDuration(estimated) },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)] text-lg">
            {skill.icon}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{skill.name}</div>
            <div className="truncate text-xs text-[var(--color-text-tertiary)]">{skill.description}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onExecute}
            className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          >
            <Play size={13} />
            {t('skill.menu.execute')}
          </button>
          <IconButton label={t('skill.menu.edit')} active={editMode} onClick={onToggleEdit}>
            <Pencil size={14} />
          </IconButton>
          <IconButton label={t('skill.menu.duplicate')} onClick={onDuplicate}>
            <Copy size={14} />
          </IconButton>
          <IconButton label={t('skill.menu.export')} onClick={onExport}>
            <Download size={14} />
          </IconButton>
          <IconButton label={t('skill.menu.delete')} danger onClick={onDelete}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-px border-b border-[var(--color-border)] bg-[var(--color-border)]">
        {stats.map(s => (
          <div key={s.key} className="flex flex-col items-center bg-[var(--color-bg-primary)] py-3">
            <span className="text-base font-semibold tabular-nums text-[var(--color-text-primary)]">{s.value}</span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)]">
              <BarChart3 size={10} />
              {t(s.key)}
            </span>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {editMode && (
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">{t('skill.edit.reorderHint')}</span>
            <button
              type="button"
              onClick={async () => {
                const updated = await skillsApi.addWaitStep(skill.id, skill.steps.length - 1);
                if (updated) onPatch(updated);
              }}
              className="flex h-7 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <Plus size={12} />
              {t('skill.edit.addWait')}
            </button>
          </div>
        )}

        {/* Steps */}
        <SectionTitle icon={<ListOrdered size={12} />} label={`${t('skill.detail.steps')} · ${skill.steps.length}`} />
        <div className="mb-5 mt-2 flex flex-col gap-1">
          {skill.steps.map((step, index) => (
            <StepRow
              key={step.id}
              step={step}
              index={index}
              editMode={editMode}
              dragging={dragIndex === index}
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDrop={async () => {
                if (dragIndex === null || dragIndex === index) return;
                const updated = await skillsApi.reorderSteps(skill.id, dragIndex, index);
                setDragIndex(null);
                if (updated) onPatch(updated);
              }}
              onRemove={async () => {
                const updated = await skillsApi.removeStep(skill.id, step.id);
                if (updated) onPatch(updated);
              }}
              onEditDetail={async value => {
                const updated = await skillsApi.updateStep({ id: skill.id, stepId: step.id, detail: value });
                if (updated) onPatch(updated);
              }}
              onEditWait={async ms => {
                const updated = await skillsApi.updateStep({ id: skill.id, stepId: step.id, waitMs: ms });
                if (updated) onPatch(updated);
              }}
              t={t}
            />
          ))}
        </div>

        {/* Variables */}
        <SectionTitle
          icon={<Variable size={12} />}
          label={`${t('skill.detail.variables')} · ${skill.variables.length}`}
        />
        <div className="mb-5 mt-2 flex flex-col gap-1.5">
          {skill.variables.length === 0 ? (
            <EmptyHint label={t('skill.detail.noVariables')} />
          ) : (
            skill.variables.map(v => (
              <div
                key={v.name}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-[var(--color-text-primary)]">{v.name}</span>
                    <span className="rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                      {t(VAR_TYPE_KEY[v.type])}
                    </span>
                    <span
                      className={`text-[10px] ${
                        v.required ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-quaternary)]'
                      }`}
                    >
                      {v.required ? t('skill.var.required') : t('skill.var.optional')}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">{v.label}</div>
                </div>
                <span className="ml-2 max-w-[40%] truncate font-mono text-[11px] text-[var(--color-text-secondary)]">
                  {v.defaultValue}
                </span>
              </div>
            ))
          )}
        </div>

        {/* History */}
        <SectionTitle icon={<History size={12} />} label={t('skill.detail.history')} />
        <div className="mt-2 flex flex-col gap-1">
          {skill.executions.length === 0 ? (
            <EmptyHint label={t('skill.detail.noHistory')} />
          ) : (
            [...skill.executions]
              .reverse()
              .slice(0, 20)
              .map(rec => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5"
                >
                  <span
                    className={`flex items-center gap-1.5 text-[11px] ${
                      rec.success ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        rec.success ? 'bg-[var(--color-accent-green)]' : 'bg-[var(--color-accent-red)]'
                      }`}
                    />
                    {rec.success ? t('skill.history.success') : t('skill.history.failed')}
                  </span>
                  <span className="flex items-center gap-3 text-[10px] text-[var(--color-text-quaternary)]">
                    <span className="font-mono tabular-nums">{formatDuration(rec.durationMs)}</span>
                    <span>{formatRelative(rec.finishedAt, '')}</span>
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step row ────────────────────────────────────────────────────────────────

function StepRow({
  step,
  index,
  editMode,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onRemove,
  onEditDetail,
  onEditWait,
  t,
}: {
  step: SkillStep;
  index: number;
  editMode: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onRemove: () => void;
  onEditDetail: (value: string) => void;
  onEditWait: (ms: number) => void;
  t: (key: MessageKey) => string;
}) {
  const Icon = stepIcon(step.type);
  return (
    <div
      draggable={editMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={e => editMode && e.preventDefault()}
      onDrop={onDrop}
      className={`flex items-start gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 transition-colors duration-[var(--duration-fast)] ${
        dragging
          ? 'border-[var(--color-accent-blue)] bg-[var(--color-bg-secondary)] opacity-60'
          : 'border-transparent hover:bg-[var(--color-bg-hover)]'
      }`}
    >
      {editMode && (
        <span className="mt-0.5 flex-shrink-0 cursor-grab text-[var(--color-text-quaternary)] active:cursor-grabbing">
          <GripVertical size={14} />
        </span>
      )}
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-[10px] font-mono tabular-nums text-[var(--color-text-tertiary)]">
        {index + 1}
      </span>
      <span className="mt-0.5 flex-shrink-0 text-[var(--color-text-tertiary)]">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-[var(--color-text-primary)]">{step.description}</div>
        {editMode && step.type === 'wait' ? (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-text-tertiary)]">{t('skill.edit.waitMs')}</span>
            <input
              type="number"
              defaultValue={step.waitMs ?? 0}
              onBlur={e => onEditWait(Number(e.target.value))}
              className="h-6 w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-1.5 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
            />
          </div>
        ) : editMode && step.detail !== undefined ? (
          <input
            defaultValue={step.detail}
            onBlur={e => onEditDetail(e.target.value)}
            aria-label={t('skill.edit.stepDetail')}
            className="mt-1 h-6 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-accent-blue)]"
          />
        ) : step.detail ? (
          <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-text-quaternary)]">{step.detail}</div>
        ) : null}
      </div>
      {editMode && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('skill.edit.removeStep')}
          className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-quaternary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-red)]/10 hover:text-[var(--color-accent-red)]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ─── Execute dialog (dynamic parameter form) ─────────────────────────────────

function ExecuteDialog({
  skill,
  onClose,
  onRun,
  t,
}: {
  skill: RecordedSkill;
  onClose: () => void;
  onRun: (params: Record<string, string>) => void | Promise<void>;
  t: (key: MessageKey) => string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(skill.variables.map(v => [v.name, v.defaultValue])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    const result = validateSkillParams(skill.variables, values);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    await onRun(result.values);
    setBusy(false);
  }, [skill.variables, values, onRun]);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('skill.exec.title')}
    >
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t('skill.exec.title')}</div>
            <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t('skill.exec.subtitle')}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('skill.exec.cancel')}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {skill.variables.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">{t('skill.exec.noParams')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {skill.variables.map(v => (
                <label key={v.name} className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                    {v.label}
                    {v.required && <span className="text-[var(--color-accent-red)]">*</span>}
                    <span className="font-mono text-[10px] text-[var(--color-text-quaternary)]">{v.name}</span>
                  </span>
                  <input
                    value={values[v.name] ?? ''}
                    onChange={e => setValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                    type={v.type === 'number' ? 'number' : v.type === 'date' ? 'text' : 'text'}
                    placeholder={v.defaultValue}
                    className={`h-9 rounded-[var(--radius-md)] border bg-[var(--color-bg-primary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none transition-colors duration-[var(--duration-fast)] focus:border-[var(--color-accent-blue)] ${
                      errors[v.name] ? 'border-[var(--color-accent-red)]' : 'border-[var(--color-border)]'
                    }`}
                  />
                  {errors[v.name] && (
                    <span className="text-[10px] text-[var(--color-accent-red)]">{errors[v.name]}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            {t('skill.exec.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-lg)] bg-[var(--color-text-primary)] text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:opacity-50"
          >
            <Play size={14} />
            {t('skill.exec.run')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Right-click menu ───────────────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  onClose,
  items,
  t,
}: {
  x: number;
  y: number;
  onClose: () => void;
  items: { key: MessageKey; icon: React.ReactNode; danger?: boolean; onClick: () => void }[];
  t: (key: MessageKey) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handle = () => onClose();
    window.addEventListener('click', handle);
    window.addEventListener('contextmenu', handle);
    return () => {
      window.removeEventListener('click', handle);
      window.removeEventListener('contextmenu', handle);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ top: y, left: x }}
      className="fixed z-[var(--z-modal)] min-w-[150px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-lg)]"
    >
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] ${
            item.danger ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-primary)]'
          }`}
        >
          {item.icon}
          {t(item.key)}
        </button>
      ))}
    </div>
  );
}

// ─── Small shared bits ──────────────────────────────────────────────────────

function IconButton({
  label,
  active,
  danger,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] ${
        active
          ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]'
          : danger
            ? 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-accent-red)]/10 hover:text-[var(--color-accent-red)]'
            : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
      {icon}
      {label}
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-[11px] text-[var(--color-text-quaternary)]">
      {label}
    </div>
  );
}
