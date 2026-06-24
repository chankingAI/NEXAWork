/**
 * NexaWork Editor Manager (N28)
 * =============================
 * Owns the disk-facing side of the Monaco code editor: reading/writing text
 * files for tabs (the IPC equivalent of FileReadTool / FileWriteTool) and
 * persisting the open-tab session so the editor restores on relaunch.
 *
 * Like {@link ./skill-manager}, it keeps zero native dependencies beyond `fs`,
 * accepts an injectable clock, and runs identically under `bun test` with a
 * null state directory (pure in-memory persistence).
 *
 * Git diff data is produced by the IPC layer (which shells out to `git` with
 * the existing `execFile` pattern) and parsed with the pure helpers in
 * `../../shared/editor`, so no git process is spawned from here.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'
import {
  detectLanguage,
  type EditorPersistState,
  isProbablyBinary,
  MAX_EDITABLE_FILE_BYTES,
} from '../../shared/editor'

export interface EditorManagerOptions {
  /** Path to the persisted editor-state JSON file, or null for in-memory. */
  statePath?: string | null
  /** Injectable clock (ms since epoch) for deterministic timing in tests. */
  now?: () => number
}

export interface ReadFileResult {
  path: string
  content: string
  language: string
  /** True when the file exceeded {@link MAX_EDITABLE_FILE_BYTES}. */
  tooLarge: boolean
  /** True when the content looks binary (NUL byte sniff). */
  binary: boolean
  /** mtime in ms, or 0 when unknown. */
  mtime: number
}

export interface WriteFileResult {
  path: string
  success: boolean
  mtime: number
}

export interface StatFileResult {
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  size: number
  mtime: number
}

const EMPTY_STATE: EditorPersistState = { openPaths: [], activePath: null }

export class EditorManager {
  private readonly statePath: string | null
  private readonly now: () => number
  /** In-memory mirror of the persisted state (source of truth in tests). */
  private state: EditorPersistState = { ...EMPTY_STATE }

  constructor(opts: EditorManagerOptions = {}) {
    this.statePath = opts.statePath ?? null
    this.now = opts.now ?? (() => Date.now())
    this.state = this.loadStateFromDisk()
  }

  // ─── File IO ───────────────────────────────────────────────────────────────

  /** Read a UTF-8 text file for an editor tab, guarding size + binary input. */
  readFile(path: string): ReadFileResult {
    const language = detectLanguage(path)
    let size = 0
    let mtime = 0
    try {
      const st = statSync(path)
      size = st.size
      mtime = Math.floor(st.mtimeMs)
    } catch {
      throw new Error(`ENOENT: cannot read '${path}'`)
    }
    if (size > MAX_EDITABLE_FILE_BYTES) {
      return {
        path,
        content: '',
        language,
        tooLarge: true,
        binary: false,
        mtime,
      }
    }
    const content = readFileSync(path, 'utf-8')
    const binary = isProbablyBinary(content)
    return {
      path,
      content: binary ? '' : content,
      language,
      tooLarge: false,
      binary,
      mtime,
    }
  }

  /** Write text to disk (creating parent dirs), returning the new mtime. */
  writeFile(path: string, content: string): WriteFileResult {
    const dir = dirname(path)
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, content, 'utf-8')
    let mtime = this.now()
    try {
      mtime = Math.floor(statSync(path).mtimeMs)
    } catch {
      // Stat failure is non-fatal; the write already succeeded.
    }
    return { path, success: true, mtime }
  }

  /** Stat a path, never throwing (missing paths report `exists: false`). */
  statFile(path: string): StatFileResult {
    try {
      const st = statSync(path)
      return {
        exists: true,
        isFile: st.isFile(),
        isDirectory: st.isDirectory(),
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
      }
    } catch {
      return {
        exists: false,
        isFile: false,
        isDirectory: false,
        size: 0,
        mtime: 0,
      }
    }
  }

  // ─── Tab session persistence ────────────────────────────────────────────────

  /** Return the persisted open-tab session. */
  loadState(): EditorPersistState {
    return {
      openPaths: [...this.state.openPaths],
      activePath: this.state.activePath,
    }
  }

  /** Persist the open-tab session (in-memory + to disk when configured). */
  saveState(state: EditorPersistState): EditorPersistState {
    const openPaths = Array.from(
      new Set((state.openPaths ?? []).filter(p => typeof p === 'string' && p)),
    )
    const activePath =
      state.activePath && openPaths.includes(state.activePath)
        ? state.activePath
        : (openPaths[openPaths.length - 1] ?? null)
    this.state = { openPaths, activePath }
    this.persistStateToDisk()
    return this.loadState()
  }

  // ─── Disk helpers ────────────────────────────────────────────────────────────

  private loadStateFromDisk(): EditorPersistState {
    if (!this.statePath || !existsSync(this.statePath))
      return { ...EMPTY_STATE }
    try {
      const parsed = JSON.parse(
        readFileSync(this.statePath, 'utf-8'),
      ) as Partial<EditorPersistState>
      const openPaths = Array.isArray(parsed.openPaths)
        ? parsed.openPaths.filter(p => typeof p === 'string')
        : []
      const activePath =
        typeof parsed.activePath === 'string' &&
        openPaths.includes(parsed.activePath)
          ? parsed.activePath
          : (openPaths[openPaths.length - 1] ?? null)
      return { openPaths, activePath }
    } catch {
      return { ...EMPTY_STATE }
    }
  }

  private persistStateToDisk(): void {
    if (!this.statePath) return
    try {
      const dir = dirname(this.statePath)
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(
        this.statePath,
        JSON.stringify(this.state, null, 2),
        'utf-8',
      )
    } catch {
      // Persistence is best-effort; in-memory state remains authoritative.
    }
  }
}

/** Factory mirroring the other managers' init helpers. */
export function initEditorManager(
  opts: EditorManagerOptions = {},
): EditorManager {
  return new EditorManager(opts)
}
