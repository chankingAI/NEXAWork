import { describe, test, expect } from 'bun:test'
import {
  AUDIT_DECISION_COLOR,
  auditExportFilename,
  cloneConfig,
  DEFAULT_SECURITY_CONFIG,
  effectiveSandbox,
  filterAuditLog,
  gateDecision,
  isValidSystemToolsMode,
  mergeSecurityConfig,
  normalizeSecurityConfig,
  type AuditLogEntry,
  type SecurityConfig,
  serializeAuditLog,
  summarizeAudit,
  SYSTEM_TOOLS_MODES,
  toolCategory,
} from '../shared/security-center'

const sampleAudit = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'a1',
  timestamp: '2026-06-24T00:00:00.000Z',
  category: 'file',
  action: 'FileWriteTool',
  decision: 'allow',
  detail: 'wrote a.txt',
  riskLevel: 'LOW',
  ...over,
})

describe('DEFAULT_SECURITY_CONFIG', () => {
  test('sandbox fully on, encryption on, system tools read-only', () => {
    expect(DEFAULT_SECURITY_CONFIG.sandbox.enabled).toBe(true)
    expect(DEFAULT_SECURITY_CONFIG.sandbox.fileSecurity).toBe(true)
    expect(DEFAULT_SECURITY_CONFIG.sandbox.commandSecurity).toBe(true)
    expect(DEFAULT_SECURITY_CONFIG.sandbox.networkSecurity).toBe(true)
    expect(DEFAULT_SECURITY_CONFIG.dataSecurity.encryption).toBe(true)
    expect(DEFAULT_SECURITY_CONFIG.systemTools).toBe('readonly')
  })

  test('SYSTEM_TOOLS_MODES lists the three modes', () => {
    expect(SYSTEM_TOOLS_MODES).toEqual(['disabled', 'readonly', 'full'])
  })
})

describe('isValidSystemToolsMode', () => {
  test('accepts the known modes', () => {
    expect(isValidSystemToolsMode('disabled')).toBe(true)
    expect(isValidSystemToolsMode('readonly')).toBe(true)
    expect(isValidSystemToolsMode('full')).toBe(true)
  })

  test('rejects anything else', () => {
    expect(isValidSystemToolsMode('nope')).toBe(false)
    expect(isValidSystemToolsMode(undefined)).toBe(false)
    expect(isValidSystemToolsMode(3)).toBe(false)
  })
})

describe('cloneConfig', () => {
  test('returns a deep copy with no shared nested references', () => {
    const clone = cloneConfig(DEFAULT_SECURITY_CONFIG)
    expect(clone).toEqual(DEFAULT_SECURITY_CONFIG)
    clone.sandbox.enabled = false
    clone.runtimes.python.enabled = false
    expect(DEFAULT_SECURITY_CONFIG.sandbox.enabled).toBe(true)
    expect(DEFAULT_SECURITY_CONFIG.runtimes.python.enabled).toBe(true)
  })
})

describe('mergeSecurityConfig', () => {
  test('null/undefined patch returns a clone of the base', () => {
    const merged = mergeSecurityConfig(DEFAULT_SECURITY_CONFIG, null)
    expect(merged).toEqual(DEFAULT_SECURITY_CONFIG)
    expect(merged).not.toBe(DEFAULT_SECURITY_CONFIG)
  })

  test('shallow sandbox sub-policy patch keeps siblings', () => {
    const merged = mergeSecurityConfig(DEFAULT_SECURITY_CONFIG, {
      sandbox: { fileSecurity: false },
    })
    expect(merged.sandbox.fileSecurity).toBe(false)
    expect(merged.sandbox.commandSecurity).toBe(true)
    expect(merged.sandbox.enabled).toBe(true)
  })

  test('runtime patch merges per-runtime without dropping versions', () => {
    const base = mergeSecurityConfig(DEFAULT_SECURITY_CONFIG, {
      runtimes: { python: { version: '3.11.4' } },
    })
    const merged = mergeSecurityConfig(base, {
      runtimes: { python: { enabled: false } },
    })
    expect(merged.runtimes.python.enabled).toBe(false)
    expect(merged.runtimes.python.version).toBe('3.11.4')
    expect(merged.runtimes.node.enabled).toBe(true)
  })

  test('invalid systemTools value is ignored (base kept)', () => {
    const merged = mergeSecurityConfig(DEFAULT_SECURITY_CONFIG, {
      systemTools: 'bogus' as never,
    })
    expect(merged.systemTools).toBe('readonly')
  })

  test('valid systemTools value is applied', () => {
    const merged = mergeSecurityConfig(DEFAULT_SECURITY_CONFIG, {
      systemTools: 'disabled',
    })
    expect(merged.systemTools).toBe('disabled')
  })

  test('does not mutate the base config', () => {
    mergeSecurityConfig(DEFAULT_SECURITY_CONFIG, {
      sandbox: { enabled: false },
    })
    expect(DEFAULT_SECURITY_CONFIG.sandbox.enabled).toBe(true)
  })
})

describe('normalizeSecurityConfig', () => {
  test('non-object yields a default clone', () => {
    expect(normalizeSecurityConfig(null)).toEqual(DEFAULT_SECURITY_CONFIG)
    expect(normalizeSecurityConfig('x')).toEqual(DEFAULT_SECURITY_CONFIG)
  })

  test('partial legacy object is filled from defaults', () => {
    const out = normalizeSecurityConfig({ sandbox: { enabled: false } })
    expect(out.sandbox.enabled).toBe(false)
    expect(out.sandbox.fileSecurity).toBe(true)
    expect(out.dataSecurity.encryption).toBe(true)
    expect(out.runtimes.node.enabled).toBe(true)
  })
})

describe('toolCategory', () => {
  test('maps known tools to their category', () => {
    expect(toolCategory('FileWriteTool')).toBe('file')
    expect(toolCategory('FileEditTool')).toBe('file')
    expect(toolCategory('BashTool')).toBe('command')
    expect(toolCategory('PowerShellTool')).toBe('command')
    expect(toolCategory('WebFetchTool')).toBe('network')
    expect(toolCategory('MCPTool')).toBe('network')
  })

  test('returns null for unrelated tools', () => {
    expect(toolCategory('GlobTool')).toBeNull()
    expect(toolCategory('unknown')).toBeNull()
  })
})

describe('effectiveSandbox', () => {
  test('sub-policies are gated by the master switch', () => {
    const off = effectiveSandbox({
      enabled: false,
      fileSecurity: true,
      commandSecurity: true,
      networkSecurity: true,
    })
    expect(off).toEqual({
      fileSecurity: false,
      commandSecurity: false,
      networkSecurity: false,
    })
  })

  test('with master on, sub-policy values pass through', () => {
    const eff = effectiveSandbox({
      enabled: true,
      fileSecurity: true,
      commandSecurity: false,
      networkSecurity: true,
    })
    expect(eff).toEqual({
      fileSecurity: true,
      commandSecurity: false,
      networkSecurity: true,
    })
  })
})

describe('gateDecision', () => {
  const cfg = (over: Partial<SecurityConfig['sandbox']>): SecurityConfig =>
    mergeSecurityConfig(DEFAULT_SECURITY_CONFIG, { sandbox: over })

  test('non-sandbox tools return null (no opinion)', () => {
    expect(gateDecision(DEFAULT_SECURITY_CONFIG, 'GlobTool')).toBeNull()
  })

  test('guarded category returns "guard"', () => {
    expect(gateDecision(DEFAULT_SECURITY_CONFIG, 'FileWriteTool')).toBe('guard')
    expect(gateDecision(DEFAULT_SECURITY_CONFIG, 'BashTool')).toBe('guard')
  })

  test('sandbox master off allows every category', () => {
    const c = cfg({ enabled: false })
    expect(gateDecision(c, 'FileWriteTool')).toBe('allow')
    expect(gateDecision(c, 'WebFetchTool')).toBe('allow')
  })

  test('a disabled sub-policy allows only that category', () => {
    const c = cfg({ fileSecurity: false })
    expect(gateDecision(c, 'FileWriteTool')).toBe('allow')
    expect(gateDecision(c, 'BashTool')).toBe('guard')
  })
})

describe('filterAuditLog', () => {
  const entries = [
    sampleAudit({ id: '1', category: 'file', decision: 'allow' }),
    sampleAudit({ id: '2', category: 'command', decision: 'deny' }),
    sampleAudit({ id: '3', category: 'network', decision: 'allow' }),
    sampleAudit({ id: '4', category: 'policy', decision: 'intercept' }),
  ]

  test('no filter returns everything', () => {
    expect(filterAuditLog(entries)).toHaveLength(4)
    expect(
      filterAuditLog(entries, { category: 'all', decision: 'all' }),
    ).toHaveLength(4)
  })

  test('filters by category', () => {
    const out = filterAuditLog(entries, { category: 'command' })
    expect(out.map(e => e.id)).toEqual(['2'])
  })

  test('filters by decision', () => {
    const out = filterAuditLog(entries, { decision: 'allow' })
    expect(out.map(e => e.id)).toEqual(['1', '3'])
  })

  test('combines category + decision', () => {
    const out = filterAuditLog(entries, {
      category: 'network',
      decision: 'allow',
    })
    expect(out.map(e => e.id)).toEqual(['3'])
  })
})

describe('summarizeAudit', () => {
  test('counts decisions by type', () => {
    const summary = summarizeAudit([
      sampleAudit({ decision: 'allow' }),
      sampleAudit({ decision: 'allow' }),
      sampleAudit({ decision: 'deny' }),
      sampleAudit({ decision: 'intercept' }),
    ])
    expect(summary).toEqual({
      total: 4,
      allowed: 2,
      denied: 1,
      intercepted: 1,
    })
  })

  test('empty log summarizes to zeroes', () => {
    expect(summarizeAudit([])).toEqual({
      total: 0,
      allowed: 0,
      denied: 0,
      intercepted: 0,
    })
  })
})

describe('AUDIT_DECISION_COLOR', () => {
  test('has a tone for every decision', () => {
    expect(AUDIT_DECISION_COLOR.allow).toBeDefined()
    expect(AUDIT_DECISION_COLOR.deny).toBeDefined()
    expect(AUDIT_DECISION_COLOR.intercept).toBeDefined()
  })
})

describe('serializeAuditLog', () => {
  test('produces a stable JSON export document', () => {
    const now = new Date('2026-06-24T05:50:00.000Z')
    const doc = serializeAuditLog([sampleAudit()], now)
    expect(doc.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(doc)
    expect(parsed.kind).toBe('nexawork-audit-log')
    expect(parsed.version).toBe(1)
    expect(parsed.exportedAt).toBe('2026-06-24T05:50:00.000Z')
    expect(parsed.count).toBe(1)
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0].action).toBe('FileWriteTool')
  })

  test('empty log serializes with count 0', () => {
    const parsed = JSON.parse(serializeAuditLog([]))
    expect(parsed.count).toBe(0)
    expect(parsed.entries).toEqual([])
  })
})

describe('auditExportFilename', () => {
  test('builds a zero-padded timestamped filename', () => {
    const name = auditExportFilename(new Date('2026-06-24T05:09:03'))
    expect(name).toBe('nexawork-audit-20260624-050903.json')
  })
})
