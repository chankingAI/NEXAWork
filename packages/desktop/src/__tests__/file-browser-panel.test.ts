import { describe, test, expect } from 'bun:test'
import {
  type FileEntry,
  type TreeNode,
  batchEntries,
  collapseNode,
  findNode,
  flattenVisible,
  LAZY_BATCH_SIZE,
  makeTreeNode,
  reconcileChildren,
  searchEntries,
  setNodeChildren,
  sortEntries,
  updateNode,
} from '../shared/file-tree'

/**
 * FileBrowser end-to-end scenario tests (N30).
 *
 * The renderer has no DOM harness in this repo, so — mirroring `*-panel` suites
 * like terminal-panel.test.ts — these tests drive the exact reducer the
 * {@link useFileBrowser} hook runs (initial load → expand → lazy load-more →
 * create → live fs-watch refresh → fuzzy search → collapse) against a faithful
 * in-memory IPC `files` fake, asserting the full user flow and the four N30
 * acceptance criteria end to end.
 */

// ─── A faithful in-memory stand-in for the main-process FileBrowserManager. ──────
class FakeFs {
  // Already filtered + sorted, exactly as the real `list` returns.
  private dirs = new Map<string, FileEntry[]>()

  setDir(path: string, entries: FileEntry[]): void {
    this.dirs.set(path, sortEntries(entries))
  }

  list(path: string, offset = 0, limit = LAZY_BATCH_SIZE) {
    const all = this.dirs.get(path) ?? []
    const { visible, hasMore, total } = batchEntries(all, offset, limit)
    return { path, root: '/proj', entries: visible, hasMore, total }
  }

  create(dir: string, name: string, kind: FileEntry['kind']): void {
    const list = this.dirs.get(dir) ?? []
    list.push({ name, path: `${dir}/${name}`, kind, size: 0, mtime: 1 })
    this.dirs.set(dir, sortEntries(list))
  }

  remove(dir: string, name: string): void {
    this.dirs.set(
      dir,
      (this.dirs.get(dir) ?? []).filter(e => e.name !== name),
    )
  }

  /** Flat list of every entry (for the search mirror). */
  all(): FileEntry[] {
    return [...this.dirs.values()].flat()
  }
}

function dir(name: string, path: string): FileEntry {
  return { name, path, kind: 'directory', size: 0, mtime: 0 }
}
function file(name: string, path: string): FileEntry {
  return { name, path, kind: 'file', size: 1, mtime: 0 }
}

// ─── Reducer mirror of useFileBrowser's tree transitions. ────────────────────────
function initialLoad(fs: FakeFs): TreeNode[] {
  return fs.list('/proj').entries.map(e => makeTreeNode(e, 0))
}

function expand(fs: FakeFs, nodes: TreeNode[], path: string): TreeNode[] {
  const node = findNode(nodes, path)!
  if (node.children) {
    return updateNode(nodes, path, n => ({ ...n, expanded: true }))
  }
  const res = fs.list(path)
  return setNodeChildren(nodes, path, res.entries, node.depth + 1, res.hasMore)
}

function loadMore(fs: FakeFs, nodes: TreeNode[], path: string): TreeNode[] {
  const node = findNode(nodes, path)!
  const res = fs.list(path, node.loadedCount)
  return updateNode(nodes, path, n => ({
    ...n,
    children: reconcileChildren(n.children, res.entries, n.depth + 1),
    loadedCount: res.entries.length,
    hasMore: res.hasMore,
  }))
}

// Mirror of the hook's `refresh(dir)` for a directory currently in the tree.
function refreshDir(fs: FakeFs, nodes: TreeNode[], path: string): TreeNode[] {
  if (path === '/proj') {
    return reconcileChildren(nodes, fs.list('/proj').entries, 0)
  }
  const node = findNode(nodes, path)
  if (!node || !node.expanded) return nodes
  const res = fs.list(path, 0, Math.max(node.loadedCount, LAZY_BATCH_SIZE))
  return updateNode(nodes, path, n => ({
    ...n,
    children: reconcileChildren(n.children, res.entries, n.depth + 1),
    loadedCount: res.entries.length,
    hasMore: res.hasMore,
  }))
}

function setup(): FakeFs {
  const fs = new FakeFs()
  fs.setDir('/proj', [
    dir('src', '/proj/src'),
    file('README.md', '/proj/README.md'),
    file('package.json', '/proj/package.json'),
  ])
  fs.setDir('/proj/src', [
    dir('lib', '/proj/src/lib'),
    file('index.ts', '/proj/src/index.ts'),
    file('app.tsx', '/proj/src/app.tsx'),
  ])
  fs.setDir('/proj/src/lib', [file('util.ts', '/proj/src/lib/util.ts')])
  return fs
}

describe('FileBrowser: tree navigation (e2e)', () => {
  test('initial load shows the project root, directories first', () => {
    const nodes = initialLoad(setup())
    const rows = flattenVisible(nodes)
    // directories first, then files case-insensitively (package < readme)
    expect(rows.map(r => r.entry.name)).toEqual([
      'src',
      'package.json',
      'README.md',
    ])
    // nothing expanded yet → only top-level rows
    expect(rows.every(r => r.depth === 0)).toBe(true)
  })

  test('expanding a directory lazily lists + reveals its children', () => {
    const fs = setup()
    let nodes = initialLoad(fs)
    nodes = expand(fs, nodes, '/proj/src')
    const rows = flattenVisible(nodes)
    expect(rows.map(r => r.entry.path)).toEqual([
      '/proj/src',
      '/proj/src/lib',
      '/proj/src/app.tsx',
      '/proj/src/index.ts',
      '/proj/package.json',
      '/proj/README.md',
    ])
    expect(findNode(nodes, '/proj/src')!.expanded).toBe(true)
  })

  test('nested expansion + collapse toggles whole subtrees', () => {
    const fs = setup()
    let nodes = expand(fs, initialLoad(fs), '/proj/src')
    nodes = expand(fs, nodes, '/proj/src/lib')
    expect(flattenVisible(nodes).map(r => r.entry.name)).toContain('util.ts')

    nodes = collapseNode(nodes, '/proj/src')
    const rows = flattenVisible(nodes)
    expect(rows.map(r => r.entry.name)).toEqual([
      'src',
      'package.json',
      'README.md',
    ])
    // lib stayed expanded internally; re-expanding src reveals it without re-list
    nodes = updateNode(nodes, '/proj/src', n => ({ ...n, expanded: true }))
    expect(flattenVisible(nodes).map(r => r.entry.name)).toContain('util.ts')
  })
})

describe('FileBrowser: lazy loading of big directories (e2e)', () => {
  test('a >100-entry directory pages in batches', () => {
    const fs = setup()
    const big: FileEntry[] = Array.from({ length: 230 }, (_, i) =>
      file(`f${i}.txt`, `/proj/big/f${i}.txt`),
    )
    fs.setDir('/proj/big', big)
    fs.setDir('/proj', [dir('big', '/proj/big')])

    let nodes = initialLoad(fs)
    nodes = expand(fs, nodes, '/proj/big')
    let node = findNode(nodes, '/proj/big')!
    expect(node.children).toHaveLength(LAZY_BATCH_SIZE)
    expect(node.hasMore).toBe(true)

    nodes = loadMore(fs, nodes, '/proj/big')
    node = findNode(nodes, '/proj/big')!
    expect(node.children).toHaveLength(200)
    expect(node.hasMore).toBe(true)

    nodes = loadMore(fs, nodes, '/proj/big')
    node = findNode(nodes, '/proj/big')!
    expect(node.children).toHaveLength(230)
    expect(node.hasMore).toBe(false)
  })
})

describe('FileBrowser: mutations + live sync (e2e)', () => {
  test('creating a file then refreshing the dir reveals it (acceptance: create)', () => {
    const fs = setup()
    let nodes = expand(fs, initialLoad(fs), '/proj/src')
    fs.create('/proj/src', 'new.ts', 'file')
    nodes = refreshDir(fs, nodes, '/proj/src')
    expect(flattenVisible(nodes).map(r => r.entry.name)).toContain('new.ts')
  })

  test('deleting a file then refreshing removes it (acceptance: delete)', () => {
    const fs = setup()
    let nodes = expand(fs, initialLoad(fs), '/proj/src')
    fs.remove('/proj/src', 'app.tsx')
    nodes = refreshDir(fs, nodes, '/proj/src')
    expect(flattenVisible(nodes).map(r => r.entry.name)).not.toContain(
      'app.tsx',
    )
  })

  test('an external fs-watch change refreshes while preserving expansion (acceptance: sync)', () => {
    const fs = setup()
    let nodes = expand(fs, initialLoad(fs), '/proj/src')
    nodes = expand(fs, nodes, '/proj/src/lib')
    expect(findNode(nodes, '/proj/src/lib')!.expanded).toBe(true)

    // external tool drops a file into src/ → watcher fires file:changed for src
    fs.create('/proj/src', 'generated.d.ts', 'file')
    nodes = refreshDir(fs, nodes, '/proj/src')

    // new file appears AND the previously-expanded lib subtree is preserved
    const names = flattenVisible(nodes).map(r => r.entry.name)
    expect(names).toContain('generated.d.ts')
    expect(findNode(nodes, '/proj/src/lib')!.expanded).toBe(true)
    expect(names).toContain('util.ts')
  })

  test('a change to an unloaded directory is a no-op', () => {
    const fs = setup()
    const nodes = initialLoad(fs) // src not expanded
    const next = refreshDir(fs, nodes, '/proj/src')
    expect(next).toBe(nodes)
  })
})

describe('FileBrowser: fuzzy search (e2e, acceptance: live filter)', () => {
  test('typing filters across the whole project and ranks matches', () => {
    const fs = setup()
    const results = searchEntries(fs.all(), 'index')
    expect(results.map(r => r.name)).toContain('index.ts')
    // unrelated files are filtered out
    expect(results.map(r => r.name)).not.toContain('README.md')
  })

  test('clearing the query returns to the unfiltered set', () => {
    const fs = setup()
    const all = fs.all()
    expect(searchEntries(all, '')).toBe(all)
  })
})
