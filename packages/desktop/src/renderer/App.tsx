import { useState, useCallback } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, type NavigationId } from './components/Sidebar';
import { SceneTabs, useScene } from './components/SceneTabs';
import { WelcomeView } from './components/WelcomeView';
import { ChatView } from './components/ChatView';
import { AutomationPanel } from './components/AutomationPanel';
import { ProjectPage } from './components/ProjectPage';

export function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<NavigationId>('assistant');
  const scene = useScene('office');

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
            {activeNav === 'automation' ? (
              <AutomationPanel />
            ) : activeNav === 'projects' ? (
              <ProjectPage />
            ) : activeSessionId ? (
              <ChatView sessionId={activeSessionId} />
            ) : (
              <WelcomeView onNewSession={handleNewSession} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
