import { describe, expect, test } from 'bun:test'
import {
  cloneRules,
  commandHead,
  DEFAULT_SECURITY_RULES,
  evaluateCommandRule,
  evaluateFileRule,
  evaluateNetworkRule,
  evaluateOperation,
  extractHost,
  isValidCommandPattern,
  isValidDomain,
  isValidPathPattern,
  matchDomain,
  matchGlob,
  normalizeRules,
  type SecurityRules,
} from '../shared/security-rules'

const rules = (patch: Partial<SecurityRules> = {}): SecurityRules => ({
  ...cloneRules(DEFAULT_SECURITY_RULES),
  ...patch,
})

describe('matchGlob', () => {
  test('exact + directory-prefix match without wildcards', () => {
    expect(matchGlob('/etc', '/etc')).toBe(true)
    expect(matchGlob('/etc', '/etc/passwd')).toBe(true)
    expect(matchGlob('/etc', '/etcd')).toBe(false)
  })

  test('* matches within a path segment only', () => {
    expect(matchGlob('/home/*/notes.txt', '/home/alice/notes.txt')).toBe(true)
    expect(matchGlob('/home/*/notes.txt', '/home/alice/sub/notes.txt')).toBe(
      false,
    )
  })

  test('** matches across separators', () => {
    expect(matchGlob('/home/**/notes.txt', '/home/alice/sub/notes.txt')).toBe(
      true,
    )
  })

  test('? matches a single non-separator char', () => {
    expect(matchGlob('file?.txt', 'file1.txt')).toBe(true)
    expect(matchGlob('file?.txt', 'file12.txt')).toBe(false)
  })

  test('empty pattern never matches', () => {
    expect(matchGlob('', 'anything')).toBe(false)
  })
})

describe('commandHead + matchDomain + extractHost', () => {
  test('commandHead returns the executable token', () => {
    expect(commandHead('  rm -rf /tmp ')).toBe('rm')
    expect(commandHead('')).toBe('')
  })

  test('extractHost handles bare hosts and URLs', () => {
    expect(extractHost('example.com')).toBe('example.com')
    expect(extractHost('https://API.Example.com/path')).toBe('api.example.com')
    expect(extractHost('   ')).toBeNull()
  })

  test('matchDomain wildcard matches apex + subdomains', () => {
    expect(matchDomain('*.example.com', 'a.example.com')).toBe(true)
    expect(matchDomain('*.example.com', 'example.com')).toBe(true)
    expect(matchDomain('*.example.com', 'evil.com')).toBe(false)
    expect(matchDomain('example.com', 'a.example.com')).toBe(false)
  })
})

describe('validation', () => {
  test('path + command patterns reject empty / control chars', () => {
    expect(isValidPathPattern('/home/*')).toBe(true)
    expect(isValidPathPattern('   ')).toBe(false)
    expect(isValidCommandPattern('git status')).toBe(true)
    expect(isValidCommandPattern('bad\u0000cmd')).toBe(false)
  })

  test('domain validation', () => {
    expect(isValidDomain('example.com')).toBe(true)
    expect(isValidDomain('*.example.com')).toBe(true)
    expect(isValidDomain('not a domain')).toBe(false)
    expect(isValidDomain('http://example.com')).toBe(false)
  })
})

describe('evaluateFileRule', () => {
  test('deny wins over allow', () => {
    const r = rules({ fileAllow: ['/home/**'], fileDeny: ['/home/secret/**'] })
    expect(evaluateFileRule(r, '/home/alice/a.txt')).toBe('allow')
    expect(evaluateFileRule(r, '/home/secret/key')).toBe('deny')
  })

  test('non-empty allow list denies unmatched paths', () => {
    const r = rules({ fileAllow: ['/work/**'] })
    expect(evaluateFileRule(r, '/work/a')).toBe('allow')
    expect(evaluateFileRule(r, '/etc/passwd')).toBe('deny')
  })

  test('no rules → prompt', () => {
    expect(evaluateFileRule(rules(), '/any')).toBe('prompt')
  })
})

describe('evaluateCommandRule', () => {
  test('whitelist allows by head or full glob, else prompt', () => {
    const r = rules({ commandAllow: ['git', 'npm *'] })
    expect(evaluateCommandRule(r, 'git status')).toBe('allow')
    expect(evaluateCommandRule(r, 'npm install foo')).toBe('allow')
    expect(evaluateCommandRule(r, 'rm -rf /')).toBe('prompt')
  })

  test('empty whitelist → prompt', () => {
    expect(evaluateCommandRule(rules(), 'git status')).toBe('prompt')
  })
})

describe('evaluateNetworkRule', () => {
  test('deny wins; allow permits; unmatched prompts', () => {
    const r = rules({
      network: [
        { domain: '*.example.com', action: 'allow' },
        { domain: 'bad.example.com', action: 'deny' },
      ],
    })
    expect(evaluateNetworkRule(r, 'https://api.example.com')).toBe('allow')
    expect(evaluateNetworkRule(r, 'https://bad.example.com')).toBe('deny')
    expect(evaluateNetworkRule(r, 'https://other.org')).toBe('prompt')
  })

  test('unparseable target → prompt', () => {
    expect(evaluateNetworkRule(rules({ network: [] }), '   ')).toBe('prompt')
  })
})

describe('evaluateOperation dispatch', () => {
  test('routes by category', () => {
    const r = rules({ fileDeny: ['/etc/**'], commandAllow: ['ls'] })
    expect(evaluateOperation(r, 'file', '/etc/passwd')).toBe('deny')
    expect(evaluateOperation(r, 'command', 'ls -la')).toBe('allow')
    expect(evaluateOperation(r, 'network', 'https://x.io')).toBe('prompt')
  })
})

describe('normalizeRules', () => {
  test('trims, dedupes, drops invalid + bad network rules', () => {
    const out = normalizeRules({
      fileAllow: ['/a', '/a', ' /b ', '   ', 123 as unknown as string],
      commandAllow: ['git'],
      network: [
        { domain: 'example.com', action: 'allow' },
        { domain: 'example.com', action: 'deny' },
        { domain: 'bad domain', action: 'allow' },
        { domain: 'x.com', action: 'nope' as unknown as 'allow' },
      ],
      fileDeny: undefined as unknown as string[],
    })
    expect(out.fileAllow).toEqual(['/a', '/b'])
    expect(out.fileDeny).toEqual([])
    // last action for a domain wins
    expect(out.network).toEqual([{ domain: 'example.com', action: 'deny' }])
  })

  test('non-object input returns defaults', () => {
    expect(normalizeRules(null)).toEqual(DEFAULT_SECURITY_RULES)
  })
})
