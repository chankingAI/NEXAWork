import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { SceneTabs } from './components/SceneTabs';
import { WelcomePage, useOnboarding } from './components/WelcomePage';
import { ChatView } from './components/ChatView';
import { ExpertsView } from './components/ExpertsView';
import { SkillSearchPanel } from './components/SkillSearchPanel';
import { ComingSoonView } from './components/ComingSoonView';
import { useAppStore } from './store/appStore';

export function App() {
  const activeNav = useAppStore(s => s.activeNav);
  const activeSessionId = useAppStore(s => s.activeSessionId);
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed);
  const scene = useAppStore(s => s.scene);
  const subTag = useAppStore(s => s.subTag);
  const sessions = useAppStore(s => s.sessions);
  const sessionSearchQuery = useAppStore(s => s.sessionSearchQuery);

  const toggleSidebar = useAppStore(s => s.toggleSidebar);
  const navigate = useAppStore(s => s.navigate);
  const setScene = useAppStore(s => s.setScene);
  const setSubTag = useAppStore(s => s.setSubTag);
  const newSession = useAppStore(s => s.newSession);
  const selectSession = useAppStore(s => s.selectSession);
  const deleteSession = useAppStore(s => s.deleteSession);
  const renameSession = useAppStore(s => s.renameSession);
  const pinSession = useAppStore(s => s.pinSession);
  const archiveSession = useAppStore(s => s.archiveSession);
  const setSessionSearchQuery = useAppStore(s => s.setSessionSearchQuery);

  const { isFirstTime, markComplete } = useOnboarding();

  const renderMainView = () => {
    switch (activeNav) {
      case 'assistant':
        return activeSessionId ? (
          <ChatView key={activeSessionId} sessionId={activeSessionId} />
        ) : (
          <WelcomePage
            activeScene={scene}
            onSceneChange={setScene}
            onQuickAction={prompt => newSession(prompt)}
            onStartChat={prompt => newSession(prompt)}
            isFirstTime={isFirstTime}
            onOnboardingComplete={markComplete}
          />
        );
      case 'experts':
        return <ExpertsView />;
      case 'skills':
        return <SkillSearchPanel />;
      default:
        return <ComingSoonView nav={activeNav} />;
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          onNewSession={() => newSession()}
          onSelectSession={selectSession}
          onNavigate={navigate}
          activeNav={activeNav}
          activeSessionId={activeSessionId}
          sessions={sessions}
          sessionSearchQuery={sessionSearchQuery}
          onSessionSearchChange={setSessionSearchQuery}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onPinSession={pinSession}
          onArchiveSession={archiveSession}
        />

        {/* Content Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Scene Tabs (shown in assistant view) */}
          {activeNav === 'assistant' && (
            <SceneTabs activeScene={scene} activeSubTag={subTag} onSceneChange={setScene} onSubTagChange={setSubTag} />
          )}

          {/* Routed Content */}
          <div className="flex flex-1 overflow-hidden">{renderMainView()}</div>
        </main>
      </div>
    </div>
  );
}
