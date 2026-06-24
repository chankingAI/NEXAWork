/**
 * NexaWork Git Panel Helpers (N31)
 * =================================
 * Pure, dependency-free types + helpers shared by the git manager (main
 * process), the IPC layer and the renderer GitPanel / DiffView. Parsing
 * `git status --porcelain`, branch listing, commit-message validation and
 * unified-diff hunk splitting all live here so they can be unit-tested under
 * `bun test` without Electron / a real git process, and the renderer reuses the
 * exact logic the backend computes.
 *
 * No Electron / fs / child_process / native dependencies live here on purpose.
 * The single-letter friendly status enum is shared with the N28 editor diff
 * layer (`./editor`).
 */
import { type GitChangeStatus, gitStatusFromCode } from './editor'

export type { GitChangeStatus } from './editor'

// ─── Working-tree status ──────────────────────────────────────────────────────

/**
 * A single changed path as reported by `git status`. Git tracks two independent
 * status columns: `index` (staged, the "X" column) and `worktree` (unstaged,
 * the "Y" column). A path may appear partially staged (both non-space).
 */
export interface GitFileState {
  /** Repo-root-relative path (POSIX separators). */
  path: string
  /** Original path for renames/copies. */
  oldPath?: string
  /** Staged status letter (X column): M/A/D/R/C/space/? . */
  index: string
  /** Unstaged status letter (Y column): M/D/?/space . */
  worktree: string
  /** Whether the index column shows a staged change. */
  staged: boolean
  /** Whether the worktree column shows an unstaged change. */
  unstaged: boolean
  /** Untracked files (`??`). */
  untracked: boolean
  /** Friendly status derived from the most significant column. */
  status: GitChangeStatus
}

/** Unescape a C-quoted git path (`"src/a b.txt"` → `src/a b.txt`). */
export function dequoteGitPath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path
  const inner = path.slice(1, -1)
  let out = ''
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = inner[++i]
    switch (next) {
      case 'n':
        out += '\n'
        break
      case 't':
        out += '\t'
        break
      case 'r':
        out += '\r'
        break
      case '"':
        out += '"'
        break
      case '\\':
        out += '\\'
        break
      default:
        out += next ?? ''
    }
  }
  return out
}

/** Friendly status from a porcelain XY pair (index favoured, then worktree). */
function statusFromXY(index: string, worktree: string): GitChangeStatus {
  if (index === '?' && worktree === '?') return 'untracked'
  const primary = index !== ' ' && index !== '' ? index : worktree
  return gitStatusFromCode(primary)
}

/**
 * Parse the output of `git status --porcelain=v1` (newline form, NOT `-z`).
 * Each line is `XY <path>` or, for renames/copies, `XY <old> -> <new>`. Paths
 * containing unusual characters are C-quoted by git and unescaped here.
 * Whitespace-only input yields `[]`.
 */
export function parsePorcelainStatus(stdout: string): GitFileState[] {
  const files: GitFileState[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.length < 4) continue
    const index = line[0]
    const worktree = line[1]
    // Column 2 is a space separator; the path starts at column 3.
    const rest = line.slice(3)
    let path = rest
    let oldPath: string | undefined
    const arrow = rest.indexOf(' -> ')
    if (arrow >= 0) {
      oldPath = dequoteGitPath(rest.slice(0, arrow))
      path = dequoteGitPath(rest.slice(arrow + 4))
    } else {
      path = dequoteGitPath(rest)
    }
    const untracked = index === '?' && worktree === '?'
    files.push({
      path,
      oldPath,
      index,
      worktree,
      staged: index !== ' ' && index !== '?' && index !== '',
      unstaged: worktree !== ' ' && worktree !== '',
      untracked,
      status: statusFromXY(index, worktree),
    })
  }
  return files
}

/** Partition parsed status into staged vs unstaged buckets (a path may be both). */
export function splitStaged(files: GitFileState[]): {
  staged: GitFileState[]
  unstaged: GitFileState[]
} {
  const staged: GitFileState[] = []
  const unstaged: GitFileState[] = []
  for (const f of files) {
    if (f.staged) staged.push(f)
    if (f.unstaged || f.untracked) unstaged.push(f)
  }
  return { staged, unstaged }
}

/** Total number of distinct changed paths (for badge counts). */
export function countChanges(files: GitFileState[]): number {
  return files.length
}

// ─── Branches ──────────────────────────────────────────────────────────────────

export interface GitBranch {
  name: string
  current: boolean
  /** Upstream tracking ref, when set (e.g. `origin/main`). */
  upstream?: string
}

export interface GitBranchInfo {
  current: string | null
  branches: GitBranch[]
  /** Commits ahead/behind the upstream, when known. */
  ahead: number
  behind: number
}

/**
 * Parse `git branch --format=%(HEAD)%(refname:short)%09%(upstream:short)`.
 * `%(HEAD)` is `*` for the current branch; the tab separates name + upstream.
 * Detached HEAD lines (name starting with `(`) are skipped.
 */
export function parseBranchList(stdout: string): GitBranch[] {
  const branches: GitBranch[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim()) continue
    const current = line[0] === '*'
    const body = current ? line.slice(1) : line
    const [name, upstream] = body.split('\t')
    const trimmed = name.trim()
    if (!trimmed || trimmed.startsWith('(')) continue
    branches.push({
      name: trimmed,
      current,
      upstream: upstream?.trim() || undefined,
    })
  }
  return branches
}

/** Parse `git rev-list --left-right --count @{upstream}...HEAD` → behind/ahead. */
export function parseAheadBehind(stdout: string): {
  ahead: number
  behind: number
} {
  const parts = stdout.trim().split(/\s+/)
  if (parts.length < 2) return { ahead: 0, behind: 0 }
  const behind = Number.parseInt(parts[0], 10)
  const ahead = Number.parseInt(parts[1], 10)
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  }
}

// ─── Branch-name + commit-message validation ────────────────────────────────────

export type BranchNameError =
  | 'empty'
  | 'whitespace'
  | 'invalidChar'
  | 'invalidSequence'
  | 'slash'
  | 'dot'
  | 'lock'

/**
 * Validate a candidate branch name against git's `check-ref-format` rules
 * (the common subset). Returns null when valid, otherwise an error key.
 */
export function validateBranchName(name: string): BranchNameError | null {
  const n = name.trim()
  if (!n) return 'empty'
  if (/\s/.test(n)) return 'whitespace'
  if (/[~^:?*[\\]/.test(n)) return 'invalidChar'
  if (n.includes('..') || n.includes('@{')) return 'invalidSequence'
  if (n.startsWith('/') || n.endsWith('/') || n.includes('//')) return 'slash'
  if (n.startsWith('.') || n.endsWith('.')) return 'dot'
  if (n.endsWith('.lock')) return 'lock'
  return null
}

/** A commit message is acceptable when it has a non-empty first line. */
export function isValidCommitMessage(message: string): boolean {
  return message.trim().length > 0
}

// ─── Unified-diff hunk parsing (per-hunk staging) ────────────────────────────────

/** A single `@@ ... @@` hunk within a file diff. */
export interface DiffHunk {
  /** The `@@ -a,b +c,d @@` header line. */
  header: string
  /** Body lines (context / +added / -removed), excluding the header. */
  lines: string[]
  /** Full hunk text (header + lines, newline-joined, trailing newline). */
  text: string
  /** Count of added (`+`) lines. */
  additions: number
  /** Count of removed (`-`) lines. */
  deletions: number
}

export interface ParsedFileDiff {
  /** Lines before the first hunk (`diff --git`, `index`, `---`, `+++`). */
  fileHeader: string[]
  hunks: DiffHunk[]
}

/**
 * Split a single-file `git diff` into its file header + hunks. Per-hunk staging
 * reconstructs a minimal patch from {@link buildHunkPatch} and feeds it to
 * `git apply --cached`.
 */
export function parseDiffHunks(diffText: string): ParsedFileDiff {
  const lines = diffText.split('\n')
  const fileHeader: string[] = []
  const hunks: DiffHunk[] = []
  let current: { header: string; lines: string[] } | null = null

  const flush = (): void => {
    if (!current) return
    let additions = 0
    let deletions = 0
    for (const l of current.lines) {
      if (l.startsWith('+')) additions++
      else if (l.startsWith('-')) deletions++
    }
    hunks.push({
      header: current.header,
      lines: current.lines,
      text: [current.header, ...current.lines].join('\n') + '\n',
      additions,
      deletions,
    })
    current = null
  }

  for (const line of lines) {
    if (line.startsWith('@@')) {
      flush()
      current = { header: line, lines: [] }
    } else if (current) {
      // A trailing empty string from the final split is not part of the hunk.
      current.lines.push(line)
    } else {
      fileHeader.push(line)
    }
  }
  flush()

  // Drop a trailing empty body line introduced by the final newline.
  for (const hunk of hunks) {
    while (hunk.lines.length > 0 && hunk.lines[hunk.lines.length - 1] === '') {
      hunk.lines.pop()
    }
    hunk.text = [hunk.header, ...hunk.lines].join('\n') + '\n'
  }
  return { fileHeader, hunks }
}

/**
 * Build a minimal, `git apply`-able patch for a single hunk: the file header
 * (everything before the first `@@`) followed by just that one hunk.
 */
export function buildHunkPatch(fileHeader: string[], hunk: DiffHunk): string {
  const header = fileHeader.filter(l => l.length > 0).join('\n')
  return `${header}\n${hunk.text}`
}

// ─── Status presentation ─────────────────────────────────────────────────────

/** Short single-letter badge for a status (M/A/D/R/C/U/?). */
export function statusBadge(state: GitFileState): string {
  if (state.untracked) return 'U'
  const letter = state.index !== ' ' ? state.index : state.worktree
  return letter === '?' ? 'U' : letter || 'M'
}

/** A stable colour-category for a status badge (renderer maps to a hex). */
export type GitStatusTone = 'added' | 'modified' | 'deleted' | 'renamed'

export function statusTone(status: GitChangeStatus): GitStatusTone {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'added'
    case 'deleted':
      return 'deleted'
    case 'renamed':
    case 'copied':
      return 'renamed'
    default:
      return 'modified'
  }
}

/** Hex colour per tone, mirroring the file-tree / diff palette. */
export const GIT_TONE_COLOR: Record<GitStatusTone, string> = {
  added: '#3FB950',
  modified: '#D29922',
  deleted: '#F85149',
  renamed: '#A371F7',
}
