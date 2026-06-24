/**
 * NexaWork SkillGenerateDialog — generate a skill from a recording (N27).
 *
 * Shown after a recording stops when the user chooses "生成技能". It analyses
 * the recording over IPC (detecting parameterizable variables via the same
 * heuristics as the recorder), lets the user confirm / edit the skill name,
 * description, when-to-use hint and each detected variable's name + default,
 * then calls {@link useRecordedSkills.create} to render the SKILL.md +
 * workflow.js bundle and persist it under `.claude/skills/`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Variable, X } from 'lucide-react';
import type { RecordedSkill, RecordingAnalysis, SkillVariable } from '../../shared/ipc-channels';
import { useI18n } from '../hooks/useI18n';
import type { MessageKey } from '../i18n';
import { useRecordedSkills } from '../hooks/useRecordedSkills';

export interface SkillGenerateDialogProps {
  recordingId: string;
  /** Pre-fill the skill name (e.g. the recording's task description). */
  defaultName?: string;
  onClose: () => void;
  onGenerated: (skill: RecordedSkill) => void;
}

const VAR_TYPE_KEY: Record<SkillVariable['type'], MessageKey> = {
  string: 'skill.varType.string',
  number: 'skill.varType.number',
  date: 'skill.varType.date',
  email: 'skill.varType.email',
  url: 'skill.varType.url',
  boolean: 'skill.varType.boolean',
};

export function SkillGenerateDialog({ recordingId, defaultName, onClose, onGenerated }: SkillGenerateDialogProps) {
  const { t } = useI18n();
  const skills = useRecordedSkills();
  const [analysis, setAnalysis] = useState<RecordingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(defaultName ?? '');
  const [description, setDescription] = useState('');
  const [whenToUse, setWhenToUse] = useState('');
  const [variables, setVariables] = useState<SkillVariable[]>([]);

  const analyze = skills.analyze;
  useEffect(() => {
    let active = true;
    setLoading(true);
    void analyze(recordingId).then(result => {
      if (!active) return;
      setAnalysis(result);
      setVariables(result?.variables ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [recordingId, analyze]);

  const stepCount = analysis?.steps.length ?? 0;
  const canGenerate = useMemo(() => name.trim().length > 0 && !busy, [name, busy]);

  const updateVariable = (index: number, patch: Partial<SkillVariable>) => {
    setVariables(prev => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const generate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    const skill = await skills.create({
      recordingId,
      name: name.trim(),
      description: description.trim(),
      whenToUse: whenToUse.trim() || undefined,
      variables,
    });
    setBusy(false);
    if (skill) onGenerated(skill);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('skill.gen.title')}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--color-accent-red)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t('skill.gen.title')}</div>
              <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t('skill.gen.subtitle')}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('skill.gen.cancel')}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-text-secondary)]">{t('skill.gen.name')}</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
              />
            </label>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs text-[var(--color-text-secondary)]">{t('skill.gen.description')}</span>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
              />
            </label>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs text-[var(--color-text-secondary)]">{t('skill.gen.whenToUse')}</span>
              <input
                value={whenToUse}
                onChange={e => setWhenToUse(e.target.value)}
                className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
              />
            </label>

            <div className="mt-5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
              <Variable size={12} />
              {t('skill.gen.variables')} · {variables.length}
              <span className="ml-auto font-normal normal-case text-[var(--color-text-quaternary)]">
                {t('skill.gen.stepCount').replace('{count}', String(stepCount))}
              </span>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              {variables.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-[11px] text-[var(--color-text-quaternary)]">
                  {t('skill.gen.noVariables')}
                </div>
              ) : (
                variables.map((v, index) => (
                  <div
                    key={`${v.stepIndex}-${index}`}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-[var(--radius-full)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                        {t(VAR_TYPE_KEY[v.type])}
                      </span>
                      {v.confidence !== undefined && (
                        <span className="text-[10px] text-[var(--color-text-quaternary)]">
                          {Math.round(v.confidence * 100)}%
                        </span>
                      )}
                      {v.reason && (
                        <span className="ml-auto truncate text-[10px] text-[var(--color-text-quaternary)]">
                          {v.reason}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--color-text-quaternary)]">
                          {t('skill.gen.varName')}
                        </span>
                        <input
                          value={v.name}
                          onChange={e => updateVariable(index, { name: e.target.value })}
                          className="h-7 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 font-mono text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--color-text-quaternary)]">
                          {t('skill.gen.varDefault')}
                        </span>
                        <input
                          value={v.defaultValue}
                          onChange={e => updateVariable(index, { defaultValue: e.target.value })}
                          className="h-7 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 text-[11px] text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-accent-blue)]"
                        />
                      </label>
                    </div>
                    <label className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                      <input
                        type="checkbox"
                        checked={v.required}
                        onChange={e => updateVariable(index, { required: e.target.checked })}
                      />
                      {t('skill.var.required')}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            {t('skill.gen.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!canGenerate}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-lg)] bg-[var(--color-text-primary)] text-sm font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {t('skill.gen.generate')}
          </button>
        </div>
      </div>
    </div>
  );
}
