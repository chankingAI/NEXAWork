import { describe, test, expect } from 'bun:test'
import {
  buildHunkPatch,
  countChanges,
  dequoteGitPath,
  GIT_TONE_COLOR,
  isValidCommitMessage,
  parseAheadBehind,
  parseBranchList,
  parseDiffHunks,
  parsePorcelainStatus,
  splitStaged,
  statusBadge,
  statusTone,
  validateBranchName,
} from '../shared/git-panel'

describe('parsePorcelainStatus', () => {
  test('parses staged + unstaged + untracked columns', () => {
    const out = [
      'M  staged-only.ts',
      ' M unstaged-only.ts',
      'MM partial.ts',
      'A  added.ts',
      ' D removed.ts',
      '?? new.ts',
    ].join('\n')
    const files = parsePorcelainStatus(out)
    expect(files).toHaveLength(6)

    const byPath = Object.fromEntries(files.map(f => [f.path, f]))
    expect(byPath['staged-only.ts'].staged).toBe(true)
    expect(byPath['staged-only.ts'].unstaged).toBe(false)
    expect(byPath['unstaged-only.ts'].staged).toBe(false)
    expect(byPath['unstaged-only.ts'].unstaged).toBe(true)
    expect(byPath['partial.ts'].staged).toBe(true)
    expect(byPath['partial.ts'].unstaged).toBe(true)
    expect(byPath['added.ts'].status).toBe('added')
    expect(byPath['removed.ts'].status).toBe('deleted')
    expect(byPath['new.ts'].untracked).toBe(true)
    expect(byPath['new.ts'].status).toBe('untracked')
  })

  test('parses renames with old → new paths', () => {
    const files = parsePorcelainStatus('R  old/name.ts -> new/name.ts')
    expect(files).toHaveLength(1)
    expect(files[0].status).toBe('renamed')
    expect(files[0].oldPath).toBe('old/name.ts')
    expect(files[0].path).toBe('new/name.ts')
  })

  test('unescapes C-quoted paths', () => {
    const files = parsePorcelainStatus('?? "with space.ts"')
    expect(files[0].path).toBe('with space.ts')
  })

  test('ignores blank/short lines', () => {
    expect(parsePorcelainStatus('')).toEqual([])
    expect(parsePorcelainStatus('\n  \n')).toEqual([])
  })
})

describe('dequoteGitPath', () => {
  test('passes through unquoted paths', () => {
    expect(dequoteGitPath('src/a.ts')).toBe('src/a.ts')
  })
  test('unescapes escape sequences', () => {
    expect(dequoteGitPath('"a\\tb"')).toBe('a\tb')
    expect(dequoteGitPath('"a\\"b"')).toBe('a"b')
    expect(dequoteGitPath('"a\\\\b"')).toBe('a\\b')
  })
})

describe('splitStaged + countChanges', () => {
  test('partitions into staged / unstaged (a path can be in both)', () => {
    const files = parsePorcelainStatus(
      ['M  a.ts', ' M b.ts', 'MM c.ts', '?? d.ts'].join('\n'),
    )
    const { staged, unstaged } = splitStaged(files)
    expect(staged.map(f => f.path).sort()).toEqual(['a.ts', 'c.ts'])
    expect(unstaged.map(f => f.path).sort()).toEqual(['b.ts', 'c.ts', 'd.ts'])
    expect(countChanges(files)).toBe(4)
  })
})

describe('parseBranchList', () => {
  test('marks current branch and reads upstream', () => {
    const out = ['*main\torigin/main', 'feature/x\t', 'release\t'].join('\n')
    const branches = parseBranchList(out)
    expect(branches).toHaveLength(3)
    expect(branches[0]).toEqual({
      name: 'main',
      current: true,
      upstream: 'origin/main',
    })
    expect(branches[1].name).toBe('feature/x')
    expect(branches[1].current).toBe(false)
    expect(branches[1].upstream).toBeUndefined()
  })

  test('skips detached HEAD lines', () => {
    const out = ['*(HEAD detached at abc123)\t', 'main\t'].join('\n')
    const branches = parseBranchList(out)
    expect(branches.map(b => b.name)).toEqual(['main'])
  })
})

describe('parseAheadBehind', () => {
  test('reads behind/ahead counts', () => {
    expect(parseAheadBehind('2\t5')).toEqual({ behind: 2, ahead: 5 })
  })
  test('defaults to zero on malformed input', () => {
    expect(parseAheadBehind('')).toEqual({ ahead: 0, behind: 0 })
  })
})

describe('validateBranchName', () => {
  test('accepts valid names', () => {
    expect(validateBranchName('feature/my-branch')).toBeNull()
    expect(validateBranchName('release-1.2')).toBeNull()
  })
  test('rejects invalid names', () => {
    expect(validateBranchName('')).toBe('empty')
    expect(validateBranchName('has space')).toBe('whitespace')
    expect(validateBranchName('bad~name')).toBe('invalidChar')
    expect(validateBranchName('a..b')).toBe('invalidSequence')
    expect(validateBranchName('/leading')).toBe('slash')
    expect(validateBranchName('.hidden')).toBe('dot')
    expect(validateBranchName('foo.lock')).toBe('lock')
  })
})

describe('isValidCommitMessage', () => {
  test('requires a non-empty trimmed message', () => {
    expect(isValidCommitMessage('feat: add')).toBe(true)
    expect(isValidCommitMessage('   ')).toBe(false)
    expect(isValidCommitMessage('')).toBe(false)
  })
})

describe('parseDiffHunks + buildHunkPatch', () => {
  const diff = [
    'diff --git a/file.ts b/file.ts',
    'index 111..222 100644',
    '--- a/file.ts',
    '+++ b/file.ts',
    '@@ -1,3 +1,4 @@',
    ' context',
    '+added line',
    ' more context',
    '@@ -10,2 +11,2 @@',
    '-old',
    '+new',
    '',
  ].join('\n')

  test('splits file header from hunks', () => {
    const parsed = parseDiffHunks(diff)
    expect(parsed.fileHeader[0]).toBe('diff --git a/file.ts b/file.ts')
    expect(parsed.hunks).toHaveLength(2)
    expect(parsed.hunks[0].header).toBe('@@ -1,3 +1,4 @@')
    expect(parsed.hunks[0].additions).toBe(1)
    expect(parsed.hunks[1].additions).toBe(1)
    expect(parsed.hunks[1].deletions).toBe(1)
  })

  test('builds an applyable single-hunk patch', () => {
    const parsed = parseDiffHunks(diff)
    const patch = buildHunkPatch(parsed.fileHeader, parsed.hunks[1])
    expect(patch).toContain('diff --git a/file.ts b/file.ts')
    expect(patch).toContain('--- a/file.ts')
    expect(patch).toContain('@@ -10,2 +11,2 @@')
    expect(patch).toContain('+new')
    // Only the targeted hunk is present, not the first one.
    expect(patch).not.toContain('+added line')
    expect(patch.endsWith('\n')).toBe(true)
  })

  test('handles an empty diff', () => {
    const parsed = parseDiffHunks('')
    expect(parsed.hunks).toEqual([])
  })
})

describe('status presentation', () => {
  test('statusBadge maps to single letters', () => {
    const [staged, unstaged, untracked] = parsePorcelainStatus(
      ['A  a.ts', ' D b.ts', '?? c.ts'].join('\n'),
    )
    expect(statusBadge(staged)).toBe('A')
    expect(statusBadge(unstaged)).toBe('D')
    expect(statusBadge(untracked)).toBe('U')
  })

  test('statusTone groups statuses', () => {
    expect(statusTone('added')).toBe('added')
    expect(statusTone('untracked')).toBe('added')
    expect(statusTone('deleted')).toBe('deleted')
    expect(statusTone('renamed')).toBe('renamed')
    expect(statusTone('modified')).toBe('modified')
  })

  test('every tone has a colour', () => {
    for (const tone of ['added', 'modified', 'deleted', 'renamed'] as const) {
      expect(GIT_TONE_COLOR[tone]).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})
