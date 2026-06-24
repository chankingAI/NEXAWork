import { describe, test, expect } from 'bun:test'
import {
  type FileEntry,
  DEFAULT_IGNORED_NAMES,
  ICON_CATEGORY_COLOR,
  LAZY_BATCH_SIZE,
  batchEntries,
  collapseNode,
  fileIconCategory,
  fileIconColor,
  findNode,
  flattenVisible,
  fuzzyMatch,
  fuzzyScore,
  isDefaultIgnored,
  isEntryVisible,
  isIgnoredByGitignore,
  makeTreeNode,
  markNodeLoading,
  parseGitignore,
  reconcileChildren,
  searchEntries,
  setNodeChildren,
  sortEntries,
  toRelativePosix,
  updateNode,
} from '../shared/file-tree'

/**
 * N30 file-tree pure-logic tests. These cover the filtering / .gitignore /
 * fuzzy-search / batching / icon / tree-state helpers that the renderer and the
 * main-process FileBrowserManager both reuse — no fs or DOM required.
 */

function file(name: string, path = `/p/${name}`): FileEntry {
  return { name, path, kind: 'file', size: 1, mtime: 0 }
}
function dir(name: string, path = `/p/${name}`): FileEntry {
  return { name, path, kind: 'directory', size: 0, mtime: 0 }
}

describe('default-ignore', () => {
  test('hides .git / node_modules / .DS_Store', () => {
    expect(isDefaultIgnored('.git')).toBe(true)
    expect(isDefaultIgnored('node_modules')).toBe(true)
    expect(isDefaultIgnored('.DS_Store')).toBe(true)
    expect(DEFAULT_IGNORED_NAMES.size).toBe(3)
  })
  test('keeps normal files', () => {
    expect(isDefaultIgnored('src')).toBe(false)
    expect(isDefaultIgnored('index.ts')).toBe(false)
  })
})

describe('parseGitignore', () => {
  test('skips blanks + comments, captures negation + dir-only', () => {
    const rules = parseGitignore(
      ['# comment', '', 'dist/', '*.log', '!keep.log', '/root-only.txt'].join(
        '\n',
      ),
    )
    expect(rules.map(r => r.source)).toEqual([
      'dist/',
      '*.log',
      '!keep.log',
      '/root-only.txt',
    ])
    expect(rules[0].dirOnly).toBe(true)
    expect(rules[2].negated).toBe(true)
  })
})

describe('isIgnoredByGitignore', () => {
  const rules = parseGitignore(
    ['dist/', '*.log', '!keep.log', '/root-only.txt', '**/tmp', 'build'].join(
      '\n',
    ),
  )

  test('dir-only rule matches only directories', () => {
    expect(isIgnoredByGitignore('dist', true, rules)).toBe(true)
    // a *file* literally named "dist" is not matched by "dist/"
    expect(isIgnoredByGitignore('dist', false, rules)).toBe(false)
  })
  test('extension glob matches at any depth', () => {
    expect(isIgnoredByGitignore('a.log', false, rules)).toBe(true)
    expect(isIgnoredByGitignore('src/nested/b.log', false, rules)).toBe(true)
  })
  test('negation re-includes a previously ignored path', () => {
    expect(isIgnoredByGitignore('keep.log', false, rules)).toBe(false)
  })
  test('anchored rule only matches at the root', () => {
    expect(isIgnoredByGitignore('root-only.txt', false, rules)).toBe(true)
    expect(isIgnoredByGitignore('sub/root-only.txt', false, rules)).toBe(false)
  })
  test('**/ prefix matches at the root and nested', () => {
    expect(isIgnoredByGitignore('tmp', true, rules)).toBe(true)
    expect(isIgnoredByGitignore('a/b/tmp', true, rules)).toBe(true)
  })
  test('bare name matches dir + its descendants', () => {
    expect(isIgnoredByGitignore('build', true, rules)).toBe(true)
    expect(isIgnoredByGitignore('build/out.js', false, rules)).toBe(true)
  })
})

describe('toRelativePosix', () => {
  test('computes a posix relative path under root', () => {
    expect(toRelativePosix('/repo', '/repo/src/a.ts')).toBe('src/a.ts')
    expect(toRelativePosix('/repo', '/repo')).toBe('')
  })
  test('normalises backslashes', () => {
    expect(toRelativePosix('C:\\repo', 'C:\\repo\\src\\a.ts')).toBe('src/a.ts')
  })
})

describe('isEntryVisible', () => {
  const rules = parseGitignore('dist/\n*.log')
  test('default-ignore wins regardless of gitignore', () => {
    expect(
      isEntryVisible(
        { name: 'node_modules', relPath: 'node_modules', isDir: true },
        rules,
        true,
      ),
    ).toBe(false)
  })
  test('respects gitignore only when enabled', () => {
    const e = { name: 'a.log', relPath: 'a.log', isDir: false }
    expect(isEntryVisible(e, rules, true)).toBe(false)
    expect(isEntryVisible(e, rules, false)).toBe(true)
  })
  test('keeps ordinary files', () => {
    expect(
      isEntryVisible(
        { name: 'a.ts', relPath: 'a.ts', isDir: false },
        rules,
        true,
      ),
    ).toBe(true)
  })
})

describe('sortEntries', () => {
  test('directories first, then case-insensitive name', () => {
    const sorted = sortEntries([
      file('Zebra.ts'),
      dir('src'),
      file('apple.ts'),
      dir('App'),
    ])
    expect(sorted.map(e => e.name)).toEqual([
      'App',
      'src',
      'apple.ts',
      'Zebra.ts',
    ])
  })
})

describe('batchEntries (lazy loading)', () => {
  const many = Array.from({ length: 250 }, (_, i) => file(`f${i}.ts`))
  test('first batch caps at the default size + flags more', () => {
    const r = batchEntries(many)
    expect(r.visible).toHaveLength(LAZY_BATCH_SIZE)
    expect(r.hasMore).toBe(true)
    expect(r.total).toBe(250)
  })
  test('cumulative slice grows with offset', () => {
    const r = batchEntries(many, 100)
    expect(r.visible).toHaveLength(200)
    expect(r.hasMore).toBe(true)
  })
  test('small directory has no more', () => {
    const r = batchEntries(many.slice(0, 30))
    expect(r.visible).toHaveLength(30)
    expect(r.hasMore).toBe(false)
  })
})

describe('fuzzy search', () => {
  test('fuzzyMatch is a subsequence test (case-insensitive)', () => {
    expect(fuzzyMatch('fbr', 'FileBrowser.tsx')).toBe(true)
    expect(fuzzyMatch('xyz', 'FileBrowser.tsx')).toBe(false)
    expect(fuzzyMatch('', 'anything')).toBe(true)
  })
  test('fuzzyScore rewards exact / prefix / contiguous matches', () => {
    expect(fuzzyScore('app', 'app')).toBe(1000)
    expect(fuzzyScore('app', 'apple') > fuzzyScore('app', 'pineapple')).toBe(
      true,
    )
    expect(fuzzyScore('zzz', 'apple')).toBe(-1)
  })
  test('searchEntries filters + ranks, empty query passthrough', () => {
    const entries = [file('readme.md'), file('app.ts'), file('apple.tsx')]
    const ranked = searchEntries(entries, 'app')
    expect(ranked.map(e => e.name)).toEqual(['app.ts', 'apple.tsx'])
    expect(searchEntries(entries, '   ')).toBe(entries)
  })
})

describe('file icons', () => {
  test('categorises by extension / filename / kind', () => {
    expect(fileIconCategory('main.ts', 'file')).toBe('code')
    expect(fileIconCategory('styles.css', 'file')).toBe('style')
    expect(fileIconCategory('package.json', 'file')).toBe('json')
    expect(fileIconCategory('.gitignore', 'file')).toBe('git')
    expect(fileIconCategory('bun.lock', 'file')).toBe('lock')
    expect(fileIconCategory('photo.png', 'file')).toBe('image')
    expect(fileIconCategory('src', 'directory')).toBe('directory')
    expect(fileIconCategory('mystery.qqq', 'file')).toBe('text')
  })
  test('every category has a hex colour', () => {
    for (const color of Object.values(ICON_CATEGORY_COLOR)) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
    expect(fileIconColor('a.ts', 'file')).toBe(ICON_CATEGORY_COLOR.code)
  })
})

describe('tree state', () => {
  const tree = [
    makeTreeNode(dir('src', '/p/src'), 0),
    makeTreeNode(file('a.ts', '/p/a.ts'), 0),
  ]

  test('makeTreeNode starts collapsed + unloaded', () => {
    const n = makeTreeNode(dir('src', '/p/src'), 0)
    expect(n.expanded).toBe(false)
    expect(n.children).toBeNull()
    expect(n.loadedCount).toBe(0)
  })

  test('setNodeChildren loads + expands a directory', () => {
    const next = setNodeChildren(
      tree,
      '/p/src',
      [file('index.ts', '/p/src/index.ts')],
      1,
      false,
    )
    const node = findNode(next, '/p/src')!
    expect(node.expanded).toBe(true)
    expect(node.children).toHaveLength(1)
    expect(node.children![0].depth).toBe(1)
  })

  test('flattenVisible only descends into expanded directories', () => {
    let next = setNodeChildren(
      tree,
      '/p/src',
      [file('index.ts', '/p/src/index.ts')],
      1,
      false,
    )
    expect(flattenVisible(next).map(n => n.entry.path)).toEqual([
      '/p/src',
      '/p/src/index.ts',
      '/p/a.ts',
    ])
    next = collapseNode(next, '/p/src')
    expect(flattenVisible(next).map(n => n.entry.path)).toEqual([
      '/p/src',
      '/p/a.ts',
    ])
  })

  test('markNodeLoading + updateNode immutably target one node', () => {
    const next = markNodeLoading(tree, '/p/src')
    expect(findNode(next, '/p/src')!.loading).toBe(true)
    expect(findNode(next, '/p/a.ts')!.loading).toBe(false)
    expect(next).not.toBe(tree)
  })

  test('updateNode recurses into children', () => {
    const loaded = setNodeChildren(
      tree,
      '/p/src',
      [dir('lib', '/p/src/lib')],
      1,
      false,
    )
    const next = updateNode(loaded, '/p/src/lib', n => ({
      ...n,
      expanded: true,
    }))
    expect(findNode(next, '/p/src/lib')!.expanded).toBe(true)
  })
})

describe('reconcileChildren (live refresh)', () => {
  test('preserves expansion of surviving nodes, adds new, drops gone', () => {
    const prevLoaded = setNodeChildren(
      [makeTreeNode(dir('src', '/p/src'), 0)],
      '/p/src',
      [dir('lib', '/p/src/lib'), file('old.ts', '/p/src/old.ts')],
      1,
      false,
    )
    const srcNode = findNode(prevLoaded, '/p/src')!
    // expand the lib subdir so we can prove its state survives a refresh
    const withExpandedLib = updateNode(srcNode.children!, '/p/src/lib', n => ({
      ...n,
      expanded: true,
      children: [],
      loadedCount: 0,
    }))

    const reconciled = reconcileChildren(
      withExpandedLib,
      [dir('lib', '/p/src/lib'), file('new.ts', '/p/src/new.ts')],
      1,
    )
    const names = reconciled.map(n => n.entry.name)
    expect(names).toContain('lib')
    expect(names).toContain('new.ts')
    expect(names).not.toContain('old.ts')
    expect(reconciled.find(n => n.entry.name === 'lib')!.expanded).toBe(true)
  })
})
