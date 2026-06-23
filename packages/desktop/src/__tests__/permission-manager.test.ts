import { describe, test, expect, beforeEach } from 'bun:test'
import {
  PermissionManager,
  mapToBackendMode,
  classifyTool,
  summarizeInput,
  type PermissionWindow,
} from '../main/backend/permission-manager'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { PermissionRequest } from '../shared/ipc-channels'

/**
 * PermissionManager Unit Tests (N17)
 * Tests mode mapping, tool classification, the request round-trip, session
 * rules, default-deny, and the permission log.
 */

// A fake window that records sends and exposes the last permission request.
function makeWindow() {
  const sent: { channel: string; payload: unknown }[] = []
  const win: PermissionWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        sent.push({ channel, payload })
      },
    },
  }
  return {
    win,
    sent,
    lastRequest(): PermissionRequest {
      const last = sent[sent.length - 1]
      expect(last.channel).toBe(IPC_CHANNELS.PERMISSION_REQUEST)
      return last.payload as PermissionRequest
    },
  }
}

describe('mapToBackendMode', () => {
  test('default maps to default', () => {
    expect(mapToBackendMode('default')).toBe('default')
  })
  test('full maps to bypassPermissions', () => {
    expect(mapToBackendMode('full')).toBe('bypassPermissions')
  })
})

describe('classifyTool', () => {
  test('Bash is HIGH risk with command in scope', () => {
    const c = classifyTool({ name: 'BashTool', input: { command: 'rm -rf /' } })
    expect(c.riskLevel).toBe('HIGH')
    expect(c.affectedScope).toBe('rm -rf /')
  })

  test('FileWrite is HIGH risk with path in scope', () => {
    const c = classifyTool({
      name: 'FileWriteTool',
      input: { file_path: '/etc/hosts' },
    })
    expect(c.riskLevel).toBe('HIGH')
    expect(c.affectedScope).toBe('/etc/hosts')
  })

  test('WebFetch is MEDIUM risk', () => {
    const c = classifyTool({
      name: 'WebFetchTool',
      input: { url: 'https://x.com' },
    })
    expect(c.riskLevel).toBe('MEDIUM')
    expect(c.affectedScope).toBe('https://x.com')
  })

  test('FileRead is LOW risk', () => {
    const c = classifyTool({
      name: 'FileReadTool',
      input: { file_path: '/tmp/a' },
    })
    expect(c.riskLevel).toBe('LOW')
  })
})

describe('summarizeInput', () => {
  test('joins key=value pairs', () => {
    expect(summarizeInput({ a: '1', b: '2' })).toBe('a=1 b=2')
  })
  test('truncates long values', () => {
    const summary = summarizeInput({ command: 'x'.repeat(100) })
    expect(summary.length).toBeLessThan(60)
    expect(summary).toContain('…')
  })
  test('caps at three keys', () => {
    const summary = summarizeInput({ a: '1', b: '2', c: '3', d: '4' })
    expect(summary).not.toContain('d=')
  })
})

describe('PermissionManager — mode', () => {
  let pm: PermissionManager
  beforeEach(() => {
    pm = new PermissionManager({ bypassAvailable: true })
  })

  test('default mode initially', () => {
    expect(pm.getMode()).toBe('default')
  })

  test('setMode to full when available', () => {
    expect(pm.setMode('full')).toBe('full')
    expect(pm.getMode()).toBe('full')
  })

  test('setMode to full rejected when bypass unavailable', () => {
    const restricted = new PermissionManager({ bypassAvailable: false })
    expect(restricted.setMode('full')).toBe('default')
    expect(restricted.isBypassAvailable()).toBe(false)
  })
})

describe('PermissionManager — request round-trip', () => {
  let pm: PermissionManager
  beforeEach(() => {
    pm = new PermissionManager({ bypassAvailable: true })
  })

  test('full mode auto-allows without prompting', async () => {
    pm.setMode('full')
    const { win, sent } = makeWindow()
    const allowed = await pm.requestPermission(win, {
      name: 'BashTool',
      input: { command: 'ls' },
    })
    expect(allowed).toBe(true)
    expect(sent).toHaveLength(0)
    expect(pm.getLog()[0].scope).toBe('auto')
  })

  test('null window denies in default mode', async () => {
    const allowed = await pm.requestPermission(null, {
      name: 'BashTool',
      input: {},
    })
    expect(allowed).toBe(false)
    expect(pm.getLog()[0].decision).toBe('deny')
  })

  test('allow once resolves true and does not persist a session rule', async () => {
    const { win, lastRequest } = makeWindow()
    const p = pm.requestPermission(win, {
      name: 'FileWriteTool',
      input: { file_path: '/a' },
    })
    const req = lastRequest()
    expect(pm.respond(req.requestId, 'allow', 'once')).toBe(true)
    expect(await p).toBe(true)

    // A second identical request should prompt again (no session rule).
    const { win: win2, sent: sent2 } = makeWindow()
    const p2 = pm.requestPermission(win2, {
      name: 'FileWriteTool',
      input: { file_path: '/a' },
    })
    expect(sent2).toHaveLength(1)
    pm.respond(
      (sent2[0].payload as PermissionRequest).requestId,
      'deny',
      'once',
    )
    expect(await p2).toBe(false)
  })

  test('allow session auto-allows subsequent same-tool requests', async () => {
    const { win, lastRequest } = makeWindow()
    const p = pm.requestPermission(win, {
      name: 'WebFetchTool',
      input: { url: 'https://x' },
    })
    pm.respond(lastRequest().requestId, 'allow', 'session')
    expect(await p).toBe(true)

    const { win: win2, sent: sent2 } = makeWindow()
    const allowed2 = await pm.requestPermission(win2, {
      name: 'WebFetchTool',
      input: { url: 'https://y' },
    })
    expect(allowed2).toBe(true)
    expect(sent2).toHaveLength(0)
  })

  test('deny resolves false and logs deny', async () => {
    const { win, lastRequest } = makeWindow()
    const p = pm.requestPermission(win, {
      name: 'BashTool',
      input: { command: 'rm' },
    })
    pm.respond(lastRequest().requestId, 'deny', 'once')
    expect(await p).toBe(false)
    expect(pm.getLog()[0].decision).toBe('deny')
  })

  test('respond with unknown id returns false', () => {
    expect(pm.respond('nope', 'allow', 'once')).toBe(false)
  })

  test('request payload carries risk + description + scope', async () => {
    const { win, lastRequest } = makeWindow()
    const p = pm.requestPermission(win, {
      name: 'BashTool',
      input: { command: 'whoami' },
    })
    const req = lastRequest()
    expect(req.tool).toBe('BashTool')
    expect(req.riskLevel).toBe('HIGH')
    expect(req.description).toContain('whoami')
    expect(req.affectedScope).toBe('whoami')
    pm.respond(req.requestId, 'allow', 'once')
    await p
  })
})

describe('PermissionManager — log', () => {
  let pm: PermissionManager
  beforeEach(() => {
    pm = new PermissionManager({ bypassAvailable: true })
  })

  test('records entries newest-first', async () => {
    pm.setMode('full')
    const { win } = makeWindow()
    await pm.requestPermission(win, {
      name: 'FileReadTool',
      input: { file_path: '/a' },
    })
    await pm.requestPermission(win, {
      name: 'FileReadTool',
      input: { file_path: '/b' },
    })
    const log = pm.getLog()
    expect(log).toHaveLength(2)
    expect(log[0].inputSummary).toContain('/b')
  })

  test('limit slices the log', async () => {
    pm.setMode('full')
    const { win } = makeWindow()
    for (let i = 0; i < 5; i++) {
      await pm.requestPermission(win, {
        name: 'FileReadTool',
        input: { i: String(i) },
      })
    }
    expect(pm.getLog(2)).toHaveLength(2)
  })

  test('clearLog empties the log', async () => {
    pm.setMode('full')
    const { win } = makeWindow()
    await pm.requestPermission(win, { name: 'FileReadTool', input: {} })
    pm.clearLog()
    expect(pm.getLog()).toHaveLength(0)
  })

  test('reset clears mode + log + session rules', async () => {
    pm.setMode('full')
    const { win } = makeWindow()
    await pm.requestPermission(win, { name: 'FileReadTool', input: {} })
    pm.reset()
    expect(pm.getMode()).toBe('default')
    expect(pm.getLog()).toHaveLength(0)
  })
})
