import { useState, useCallback, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, type NavigationId } from './components/Sidebar';
import { SceneTabs, useScene } from './components/SceneTabs';
import { WelcomeView } from './components/WelcomeView';
import { ChatView } from './components/ChatView';
import { SkillManagementPage, type CreateSkillDraft, type ImportMethod } from './components/SkillManagementPage';
import { PermissionSelector } from './components/PermissionSelector';
import { PermissionConfirmDialog } from './components/PermissionConfirmDialog';
import { PermissionLogView } from './components/PermissionLogView';
import { AutomationPanel } from './components/AutomationPanel';
import { defaultSkills, type MarketSkill } from './components/SkillSearchPanel';
import { usePermission } from './hooks/usePermission';
import { useAutomations } from './hooks/useAutomations';

export function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<NavigationId>('assistant');
  const [skills, setSkills] = useState<MarketSkill[]>(defaultSkills);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const scene = useScene('office');
  const permission = usePermission();
  const automations = useAutomations();

  const handleNewSession = useCallback(() => {
    const id = `session-${Date.now()}`;
    setActiveSessionId(id);
    setActiveNav('assistant');
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setActiveNav('assistant');
  }, []);

  const handleNavigate = useCallback((id: NavigationId) => {
    setActiveNav(id);
    if (id !== 'assistant') {
      setActiveSessionId(null);
    }
  }, []);

  // Refresh permission log when entering the security view.
  useEffect(() => {
    if (activeNav === 'security') permission.refreshLog();
  }, [activeNav, permission.refreshLog]);

  // ─── Skill handlers ─────────────────────────────────────────
  const handleToggleSkill = useCallback((skillId: string, enabled: boolean) => {
    setSkills(prev => prev.map(s => (s.id === skillId ? { ...s, enabled } : s)));
    window.nexawork?.skill?.toggle({ skillId, enabled }).catch(() => {});
  }, []);

  const handleDeleteSkill = useCallback((skillId: string) => {
    setSkills(prev => prev.filter(s => s.id !== skillId));
    window.nexawork?.skill?.delete({ skillId }).catch(() => {});
  }, []);

  const handleInstallSkill = useCallback((skillId: string) => {
    setSkills(prev => prev.map(s => (s.id === skillId ? { ...s, source: 'installed', enabled: true } : s)));
    window.nexawork?.skill?.install({ skillId }).catch(() => {});
  }, []);

  const handleImportSkill = useCallback((method: ImportMethod, value: string) => {
    const id = `custom-${Date.now()}`;
    setSkills(prev => [
      ...prev,
      {
        id,
        name:
          value
            .split('/')
            .pop()
            ?.replace(/\.(md|json|git)$/i, '') || '导入的技能',
        description: `通过 ${method} 导入：${value}`,
        icon: '📦',
        color: '#6366F1',
        source: 'installed',
        enabled: false,
        version: '1.0.0',
        permissions: [],
      },
    ]);
  }, []);

  const handleCreateSkill = useCallback((draft: CreateSkillDraft) => {
    const id = `custom-${Date.now()}`;
    setSkills(prev => [
      ...prev,
      {
        id,
        name: draft.name,
        description: draft.description,
        icon: '✨',
        color: '#8B5CF6',
        source: 'installed',
        enabled: true,
        version: '1.0.0',
        permissions: [],
      },
    ]);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNewSession={handleNewSession}
          onSelectSession={handleSelectSession}
          onNavigate={handleNavigate}
          activeNav={activeNav}
          activeSessionId={activeSessionId}
        />

        {/* Content Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Scene Tabs (shown in assistant view) */}
          {activeNav === 'assistant' && (
            <SceneTabs
              activeScene={scene.activeScene}
              activeSubTag={scene.activeSubTag}
              onSceneChange={scene.setScene}
              onSubTagChange={scene.setSubTag}
            />
          )}

          {/* Main Content */}
          <div className="flex flex-1 overflow-hidden">
            {activeNav === 'skills' ? (
              <SkillManagementPage
                skills={skills}
                autoUpdate={autoUpdate}
                onToggleSkill={handleToggleSkill}
                onDeleteSkill={handleDeleteSkill}
                onInstallSkill={handleInstallSkill}
                onAutoUpdateChange={setAutoUpdate}
                onImportSkill={handleImportSkill}
                onCreateSkill={handleCreateSkill}
              />
            ) : activeNav === 'security' ? (
              <PermissionLogView entries={permission.log} onClear={permission.clearLog} />
            ) : activeNav === 'automation' ? (
              <AutomationPanel
                automations={automations.automations}
                now={automations.now}
                onCreate={automations.create}
                onToggle={automations.toggle}
                onDelete={automations.remove}
                onRunNow={automations.runNow}
              />
            ) : activeSessionId ? (
              <ChatView
                sessionId={activeSessionId}
                inputToolbar={
                  <PermissionSelector
                    mode={permission.mode}
                    bypassAvailable={permission.bypassAvailable}
                    onModeChange={permission.setMode}
                  />
                }
              />
            ) : (
              <WelcomeView onNewSession={handleNewSession} />
            )}
          </div>
        </main>
      </div>

      {/* Global tool permission prompt */}
      {permission.activeRequest && (
        <PermissionConfirmDialog request={permission.activeRequest} onRespond={permission.respond} />
      )}
    </div>
  );
}
