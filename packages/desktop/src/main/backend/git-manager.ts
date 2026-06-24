/**
 * NexaWork Git Manager (N31)
 * ===========================
 * Owns the git-facing side of the Git status panel + diff viewer: working-tree
 * status (staged / unstaged), branch listing + switching / creating / merging,
 * staging + unstaging (whole files and individual hunks), committing, and
 * push / pull. It also watches `.git` (HEAD + index) and the working tree so
 * the panel refreshes live.
 *
 * Following the established N28/N29/N30 managers, the git invoker is injectable
 * (`GitRunner`) and the filesystem watcher is injectable (`WatchFn`) — unit
 * tests pass fakes (or run against real temp repos with a real CLI runner) and
 * never depend on Electron. All porcelain / branch / diff-hunk parsing is the
 * pure code in `../../shared/git-panel`, reused verbatim by the renderer.
 *
 * Per the N31 integration constraint, every git operation is shelled out from
 * the main process (the desktop app's established `execFile('git', …)` pattern,
 * which is exactly what `simple-git` wraps); the renderer only calls IPC.
 */
import { execFile } from 'child_process'
import { existsSync, readFileSync, statSync, watch as fsWatch } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, relative, resolve } from 'path'
import {
  detectLanguage,
  type GitChangeStatus,
  type GitDiffData,
} from '../../shared/editor'
import type { FileWatcher, WatchFn } from './file-browser-manager'
import {
  type GitBranchInfo,
  type GitFileState,
  parseAheadBehind,
  parseBranchList,
  parseDiffHunks,
  parsePorcelainStatus,
} from '../../shared/git-panel'

export interface GitExecResult {
  stdout: string
  stderr: string
  code: number
}

/** Invoke `git <args>` in `cwd` (optional stdin), resolving the exit code. */
export type GitRunner = (
  args: string[],
  cwd: string,
  input?: string,
) => Promise<GitExecResult>

export interface GitManagerOptions {
  /** Project root the panel operates on (defaults to cwd). */
  root?: string
  /** Injectable git invoker (defaults to a real `execFile('git', …)`). */
  runner?: GitRunner
  /** Injectable filesystem watcher (defaults to a lazy `fs.watch`). */
  watch?: WatchFn
  /** Disable filesystem watching entirely (e.g. headless tests). */
  watchEnabled?: boolean
}

export interface GitStatusResult {
  repoRoot: string | null
  branch: string | null
  files: GitFileState[]
  ahead: number
  behind: number
}

export interface MutationOk {
  success: boolean
  /** Optional human-readable detail (e.g. git stderr on a non-fatal note). */
  message?: string
}

type ChangeListener = () => void

const MAX_GIT_BUFFER = 64 * 1024 * 1024

/** Default runner: `execFile('git', …)` with optional piped stdin. */
function defaultRunner(
  args: string[],
  cwd: string,
  input?: string,
): Promise<GitExecResult> {
  return new Promise(resolve => {
    const child = execFile(
      'git',
      args,
      { cwd, maxBuffer: MAX_GIT_BUFFER },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code })
      },
    )
    if (input !== undefined && child.stdin) {
      child.stdin.write(input)
      child.stdin.end()
    }
  })
}

/** Default watcher: a non-recursive `fs.watch` (best-effort). */
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

export class GitManager {
  private root: string
  private readonly run: GitRunner
  private readonly watchFn: WatchFn
  private readonly watchEnabled: boolean
  private readonly watchers = new Map<string, FileWatcher>()
  private readonly changeListeners = new Set<ChangeListener>()
  private watching = false

  constructor(opts: GitManagerOptions = {}) {
    this.root = resolve(opts.root ?? safeCwd())
    this.run = opts.runner ?? defaultRunner
    this.watchFn = opts.watch ?? defaultWatch
    this.watchEnabled = opts.watchEnabled ?? true
  }

  // ─── Root ───────────────────────────────────────────────────────────────────

  getRoot(): string {
    return this.root
  }

  setRoot(root: string): string {
    const next = resolve(root)
    if (next !== this.root) {
      this.disposeWatchers()
      this.watching = false
      this.root = next
    }
    return this.root
  }

  /** Resolve the repository root for the current cwd, or null when not a repo. */
  async repoRoot(): Promise<string | null> {
    const { stdout, code } = await this.run(
      ['rev-parse', '--show-toplevel'],
      this.root,
    )
    if (code !== 0) return null
    return stdout.trim() || null
  }

  // ─── Change notifications ─────────────────────────────────────────────────────

  onChanged(listener: ChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private emitChanged(): void {
    for (const listener of this.changeListeners) listener()
  }

  // ─── Status + branches ──────────────────────────────────────────────────────

  /** Working-tree status (staged + unstaged) plus branch + ahead/behind. */
  async status(): Promise<GitStatusResult> {
    const repoRoot = await this.repoRoot()
    if (!repoRoot) {
      return { repoRoot: null, branch: null, files: [], ahead: 0, behind: 0 }
    }
    void this.startWatching(repoRoot)

    const statusOut = await this.run(
      ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--branch'],
      repoRoot,
    )
    const files = parsePorcelainStatus(stripBranchHeader(statusOut.stdout))
    const branch = await this.currentBranch(repoRoot)
    const { ahead, behind } = await this.aheadBehind(repoRoot)
    return { repoRoot, branch, files, ahead, behind }
  }

  private async currentBranch(repoRoot: string): Promise<string | null> {
    const { stdout, code } = await this.run(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      repoRoot,
    )
    if (code !== 0) return null
    const name = stdout.trim()
    return name && name !== 'HEAD' ? name : null
  }

  private async aheadBehind(
    repoRoot: string,
  ): Promise<{ ahead: number; behind: number }> {
    const { stdout, code } = await this.run(
      ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
      repoRoot,
    )
    if (code !== 0) return { ahead: 0, behind: 0 }
    return parseAheadBehind(stdout)
  }

  /** Full branch list (with current marker + upstream) and ahead/behind. */
  async branches(): Promise<GitBranchInfo> {
    const repoRoot = await this.repoRoot()
    if (!repoRoot) {
      return { current: null, branches: [], ahead: 0, behind: 0 }
    }
    const { stdout } = await this.run(
      ['branch', '--format=%(HEAD)%(refname:short)%09%(upstream:short)'],
      repoRoot,
    )
    const branches = parseBranchList(stdout)
    const current = branches.find(b => b.current)?.name ?? null
    const { ahead, behind } = await this.aheadBehind(repoRoot)
    return { current, branches, ahead, behind }
  }

  // ─── Staging ──────────────────────────────────────────────────────────────────

  async stage(paths: string[]): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    if (paths.length === 0) return { success: true }
    const res = await this.run(['add', '--', ...paths], repoRoot)
    return this.toResult(res)
  }

  async stageAll(): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(['add', '-A'], repoRoot)
    return this.toResult(res)
  }

  async unstage(paths: string[]): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    if (paths.length === 0) return { success: true }
    const res = await this.run(
      ['reset', '-q', 'HEAD', '--', ...paths],
      repoRoot,
    )
    return this.toResult(res)
  }

  async unstageAll(): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(['reset', '-q', 'HEAD'], repoRoot)
    return this.toResult(res)
  }

  /** Discard unstaged changes to a path (checkout / clean for untracked). */
  async discard(path: string): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const checkout = await this.run(['checkout', '--', path], repoRoot)
    if (checkout.code !== 0) {
      // Untracked file: remove it instead.
      const clean = await this.run(['clean', '-fq', '--', path], repoRoot)
      return this.toResult(clean)
    }
    return this.toResult(checkout)
  }

  // ─── Per-hunk staging ──────────────────────────────────────────────────────────

  /** Apply a single-hunk patch to the index (`git apply --cached`). */
  async stageHunk(patch: string): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(
      ['apply', '--cached', '--unidiff-zero', '-'],
      repoRoot,
      patch,
    )
    return this.toResult(res)
  }

  /** Reverse-apply a single-hunk patch against the index (unstage a hunk). */
  async unstageHunk(patch: string): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(
      ['apply', '--cached', '--reverse', '--unidiff-zero', '-'],
      repoRoot,
      patch,
    )
    return this.toResult(res)
  }

  // ─── Commit + sync ──────────────────────────────────────────────────────────────

  async commit(message: string): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(['commit', '-m', message], repoRoot)
    return this.toResult(res)
  }

  async push(): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    let res = await this.run(['push'], repoRoot)
    if (res.code !== 0 && /no upstream|set-upstream/i.test(res.stderr)) {
      const branch = await this.currentBranch(repoRoot)
      if (branch) {
        res = await this.run(
          ['push', '--set-upstream', 'origin', branch],
          repoRoot,
        )
      }
    }
    return this.toResult(res)
  }

  async pull(): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(['pull', '--ff-only'], repoRoot)
    return this.toResult(res)
  }

  async commitAndPush(message: string): Promise<MutationOk> {
    const committed = await this.commit(message)
    if (!committed.success) return committed
    return this.push()
  }

  // ─── Branch operations ──────────────────────────────────────────────────────────

  async createBranch(name: string): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(['checkout', '-b', name], repoRoot)
    return this.toResult(res)
  }

  async checkout(name: string): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(['checkout', name], repoRoot)
    return this.toResult(res)
  }

  async merge(name: string): Promise<MutationOk> {
    const repoRoot = await this.requireRepo()
    const res = await this.run(['merge', '--no-edit', name], repoRoot)
    return this.toResult(res)
  }

  // ─── Diff ──────────────────────────────────────────────────────────────────────

  /**
   * Build Monaco DiffEditor data for one file. When `staged` is set the diff is
   * `HEAD` vs the index; otherwise it is the index (or HEAD) vs the working tree.
   */
  async diff(
    path: string,
    opts: { staged?: boolean } = {},
  ): Promise<GitDiffData | null> {
    const repoRoot = await this.repoRoot()
    if (!repoRoot) return null
    const rel = this.toRepoRel(repoRoot, path)
    const staged = opts.staged ?? false

    const headRes = await this.run(['show', `HEAD:${rel}`], repoRoot)
    const headExists = headRes.code === 0
    const original = headExists ? headRes.stdout : ''

    let modified = ''
    let modifiedExists = false
    if (staged) {
      const stagedRes = await this.run(['show', `:${rel}`], repoRoot)
      modifiedExists = stagedRes.code === 0
      modified = modifiedExists ? stagedRes.stdout : ''
    } else {
      const abs = join(repoRoot, rel)
      if (existsSync(abs)) {
        modifiedExists = true
        try {
          modified = readFileSync(abs, 'utf-8')
        } catch {
          modified = ''
        }
      }
    }

    let status: GitChangeStatus = 'modified'
    if (!headExists && modifiedExists) status = 'added'
    else if (headExists && !modifiedExists) status = 'deleted'

    return {
      path: rel,
      status,
      original,
      modified,
      language: detectLanguage(rel),
    }
  }

  /** Raw unified diff for a file, split into a header + hunks (per-hunk staging). */
  async diffHunks(
    path: string,
    opts: { staged?: boolean } = {},
  ): Promise<ReturnType<typeof parseDiffHunks>> {
    const repoRoot = await this.requireRepo()
    const rel = this.toRepoRel(repoRoot, path)
    const args = ['-c', 'core.quotepath=false', 'diff', '--no-color']
    if (opts.staged) args.push('--cached')
    args.push('--', rel)
    const { stdout } = await this.run(args, repoRoot)
    return parseDiffHunks(stdout)
  }

  // ─── Watching ─────────────────────────────────────────────────────────────────

  private async startWatching(repoRoot: string): Promise<void> {
    if (!this.watchEnabled || this.watching) return
    this.watching = true
    this.watchPath(repoRoot)
    const gitDir = join(repoRoot, '.git')
    if (existsSync(gitDir)) this.watchPath(gitDir)
  }

  private watchPath(dir: string): void {
    if (this.watchers.has(dir)) return
    try {
      const watcher = this.watchFn(dir, () => this.emitChanged())
      this.watchers.set(dir, watcher)
    } catch {
      // Watching is best-effort; status still works without live updates.
    }
  }

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

  dispose(): void {
    this.disposeWatchers()
    this.changeListeners.clear()
    this.watching = false
  }

  /** @internal Test helper: number of active watchers. */
  watcherCount(): number {
    return this.watchers.size
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  private async requireRepo(): Promise<string> {
    const repoRoot = await this.repoRoot()
    if (!repoRoot) throw new Error('NOT_A_REPO: not a git repository')
    return repoRoot
  }

  private toRepoRel(repoRoot: string, path: string): string {
    const rel = isAbsolute(path) ? relative(repoRoot, path) : path
    return rel.replace(/\\/g, '/')
  }

  private toResult(res: GitExecResult): MutationOk {
    if (res.code === 0) {
      return { success: true, message: res.stdout.trim() || undefined }
    }
    return {
      success: false,
      message: (res.stderr || res.stdout).trim() || 'git command failed',
    }
  }
}

/** Strip the leading `## branch...tracking` header line of `status --branch`. */
function stripBranchHeader(stdout: string): string {
  return stdout
    .split('\n')
    .filter(line => !line.startsWith('##'))
    .join('\n')
}

export function initGitManager(opts: GitManagerOptions = {}): GitManager {
  return new GitManager(opts)
}
