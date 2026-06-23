/**
 * ExpertsView — experts marketplace screen (N12 + N13 + N14 wiring)
 *
 * Composes the recommended-team strip (opens ExpertTeamDialog) with the
 * ExpertListPage marketplace. Selecting an individual expert sets it as the
 * active expert and opens a fresh chat session; summoning a team does the
 * same with the generated team introduction prefilled.
 */
import { Users, Zap } from 'lucide-react';
import { ExpertListPage } from './ExpertListPage';
import { ExpertTeamDialog, defaultTeams } from './ExpertTeamDialog';
import { useAppStore } from '../store/appStore';

export function ExpertsView() {
  const expertMarketTab = useAppStore(s => s.expertMarketTab);
  const expertSearchQuery = useAppStore(s => s.expertSearchQuery);
  const summonedTeamId = useAppStore(s => s.summonedTeamId);
  const setExpertMarketTab = useAppStore(s => s.setExpertMarketTab);
  const setExpertSearchQuery = useAppStore(s => s.setExpertSearchQuery);
  const selectExpert = useAppStore(s => s.selectExpert);
  const newSession = useAppStore(s => s.newSession);
  const summonTeam = useAppStore(s => s.summonTeam);
  const dismissTeam = useAppStore(s => s.dismissTeam);
  const confirmSummonTeam = useAppStore(s => s.confirmSummonTeam);

  const summonedTeam = summonedTeamId ? (defaultTeams.find(t => t.id === summonedTeamId) ?? null) : null;

  const handleSelectExpert = (expertId: string) => {
    selectExpert(expertId);
    newSession();
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Recommended teams strip */}
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Users size={14} className="text-[var(--color-text-secondary)]" />
          <span className="text-xs font-medium text-[var(--color-text-primary)]">推荐团队</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {defaultTeams.map(team => (
            <button
              key={team.id}
              onClick={() => summonTeam(team.id)}
              className="flex w-[220px] flex-shrink-0 flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 text-left transition-all duration-[var(--duration-fast)] hover:border-[var(--color-text-tertiary)] hover:shadow-[var(--shadow-sm)] active:scale-[0.98]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-base">
                  {team.avatar}
                </span>
                <div className="flex flex-1 flex-col overflow-hidden">
                  <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{team.name}</span>
                  <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-text-quaternary)]">
                    <Zap size={9} />
                    {team.usageCount >= 10000
                      ? `${(team.usageCount / 1000).toFixed(1)}k`
                      : team.usageCount.toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                {team.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Expert marketplace */}
      <div className="flex-1 overflow-hidden">
        <ExpertListPage
          activeTab={expertMarketTab}
          onTabChange={setExpertMarketTab}
          onSelectExpert={handleSelectExpert}
          onMyExperts={() => setExpertMarketTab('experts')}
          searchQuery={expertSearchQuery}
          onSearchChange={setExpertSearchQuery}
        />
      </div>

      {/* Team detail dialog */}
      <ExpertTeamDialog
        team={summonedTeam}
        isOpen={summonedTeam !== null}
        onClose={dismissTeam}
        onSummon={confirmSummonTeam}
      />
    </div>
  );
}
