/**
 * NexaWork Code-Editor Helpers (N28)
 * ===================================
 * Pure, dependency-free types + helpers shared by the editor manager (main
 * process), the IPC layer and the renderer CodeEditor / DiffViewer. Keeping
 * language detection, tab-model maths, git `--name-status` parsing, diff line
 * ranges (for highlighting AI edits) and the editor config defaults here means
 * they can be unit tested under `bun test` without Electron / Monaco, and the
 * renderer reuses the exact same logic the backend computes.
 *
 * No Electron / fs / Monaco / native dependencies live here on purpose.
 */

// ─── Editor configuration ────────────────────────────────────────────────────

/** Static editor configuration (N28 spec: JetBrains Mono 13px, 2-space tabs). */
export interface EditorConfig {
  fontFamily: string
  fontSize: number
  tabSize: number
  /** Debounce before an edited tab is auto-written to disk. */
  autosaveDelayMs: number
  minimap: boolean
}

export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  fontFamily:
    "'JetBrains Mono', 'SF Mono', ui-monospace, 'Menlo', 'Consolas', monospace",
  fontSize: 13,
  tabSize: 2,
  autosaveDelayMs: 1000,
  minimap: false,
}

/** Hard ceiling (bytes) above which we refuse to load a file into the editor. */
export const MAX_EDITABLE_FILE_BYTES = 2 * 1024 * 1024 // 2 MiB

// ─── Language detection ──────────────────────────────────────────────────────

/**
 * Map of file extensions → Monaco language id. Only the languages Monaco ships
 * grammars for are worth listing; anything unknown falls back to plaintext.
 */
const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'html',
  dockerfile: 'dockerfile',
  ini: 'ini',
  bat: 'bat',
  ps1: 'powershell',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  scala: 'scala',
}

/** Filenames (lower-cased) that map to a language regardless of extension. */
const FILENAME_LANGUAGE: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  '.gitignore': 'plaintext',
  '.env': 'plaintext',
}

/** Extract the trailing path segment (handles both `/` and `\\` separators). */
export function baseName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/** Lower-cased extension without the dot, or '' when there is none. */
export function fileExtension(path: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return '' // no dot, or dotfile like `.env`
  return name.slice(dot + 1).toLowerCase()
}

/** Detect the Monaco language id for a path; defaults to `plaintext`. */
export function detectLanguage(path: string): string {
  const name = baseName(path).toLowerCase()
  if (FILENAME_LANGUAGE[name]) return FILENAME_LANGUAGE[name]
  const ext = fileExtension(path)
  return EXTENSION_LANGUAGE[ext] ?? 'plaintext'
}

/** Heuristic binary sniff: presence of a NUL byte in the leading sample. */
export function isProbablyBinary(content: string): boolean {
  const sample = content.slice(0, 8000)
  return sample.includes('\u0000')
}

// ─── Tab model ───────────────────────────────────────────────────────────────

/** A single open editor tab. */
export interface EditorTab {
  /** Stable id (usually the absolute path). */
  id: string
  /** Absolute file path on disk. */
  path: string
  /** Display name (file basename). */
  name: string
  /** Monaco language id. */
  language: string
  /** Current buffer contents. */
  content: string
  /** Last contents known to match disk (for dirty + autosave checks). */
  savedContent: string
  /** Whether the buffer differs from disk. */
  dirty: boolean
  /** Read-only tabs cannot be edited/saved (e.g. too-large files). */
  readOnly: boolean
}

/** Persisted subset of the editor state (content is reloaded from disk). */
export interface EditorPersistState {
  openPaths: string[]
  activePath: string | null
}

/** Build a fresh tab for a file just loaded from disk. */
export function makeTab(
  path: string,
  content: string,
  opts: { language?: string; readOnly?: boolean } = {},
): EditorTab {
  return {
    id: path,
    path,
    name: baseName(path),
    language: opts.language ?? detectLanguage(path),
    content,
    savedContent: content,
    dirty: false,
    readOnly: opts.readOnly ?? false,
  }
}

/** Find a tab index by path; -1 when absent. */
export function indexOfTab(tabs: EditorTab[], path: string): number {
  return tabs.findIndex(t => t.path === path)
}

/**
 * Add a tab (or return the existing one's index when the path is already open),
 * yielding the next tab array + the active path that should be focused.
 */
export function openTab(
  tabs: EditorTab[],
  tab: EditorTab,
): { tabs: EditorTab[]; activePath: string } {
  const existing = indexOfTab(tabs, tab.path)
  if (existing >= 0) {
    // Refresh contents from the freshly-read tab but keep position.
    const next = tabs.slice()
    next[existing] = tab
    return { tabs: next, activePath: tab.path }
  }
  return { tabs: [...tabs, tab], activePath: tab.path }
}

/**
 * Close the tab at `path`, returning the next tab array + the active path that
 * should be focused afterwards (the neighbour, or null when none remain).
 */
export function closeTab(
  tabs: EditorTab[],
  path: string,
  activePath: string | null,
): { tabs: EditorTab[]; activePath: string | null } {
  const idx = indexOfTab(tabs, path)
  if (idx < 0) return { tabs, activePath }
  const next = tabs.filter(t => t.path !== path)
  if (next.length === 0) return { tabs: next, activePath: null }
  if (activePath !== path) return { tabs: next, activePath }
  // Focus the neighbour that takes the closed tab's slot (or the new last one).
  const neighbour = next[Math.min(idx, next.length - 1)]
  return { tabs: next, activePath: neighbour.path }
}

/** Apply a content edit to a tab, recomputing its dirty flag. */
export function setTabContent(
  tabs: EditorTab[],
  path: string,
  content: string,
): EditorTab[] {
  return tabs.map(t =>
    t.path === path ? { ...t, content, dirty: content !== t.savedContent } : t,
  )
}

/** Mark a tab as saved (savedContent := content, dirty := false). */
export function markTabSaved(
  tabs: EditorTab[],
  path: string,
  savedContent?: string,
): EditorTab[] {
  return tabs.map(t =>
    t.path === path
      ? {
          ...t,
          savedContent: savedContent ?? t.content,
          content: savedContent ?? t.content,
          dirty: false,
        }
      : t,
  )
}

/** Serialize the open tabs to the persisted shape. */
export function toPersistState(
  tabs: EditorTab[],
  activePath: string | null,
): EditorPersistState {
  return { openPaths: tabs.map(t => t.path), activePath }
}

// ─── Git change parsing ──────────────────────────────────────────────────────

export type GitChangeStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'type-changed'
  | 'unknown'

export interface GitChange {
  path: string
  status: GitChangeStatus
  /** Single-letter status code (M/A/D/R/C/T/?). */
  code: string
  /** Original path for renames/copies. */
  oldPath?: string
}

/** Map a git status letter to a friendly status enum. */
export function gitStatusFromCode(code: string): GitChangeStatus {
  switch (code[0]) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'type-changed'
    case '?':
      return 'untracked'
    default:
      return 'unknown'
  }
}

/**
 * Parse the output of `git diff --name-status` (optionally including `-z`
 * untracked lines). Each line is `<code>\t<path>` or, for renames/copies,
 * `<code>\t<oldPath>\t<newPath>`. Whitespace-only input yields `[]`.
 */
export function parseGitNameStatus(stdout: string): GitChange[] {
  const changes: GitChange[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim()) continue
    const parts = line.split('\t')
    const code = parts[0].trim()
    const status = gitStatusFromCode(code)
    if ((code[0] === 'R' || code[0] === 'C') && parts.length >= 3) {
      changes.push({
        path: parts[2],
        oldPath: parts[1],
        status,
        code,
      })
    } else if (parts.length >= 2) {
      changes.push({ path: parts[parts.length - 1], status, code })
    }
  }
  return changes
}

/** Data backing a Monaco DiffEditor for a single changed file. */
export interface GitDiffData {
  path: string
  status: GitChangeStatus
  /** Contents at HEAD (empty for added/untracked files). */
  original: string
  /** Current working-tree contents (empty for deleted files). */
  modified: string
  language: string
}

// ─── AI integration helpers ──────────────────────────────────────────────────

/** Tool names (from the backend tool registry) that mutate a file on disk. */
const FILE_MUTATING_TOOLS = new Set([
  'FileWriteTool',
  'FileEditTool',
  'FileMultiEditTool',
  'NotebookEditTool',
])

/** Whether a streamed tool result corresponds to a file write/edit. */
export function isFileMutatingTool(toolName: string): boolean {
  return FILE_MUTATING_TOOLS.has(toolName)
}

/**
 * Pull the target file path out of a tool's input payload. Different tools name
 * the field differently (`file_path`, `filePath`, `path`, `notebook_path`); we
 * accept any of them. Returns null when no string path is present.
 */
export function extractEditedFilePath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  for (const key of ['file_path', 'filePath', 'path', 'notebook_path']) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/**
 * Build the chat prompt for the "Ask AI about this" editor context-menu action.
 * Wraps the selection in a fenced block tagged with the file's language so the
 * assistant has both the code and its provenance.
 */
export function buildAskAiPrompt(
  filePath: string,
  language: string,
  selection: string,
): string {
  const fence = language && language !== 'plaintext' ? language : ''
  const name = baseName(filePath)
  return [
    `关于 \`${name}\` 中选中的这段代码，请帮我解释 / 改进：`,
    '',
    '```' + fence,
    selection,
    '```',
  ].join('\n')
}

// ─── Diff line ranges (AI-edit highlighting) ─────────────────────────────────

/** An inclusive 1-based line range in the modified document. */
export interface LineRange {
  startLine: number
  endLine: number
}

/**
 * Compute the set of changed line ranges between two text documents using a
 * classic LCS line diff. Returns ranges (1-based, inclusive) in the *new*
 * document that were added or modified — used to flash-highlight the lines an
 * AI assistant just rewrote. Pure addition at EOF and intra-line edits are
 * both captured. When nothing changed, returns `[]`.
 */
export function computeChangedLineRanges(
  oldText: string,
  newText: string,
): LineRange[] {
  if (oldText === newText) return []
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const n = a.length
  const m = b.length

  // LCS table over lines.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  // Walk the table; collect runs of lines present in `b` but not matched.
  const changedNewLines: boolean[] = new Array<boolean>(m).fill(false)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // Line removed from old → does not advance new doc.
      i++
    } else {
      // Line added in new doc.
      changedNewLines[j] = true
      j++
    }
  }
  while (j < m) {
    changedNewLines[j] = true
    j++
  }

  // Coalesce consecutive changed lines into ranges (1-based, inclusive).
  const ranges: LineRange[] = []
  let runStart = -1
  for (let k = 0; k < m; k++) {
    if (changedNewLines[k]) {
      if (runStart < 0) runStart = k
    } else if (runStart >= 0) {
      ranges.push({ startLine: runStart + 1, endLine: k })
      runStart = -1
    }
  }
  if (runStart >= 0) ranges.push({ startLine: runStart + 1, endLine: m })
  return ranges
}
