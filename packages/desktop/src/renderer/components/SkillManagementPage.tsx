/**
 * NexaWork SkillManagementPage — Full skill lifecycle management (N16)
 * Tabs: 已安装 / 市场 / 我创建. Install flow, import (file/URL/Git), create wizard.
 */
import { useState, useCallback, useMemo } from 'react';
import {
  Package,
  Store,
  PenTool,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Download,
  Shield,
  Check,
  X,
  Plus,
  FileUp,
  Link2,
  GitBranch,
  Play,
} from 'lucide-react';
import { defaultSkills, permissionIcon, type MarketSkill, type SkillPermission } from './SkillSearchPanel';

// ─── Types ────────────────────────────────────────────────────
export type ManagementTab = 'installed' | 'market' | 'created';
export type ImportMethod = 'file' | 'url' | 'git';
export type InstallStep = 'select' | 'permissions' | 'confirm' | 'done';

export interface CreateSkillDraft {
  name: string;
  description: string;
  trigger: string;
  instruction: string;
}

export interface SkillManagementPageProps {
  skills?: MarketSkill[];
  autoUpdate?: boolean;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
  onDeleteSkill: (skillId: string) => void;
  onInstallSkill: (skillId: string) => void;
  onAutoUpdateChange: (enabled: boolean) => void;
  onImportSkill: (method: ImportMethod, value: string) => void;
  onCreateSkill: (draft: CreateSkillDraft) => void;
}

// ─── Tab Metadata ─────────────────────────────────────────────
export const managementTabs: { id: ManagementTab; label: string; icon: React.ReactNode }[] = [
  { id: 'installed', label: '已安装', icon: <Package size={14} /> },
  { id: 'market', label: '市场', icon: <Store size={14} /> },
  { id: 'created', label: '我创建', icon: <PenTool size={14} /> },
];

// ─── Import Method Metadata ───────────────────────────────────
export const importMethods: { id: ImportMethod; label: string; placeholder: string; icon: React.ReactNode }[] = [
  { id: 'file', label: '从文件导入', placeholder: '选择 SKILL.md 文件路径', icon: <FileUp size={14} /> },
  { id: 'url', label: '从 URL 导入', placeholder: 'https://example.com/skill.json', icon: <Link2 size={14} /> },
  {
    id: 'git',
    label: '从 Git 仓库导入',
    placeholder: 'https://github.com/user/skill.git',
    icon: <GitBranch size={14} />,
  },
];

// ─── Install Flow Steps ───────────────────────────────────────
export const installSteps: InstallStep[] = ['select', 'permissions', 'confirm', 'done'];

export function nextInstallStep(step: InstallStep): InstallStep {
  const idx = installSteps.indexOf(step);
  return idx < installSteps.length - 1 ? installSteps[idx + 1] : step;
}

// ─── Pure Helpers (testable) ──────────────────────────────────
export function getInstalledSkills(skills: MarketSkill[]): MarketSkill[] {
  return skills.filter(s => s.source === 'installed' || s.source === 'bundled');
}

export function getMarketSkills(skills: MarketSkill[]): MarketSkill[] {
  return skills.filter(s => s.source === 'available');
}

export function getCreatedSkills(skills: MarketSkill[]): MarketSkill[] {
  return skills.filter(s => s.fromRecorder === true || s.id.startsWith('custom-'));
}

/**
 * Validate a create-skill draft. Returns list of error keys (empty = valid).
 */
export function validateDraft(draft: CreateSkillDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('name');
  if (!draft.description.trim()) errors.push('description');
  if (!draft.instruction.trim()) errors.push('instruction');
  return errors;
}

export function isDraftValid(draft: CreateSkillDraft): boolean {
  return validateDraft(draft).length === 0;
}

export const emptyDraft: CreateSkillDraft = {
  name: '',
  description: '',
  trigger: '',
  instruction: '',
};

// ─── Skill Card ───────────────────────────────────────────────
function SkillCard({ skill, onToggle, onDelete }: { skill: MarketSkill; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-base"
          style={{ backgroundColor: `${skill.color}1a`, color: skill.color }}
        >
          {skill.icon}
        </span>
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{skill.name}</span>
          <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">v{skill.version}</span>
        </div>
        <button
          onClick={onToggle}
          aria-label={skill.enabled ? 'Disable skill' : 'Enable skill'}
          aria-pressed={skill.enabled}
          className="flex-shrink-0 text-[var(--color-text-tertiary)]"
        >
          {skill.enabled ? (
            <ToggleRight size={24} className="text-[var(--color-accent-green)]" />
          ) : (
            <ToggleLeft size={24} />
          )}
        </button>
      </div>
      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">{skill.description}</p>
      <div className="flex justify-end">
        <button
          onClick={onDelete}
          aria-label="Delete skill"
          className="flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] text-[var(--color-text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-red)]/10 hover:text-[var(--color-accent-red)]"
        >
          <Trash2 size={12} />
          删除
        </button>
      </div>
    </div>
  );
}

// ─── Install Dialog ───────────────────────────────────────────
function InstallDialog({
  skill,
  step,
  onAdvance,
  onConfirm,
  onClose,
}: {
  skill: MarketSkill;
  step: InstallStep;
  onAdvance: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">安装技能 · {skill.name}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4">
          {step === 'permissions' && (
            <>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
                <Shield size={13} />
                该技能请求以下权限
              </div>
              <div className="flex flex-col gap-1.5">
                {skill.permissions.map((p: SkillPermission, i: number) => (
                  <div
                    key={`${p.type}-${i}`}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]"
                  >
                    <span className="text-[var(--color-text-tertiary)]">{permissionIcon(p.type)}</span>
                    {p.description}
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 'confirm' && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              确认安装 <span className="font-medium text-[var(--color-text-primary)]">{skill.name}</span>（v
              {skill.version}）？安装后可随时在"已安装"中卸载。
            </p>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <Check size={28} className="text-[var(--color-accent-green)]" />
              <span className="text-sm text-[var(--color-text-primary)]">{skill.name} 安装完成</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          {step === 'permissions' && (
            <button
              onClick={onAdvance}
              className="h-8 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-xs font-medium text-[var(--color-bg-primary)] hover:opacity-90"
            >
              下一步
            </button>
          )}
          {step === 'confirm' && (
            <button
              onClick={onConfirm}
              className="h-8 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-xs font-medium text-[var(--color-bg-primary)] hover:opacity-90"
            >
              确认安装
            </button>
          )}
          {step === 'done' && (
            <button
              onClick={onClose}
              className="h-8 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 text-xs font-medium text-[var(--color-bg-primary)] hover:opacity-90"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SkillManagementPage Component ────────────────────────────
export function SkillManagementPage({
  skills = defaultSkills,
  autoUpdate = false,
  onToggleSkill,
  onDeleteSkill,
  onInstallSkill,
  onAutoUpdateChange,
  onImportSkill,
  onCreateSkill,
}: SkillManagementPageProps) {
  const [activeTab, setActiveTab] = useState<ManagementTab>('installed');
  const [installTarget, setInstallTarget] = useState<MarketSkill | null>(null);
  const [installStep, setInstallStep] = useState<InstallStep>('permissions');
  const [importMethod, setImportMethod] = useState<ImportMethod>('file');
  const [importValue, setImportValue] = useState('');
  const [draft, setDraft] = useState<CreateSkillDraft>(emptyDraft);

  const installed = useMemo(() => getInstalledSkills(skills), [skills]);
  const market = useMemo(() => getMarketSkills(skills), [skills]);
  const created = useMemo(() => getCreatedSkills(skills), [skills]);

  const startInstall = useCallback((skill: MarketSkill) => {
    setInstallTarget(skill);
    setInstallStep('permissions');
  }, []);

  const advanceInstall = useCallback(() => {
    setInstallStep(prev => nextInstallStep(prev));
  }, []);

  const confirmInstall = useCallback(() => {
    if (installTarget) onInstallSkill(installTarget.id);
    setInstallStep('done');
  }, [installTarget, onInstallSkill]);

  const handleCreate = useCallback(() => {
    if (isDraftValid(draft)) {
      onCreateSkill(draft);
      setDraft(emptyDraft);
    }
  }, [draft, onCreateSkill]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-[var(--color-border)] px-4 py-2">
        {managementTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
              activeTab === tab.id
                ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Installed */}
        {activeTab === 'installed' && (
          <>
            <div className="mb-3 flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-3 py-2">
              <span className="text-xs text-[var(--color-text-secondary)]">技能自动更新（全局）</span>
              <button
                onClick={() => onAutoUpdateChange(!autoUpdate)}
                aria-label="Toggle auto-update"
                aria-pressed={autoUpdate}
                className="text-[var(--color-text-tertiary)]"
              >
                {autoUpdate ? (
                  <ToggleRight size={24} className="text-[var(--color-accent-green)]" />
                ) : (
                  <ToggleLeft size={24} />
                )}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {installed.map(skill => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={() => onToggleSkill(skill.id, !skill.enabled)}
                  onDelete={() => onDeleteSkill(skill.id)}
                />
              ))}
            </div>
            {installed.length === 0 && <EmptyState label="还没有已安装的技能" />}
          </>
        )}

        {/* Market */}
        {activeTab === 'market' && (
          <div className="grid grid-cols-2 gap-3">
            {market.map(skill => (
              <div
                key={skill.id}
                className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-base"
                    style={{ backgroundColor: `${skill.color}1a`, color: skill.color }}
                  >
                    {skill.icon}
                  </span>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{skill.name}</span>
                    <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">v{skill.version}</span>
                  </div>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  {skill.description}
                </p>
                <button
                  onClick={() => startInstall(skill)}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
                >
                  <Download size={13} />
                  一键安装
                </button>
              </div>
            ))}
            {market.length === 0 && <EmptyState label="市场暂无可安装技能" />}
          </div>
        )}

        {/* Created */}
        {activeTab === 'created' && (
          <div className="flex flex-col gap-4">
            {/* Import */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
              <div className="mb-2 text-xs font-medium text-[var(--color-text-primary)]">导入技能</div>
              <div className="mb-2 flex gap-1.5">
                {importMethods.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setImportMethod(m.id)}
                    className={`flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] transition-colors duration-[var(--duration-fast)] ${
                      importMethod === m.id
                        ? 'bg-[var(--color-bg-hover)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]'
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={importValue}
                  onChange={e => setImportValue(e.target.value)}
                  placeholder={importMethods.find(m => m.id === importMethod)?.placeholder}
                  aria-label="Import source"
                  className="h-8 flex-1 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
                />
                <button
                  onClick={() => {
                    if (importValue.trim()) {
                      onImportSkill(importMethod, importValue.trim());
                      setImportValue('');
                    }
                  }}
                  className="h-8 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-xs font-medium text-[var(--color-bg-primary)] hover:opacity-90"
                >
                  导入
                </button>
              </div>
            </div>

            {/* Create wizard */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
                <Plus size={13} />
                创建新技能
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="技能名称"
                  aria-label="Skill name"
                  className="h-8 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
                />
                <input
                  type="text"
                  value={draft.description}
                  onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                  placeholder="技能描述"
                  aria-label="Skill description"
                  className="h-8 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
                />
                <input
                  type="text"
                  value={draft.trigger}
                  onChange={e => setDraft(d => ({ ...d, trigger: e.target.value }))}
                  placeholder="触发条件（可选）"
                  aria-label="Skill trigger"
                  className="h-8 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
                />
                <textarea
                  value={draft.instruction}
                  onChange={e => setDraft(d => ({ ...d, instruction: e.target.value }))}
                  placeholder="指令内容（Markdown）"
                  aria-label="Skill instruction"
                  rows={4}
                  className="resize-none rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-2.5 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
                />
                <div className="flex justify-end gap-2">
                  <button className="flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)]">
                    <Play size={12} />
                    测试运行
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!isDraftValid(draft)}
                    className="h-8 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 text-xs font-medium text-[var(--color-bg-primary)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    创建技能
                  </button>
                </div>
              </div>
            </div>

            {/* Created list */}
            {created.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {created.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onToggle={() => onToggleSkill(skill.id, !skill.enabled)}
                    onDelete={() => onDeleteSkill(skill.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Install dialog */}
      {installTarget && (
        <InstallDialog
          skill={installTarget}
          step={installStep}
          onAdvance={advanceInstall}
          onConfirm={confirmInstall}
          onClose={() => setInstallTarget(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="col-span-2 flex flex-col items-center gap-2 py-12 text-center">
      <Package size={24} className="text-[var(--color-text-quaternary)]" />
      <span className="text-sm text-[var(--color-text-tertiary)]">{label}</span>
    </div>
  );
}
