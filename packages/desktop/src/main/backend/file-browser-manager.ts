/**
 * NexaWork File Browser Manager (N30)
 * ====================================
 * Owns the disk-facing side of the project file-tree browser: listing
 * directories (with default-ignore + `.gitignore` filtering, directory-first
 * sorting and lazy batching), file/folder mutations (create / rename / delete /
 * move) and live filesystem watching.
 *
 * Like the other managers it keeps zero native dependencies beyond `fs`, and
 * the watcher factory is injectable — tests pass a fake watcher and never touch
 * `fs.watch`, mirroring the injectable-PTY pattern in `./terminal-manager`. All
 * path-filtering / sorting / batching logic is the pure code in
 * `../../shared/file-tree`, reused verbatim by the renderer.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch as fsWatch,
  writeFileSync,
} from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join, resolve } from 'path'
import {
  batchEntries,
  type FileEntry,
  type FileNodeKind,
  type GitignoreRule,
  isEntryVisible,
  LAZY_BATCH_SIZE,
  parseGitignore,
  searchEntries,
  sortEntries,
  toRelativePosix,
} from '../../shared/file-tree'

/** Minimal subset of `fs.FSWatcher` the manager relies on. */
export interface FileWatcher {
  close(): void
}

/** Factory producing a watcher for `dir`, invoking `cb` on any change. */
export type WatchFn = (dir: string, cb: () => void) => FileWatcher

export interface FileBrowserManagerOptions {
  /** Project root (default-cwd) used for relative paths + `.gitignore`. */
  root?: string
  /** Injectable directory watcher (defaults to a lazy `fs.watch`). */
  watch?: WatchFn
  /** Disable filesystem watching entirely (e.g. headless tests). */
  watchEnabled?: boolean
}

export interface ListDirInput {
  path: string
  offset?: number
  limit?: number
  respectGitignore?: boolean
}

export interface ListDirResult {
  path: string
  root: string
  entries: FileEntry[]
  hasMore: boolean
  total: number
}

export interface MutationResult {
  path: string
  success: boolean
}

type ChangeListener = (dir: string) => void

/** Default watcher: a non-recursive `fs.watch` (Linux lacks recursive mode). */
function defaultWatch(dir: string, cb: () => void): FileWatcher {
  const watcher = fsWatch(dir, { persistent: false }, () => cb())
  watcher.on('error', () => {
    // A vanished/again-unreadable directory should not crash the process.
  })
  return watcher
}

function safeCwd(): string {
  try {
    return process.cwd()
  } catch {
    return homedir()
  }
}

export class FileBrowserManager {
  private root: string
  private readonly watchFn: WatchFn
  private readonly watchEnabled: boolean
  private readonly watchers = new Map<string, FileWatcher>()
  private readonly changeListeners = new Set<ChangeListener>()
  /** Cached parsed `.gitignore` rules + the mtime they were read at. */
  private gitignoreRules: GitignoreRule[] = []
  private gitignoreMtime = -1

  constructor(opts: FileBrowserManagerOptions = {}) {
    this.root = normalizeDir(opts.root ?? safeCwd())
    this.watchFn = opts.watch ?? defaultWatch
    this.watchEnabled = opts.watchEnabled ?? true
    this.loadGitignore()
  }

  // ─── Root ───────────────────────────────────────────────────────────────────

  getRoot(): string {
    return this.root
  }

  /** Re-point the browser at a new project root (tears down old watchers). */
  setRoot(root: string): string {
    const next = normalizeDir(root)
    if (next !== this.root) {
      this.disposeWatchers()
      this.root = next
      this.gitignoreMtime = -1
      this.loadGitignore()
    }
    return this.root
  }

  // ─── Change notifications ─────────────────────────────────────────────────────

  onChanged(listener: ChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private emitChanged(dir: string): void {
    for (const listener of this.changeListeners) listener(dir)
  }

  // ─── Listing ──────────────────────────────────────────────────────────────────

  /**
   * List one directory: filtered (default-ignore + `.gitignore`), sorted
   * (dirs first) and batched (first `offset + limit` entries). Begins watching
   * the directory so external changes push a `file:changed` event.
   */
  list(input: ListDirInput): ListDirResult {
    const dir = this.resolvePath(input.path)
    const respectGitignore = input.respectGitignore ?? true
    this.refreshGitignoreIfStale()

    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      throw new Error(`ENOENT: cannot list '${dir}'`)
    }

    const entries: FileEntry[] = []
    for (const name of names) {
      const abs = join(dir, name)
      let isDir = false
      let size = 0
      let mtime = 0
      try {
        const st = statSync(abs)
        isDir = st.isDirectory()
        size = isDir ? 0 : st.size
        mtime = Math.floor(st.mtimeMs)
      } catch {
        continue // Vanished between readdir + stat — skip.
      }
      const relPath = toRelativePosix(this.root, abs)
      if (
        !isEntryVisible(
          { name, relPath, isDir },
          this.gitignoreRules,
          respectGitignore,
        )
      ) {
        continue
      }
      entries.push({
        name,
        path: abs,
        kind: isDir ? 'directory' : 'file',
        size,
        mtime,
      })
    }

    const sorted = sortEntries(entries)
    const { visible, hasMore, total } = batchEntries(
      sorted,
      input.offset ?? 0,
      input.limit ?? LAZY_BATCH_SIZE,
    )
    this.watchDir(dir)
    return { path: dir, root: this.root, entries: visible, hasMore, total }
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────────

  /** Create an empty file or a directory (creating parents as needed). */
  create(path: string, kind: FileNodeKind): MutationResult {
    const abs = this.resolvePath(path)
    if (existsSync(abs)) {
      throw new Error(`EEXIST: '${abs}' already exists`)
    }
    if (kind === 'directory') {
      mkdirSync(abs, { recursive: true })
    } else {
      const parent = dirname(abs)
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
      writeFileSync(abs, '', 'utf-8')
    }
    return { path: abs, success: true }
  }

  /** Rename / move a path to `newPath` (a sibling rename or a relocation). */
  rename(oldPath: string, newPath: string): MutationResult {
    const from = this.resolvePath(oldPath)
    const to = this.resolvePath(newPath)
    if (!existsSync(from)) throw new Error(`ENOENT: '${from}' not found`)
    if (existsSync(to)) throw new Error(`EEXIST: '${to}' already exists`)
    const parent = dirname(to)
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
    renameSync(from, to)
    return { path: to, success: true }
  }

  /** Move a path into `targetDir`, keeping its basename (drag-and-drop). */
  move(fromPath: string, targetDir: string): MutationResult {
    const from = this.resolvePath(fromPath)
    const dir = this.resolvePath(targetDir)
    const base = from.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop()!
    const to = join(dir, base)
    return this.rename(from, to)
  }

  /** Delete a file or directory (recursively for directories). */
  remove(path: string): MutationResult {
    const abs = this.resolvePath(path)
    if (!existsSync(abs)) return { path: abs, success: true }
    rmSync(abs, { recursive: true, force: true })
    return { path: abs, success: true }
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  /**
   * Recursively fuzzy-search filenames under `root` (or the project root),
   * honouring the same ignore rules as listing. Capped at `limit` results to
   * bound the walk on large trees.
   */
  search(
    query: string,
    opts: { root?: string; limit?: number } = {},
  ): {
    matches: FileEntry[]
  } {
    const q = query.trim()
    if (!q) return { matches: [] }
    this.refreshGitignoreIfStale()
    const startDir = opts.root ? this.resolvePath(opts.root) : this.root
    const limit = opts.limit ?? 200
    const collected: FileEntry[] = []
    const maxVisited = 20000
    let visited = 0

    const walk = (dir: string): void => {
      if (collected.length >= limit || visited >= maxVisited) return
      let names: string[]
      try {
        names = readdirSync(dir)
      } catch {
        return
      }
      for (const name of names) {
        if (collected.length >= limit || visited >= maxVisited) return
        visited++
        const abs = join(dir, name)
        let isDir = false
        let size = 0
        let mtime = 0
        try {
          const st = statSync(abs)
          isDir = st.isDirectory()
          size = isDir ? 0 : st.size
          mtime = Math.floor(st.mtimeMs)
        } catch {
          continue
        }
        const relPath = toRelativePosix(this.root, abs)
        if (
          !isEntryVisible({ name, relPath, isDir }, this.gitignoreRules, true)
        ) {
          continue
        }
        collected.push({
          name,
          path: abs,
          kind: isDir ? 'directory' : 'file',
          size,
          mtime,
        })
        if (isDir) walk(abs)
      }
    }
    walk(startDir)
    return { matches: searchEntries(collected, q).slice(0, limit) }
  }

  // ─── Watching ─────────────────────────────────────────────────────────────────

  private watchDir(dir: string): void {
    if (!this.watchEnabled || this.watchers.has(dir)) return
    try {
      const watcher = this.watchFn(dir, () => this.emitChanged(dir))
      this.watchers.set(dir, watcher)
    } catch {
      // Watching is best-effort; listing still works without live updates.
    }
  }

  /** Tear down every active watcher. */
  disposeWatchers(): void {
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close()
      } catch {
        // Already closed.
      }
    }
    this.watchers.clear()
  }

  /** Full teardown (watchers + listeners) on window close / re-registration. */
  dispose(): void {
    this.disposeWatchers()
    this.changeListeners.clear()
  }

  /** @internal Test helper: number of active directory watchers. */
  watcherCount(): number {
    return this.watchers.size
  }

  // ─── .gitignore loading ────────────────────────────────────────────────────────

  private gitignorePath(): string {
    return join(this.root, '.gitignore')
  }

  private loadGitignore(): void {
    const path = this.gitignorePath()
    try {
      const st = statSync(path)
      this.gitignoreMtime = Math.floor(st.mtimeMs)
      this.gitignoreRules = parseGitignore(readFileSync(path, 'utf-8'))
    } catch {
      this.gitignoreMtime = -1
      this.gitignoreRules = []
    }
  }

  /** Re-read `.gitignore` only when its mtime changed (cheap on hot listing). */
  private refreshGitignoreIfStale(): void {
    const path = this.gitignorePath()
    try {
      const st = statSync(path)
      const mtime = Math.floor(st.mtimeMs)
      if (mtime !== this.gitignoreMtime) {
        this.gitignoreMtime = mtime
        this.gitignoreRules = parseGitignore(readFileSync(path, 'utf-8'))
      }
    } catch {
      if (this.gitignoreMtime !== -1) {
        this.gitignoreMtime = -1
        this.gitignoreRules = []
      }
    }
  }

  /** Resolve an input path against the root, accepting absolute or relative. */
  private resolvePath(path: string): string {
    if (!path || !path.trim()) return this.root
    return isAbsolute(path) ? resolve(path) : resolve(this.root, path)
  }
}

function normalizeDir(dir: string): string {
  return resolve(dir)
}

/** Factory mirroring the other managers' init helpers. */
export function initFileBrowserManager(
  opts: FileBrowserManagerOptions = {},
): FileBrowserManager {
  return new FileBrowserManager(opts)
}
