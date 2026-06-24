/**
 * NexaWork Terminal — shared pure logic (N29)
 * ===========================================
 * Zero-dependency helpers backing the xterm.js terminal panel: shell
 * resolution, session-list state transitions, dimension clamping, the
 * terminal colour theme, and AI-command detection. Everything here is a pure
 * function or constant so it runs identically in the renderer, the Electron
 * main process, and under `bun test` (no node-pty / xterm / DOM imports).
 *
 * Native PTY ownership lives in `../main/backend/terminal-manager`; xterm
 * rendering lives in `../renderer/components/TerminalPanel`.
 */

export type TerminalShellKind = 'bash' | 'zsh' | 'sh' | 'powershell' | 'cmd'

/** Metadata describing one PTY-backed terminal tab (safe to send over IPC). */
export interface TerminalSessionInfo {
  id: string
  title: string
  /** Absolute path to the spawned shell binary. */
  shell: string
  kind: TerminalShellKind
  cwd: string
  cols: number
  rows: number
  status: 'running' | 'exited'
  /** Exit code once the shell has terminated, otherwise null. */
  exitCode: number | null
}

/** A resolved shell command line ready to hand to node-pty. */
export interface ResolvedShell {
  shell: string
  args: string[]
  kind: TerminalShellKind
}

// ─── Dimensions ──────────────────────────────────────────────────────────────

export const DEFAULT_TERMINAL_COLS = 80
export const DEFAULT_TERMINAL_ROWS = 24
export const MIN_TERMINAL_COLS = 2
export const MIN_TERMINAL_ROWS = 1
export const MAX_TERMINAL_COLS = 1000
export const MAX_TERMINAL_ROWS = 1000

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.floor(value)
      : fallback
  if (n < min) return min
  if (n > max) return max
  return n
}

export function clampCols(cols: unknown): number {
  return clampInt(
    cols,
    MIN_TERMINAL_COLS,
    MAX_TERMINAL_COLS,
    DEFAULT_TERMINAL_COLS,
  )
}

export function clampRows(rows: unknown): number {
  return clampInt(
    rows,
    MIN_TERMINAL_ROWS,
    MAX_TERMINAL_ROWS,
    DEFAULT_TERMINAL_ROWS,
  )
}

export function clampDimensions(dim: { cols?: unknown; rows?: unknown }): {
  cols: number
  rows: number
} {
  return { cols: clampCols(dim.cols), rows: clampRows(dim.rows) }
}

// ─── Terminal appearance (N29 spec: #1A1A1A bg, #F9FAFB fg, JetBrains Mono) ────

export const TERMINAL_FONT_FAMILY =
  "'JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', monospace"
export const TERMINAL_FONT_SIZE = 13

/** xterm.js `ITheme`-compatible palette (dark, matching the spec colours). */
export const TERMINAL_THEME = {
  background: '#1A1A1A',
  foreground: '#F9FAFB',
  cursor: '#F9FAFB',
  cursorAccent: '#1A1A1A',
  selectionBackground: 'rgba(249, 250, 251, 0.25)',
  black: '#1A1A1A',
  red: '#F87171',
  green: '#34D399',
  yellow: '#FBBF24',
  blue: '#60A5FA',
  magenta: '#C084FC',
  cyan: '#22D3EE',
  white: '#E5E7EB',
  brightBlack: '#6B7280',
  brightRed: '#FCA5A5',
  brightGreen: '#6EE7B7',
  brightYellow: '#FDE68A',
  brightBlue: '#93C5FD',
  brightMagenta: '#D8B4FE',
  brightCyan: '#67E8F9',
  brightWhite: '#F9FAFB',
} as const

// ─── Shell resolution ──────────────────────────────────────────────────────────

/** Classify a shell binary path/name into a {@link TerminalShellKind}. */
export function shellKindFromPath(shellPath: string): TerminalShellKind {
  const base = shellPath
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .toLowerCase()
    .replace(/\.exe$/, '')
  if (base.includes('powershell') || base === 'pwsh') return 'powershell'
  if (base === 'cmd') return 'cmd'
  if (base === 'zsh') return 'zsh'
  if (base === 'bash') return 'bash'
  return 'sh'
}

/**
 * Pick a sensible default shell for the platform, honouring `$SHELL` /
 * `%COMSPEC%` when present. The returned args request an interactive login
 * shell on POSIX so the user's profile (PATH, prompt) is loaded.
 */
export function resolveDefaultShell(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = {},
  requestedShell?: string,
): ResolvedShell {
  if (requestedShell && requestedShell.trim()) {
    const shell = requestedShell.trim()
    const kind = shellKindFromPath(shell)
    return { shell, args: posixArgsFor(kind), kind }
  }

  if (platform === 'win32') {
    const shell =
      env.COMSPEC && env.COMSPEC.trim() ? env.COMSPEC : 'powershell.exe'
    return { shell, args: [], kind: shellKindFromPath(shell) }
  }

  const fromEnv = env.SHELL && env.SHELL.trim() ? env.SHELL.trim() : null
  const fallback = platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
  const shell = fromEnv ?? fallback
  const kind = shellKindFromPath(shell)
  return { shell, args: posixArgsFor(kind), kind }
}

function posixArgsFor(kind: TerminalShellKind): string[] {
  // Login shell loads the user profile; cmd/powershell take no such flag.
  if (kind === 'bash' || kind === 'zsh' || kind === 'sh') return ['-l']
  return []
}

// ─── Session-list state transitions ─────────────────────────────────────────────

/** Trim/normalise a user-supplied tab title (empty → null). */
export function sanitizeTitle(title: string): string | null {
  const trimmed = title
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80)
  return trimmed.length > 0 ? trimmed : null
}

/** Default tab label, e.g. `bash 1`. `index` is 1-based. */
export function defaultTerminalTitle(
  kind: TerminalShellKind,
  index: number,
): string {
  return `${kind} ${index}`
}

export function makeSessionInfo(params: {
  id: string
  resolved: ResolvedShell
  cwd: string
  cols: number
  rows: number
  title?: string
  index?: number
}): TerminalSessionInfo {
  const { id, resolved, cwd } = params
  const title =
    (params.title && sanitizeTitle(params.title)) ||
    defaultTerminalTitle(resolved.kind, params.index ?? 1)
  return {
    id,
    title,
    shell: resolved.shell,
    kind: resolved.kind,
    cwd,
    cols: clampCols(params.cols),
    rows: clampRows(params.rows),
    status: 'running',
    exitCode: null,
  }
}

export function findSession(
  list: TerminalSessionInfo[],
  id: string,
): TerminalSessionInfo | undefined {
  return list.find(s => s.id === id)
}

export function addSession(
  list: TerminalSessionInfo[],
  session: TerminalSessionInfo,
): TerminalSessionInfo[] {
  if (list.some(s => s.id === session.id)) {
    return list.map(s => (s.id === session.id ? session : s))
  }
  return [...list, session]
}

export function removeSession(
  list: TerminalSessionInfo[],
  id: string,
): TerminalSessionInfo[] {
  return list.filter(s => s.id !== id)
}

export function markSessionExited(
  list: TerminalSessionInfo[],
  id: string,
  exitCode: number,
): TerminalSessionInfo[] {
  return list.map(s =>
    s.id === id ? { ...s, status: 'exited' as const, exitCode } : s,
  )
}

export function renameSession(
  list: TerminalSessionInfo[],
  id: string,
  title: string,
): TerminalSessionInfo[] {
  const clean = sanitizeTitle(title)
  if (!clean) return list
  return list.map(s => (s.id === id ? { ...s, title: clean } : s))
}

export function resizeSession(
  list: TerminalSessionInfo[],
  id: string,
  cols: number,
  rows: number,
): TerminalSessionInfo[] {
  const c = clampCols(cols)
  const r = clampRows(rows)
  return list.map(s => (s.id === id ? { ...s, cols: c, rows: r } : s))
}

/**
 * Choose which tab becomes active after `closedId` is removed. When the closed
 * tab was not active the current `activeId` is kept; otherwise the neighbour to
 * the left (or the new first tab) is selected, falling back to null when empty.
 */
export function nextActiveAfterClose(
  list: TerminalSessionInfo[],
  closedId: string,
  activeId: string | null,
): string | null {
  if (activeId && activeId !== closedId) return activeId
  const idx = list.findIndex(s => s.id === closedId)
  const remaining = list.filter(s => s.id !== closedId)
  if (remaining.length === 0) return null
  const neighbour = idx > 0 ? remaining[idx - 1] : remaining[0]
  return neighbour.id
}

// ─── AI command integration ──────────────────────────────────────────────────

const SHELL_COMMAND_TOOLS = new Set([
  'Bash',
  'BashTool',
  'PowerShell',
  'PowerShellTool',
  'Shell',
  'Terminal',
])

/** True when an AI tool runs a shell command (so the terminal can echo it). */
export function isShellCommandTool(toolName: string): boolean {
  return SHELL_COMMAND_TOOLS.has(toolName)
}

/** Pull the command string out of a shell tool's input payload. */
export function extractShellCommand(
  input: Record<string, unknown> | undefined,
): string | null {
  if (!input) return null
  const candidates = ['command', 'cmd', 'script', 'shellCommand']
  for (const key of candidates) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Render an AI-issued command as a dim, prompt-prefixed line for echoing into
 * an xterm instance (display-only; it is not written to the PTY's stdin).
 */
export function formatAiCommandLine(command: string): string {
  const cleaned = command.replace(/\r?\n/g, ' ').trim()
  // \x1b[2m = dim, \x1b[36m = cyan marker, \x1b[0m = reset.
  return `\x1b[2m\x1b[36m∴ AI\x1b[0m\x1b[2m $ ${cleaned}\x1b[0m\r\n`
}
