import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  FileBrowserManager,
  type FileWatcher,
  initFileBrowserManager,
} from '../main/backend/file-browser-manager'

/**
 * N30 FileBrowserManager tests. File IO runs against a real temp directory
 * (mirroring the N28 editor-manager suite); the fs watcher is injected as a
 * fake so no OS watch handles are opened and change events are deterministic.
 */

interface FakeWatcher extends FileWatcher {
  dir: string
  fire: () => void
  closed: boolean
}

function makeManager(root: string) {
  const watchers: FakeWatcher[] = []
  const manager = new FileBrowserManager({
    root,
    watch: (dir, cb) => {
      const w: FakeWatcher = {
        dir,
        closed: false,
        fire: () => cb(),
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

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nexa-files-'))
  // Scaffold a small project.
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'src', 'lib'))
  mkdirSync(join(root, 'node_modules'))
  mkdirSync(join(root, 'dist'))
  writeFileSync(join(root, 'src', 'index.ts'), 'export {}')
  writeFileSync(join(root, 'src', 'app.log'), 'log')
  writeFileSync(join(root, 'README.md'), '# hi')
  writeFileSync(join(root, '.DS_Store'), '')
  writeFileSync(join(root, '.gitignore'), 'dist/\n*.log\n')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('FileBrowserManager.list', () => {
  test('lists entries, dirs first, filtering default-ignore + gitignore', () => {
    const { manager } = makeManager(root)
    const result = manager.list({ path: root })
    const names = result.entries.map(e => e.name)
    // node_modules + .DS_Store (default-ignore) and dist (gitignore) are hidden
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('.DS_Store')
    expect(names).not.toContain('dist')
    // directory (src) sorts before files; .gitignore is a real visible file
    expect(names[0]).toBe('src')
    expect(names).toContain('README.md')
    expect(names).toContain('.gitignore')
    expect(result.root).toBe(manager.getRoot())
  })

  test('respectGitignore=false surfaces ignored files', () => {
    const { manager } = makeManager(root)
    const dist = manager.list({ path: root, respectGitignore: false })
    expect(dist.entries.map(e => e.name)).toContain('dist')
    // default-ignore still applies even with gitignore off
    expect(dist.entries.map(e => e.name)).not.toContain('node_modules')
  })

  test('nested *.log is filtered via root .gitignore', () => {
    const { manager } = makeManager(root)
    const src = manager.list({ path: join(root, 'src') })
    const names = src.entries.map(e => e.name)
    expect(names).toContain('index.ts')
    expect(names).toContain('lib')
    expect(names).not.toContain('app.log')
  })

  test('lazy batching caps the first page + flags hasMore', () => {
    const big = join(root, 'big')
    mkdirSync(big)
    for (let i = 0; i < 130; i++) writeFileSync(join(big, `f${i}.txt`), '')
    const { manager } = makeManager(root)
    const page1 = manager.list({ path: big, limit: 100 })
    expect(page1.entries).toHaveLength(100)
    expect(page1.hasMore).toBe(true)
    expect(page1.total).toBe(130)
    const page2 = manager.list({ path: big, offset: 100, limit: 100 })
    expect(page2.entries).toHaveLength(130)
    expect(page2.hasMore).toBe(false)
  })

  test('throws for a missing directory', () => {
    const { manager } = makeManager(root)
    expect(() => manager.list({ path: join(root, 'nope') })).toThrow()
  })

  test('starts exactly one watcher per listed directory', () => {
    const { manager, watchers } = makeManager(root)
    manager.list({ path: root })
    manager.list({ path: join(root, 'src') })
    manager.list({ path: root }) // re-list does not double-watch
    expect(manager.watcherCount()).toBe(2)
    expect(watchers).toHaveLength(2)
  })
})

describe('FileBrowserManager mutations', () => {
  test('create file + folder', () => {
    const { manager } = makeManager(root)
    manager.create(join(root, 'src', 'new.ts'), 'file')
    manager.create(join(root, 'src', 'newdir'), 'directory')
    expect(existsSync(join(root, 'src', 'new.ts'))).toBe(true)
    expect(existsSync(join(root, 'src', 'newdir'))).toBe(true)
  })

  test('create rejects an existing path', () => {
    const { manager } = makeManager(root)
    expect(() => manager.create(join(root, 'README.md'), 'file')).toThrow()
  })

  test('rename moves a path', () => {
    const { manager } = makeManager(root)
    manager.rename(join(root, 'README.md'), join(root, 'READ.md'))
    expect(existsSync(join(root, 'README.md'))).toBe(false)
    expect(existsSync(join(root, 'READ.md'))).toBe(true)
  })

  test('rename rejects overwriting an existing target', () => {
    const { manager } = makeManager(root)
    expect(() =>
      manager.rename(join(root, 'README.md'), join(root, 'src')),
    ).toThrow()
  })

  test('move relocates into a target dir keeping the basename', () => {
    const { manager } = makeManager(root)
    manager.move(join(root, 'README.md'), join(root, 'src'))
    expect(existsSync(join(root, 'src', 'README.md'))).toBe(true)
  })

  test('remove deletes files and directories recursively', () => {
    const { manager } = makeManager(root)
    manager.remove(join(root, 'src'))
    expect(existsSync(join(root, 'src'))).toBe(false)
    // deleting a missing path is a no-op success
    expect(manager.remove(join(root, 'gone')).success).toBe(true)
  })
})

describe('FileBrowserManager.search', () => {
  test('fuzzy filename search honours ignore rules', () => {
    const { manager } = makeManager(root)
    const { matches } = manager.search('index')
    expect(matches.some(m => m.name === 'index.ts')).toBe(true)
    // ignored trees never appear in results
    const all = manager.search('e')
    expect(all.matches.every(m => !m.path.includes('node_modules'))).toBe(true)
    expect(all.matches.every(m => !m.path.includes('app.log'))).toBe(true)
  })
  test('empty query returns nothing', () => {
    const { manager } = makeManager(root)
    expect(manager.search('   ').matches).toEqual([])
  })
})

describe('FileBrowserManager watching', () => {
  test('a watcher callback emits a change for its directory', () => {
    const { manager, watchers } = makeManager(root)
    const seen: string[] = []
    manager.onChanged(dir => seen.push(dir))
    manager.list({ path: root })
    watchers[0].fire()
    expect(seen).toEqual([root])
  })

  test('onChanged unsubscribe stops delivery', () => {
    const { manager, watchers } = makeManager(root)
    const seen: string[] = []
    const off = manager.onChanged(dir => seen.push(dir))
    manager.list({ path: root })
    off()
    watchers[0].fire()
    expect(seen).toEqual([])
  })

  test('dispose closes every watcher', () => {
    const { manager, watchers } = makeManager(root)
    manager.list({ path: root })
    manager.list({ path: join(root, 'src') })
    manager.dispose()
    expect(watchers.every(w => w.closed)).toBe(true)
    expect(manager.watcherCount()).toBe(0)
  })

  test('setRoot re-points the root and tears down old watchers', () => {
    const { manager, watchers } = makeManager(root)
    manager.list({ path: root })
    const other = mkdtempSync(join(tmpdir(), 'nexa-files2-'))
    try {
      manager.setRoot(other)
      expect(manager.getRoot()).toBe(resolve(other))
      expect(watchers[0].closed).toBe(true)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  test('initFileBrowserManager returns a usable instance', () => {
    const m = initFileBrowserManager({ root, watchEnabled: false })
    expect(m).toBeInstanceOf(FileBrowserManager)
    expect(m.list({ path: root }).entries.length).toBeGreaterThan(0)
  })
})
