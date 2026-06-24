import { describe, test, expect } from 'bun:test'
import {
  addSession,
  removeSession,
  markSessionExited,
  nextActiveAfterClose,
  makeSessionInfo,
  formatAiCommandLine,
  isShellCommandTool,
  extractShellCommand,
  TERMINAL_THEME,
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE,
  type TerminalSessionInfo,
} from '../shared/terminal'

/**
 * TerminalPanel end-to-end scenario tests (N29).
 *
 * The renderer has no DOM test harness in this repo, so — mirroring the other
 * `*-panel` suites — these tests drive the exact reducer the {@link useTerminal}
 * hook runs (create / setActive / close / onExit) plus the render decisions the
 * panel makes (empty state, exit badge, AI command echo, xterm theme/font), and
 * assert the full multi-tab user flow end to end.
 */

// A faithful re-implementation of the useTerminal reducer so the scenario below
// exercises the same create/close/active-fallback ordering the hook uses.
interface PanelState {
  sessions: TerminalSessionInfo[]
  activeId: string | null
}

function emptyState(): PanelState {
  return { sessions: [], activeId: null }
}

function open(state: PanelState, title: string): PanelState {
  const info = makeSessionInfo({
    id: `t-${state.sessions.length + 1}-${title}`,
    resolved: { shell: '/bin/bash', args: [], kind: 'bash' },
    cwd: '/home/user',
    cols: 80,
    rows: 24,
    title,
  })
  return { sessions: addSession(state.sessions, info), activeId: info.id }
}

function switchTo(state: PanelState, id: string): PanelState {
  return { ...state, activeId: id }
}

function close(state: PanelState, id: string): PanelState {
  return {
    sessions: removeSession(state.sessions, id),
    activeId: nextActiveAfterClose(state.sessions, id, state.activeId),
  }
}

function exit(state: PanelState, id: string, code: number): PanelState {
  return { ...state, sessions: markSessionExited(state.sessions, id, code) }
}

// Mirror of the panel's "show empty state" decision.
const isEmpty = (state: PanelState) => state.sessions.length === 0

describe('TerminalPanel: multi-tab lifecycle (e2e)', () => {
  test('starts in the empty state with no active tab', () => {
    const s = emptyState()
    expect(isEmpty(s)).toBe(true)
    expect(s.activeId).toBeNull()
  })

  test('creating tabs appends them and focuses the newest', () => {
    let s = emptyState()
    s = open(s, 'one')
    expect(isEmpty(s)).toBe(false)
    expect(s.sessions).toHaveLength(1)
    expect(s.activeId).toBe(s.sessions[0].id)

    const firstId = s.sessions[0].id
    s = open(s, 'two')
    s = open(s, 'three')
    expect(s.sessions).toHaveLength(3)
    // newest tab becomes active
    expect(s.activeId).toBe(s.sessions[2].id)
    // earlier tabs survive (independent instances)
    expect(s.sessions.map(t => t.title)).toEqual(['one', 'two', 'three'])
    expect(s.sessions[0].id).toBe(firstId)
  })

  test('switching tabs changes only the active id, not the list', () => {
    let s = open(open(open(emptyState(), 'a'), 'b'), 'c')
    const before = s.sessions
    s = switchTo(s, s.sessions[0].id)
    expect(s.activeId).toBe(s.sessions[0].id)
    expect(s.sessions).toBe(before) // list identity untouched
  })

  test('closing the active tab activates a neighbour; closing inactive keeps focus', () => {
    let s = open(open(open(emptyState(), 'a'), 'b'), 'c')
    const [a, b, c] = s.sessions.map(t => t.id)

    // active is c (newest). Close it → falls back to previous (b).
    s = close(s, c)
    expect(s.sessions.map(t => t.id)).toEqual([a, b])
    expect(s.activeId).toBe(b)

    // close an inactive tab (a) while b is active → b stays active.
    s = close(s, a)
    expect(s.sessions.map(t => t.id)).toEqual([b])
    expect(s.activeId).toBe(b)
  })

  test('closing the last tab returns to the empty state', () => {
    let s = open(emptyState(), 'only')
    s = close(s, s.sessions[0].id)
    expect(isEmpty(s)).toBe(true)
    expect(s.activeId).toBeNull()
  })

  test('a PTY exit flips the tab to an exited badge without removing it', () => {
    let s = open(open(emptyState(), 'a'), 'b')
    const bId = s.sessions[1].id
    s = exit(s, bId, 137)

    const exited = s.sessions.find(t => t.id === bId)
    expect(exited?.status).toBe('exited')
    expect(exited?.exitCode).toBe(137)
    // still selectable / still present
    expect(s.sessions).toHaveLength(2)
    expect(s.activeId).toBe(bId)

    // the panel renders the exit badge via t('terminal.exited').replace('{code}', …)
    const badge = '已退出 (代码 {code})'.replace(
      '{code}',
      String(exited?.exitCode ?? 0),
    )
    expect(badge).toBe('已退出 (代码 137)')
  })
})

describe('TerminalPanel: AI command echo (e2e)', () => {
  test('an AI BashTool call is recognised and echoed as a display-only prompt line', () => {
    expect(isShellCommandTool('BashTool')).toBe(true)
    const command = isShellCommandTool('BashTool')
      ? extractShellCommand({ command: 'npm run build' })
      : null
    expect(command).toBe('npm run build')

    const line = formatAiCommandLine(command ?? '')
    // echoed line carries the command and a CRLF so xterm renders a fresh row
    expect(line).toContain('npm run build')
    expect(line.endsWith('\r\n')).toBe(true)
  })

  test('non-shell tools are ignored (no terminal echo)', () => {
    expect(isShellCommandTool('FileReadTool')).toBe(false)
    expect(extractShellCommand({ path: '/x' })).toBeNull()
  })
})

describe('TerminalPanel: xterm theme & font (acceptance)', () => {
  test('uses the spec dark theme and JetBrains Mono 13px', () => {
    expect(TERMINAL_THEME.background).toBe('#1A1A1A')
    expect(TERMINAL_THEME.foreground).toBe('#F9FAFB')
    expect(TERMINAL_FONT_SIZE).toBe(13)
    expect(TERMINAL_FONT_FAMILY).toContain('JetBrains Mono')
  })

  test('exposes a full ANSI colour palette for coloured output', () => {
    const ansiKeys = [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ] as const
    for (const key of ansiKeys) {
      expect(TERMINAL_THEME[key]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
