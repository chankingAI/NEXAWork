import { describe, test, expect } from 'bun:test'
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE,
  TERMINAL_THEME,
  addSession,
  clampCols,
  clampDimensions,
  clampRows,
  defaultTerminalTitle,
  extractShellCommand,
  findSession,
  formatAiCommandLine,
  isShellCommandTool,
  makeSessionInfo,
  markSessionExited,
  nextActiveAfterClose,
  removeSession,
  renameSession,
  resizeSession,
  resolveDefaultShell,
  sanitizeTitle,
  shellKindFromPath,
  type TerminalSessionInfo,
} from '../shared/terminal'

/**
 * N29 terminal shared-logic tests — pure helpers backing the xterm.js panel:
 * dimension clamping, shell resolution, the colour theme, session-list state
 * transitions, and AI-command detection. No node-pty / xterm / DOM here.
 */

describe('clampCols / clampRows / clampDimensions', () => {
  test('returns defaults for non-numeric input', () => {
    expect(clampCols(undefined)).toBe(DEFAULT_TERMINAL_COLS)
    expect(clampCols('abc')).toBe(DEFAULT_TERMINAL_COLS)
    expect(clampCols(NaN)).toBe(DEFAULT_TERMINAL_COLS)
    expect(clampRows(undefined)).toBe(DEFAULT_TERMINAL_ROWS)
    expect(clampRows(null)).toBe(DEFAULT_TERMINAL_ROWS)
  })

  test('clamps below minimum and above maximum', () => {
    expect(clampCols(0)).toBe(MIN_TERMINAL_COLS)
    expect(clampCols(-50)).toBe(MIN_TERMINAL_COLS)
    expect(clampCols(99999)).toBe(MAX_TERMINAL_COLS)
    expect(clampRows(0)).toBe(MIN_TERMINAL_ROWS)
    expect(clampRows(99999)).toBe(MAX_TERMINAL_ROWS)
  })

  test('floors fractional values and passes valid ones through', () => {
    expect(clampCols(120.9)).toBe(120)
    expect(clampRows(40.2)).toBe(40)
    expect(clampDimensions({ cols: 100, rows: 30 })).toEqual({
      cols: 100,
      rows: 30,
    })
    expect(clampDimensions({})).toEqual({
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
    })
  })
})

describe('TERMINAL_THEME / font constants (N29 spec colours)', () => {
  test('matches the spec dark palette', () => {
    expect(TERMINAL_THEME.background).toBe('#1A1A1A')
    expect(TERMINAL_THEME.foreground).toBe('#F9FAFB')
  })

  test('defines a full 16-colour ANSI palette', () => {
    const ansi = [
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
    for (const key of ansi) {
      expect(TERMINAL_THEME[key]).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  test('uses JetBrains Mono 13px', () => {
    expect(TERMINAL_FONT_FAMILY).toContain('JetBrains Mono')
    expect(TERMINAL_FONT_SIZE).toBe(13)
  })
})

describe('shellKindFromPath', () => {
  test('classifies common shells', () => {
    expect(shellKindFromPath('/bin/bash')).toBe('bash')
    expect(shellKindFromPath('/usr/bin/zsh')).toBe('zsh')
    expect(shellKindFromPath('/bin/sh')).toBe('sh')
    expect(shellKindFromPath('C:/Windows/System32/cmd.exe')).toBe('cmd')
    expect(
      shellKindFromPath(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ),
    ).toBe('powershell')
    expect(shellKindFromPath('pwsh')).toBe('powershell')
  })

  test('falls back to sh for unknown binaries', () => {
    expect(shellKindFromPath('/usr/bin/fish')).toBe('sh')
  })
})

describe('resolveDefaultShell', () => {
  test('honours an explicit requested shell', () => {
    const r = resolveDefaultShell('linux', {}, '/bin/zsh')
    expect(r.shell).toBe('/bin/zsh')
    expect(r.kind).toBe('zsh')
    expect(r.args).toEqual(['-l'])
  })

  test('uses $SHELL on POSIX when present', () => {
    const r = resolveDefaultShell('linux', { SHELL: '/usr/bin/bash' })
    expect(r.shell).toBe('/usr/bin/bash')
    expect(r.kind).toBe('bash')
    expect(r.args).toEqual(['-l'])
  })

  test('defaults to zsh on darwin and bash on linux', () => {
    expect(resolveDefaultShell('darwin', {}).shell).toBe('/bin/zsh')
    expect(resolveDefaultShell('linux', {}).shell).toBe('/bin/bash')
  })

  test('uses COMSPEC or powershell on win32 with no login arg', () => {
    const withComspec = resolveDefaultShell('win32', {
      COMSPEC: 'C:/Windows/System32/cmd.exe',
    })
    expect(withComspec.kind).toBe('cmd')
    expect(withComspec.args).toEqual([])

    const fallback = resolveDefaultShell('win32', {})
    expect(fallback.shell).toBe('powershell.exe')
    expect(fallback.kind).toBe('powershell')
  })
})

describe('title helpers', () => {
  test('sanitizeTitle trims, collapses whitespace, caps length', () => {
    expect(sanitizeTitle('  hello  ')).toBe('hello')
    expect(sanitizeTitle('a\nb\tc')).toBe('a b c')
    expect(sanitizeTitle('   ')).toBeNull()
    expect(sanitizeTitle('x'.repeat(200))!.length).toBe(80)
  })

  test('defaultTerminalTitle composes kind + index', () => {
    expect(defaultTerminalTitle('bash', 1)).toBe('bash 1')
    expect(defaultTerminalTitle('zsh', 3)).toBe('zsh 3')
  })
})

describe('makeSessionInfo', () => {
  const resolved = { shell: '/bin/bash', args: ['-l'], kind: 'bash' as const }

  test('builds a running session with clamped dims and default title', () => {
    const info = makeSessionInfo({
      id: 't1',
      resolved,
      cwd: '/home/u',
      cols: 0,
      rows: 99999,
      index: 2,
    })
    expect(info).toMatchObject({
      id: 't1',
      shell: '/bin/bash',
      kind: 'bash',
      cwd: '/home/u',
      status: 'running',
      exitCode: null,
      title: 'bash 2',
    })
    expect(info.cols).toBe(MIN_TERMINAL_COLS)
    expect(info.rows).toBe(MAX_TERMINAL_ROWS)
  })

  test('prefers a sanitized custom title', () => {
    const info = makeSessionInfo({
      id: 't2',
      resolved,
      cwd: '/x',
      cols: 80,
      rows: 24,
      title: '  build  ',
    })
    expect(info.title).toBe('build')
  })
})

describe('session-list transitions', () => {
  const base = (id: string): TerminalSessionInfo => ({
    id,
    title: id,
    shell: '/bin/bash',
    kind: 'bash',
    cwd: '/',
    cols: 80,
    rows: 24,
    status: 'running',
    exitCode: null,
  })

  test('addSession appends and upserts by id', () => {
    const a = base('a')
    const list = addSession([], a)
    expect(list).toHaveLength(1)
    const updated = addSession(list, { ...a, title: 'renamed' })
    expect(updated).toHaveLength(1)
    expect(updated[0].title).toBe('renamed')
  })

  test('findSession / removeSession', () => {
    const list = [base('a'), base('b')]
    expect(findSession(list, 'b')?.id).toBe('b')
    expect(findSession(list, 'z')).toBeUndefined()
    expect(removeSession(list, 'a').map(s => s.id)).toEqual(['b'])
  })

  test('markSessionExited flips status + exit code', () => {
    const list = markSessionExited([base('a')], 'a', 137)
    expect(list[0].status).toBe('exited')
    expect(list[0].exitCode).toBe(137)
  })

  test('renameSession ignores empty titles', () => {
    const list = [base('a')]
    expect(renameSession(list, 'a', 'new')[0].title).toBe('new')
    expect(renameSession(list, 'a', '   ')[0].title).toBe('a')
  })

  test('resizeSession clamps and updates only the target', () => {
    const list = [base('a'), base('b')]
    const out = resizeSession(list, 'a', 0, 99999)
    expect(out[0]).toMatchObject({
      cols: MIN_TERMINAL_COLS,
      rows: MAX_TERMINAL_ROWS,
    })
    expect(out[1]).toMatchObject({ cols: 80, rows: 24 })
  })

  describe('nextActiveAfterClose', () => {
    const list = [base('a'), base('b'), base('c')]

    test('keeps current active when a non-active tab closes', () => {
      expect(nextActiveAfterClose(list, 'a', 'c')).toBe('c')
    })

    test('selects the left neighbour when the active tab closes', () => {
      expect(nextActiveAfterClose(list, 'b', 'b')).toBe('a')
    })

    test('selects the new first tab when the first active tab closes', () => {
      expect(nextActiveAfterClose(list, 'a', 'a')).toBe('b')
    })

    test('returns null when the last tab closes', () => {
      expect(nextActiveAfterClose([base('a')], 'a', 'a')).toBeNull()
    })
  })
})

describe('AI command integration', () => {
  test('isShellCommandTool recognises shell tools only', () => {
    expect(isShellCommandTool('Bash')).toBe(true)
    expect(isShellCommandTool('BashTool')).toBe(true)
    expect(isShellCommandTool('PowerShell')).toBe(true)
    expect(isShellCommandTool('FileReadTool')).toBe(false)
    expect(isShellCommandTool('WebSearch')).toBe(false)
  })

  test('extractShellCommand pulls the command from known keys', () => {
    expect(extractShellCommand({ command: ' ls -la ' })).toBe('ls -la')
    expect(extractShellCommand({ script: 'echo hi' })).toBe('echo hi')
    expect(extractShellCommand({ other: 'x' })).toBeNull()
    expect(extractShellCommand(undefined)).toBeNull()
    expect(extractShellCommand({ command: '   ' })).toBeNull()
  })

  test('formatAiCommandLine produces a dim single-line prompt', () => {
    const line = formatAiCommandLine('echo\nhello')
    expect(line).toContain('echo hello')
    expect(line.startsWith('\x1b[2m')).toBe(true)
    expect(line.endsWith('\r\n')).toBe(true)
  })
})
