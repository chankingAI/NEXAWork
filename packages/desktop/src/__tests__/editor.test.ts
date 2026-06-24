/**
 * Code-editor subsystem tests (N28).
 *
 * Two Electron-free layers, both run under `bun test`:
 *  1. The pure helpers in `shared/editor` — path/basename/extension parsing,
 *     Monaco language detection, binary sniffing, the tab model (open/close/
 *     edit/save/persist), `git diff --name-status` parsing, the "Ask AI" prompt
 *     builder, the AI-edit tool detection + path extraction, and the LCS-based
 *     changed-line-range diff used for flash-highlighting.
 *  2. The `EditorManager` (real temp dir + null in-memory dir) — file read with
 *     size/binary guards, write-through with mtime, stat, and the open-tab
 *     session persistence (load/save round-trip + sanitisation).
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  baseName,
  buildAskAiPrompt,
  closeTab,
  computeChangedLineRanges,
  DEFAULT_EDITOR_CONFIG,
  detectLanguage,
  extractEditedFilePath,
  fileExtension,
  gitStatusFromCode,
  indexOfTab,
  isFileMutatingTool,
  isProbablyBinary,
  makeTab,
  markTabSaved,
  MAX_EDITABLE_FILE_BYTES,
  openTab,
  parseGitNameStatus,
  setTabContent,
  toPersistState,
} from '../shared/editor'
import { EditorManager } from '../main/backend/editor-manager'

// ─── Pure helpers ──────────────────────────────────────────────────────────

describe('baseName / fileExtension', () => {
  test('extracts basename across separators and trailing slashes', () => {
    expect(baseName('/a/b/c.ts')).toBe('c.ts')
    expect(baseName('C:\\a\\b\\c.ts')).toBe('c.ts')
    expect(baseName('/a/b/')).toBe('b')
    expect(baseName('file.ts')).toBe('file.ts')
  })

  test('extracts lower-cased extension, empty for dotfiles', () => {
    expect(fileExtension('/x/y.TS')).toBe('ts')
    expect(fileExtension('archive.tar.gz')).toBe('gz')
    expect(fileExtension('.env')).toBe('')
    expect(fileExtension('Makefile')).toBe('')
  })
})

describe('detectLanguage', () => {
  test('maps common extensions to Monaco language ids', () => {
    expect(detectLanguage('a.ts')).toBe('typescript')
    expect(detectLanguage('a.tsx')).toBe('typescript')
    expect(detectLanguage('a.jsx')).toBe('javascript')
    expect(detectLanguage('styles.css')).toBe('css')
    expect(detectLanguage('main.py')).toBe('python')
    expect(detectLanguage('go.mod')).toBe('plaintext')
    expect(detectLanguage('readme.MD')).toBe('markdown')
  })

  test('recognises special filenames regardless of extension', () => {
    expect(detectLanguage('/repo/Dockerfile')).toBe('dockerfile')
    expect(detectLanguage('/repo/Makefile')).toBe('makefile')
    expect(detectLanguage('/repo/.gitignore')).toBe('plaintext')
  })

  test('unknown extensions fall back to plaintext', () => {
    expect(detectLanguage('a.unknownext')).toBe('plaintext')
    expect(detectLanguage('noext')).toBe('plaintext')
  })
})

describe('isProbablyBinary', () => {
  test('flags NUL bytes, passes plain text', () => {
    expect(isProbablyBinary('hello world')).toBe(false)
    expect(isProbablyBinary('a\u0000b')).toBe(true)
    expect(isProbablyBinary('')).toBe(false)
  })
})

describe('tab model', () => {
  test('makeTab derives name + language and starts clean', () => {
    const tab = makeTab('/proj/src/index.ts', 'const x = 1\n')
    expect(tab.name).toBe('index.ts')
    expect(tab.language).toBe('typescript')
    expect(tab.dirty).toBe(false)
    expect(tab.savedContent).toBe('const x = 1\n')
    expect(tab.readOnly).toBe(false)
  })

  test('openTab appends new + replaces existing without duplicating', () => {
    const a = makeTab('/a.ts', 'a')
    const r1 = openTab([], a)
    expect(r1.tabs).toHaveLength(1)
    expect(r1.activePath).toBe('/a.ts')

    const b = makeTab('/b.ts', 'b')
    const r2 = openTab(r1.tabs, b)
    expect(r2.tabs).toHaveLength(2)
    expect(r2.activePath).toBe('/b.ts')

    const aReloaded = makeTab('/a.ts', 'a2')
    const r3 = openTab(r2.tabs, aReloaded)
    expect(r3.tabs).toHaveLength(2)
    expect(indexOfTab(r3.tabs, '/a.ts')).toBe(0)
    expect(r3.tabs[0].content).toBe('a2')
    expect(r3.activePath).toBe('/a.ts')
  })

  test('closeTab focuses the neighbour and clears when empty', () => {
    const tabs = [
      makeTab('/a.ts', 'a'),
      makeTab('/b.ts', 'b'),
      makeTab('/c.ts', 'c'),
    ]
    const r1 = closeTab(tabs, '/b.ts', '/b.ts')
    expect(r1.tabs.map(t => t.path)).toEqual(['/a.ts', '/c.ts'])
    expect(r1.activePath).toBe('/c.ts')

    // Closing a non-active tab keeps the active selection.
    const r2 = closeTab(tabs, '/a.ts', '/c.ts')
    expect(r2.activePath).toBe('/c.ts')

    const r3 = closeTab([makeTab('/only.ts', 'x')], '/only.ts', '/only.ts')
    expect(r3.tabs).toHaveLength(0)
    expect(r3.activePath).toBeNull()
  })

  test('setTabContent toggles dirty against savedContent', () => {
    const tabs = [makeTab('/a.ts', 'orig')]
    const dirty = setTabContent(tabs, '/a.ts', 'changed')
    expect(dirty[0].dirty).toBe(true)
    const reverted = setTabContent(dirty, '/a.ts', 'orig')
    expect(reverted[0].dirty).toBe(false)
  })

  test('markTabSaved syncs savedContent and clears dirty', () => {
    const edited = setTabContent([makeTab('/a.ts', 'orig')], '/a.ts', 'new')
    const saved = markTabSaved(edited, '/a.ts')
    expect(saved[0].dirty).toBe(false)
    expect(saved[0].savedContent).toBe('new')
  })

  test('toPersistState serialises open paths + active', () => {
    const tabs = [makeTab('/a.ts', 'a'), makeTab('/b.ts', 'b')]
    expect(toPersistState(tabs, '/b.ts')).toEqual({
      openPaths: ['/a.ts', '/b.ts'],
      activePath: '/b.ts',
    })
  })
})

describe('git status parsing', () => {
  test('gitStatusFromCode maps letters', () => {
    expect(gitStatusFromCode('M')).toBe('modified')
    expect(gitStatusFromCode('A')).toBe('added')
    expect(gitStatusFromCode('D')).toBe('deleted')
    expect(gitStatusFromCode('R100')).toBe('renamed')
    expect(gitStatusFromCode('C75')).toBe('copied')
    expect(gitStatusFromCode('?')).toBe('untracked')
    expect(gitStatusFromCode('X')).toBe('unknown')
  })

  test('parseGitNameStatus handles modifies, renames and blank lines', () => {
    const out = [
      'M\tsrc/a.ts',
      'A\tsrc/new.ts',
      'D\tsrc/gone.ts',
      'R100\tsrc/old.ts\tsrc/renamed.ts',
      '',
      '?\tsrc/untracked.ts',
    ].join('\n')
    const changes = parseGitNameStatus(out)
    expect(changes).toHaveLength(5)
    expect(changes[0]).toEqual({
      path: 'src/a.ts',
      status: 'modified',
      code: 'M',
    })
    const rename = changes.find(c => c.status === 'renamed')
    expect(rename).toEqual({
      path: 'src/renamed.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
      code: 'R100',
    })
    expect(parseGitNameStatus('   \n\n')).toEqual([])
  })
})

describe('AI integration helpers', () => {
  test('isFileMutatingTool recognises the write/edit tools', () => {
    expect(isFileMutatingTool('FileWriteTool')).toBe(true)
    expect(isFileMutatingTool('FileEditTool')).toBe(true)
    expect(isFileMutatingTool('FileMultiEditTool')).toBe(true)
    expect(isFileMutatingTool('NotebookEditTool')).toBe(true)
    expect(isFileMutatingTool('BashTool')).toBe(false)
    expect(isFileMutatingTool('FileReadTool')).toBe(false)
  })

  test('extractEditedFilePath accepts the various field names', () => {
    expect(extractEditedFilePath({ file_path: '/a.ts' })).toBe('/a.ts')
    expect(extractEditedFilePath({ filePath: '/b.ts' })).toBe('/b.ts')
    expect(extractEditedFilePath({ path: '/c.ts' })).toBe('/c.ts')
    expect(extractEditedFilePath({ notebook_path: '/d.ipynb' })).toBe(
      '/d.ipynb',
    )
    expect(extractEditedFilePath({ other: 1 })).toBeNull()
    expect(extractEditedFilePath(null)).toBeNull()
    expect(extractEditedFilePath('x')).toBeNull()
    expect(extractEditedFilePath({ file_path: '   ' })).toBeNull()
  })

  test('buildAskAiPrompt fences the selection with its language', () => {
    const prompt = buildAskAiPrompt(
      '/proj/src/util.ts',
      'typescript',
      'const a = 1',
    )
    expect(prompt).toContain('util.ts')
    expect(prompt).toContain('```typescript')
    expect(prompt).toContain('const a = 1')

    const plain = buildAskAiPrompt('/notes.txt', 'plaintext', 'hello')
    // plaintext should not leak as a fence language.
    expect(plain).toContain('```\n')
  })
})

describe('computeChangedLineRanges', () => {
  test('returns [] for identical text', () => {
    expect(computeChangedLineRanges('a\nb\nc', 'a\nb\nc')).toEqual([])
  })

  test('captures a single modified line', () => {
    const ranges = computeChangedLineRanges('a\nb\nc', 'a\nB\nc')
    expect(ranges).toEqual([{ startLine: 2, endLine: 2 }])
  })

  test('captures appended lines at EOF', () => {
    const ranges = computeChangedLineRanges('a\nb', 'a\nb\nc\nd')
    expect(ranges).toEqual([{ startLine: 3, endLine: 4 }])
  })

  test('captures multiple disjoint runs', () => {
    const ranges = computeChangedLineRanges('a\nb\nc\nd\ne', 'a\nB\nc\nD\nE')
    expect(ranges).toEqual([
      { startLine: 2, endLine: 2 },
      { startLine: 4, endLine: 5 },
    ])
  })

  test('captures a contiguous inserted block', () => {
    const ranges = computeChangedLineRanges('a\nd', 'a\nb\nc\nd')
    expect(ranges).toEqual([{ startLine: 2, endLine: 3 }])
  })
})

describe('DEFAULT_EDITOR_CONFIG', () => {
  test('matches the N28 spec', () => {
    expect(DEFAULT_EDITOR_CONFIG.fontSize).toBe(13)
    expect(DEFAULT_EDITOR_CONFIG.tabSize).toBe(2)
    expect(DEFAULT_EDITOR_CONFIG.autosaveDelayMs).toBe(1000)
    expect(DEFAULT_EDITOR_CONFIG.minimap).toBe(false)
    expect(DEFAULT_EDITOR_CONFIG.fontFamily).toContain('JetBrains Mono')
  })
})

// ─── EditorManager (disk-facing) ─────────────────────────────────────────────

const workDir = mkdtempSync(join(tmpdir(), 'nexa-editor-'))
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('EditorManager file IO', () => {
  test('write then read round-trips content + language + mtime', () => {
    const mgr = new EditorManager()
    const path = join(workDir, 'sample.ts')
    const write = mgr.writeFile(path, 'export const a = 1\n')
    expect(write.success).toBe(true)
    expect(write.mtime).toBeGreaterThan(0)

    const read = mgr.readFile(path)
    expect(read.content).toBe('export const a = 1\n')
    expect(read.language).toBe('typescript')
    expect(read.tooLarge).toBe(false)
    expect(read.binary).toBe(false)
  })

  test('readFile creates parent dirs on write and flags binary content', () => {
    const mgr = new EditorManager()
    const nested = join(workDir, 'deep', 'nested', 'bin.dat')
    mgr.writeFile(nested, 'ok\u0000nope')
    const read = mgr.readFile(nested)
    expect(read.binary).toBe(true)
    expect(read.content).toBe('')
  })

  test('readFile throws ENOENT for a missing file', () => {
    const mgr = new EditorManager()
    expect(() => mgr.readFile(join(workDir, 'does-not-exist.ts'))).toThrow(
      /ENOENT/,
    )
  })

  test('statFile reports existence without throwing', () => {
    const mgr = new EditorManager()
    const path = join(workDir, 'statme.txt')
    mgr.writeFile(path, 'hi')
    const ok = mgr.statFile(path)
    expect(ok.exists).toBe(true)
    expect(ok.isFile).toBe(true)
    expect(ok.size).toBe(2)

    const missing = mgr.statFile(join(workDir, 'nope.txt'))
    expect(missing.exists).toBe(false)
  })

  test('MAX_EDITABLE_FILE_BYTES is the documented 2 MiB ceiling', () => {
    expect(MAX_EDITABLE_FILE_BYTES).toBe(2 * 1024 * 1024)
  })
})

describe('EditorManager session persistence', () => {
  test('in-memory manager starts empty and round-trips state', () => {
    const mgr = new EditorManager()
    expect(mgr.loadState()).toEqual({ openPaths: [], activePath: null })

    const saved = mgr.saveState({
      openPaths: ['/a.ts', '/b.ts'],
      activePath: '/a.ts',
    })
    expect(saved).toEqual({
      openPaths: ['/a.ts', '/b.ts'],
      activePath: '/a.ts',
    })
  })

  test('saveState dedups paths and repairs a dangling active path', () => {
    const mgr = new EditorManager()
    const saved = mgr.saveState({
      openPaths: ['/a.ts', '/a.ts', '/b.ts'],
      activePath: '/missing.ts',
    })
    expect(saved.openPaths).toEqual(['/a.ts', '/b.ts'])
    // Dangling active path falls back to the last open path.
    expect(saved.activePath).toBe('/b.ts')
  })

  test('persists to disk and reloads across instances', () => {
    const statePath = join(workDir, 'editor-state.json')
    const first = new EditorManager({ statePath })
    first.saveState({ openPaths: ['/x.ts', '/y.ts'], activePath: '/x.ts' })

    const second = new EditorManager({ statePath })
    expect(second.loadState()).toEqual({
      openPaths: ['/x.ts', '/y.ts'],
      activePath: '/x.ts',
    })
  })
})
