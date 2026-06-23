/**
 * SkillSearchPanel — skill search & browse panel (N15, WorkBuddy 截图4).
 *
 * Top search box (realtime filter) + category tabs (内置 / 已安装 / 可用) +
 * skill list (SkillItem) + bottom "导入技能" button. Selecting a skill opens
 * the SkillDetail modal; importing opens the SkillImportDialog. All state is
 * sourced from the centralized Zustand store and synced with the backend via
 * IPC (window.nexawork.skill.*).
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { SkillItem } from './SkillItem';
import { SkillDetail } from './SkillDetail';
import { SkillImportDialog } from './SkillImportDialog';
import { skillCategoryTabs, filterSkills, countByCategory } from './skillCatalog';

export function SkillSearchPanel() {
  const skillList = useAppStore(s => s.skillList);
  const skillCategory = useAppStore(s => s.skillCategory);
  const skillSearchQuery = useAppStore(s => s.skillSearchQuery);
  const selectedSkillId = useAppStore(s => s.selectedSkillId);
  const skillImporting = useAppStore(s => s.skillImporting);
  const skillImportMessage = useAppStore(s => s.skillImportMessage);

  const loadSkills = useAppStore(s => s.loadSkills);
  const setSkillCategory = useAppStore(s => s.setSkillCategory);
  const setSkillSearchQuery = useAppStore(s => s.setSkillSearchQuery);
  const selectSkill = useAppStore(s => s.selectSkill);
  const toggleSkill = useAppStore(s => s.toggleSkill);
  const importSkill = useAppStore(s => s.importSkill);
  const clearSkillImportMessage = useAppStore(s => s.clearSkillImportMessage);

  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const counts = useMemo(() => countByCategory(skillList), [skillList]);
  const filtered = useMemo(
    () => filterSkills(skillList, skillCategory, skillSearchQuery),
    [skillList, skillCategory, skillSearchQuery],
  );
  const selectedSkill = useMemo(
    () => skillList.find(s => s.id === selectedSkillId) ?? null,
    [skillList, selectedSkillId],
  );

  const activeTab = skillCategoryTabs.find(t => t.id === skillCategory)!;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <Sparkles size={16} className="text-[var(--color-text-secondary)]" />
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">技能</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">浏览、启用与导入技能</span>
      </div>

      {/* Search box */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-quaternary)]"
          />
          <input
            type="text"
            value={skillSearchQuery}
            onChange={e => setSkillSearchQuery(e.target.value)}
            placeholder="搜索技能..."
            className="h-9 w-full rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] pl-8 pr-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-quaternary)] outline-none transition-colors duration-[var(--duration-fast)] focus:bg-[var(--color-bg-primary)] focus:ring-1 focus:ring-[var(--color-border-focus)]"
            aria-label="搜索技能"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 border-b border-[var(--color-border)] px-4 pb-2">
        {skillCategoryTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSkillCategory(tab.id)}
            className={`flex items-center gap-1.5 rounded-[var(--radius-full)] px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${
              skillCategory === tab.id
                ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
            }`}
            aria-pressed={skillCategory === tab.id}
          >
            {tab.label}
            <span
              className={`rounded-[var(--radius-full)] px-1.5 text-[10px] ${
                skillCategory === tab.id
                  ? 'bg-white/20'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
              }`}
            >
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Import result banner */}
      {skillImportMessage && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-accent-green)]/10 px-3 py-2 text-xs text-[var(--color-accent-green)]">
          <span>{skillImportMessage}</span>
          <button
            onClick={clearSkillImportMessage}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            aria-label="关闭提示"
          >
            ✕
          </button>
        </div>
      )}

      {/* Skill list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Sparkles size={24} className="text-[var(--color-text-quaternary)]" />
            <span className="text-sm text-[var(--color-text-tertiary)]">
              {skillSearchQuery ? '没有匹配的技能' : activeTab.emptyHint}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map(skill => (
              <SkillItem key={skill.id} skill={skill} active={skill.id === selectedSkillId} onSelect={selectSkill} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom: Import button */}
      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] active:scale-[0.99]"
        >
          <Plus size={16} />
          导入技能
        </button>
      </div>

      {/* Detail modal */}
      <SkillDetail
        skill={selectedSkill}
        isOpen={selectedSkill !== null}
        onClose={() => selectSkill(null)}
        onToggle={toggleSkill}
        onInstall={id => toggleSkill(id, true)}
      />

      {/* Import dialog */}
      <SkillImportDialog
        isOpen={importOpen}
        importing={skillImporting}
        onClose={() => setImportOpen(false)}
        onImport={async (source, sourceType) => {
          const result = await importSkill(source, sourceType);
          if (result.success) setImportOpen(false);
        }}
      />
    </div>
  );
}
