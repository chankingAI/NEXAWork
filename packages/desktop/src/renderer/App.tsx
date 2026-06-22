import { useState, useCallback } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { WelcomeView } from './components/WelcomeView';
import { ChatView } from './components/ChatView';

export function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleNewSession = useCallback(() => {
    const id = `session-${Date.now()}`;
    setActiveSessionId(id);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
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
          activeSessionId={activeSessionId}
        />

        {/* Content Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {activeSessionId ? <ChatView sessionId={activeSessionId} /> : <WelcomeView onNewSession={handleNewSession} />}
        </main>
      </div>
    </div>
  );
}
