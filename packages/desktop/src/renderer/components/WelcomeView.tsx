import { Sparkles } from 'lucide-react';

interface WelcomeViewProps {
  onNewSession: () => void;
}

export function WelcomeView({ onNewSession }: WelcomeViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      {/* Brand */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--color-accent)]">
          <Sparkles size={32} className="text-[var(--color-text-inverse)]" />
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">NexaWork</h1>
        <p className="text-base text-[var(--color-text-secondary)]">AI Powered Office Suite</p>
      </div>

      {/* Scene Tabs */}
      <div className="flex gap-2">
        {['Daily Office', 'Code Dev', 'Creative', 'Record/Replay'].map((scene, i) => (
          <button
            key={scene}
            className={`rounded-full px-4 py-2 text-sm transition-all duration-[var(--duration-fast)] ${
              i === 0
                ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
            }`}
          >
            {scene}
          </button>
        ))}
      </div>

      {/* Quick Start */}
      <button
        onClick={onNewSession}
        className="rounded-[var(--radius-lg)] bg-[var(--color-accent)] px-8 py-3 text-sm font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] transition-all duration-[var(--duration-fast)] hover:opacity-90 active:scale-[0.98]"
      >
        Start a new conversation
      </button>

      {/* Shortcuts */}
      <div className="flex gap-3">
        {['Write code', 'Analyze data', 'Draft document', 'Automate task'].map(shortcut => (
          <button
            key={shortcut}
            onClick={onNewSession}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-all duration-[var(--duration-fast)] hover:border-[var(--color-border-focus)] hover:text-[var(--color-text-primary)]"
          >
            {shortcut}
          </button>
        ))}
      </div>
    </div>
  );
}
