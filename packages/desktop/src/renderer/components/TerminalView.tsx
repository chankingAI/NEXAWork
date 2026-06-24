/**
 * NexaWork TerminalView — one xterm.js instance bound to a PTY tab (N29).
 *
 * Owns a single {@link Terminal} wired to the main-process PTY identified by
 * `session.id`:
 *  - PTY stdout (`terminal:data`) is filtered by id and written into xterm.
 *  - User keystrokes (`onData`) are forwarded to the PTY via `terminal:write`.
 *  - The fit addon keeps the grid sized to the panel; dimension changes are
 *    pushed back to the PTY via `terminal:resize` (observed with ResizeObserver).
 *  - When active, AI shell commands (`terminal:aiCommand`) are echoed as a dim
 *    prompt line (display-only — not written to stdin).
 *
 * Instances stay mounted while hidden so scrollback survives tab switches; the
 * grid is re-fit whenever the view becomes active again.
 */
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE,
  TERMINAL_THEME,
  formatAiCommandLine,
  type TerminalSessionInfo,
} from '../../shared/terminal';

export interface TerminalViewProps {
  session: TerminalSessionInfo;
  active: boolean;
}

export function TerminalView({ session, active }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const idRef = useRef(session.id);
  idRef.current = session.id;
  const activeRef = useRef(active);
  activeRef.current = active;

  // Mount the xterm instance once per tab and wire it to the PTY.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      theme: { ...TERMINAL_THEME },
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    try {
      fit.fit();
    } catch {
      // Container not laid out yet; ResizeObserver will fit shortly.
    }
    termRef.current = term;
    fitRef.current = fit;

    const api = window.nexawork?.terminal;

    // PTY stdout → xterm (filtered to this tab).
    const offData = api?.onData(({ id, data }) => {
      if (id === idRef.current) term.write(data);
    });

    // User keystrokes → PTY stdin.
    const inputDisposable = term.onData(data => {
      void api?.write({ id: idRef.current, data });
    });

    // Grid resize → PTY resize.
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      void api?.resize({ id: idRef.current, cols, rows });
    });

    // AI shell command echo (only on the active tab; display-only).
    const offAi = api?.onAiCommand(({ command }) => {
      if (activeRef.current) term.write(formatAiCommandLine(command));
    });

    return () => {
      offData?.();
      offAi?.();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Keep the grid fitted to the panel as it resizes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (!activeRef.current) return;
      try {
        fitRef.current?.fit();
      } catch {
        // Ignore transient zero-size layouts.
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Re-fit and focus when this tab becomes active (it may have been hidden
  // with a zero-size container, leaving xterm un-fitted).
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // no-op
      }
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return (
    <div
      className="h-full w-full overflow-hidden p-1.5"
      style={{ backgroundColor: TERMINAL_THEME.background, display: active ? 'block' : 'none' }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
