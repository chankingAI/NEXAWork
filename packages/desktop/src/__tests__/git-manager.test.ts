import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { GitManager, type GitRunner } from '../main/backend/git-manager'
import type { FileWatcher } from '../main/backend/file-browser-manager'

/**
 * N31 GitManager tests. Operations run against real temp git repos using the
 * real `execFile('git', …)` runner (git is available in CI) — exercising the
 * full status / staging / commit / branch / diff pipeline end-to-end. The fs
 * watcher is injected as a fake so no OS handles are opened. A few cases inject
 * a fake runner to assert argument wiring without a real repo.
 */

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim()
}

interface FakeWatcher extends FileWatcher {
  dir: string
  closed: boolean
}

function makeManager(root: string, watchEnabled = false) {
  const watchers: FakeWatcher[] = []
  const manager = new GitManager({
    root,
    watchEnabled,
    watch: dir => {
      const w: FakeWatcher = {
        dir,
        closed: false,
        close: () => {
          w.closed = true
        },
      }
      watchers.push(w)
      return w
    },
  })
  return { manager, watchers }
}

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'nexa-git-'))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.email', 'test@nexa.work')
  git(repo, 'config', 'user.name', 'Nexa Test')
  git(repo, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(repo, 'a.txt'), 'first\n')
  git(repo, 'add', 'a.txt')
  git(repo, 'commit', '-q', '-m', 'initial')
})
afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('GitManager.repoRoot + status', () => {
  test('reports repo root and current branch', async () => {
    const { manager } = makeManager(repo)
    const status = await manager.status()
    expect(status.repoRoot).not.toBeNull()
    expect(status.branch).toBeTruthy()
    expect(status.files).toEqual([])
  })

  test('returns null repoRoot outside a repository', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'nexa-norepo-'))
    try {
      const { manager } = makeManager(outside)
      const status = await manager.status()
      expect(status.repoRoot).toBeNull()
      expect(status.files).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('detects modified + untracked files', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed\n')
    writeFileSync(join(repo, 'b.txt'), 'brand new\n')
    const { manager } = makeManager(repo)
    const status = await manager.status()
    const byPath = Object.fromEntries(status.files.map(f => [f.path, f]))
    expect(byPath['a.txt'].unstaged).toBe(true)
    expect(byPath['b.txt'].untracked).toBe(true)
  })
})

describe('GitManager staging', () => {
  test('stage / unstage a single file', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed\n')
    const { manager } = makeManager(repo)

    const staged = await manager.stage(['a.txt'])
    expect(staged.success).toBe(true)
    let status = await manager.status()
    expect(status.files.find(f => f.path === 'a.txt')?.staged).toBe(true)

    const unstaged = await manager.unstage(['a.txt'])
    expect(unstaged.success).toBe(true)
    status = await manager.status()
    expect(status.files.find(f => f.path === 'a.txt')?.staged).toBe(false)
  })

  test('stageAll then unstageAll', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed\n')
    writeFileSync(join(repo, 'b.txt'), 'new\n')
    const { manager } = makeManager(repo)

    await manager.stageAll()
    let status = await manager.status()
    expect(status.files.every(f => f.staged)).toBe(true)

    await manager.unstageAll()
    status = await manager.status()
    expect(status.files.some(f => f.staged)).toBe(false)
  })

  test('discard reverts an unstaged modification', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed\n')
    const { manager } = makeManager(repo)
    const res = await manager.discard('a.txt')
    expect(res.success).toBe(true)
    const status = await manager.status()
    expect(status.files).toEqual([])
  })
})

describe('GitManager commit', () => {
  test('commits staged changes', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed\n')
    const { manager } = makeManager(repo)
    await manager.stage(['a.txt'])
    const res = await manager.commit('feat: change a')
    expect(res.success).toBe(true)
    const status = await manager.status()
    expect(status.files).toEqual([])
    expect(git(repo, 'log', '--oneline')).toContain('feat: change a')
  })

  test('commit fails with nothing staged', async () => {
    const { manager } = makeManager(repo)
    const res = await manager.commit('empty')
    expect(res.success).toBe(false)
  })
})

describe('GitManager branches', () => {
  test('lists branches with current marker', async () => {
    git(repo, 'branch', 'feature-x')
    const { manager } = makeManager(repo)
    const info = await manager.branches()
    const names = info.branches.map(b => b.name)
    expect(names).toContain('feature-x')
    expect(info.current).toBeTruthy()
    expect(info.branches.find(b => b.current)?.name).toBe(
      info.current ?? undefined,
    )
  })

  test('createBranch switches onto the new branch', async () => {
    const { manager } = makeManager(repo)
    const res = await manager.createBranch('feature-y')
    expect(res.success).toBe(true)
    const info = await manager.branches()
    expect(info.current).toBe('feature-y')
  })

  test('checkout switches branches', async () => {
    git(repo, 'branch', 'other')
    const { manager } = makeManager(repo)
    const res = await manager.checkout('other')
    expect(res.success).toBe(true)
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('other')
  })

  test('merge brings in commits from another branch', async () => {
    // Create a divergent commit on a feature branch.
    git(repo, 'checkout', '-q', '-b', 'feature')
    writeFileSync(join(repo, 'c.txt'), 'feature work\n')
    git(repo, 'add', 'c.txt')
    git(repo, 'commit', '-q', '-m', 'feat: c')
    const base = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')
    expect(base).toBe('feature')

    git(repo, 'checkout', '-q', '-')
    const { manager } = makeManager(repo)
    const res = await manager.merge('feature')
    expect(res.success).toBe(true)
    expect(git(repo, 'log', '--oneline')).toContain('feat: c')
  })
})

describe('GitManager diff', () => {
  test('produces HEAD vs working-tree diff data', async () => {
    writeFileSync(join(repo, 'a.txt'), 'second\n')
    const { manager } = makeManager(repo)
    const diff = await manager.diff('a.txt')
    expect(diff).not.toBeNull()
    expect(diff?.original).toBe('first\n')
    expect(diff?.modified).toBe('second\n')
    expect(diff?.status).toBe('modified')
  })

  test('marks added files (no HEAD version)', async () => {
    writeFileSync(join(repo, 'new.txt'), 'hi\n')
    const { manager } = makeManager(repo)
    const diff = await manager.diff('new.txt')
    expect(diff?.status).toBe('added')
    expect(diff?.original).toBe('')
  })

  test('diffHunks splits the unified diff', async () => {
    writeFileSync(join(repo, 'a.txt'), 'first\nsecond line\n')
    const { manager } = makeManager(repo)
    const parsed = await manager.diffHunks('a.txt')
    expect(parsed.hunks.length).toBeGreaterThan(0)
    expect(parsed.fileHeader.join('\n')).toContain('diff --git')
  })
})

describe('GitManager per-hunk staging', () => {
  test('stageHunk applies a single hunk to the index', async () => {
    writeFileSync(join(repo, 'a.txt'), 'first\nappended\n')
    const { manager } = makeManager(repo)
    const parsed = await manager.diffHunks('a.txt')
    const { buildHunkPatch } = await import('../shared/git-panel')
    const patch = buildHunkPatch(parsed.fileHeader, parsed.hunks[0])
    const res = await manager.stageHunk(patch)
    expect(res.success).toBe(true)
    const status = await manager.status()
    expect(status.files.find(f => f.path === 'a.txt')?.staged).toBe(true)
  })
})

describe('GitManager watching + lifecycle', () => {
  test('opens watchers on status when enabled and disposes them', async () => {
    const { manager, watchers } = makeManager(repo, true)
    await manager.status()
    expect(manager.watcherCount()).toBeGreaterThan(0)
    let fired = 0
    manager.onChanged(() => fired++)
    manager.dispose()
    expect(manager.watcherCount()).toBe(0)
    expect(watchers.every(w => w.closed)).toBe(true)
  })

  test('emits a change event to listeners', async () => {
    // Inject a watch factory we can fire manually.
    const triggers: Array<() => void> = []
    const manager = new GitManager({
      root: repo,
      watchEnabled: true,
      watch: (_dir, cb) => {
        triggers.push(cb)
        return { close: () => {} }
      },
    })
    await manager.status()
    let fired = 0
    manager.onChanged(() => fired++)
    expect(triggers.length).toBeGreaterThan(0)
    triggers[0]()
    expect(fired).toBe(1)
    manager.dispose()
  })
})

describe('GitManager with injected runner', () => {
  test('forwards stdin patch + args to the runner', async () => {
    const calls: { args: string[]; input?: string }[] = []
    const runner: GitRunner = async (args, _cwd, input) => {
      calls.push({ args, input })
      if (args[0] === 'rev-parse') {
        return { stdout: '/fake/root', stderr: '', code: 0 }
      }
      return { stdout: '', stderr: '', code: 0 }
    }
    const manager = new GitManager({
      root: '/fake/root',
      runner,
      watchEnabled: false,
    })
    const res = await manager.stageHunk('PATCH-BODY')
    expect(res.success).toBe(true)
    const applyCall = calls.find(c => c.args[0] === 'apply')
    expect(applyCall?.args).toContain('--cached')
    expect(applyCall?.input).toBe('PATCH-BODY')
  })

  test('push retries with --set-upstream when no upstream is set', async () => {
    const calls: string[][] = []
    const runner: GitRunner = async args => {
      calls.push(args)
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        return { stdout: '/fake', stderr: '', code: 0 }
      }
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
        return { stdout: 'main', stderr: '', code: 0 }
      }
      if (args[0] === 'push' && args.length === 1) {
        return { stdout: '', stderr: 'fatal: no upstream branch', code: 1 }
      }
      return { stdout: '', stderr: '', code: 0 }
    }
    const manager = new GitManager({
      root: '/fake',
      runner,
      watchEnabled: false,
    })
    const res = await manager.push()
    expect(res.success).toBe(true)
    expect(
      calls.some(
        a =>
          a[0] === 'push' && a.includes('--set-upstream') && a.includes('main'),
      ),
    ).toBe(true)
  })
})
