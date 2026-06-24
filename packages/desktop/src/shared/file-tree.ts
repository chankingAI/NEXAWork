/**
 * NexaWork File Browser — shared pure logic (N30)
 * ================================================
 * Zero-dependency helpers backing the project file-tree browser: directory
 * entry typing + sorting, default-ignore / `.gitignore` filtering, fuzzy
 * filename search, file-icon categorisation + colours, lazy-load batching, and
 * the immutable tree-state transitions the {@link useFileBrowser} hook runs.
 *
 * Everything here is a pure function or constant so it runs identically in the
 * renderer, the Electron main process, and under `bun test` (no `fs` / DOM /
 * native imports). Disk IO + filesystem watching live in
 * `../main/backend/file-browser-manager`; the React surface lives in
 * `../renderer/components/FileBrowser`.
 */
import { baseName, fileExtension } from './editor'

export type FileNodeKind = 'file' | 'directory'

/** One directory entry, safe to send over IPC (no fs handles). */
export interface FileEntry {
  /** Display name (basename). */
  name: string
  /** Absolute path on disk. */
  path: string
  kind: FileNodeKind
  /** Size in bytes (0 for directories). */
  size: number
  /** mtime in ms since epoch, or 0 when unknown. */
  mtime: number
}

// ─── Default ignore rules ────────────────────────────────────────────────────

/** Names hidden by default regardless of `.gitignore` (N30 spec). */
export const DEFAULT_IGNORED_NAMES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
])

/** True when a basename is hidden by the built-in default-ignore list. */
export function isDefaultIgnored(name: string): boolean {
  return DEFAULT_IGNORED_NAMES.has(name)
}

// ─── .gitignore matching ─────────────────────────────────────────────────────

/** A compiled `.gitignore` line. */
export interface GitignoreRule {
  /** Original (trimmed) source pattern, for debugging/tests. */
  source: string
  /** A leading `!` rule re-includes a previously ignored path. */
  negated: boolean
  /** A trailing `/` rule only matches directories. */
  dirOnly: boolean
  /** Compiled matcher against a repo-root-relative POSIX path. */
  regex: RegExp
}

/** Escape a literal character for use inside a RegExp. */
function escapeRegExpChar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Translate one gitignore glob into a RegExp source fragment (the part that
 * matches a single path, without anchors). `**` matches across separators,
 * `*` matches within a segment, `?` matches a single non-separator character.
 */
function globToRegExpBody(glob: string): string {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**` → any characters including `/`.
        out += '.*'
        i++
        // Swallow a following slash so `a/**/b` also matches `a/b`.
        if (glob[i + 1] === '/') {
          out += '/?'
          i++
        }
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else {
      out += escapeRegExpChar(ch)
    }
  }
  return out
}

/** Parse `.gitignore` file contents into ordered {@link GitignoreRule}s. */
export function parseGitignore(content: string): GitignoreRule[] {
  const rules: GitignoreRule[] = []
  for (const raw of content.split('\n')) {
    let line = raw.replace(/\r$/, '')
    // Strip trailing unescaped whitespace; keep escaped trailing spaces.
    line = line.replace(/(?:(?<!\\)\s)+$/, '')
    if (!line || line.startsWith('#')) continue

    let negated = false
    if (line.startsWith('!')) {
      negated = true
      line = line.slice(1)
    }
    // Unescape leading `\#` / `\!`.
    line = line.replace(/^\\([#!])/, '$1')
    if (!line) continue

    let dirOnly = false
    if (line.endsWith('/')) {
      dirOnly = true
      line = line.slice(0, -1)
    }

    // A pattern containing a (non-trailing) slash is anchored to the gitignore
    // root; a leading `**/` or no slash matches at any depth.
    let anchored = line.includes('/')
    if (line.startsWith('/')) {
      line = line.slice(1)
    } else if (line.startsWith('**/')) {
      anchored = false
      line = line.slice(3)
    }
    if (!line) continue

    const body = globToRegExpBody(line)
    const prefix = anchored ? '^' : '(?:^|.*/)'
    // Allow a directory pattern to also match everything beneath it.
    const regex = new RegExp(`${prefix}${body}(?:/.*)?$`)
    rules.push({ source: raw.trim(), negated, dirOnly, regex })
  }
  return rules
}

/**
 * Apply parsed gitignore rules to a repo-root-relative POSIX path. Later rules
 * win (matching git's last-match-wins semantics); negations re-include.
 */
export function isIgnoredByGitignore(
  relPath: string,
  isDir: boolean,
  rules: GitignoreRule[],
): boolean {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  let ignored = false
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue
    if (rule.regex.test(normalized)) ignored = !rule.negated
  }
  return ignored
}

/** Convert an absolute path to a POSIX path relative to `root` (`''` if equal). */
export function toRelativePosix(root: string, absPath: string): string {
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const p = absPath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (p === r) return ''
  if (p.startsWith(`${r}/`)) return p.slice(r.length + 1)
  return p
}

/** Combined visibility test: default-ignore first, then `.gitignore`. */
export function isEntryVisible(
  entry: { name: string; relPath: string; isDir: boolean },
  rules: GitignoreRule[],
  respectGitignore: boolean,
): boolean {
  if (isDefaultIgnored(entry.name)) return false
  if (respectGitignore && rules.length > 0) {
    if (isIgnoredByGitignore(entry.relPath, entry.isDir, rules)) return false
  }
  return true
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

/** Directories first, then case-insensitive name order (stable, locale-aware). */
export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

// ─── Lazy-load batching (N30: >100 items load in batches) ─────────────────────

export const LAZY_BATCH_SIZE = 100

export interface BatchResult {
  /** The slice `[0, offset + limit)` of the sorted entries. */
  visible: FileEntry[]
  /** Whether more entries remain past `visible`. */
  hasMore: boolean
  /** Total entry count (post-filter). */
  total: number
}

/**
 * Return the cumulative visible slice for a lazily-loaded directory: the first
 * `offset + limit` entries plus a `hasMore` flag. `offset` is how many are
 * already shown; `limit` defaults to {@link LAZY_BATCH_SIZE}.
 */
export function batchEntries(
  entries: FileEntry[],
  offset = 0,
  limit = LAZY_BATCH_SIZE,
): BatchResult {
  const total = entries.length
  const end = Math.min(total, Math.max(0, offset) + Math.max(1, limit))
  return {
    visible: entries.slice(0, end),
    hasMore: end < total,
    total,
  }
}

// ─── Fuzzy filename search ────────────────────────────────────────────────────

/**
 * Subsequence fuzzy match: every char of `query` appears in `text` in order
 * (case-insensitive). Empty query matches everything.
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase()
  if (!q) return true
  const t = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

/**
 * Score a fuzzy match (higher = better): rewards contiguous runs, a prefix
 * match and an exact-substring hit. Returns -1 when `query` does not match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  if (!q) return 0
  const t = text.toLowerCase()
  if (t === q) return 1000
  let qi = 0
  let score = 0
  let streak = 0
  let firstIdx = -1
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstIdx < 0) firstIdx = ti
      streak += 1
      score += 1 + streak
      qi++
    } else {
      streak = 0
    }
  }
  if (qi < q.length) return -1
  if (firstIdx === 0) score += 10
  if (t.includes(q)) score += 20
  return score
}

/** Filter + rank entries by fuzzy filename match (best first). */
export function searchEntries(
  entries: FileEntry[],
  query: string,
): FileEntry[] {
  if (!query.trim()) return entries
  const scored: Array<{ entry: FileEntry; score: number }> = []
  for (const entry of entries) {
    const score = fuzzyScore(query, entry.name)
    if (score >= 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.entry)
}

// ─── File-icon categorisation + colours ───────────────────────────────────────

export type FileIconCategory =
  | 'directory'
  | 'code'
  | 'script'
  | 'style'
  | 'markup'
  | 'json'
  | 'config'
  | 'markdown'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'pdf'
  | 'font'
  | 'lock'
  | 'git'
  | 'binary'
  | 'text'

const EXTENSION_CATEGORY: Record<string, FileIconCategory> = {
  ts: 'code',
  tsx: 'code',
  mts: 'code',
  cts: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  vue: 'code',
  svelte: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  kt: 'code',
  swift: 'code',
  c: 'code',
  h: 'code',
  cpp: 'code',
  cc: 'code',
  hpp: 'code',
  cs: 'code',
  py: 'code',
  rb: 'code',
  php: 'code',
  lua: 'code',
  dart: 'code',
  scala: 'code',
  r: 'code',
  sh: 'script',
  bash: 'script',
  zsh: 'script',
  ps1: 'script',
  bat: 'script',
  cmd: 'script',
  css: 'style',
  scss: 'style',
  sass: 'style',
  less: 'style',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  json: 'json',
  jsonc: 'json',
  yml: 'config',
  yaml: 'config',
  toml: 'config',
  ini: 'config',
  env: 'config',
  conf: 'config',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  ico: 'image',
  bmp: 'image',
  avif: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  rar: 'archive',
  '7z': 'archive',
  bz2: 'archive',
  xz: 'archive',
  pdf: 'pdf',
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  eot: 'font',
  txt: 'text',
  log: 'text',
  exe: 'binary',
  dll: 'binary',
  so: 'binary',
  dylib: 'binary',
  bin: 'binary',
  wasm: 'binary',
}

const FILENAME_CATEGORY: Record<string, FileIconCategory> = {
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  dockerfile: 'config',
  makefile: 'config',
  'package.json': 'json',
  'tsconfig.json': 'json',
  'bun.lock': 'lock',
  'bun.lockb': 'lock',
  'package-lock.json': 'lock',
  'yarn.lock': 'lock',
  'pnpm-lock.yaml': 'lock',
}

/** Classify a file/dir into an icon category used to pick its Lucide glyph. */
export function fileIconCategory(
  name: string,
  kind: FileNodeKind,
): FileIconCategory {
  if (kind === 'directory') return 'directory'
  const lower = baseName(name).toLowerCase()
  if (FILENAME_CATEGORY[lower]) return FILENAME_CATEGORY[lower]
  const ext = fileExtension(name)
  return EXTENSION_CATEGORY[ext] ?? 'text'
}

/** Accent colour for an icon category (Apple-flat palette, white-bg friendly). */
export const ICON_CATEGORY_COLOR: Record<FileIconCategory, string> = {
  directory: '#60A5FA',
  code: '#3B82F6',
  script: '#10B981',
  style: '#EC4899',
  markup: '#F97316',
  json: '#F59E0B',
  config: '#8B5CF6',
  markdown: '#0EA5E9',
  image: '#A855F7',
  video: '#EF4444',
  audio: '#14B8A6',
  archive: '#92400E',
  pdf: '#DC2626',
  font: '#6366F1',
  lock: '#9CA3AF',
  git: '#F1502F',
  binary: '#6B7280',
  text: '#64748B',
}

/** Convenience: the colour for a path's icon. */
export function fileIconColor(name: string, kind: FileNodeKind): string {
  return ICON_CATEGORY_COLOR[fileIconCategory(name, kind)]
}

// ─── Tree state model (renderer) ──────────────────────────────────────────────

/** A node in the rendered file tree. `children === null` ⇒ not yet loaded. */
export interface TreeNode {
  entry: FileEntry
  depth: number
  expanded: boolean
  loading: boolean
  children: TreeNode[] | null
  /** How many of this directory's entries are loaded (lazy batching). */
  loadedCount: number
  /** Whether more entries remain to load for this directory. */
  hasMore: boolean
}

/** Build a fresh (collapsed, unloaded) tree node for an entry. */
export function makeTreeNode(entry: FileEntry, depth: number): TreeNode {
  return {
    entry,
    depth,
    expanded: false,
    loading: false,
    children: null,
    loadedCount: 0,
    hasMore: false,
  }
}

/** Immutably replace the node at `path`, mapping it through `updater`. */
export function updateNode(
  nodes: TreeNode[],
  path: string,
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map(node => {
    if (node.entry.path === path) return updater(node)
    if (node.children) {
      const nextChildren = updateNode(node.children, path, updater)
      if (nextChildren !== node.children) {
        return { ...node, children: nextChildren }
      }
    }
    return node
  })
}

/** Find a node by path (depth-first), or null. */
export function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.entry.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}

/**
 * Flatten the tree into the visible row order (expanded directories contribute
 * their children) — what the renderer maps to a flat virtual list.
 */
export function flattenVisible(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      out.push(node)
      if (node.entry.kind === 'directory' && node.expanded && node.children) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return out
}

/** Set a directory node's loaded children (from a list result). */
export function setNodeChildren(
  nodes: TreeNode[],
  path: string,
  childEntries: FileEntry[],
  depth: number,
  hasMore: boolean,
): TreeNode[] {
  return updateNode(nodes, path, node => ({
    ...node,
    loading: false,
    expanded: true,
    children: childEntries.map(e => makeTreeNode(e, depth)),
    loadedCount: childEntries.length,
    hasMore,
  }))
}

/** Collapse a directory node (keeps its cached children for re-expand). */
export function collapseNode(nodes: TreeNode[], path: string): TreeNode[] {
  return updateNode(nodes, path, node => ({ ...node, expanded: false }))
}

/** Mark a directory node as loading (spinner) before its list resolves. */
export function markNodeLoading(nodes: TreeNode[], path: string): TreeNode[] {
  return updateNode(nodes, path, node => ({ ...node, loading: true }))
}

/**
 * Reconcile a freshly-listed set of entries against the previously-rendered
 * children of a directory (used on a live `file:changed` refresh): entries that
 * still exist keep their expansion + loaded subtree, vanished entries drop out,
 * and new entries appear as fresh collapsed nodes. Result is re-sorted.
 */
export function reconcileChildren(
  prev: TreeNode[] | null,
  newEntries: FileEntry[],
  depth: number,
): TreeNode[] {
  const byPath = new Map<string, TreeNode>()
  for (const node of prev ?? []) byPath.set(node.entry.path, node)
  return newEntries.map(entry => {
    const existing = byPath.get(entry.path)
    if (existing && existing.entry.kind === entry.kind) {
      return { ...existing, entry, depth }
    }
    return makeTreeNode(entry, depth)
  })
}
