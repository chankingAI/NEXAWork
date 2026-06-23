import { Minus, Square, X } from 'lucide-react';

export interface TitleBarProps {
  /** Recording entry/status controls rendered on the right (N24). */
  recordSlot?: React.ReactNode;
}

export function TitleBar({ recordSlot }: TitleBarProps) {
  const platform =
    typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Mac') ? 'darwin' : 'win32') : 'win32';

  const handleMinimize = () => window.nexawork?.window.minimize();
  const handleMaximize = () => window.nexawork?.window.maximize();
  const handleClose = () => window.nexawork?.window.close();

  return (
    <header className="titlebar-drag flex h-10 items-center border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
      {/* macOS traffic light spacing */}
      {platform === 'darwin' && <div className="w-16" />}

      {/* App title */}
      <div className="flex flex-1 items-center justify-center">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">NexaWork</span>
      </div>

      {/* Recording controls (N24) */}
      {recordSlot && <div className="mr-2 flex items-center gap-2">{recordSlot}</div>}

      {/* Windows controls */}
      {platform !== 'darwin' && (
        <div className="titlebar-no-drag flex items-center gap-0">
          <button
            onClick={handleMinimize}
            className="flex h-8 w-10 items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="flex h-8 w-10 items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            aria-label="Maximize"
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            className="flex h-8 w-10 items-center justify-center text-[var(--color-text-secondary)] hover:bg-red-500 hover:text-white"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
