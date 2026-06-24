import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Database } from '../main/backend/database'
import { PermissionManager } from '../main/backend/permission-manager'
import {
  describePolicyChanges,
  extractVersion,
  SecurityManager,
} from '../main/backend/security-manager'

/** A SecurityManager backed by an isolated temp-file Database + fake probe. */
function makeManager(opts: {
  dir: string
  probe?: (cmd: string, args: string[]) => Promise<string | null>
  probeRuntimes?: boolean
}): { manager: SecurityManager; db: Database; file: string } {
  const file = join(opts.dir, 'db.json')
  const db = new Database(file)
  const manager = new SecurityManager({
    db,
    probe: opts.probe ?? (async () => null),
    probeRuntimes: opts.probeRuntimes ?? false,
  })
  return { manager, db, file }
}

describe('extractVersion', () => {
  test('pulls a dotted version out of a --version line', () => {
    expect(extractVersion('Python 3.11.4')).toBe('3.11.4')
    expect(extractVersion('v20.11.1')).toBe('20.11.1')
    expect(extractVersion('git version 2.43')).toBe('2.43')
  })

  test('returns undefined when there is no version / null input', () => {
    expect(extractVersion(null)).toBeUndefined()
    expect(extractVersion('no digits here')).toBeUndefined()
  })
})

describe('describePolicyChanges', () => {
  test('lists only the fields that changed', () => {
    const { manager } = makeManager({ dir: mkdtempSync(join(tmpdir(), 'nx-')) })
    const before = manager.getConfig()
    const after = manager.getConfig()
    after.sandbox.fileSecurity = false
    after.systemTools = 'full'
    const changes = describePolicyChanges(before, after)
    expect(changes).toContain('sandbox.file=off')
    expect(changes).toContain('systemTools=full')
    expect(changes).toHaveLength(2)
  })

  test('identical configs produce no changes', () => {
    const { manager } = makeManager({ dir: mkdtempSync(join(tmpdir(), 'nx-')) })
    expect(
      describePolicyChanges(manager.getConfig(), manager.getConfig()),
    ).toEqual([])
  })
})

describe('SecurityManager', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexa-sec-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('initializes the default policy and persists it', () => {
    const { manager, db } = makeManager({ dir })
    expect(manager.getConfig().sandbox.enabled).toBe(true)
    expect(db.getSecurityConfig()).not.toBeNull()
  })

  test('getConfig returns a defensive copy', () => {
    const { manager } = makeManager({ dir })
    const a = manager.getConfig()
    a.sandbox.enabled = false
    expect(manager.getConfig().sandbox.enabled).toBe(true)
  })

  test('updateConfig merges, persists, and returns the new config', () => {
    const { manager, db } = makeManager({ dir })
    const updated = manager.updateConfig({ sandbox: { fileSecurity: false } })
    expect(updated.sandbox.fileSecurity).toBe(false)
    expect(updated.sandbox.commandSecurity).toBe(true)
    expect(db.getSecurityConfig()?.sandbox.fileSecurity).toBe(false)
  })

  test('updateConfig records a policy-change audit entry', () => {
    const { manager } = makeManager({ dir })
    manager.updateConfig({ systemTools: 'full' })
    const log = manager.listAudit()
    expect(log).toHaveLength(1)
    expect(log[0].action).toBe('policy:update')
    expect(log[0].decision).toBe('intercept')
    expect(log[0].detail).toContain('systemTools=full')
  })

  test('a no-op updateConfig records nothing', () => {
    const { manager } = makeManager({ dir })
    manager.updateConfig({ sandbox: { enabled: true } })
    expect(manager.listAudit()).toHaveLength(0)
  })

  test('runtime patch is categorized as "runtime" in the audit', () => {
    const { manager } = makeManager({ dir })
    manager.updateConfig({ runtimes: { python: { enabled: false } } })
    expect(manager.listAudit()[0].category).toBe('runtime')
  })

  test('data-security patch is categorized as "data"', () => {
    const { manager } = makeManager({ dir })
    manager.updateConfig({ dataSecurity: { gateway: false } })
    expect(manager.listAudit()[0].category).toBe('data')
  })

  test('gate() returns true only for an unguarded category', () => {
    const { manager } = makeManager({ dir })
    expect(manager.gate('FileWriteTool')).toBeNull()
    manager.updateConfig({ sandbox: { fileSecurity: false } })
    expect(manager.gate('FileWriteTool')).toBe(true)
    expect(manager.gate('BashTool')).toBeNull()
  })

  test('gate() ignores tools outside a sandbox category', () => {
    const { manager } = makeManager({ dir })
    expect(manager.gate('GlobTool')).toBeNull()
  })

  test('recordToolDecision appends a categorized entry', () => {
    const { manager } = makeManager({ dir })
    const entry = manager.recordToolDecision(
      'BashTool',
      false,
      'rm -rf',
      'HIGH',
    )
    expect(entry).not.toBeNull()
    expect(entry?.category).toBe('command')
    expect(entry?.decision).toBe('deny')
    expect(entry?.riskLevel).toBe('HIGH')
    expect(manager.listAudit()).toHaveLength(1)
  })

  test('recordToolDecision ignores non-security tools', () => {
    const { manager } = makeManager({ dir })
    expect(manager.recordToolDecision('GlobTool', true, 'x', 'LOW')).toBeNull()
    expect(manager.listAudit()).toHaveLength(0)
  })

  test('listAudit is newest-first and honours a limit', () => {
    const { manager } = makeManager({ dir })
    manager.recordToolDecision('FileWriteTool', true, 'one', 'LOW')
    manager.recordToolDecision('BashTool', true, 'two', 'LOW')
    const all = manager.listAudit()
    expect(all[0].detail).toBe('two')
    expect(manager.listAudit(1)).toHaveLength(1)
  })

  test('clearAudit empties the log', () => {
    const { manager } = makeManager({ dir })
    manager.recordToolDecision('FileWriteTool', true, 'x', 'LOW')
    manager.clearAudit()
    expect(manager.listAudit()).toHaveLength(0)
  })

  test('exportAudit serializes the full log as JSON', () => {
    const { manager } = makeManager({ dir })
    manager.recordToolDecision('WebFetchTool', true, 'GET /', 'MEDIUM')
    const doc = JSON.parse(
      manager.exportAudit(new Date('2026-06-24T00:00:00Z')),
    )
    expect(doc.kind).toBe('nexawork-audit-log')
    expect(doc.count).toBe(1)
    expect(doc.entries[0].category).toBe('network')
  })

  test('onChanged fires on update and unsubscribes cleanly', () => {
    const { manager } = makeManager({ dir })
    let count = 0
    const off = manager.onChanged(() => {
      count += 1
    })
    manager.updateConfig({ systemTools: 'disabled' })
    expect(count).toBeGreaterThan(0)
    const afterFirst = count
    off()
    manager.updateConfig({ systemTools: 'full' })
    expect(count).toBe(afterFirst)
  })

  test('refreshRuntimeVersions caches detected versions into the policy', async () => {
    const probe = async (cmd: string) =>
      cmd === 'python3' ? 'Python 3.12.1' : 'v20.11.1'
    const { manager } = makeManager({ dir, probe })
    await manager.refreshRuntimeVersions()
    const cfg = manager.getConfig()
    expect(cfg.runtimes.python.version).toBe('3.12.1')
    expect(cfg.runtimes.node.version).toBe('20.11.1')
  })

  test('policy survives a manager restart (persisted to disk)', () => {
    const file = join(dir, 'db.json')
    const db1 = new Database(file)
    const m1 = new SecurityManager({ db: db1, probeRuntimes: false })
    m1.updateConfig({
      sandbox: { networkSecurity: false },
      systemTools: 'disabled',
    })

    const db2 = new Database(file)
    const m2 = new SecurityManager({ db: db2, probeRuntimes: false })
    const cfg = m2.getConfig()
    expect(cfg.sandbox.networkSecurity).toBe(false)
    expect(cfg.systemTools).toBe('disabled')
  })

  test('reset restores defaults and clears the audit log', () => {
    const { manager } = makeManager({ dir })
    manager.updateConfig({ systemTools: 'full' })
    manager.reset()
    expect(manager.getConfig().systemTools).toBe('readonly')
    expect(manager.listAudit()).toHaveLength(0)
  })

  test('audit log is capped at 1000 entries', () => {
    const { manager } = makeManager({ dir })
    for (let i = 0; i < 1010; i++) {
      manager.recordToolDecision('FileWriteTool', true, `w${i}`, 'LOW')
    }
    expect(manager.listAudit().length).toBe(1000)
  })
})

describe('SecurityManager ↔ PermissionManager bridge', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexa-bridge-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('an unguarded category auto-allows and lands in the audit log', async () => {
    const { manager } = makeManager({ dir })
    const perms = new PermissionManager({ bypassAvailable: true })
    perms.setPolicyGate(tool => manager.gate(tool))
    perms.setAuditSink(info =>
      manager.recordToolDecision(
        info.tool,
        info.allowed,
        info.detail,
        info.riskLevel,
      ),
    )
    // Disable command security so the gate auto-allows BashTool.
    manager.updateConfig({ sandbox: { commandSecurity: false } })

    const allowed = await perms.requestPermission(null, {
      name: 'BashTool',
      input: { command: 'ls' },
    })
    expect(allowed).toBe(true)
    const log = manager.listAudit()
    const commandEntry = log.find(
      e => e.category === 'command' && e.action === 'BashTool',
    )
    expect(commandEntry).toBeDefined()
    expect(commandEntry?.decision).toBe('allow')
  })

  test('a guarded category with no window is denied and audited', async () => {
    const { manager } = makeManager({ dir })
    const perms = new PermissionManager({ bypassAvailable: true })
    perms.setPolicyGate(tool => manager.gate(tool))
    perms.setAuditSink(info =>
      manager.recordToolDecision(
        info.tool,
        info.allowed,
        info.detail,
        info.riskLevel,
      ),
    )

    const allowed = await perms.requestPermission(null, {
      name: 'FileWriteTool',
      input: { file_path: '/tmp/x' },
    })
    expect(allowed).toBe(false)
    const entry = manager.listAudit().find(e => e.action === 'FileWriteTool')
    expect(entry?.decision).toBe('deny')
  })
})
