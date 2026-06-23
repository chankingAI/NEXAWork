import { describe, test, expect } from 'bun:test'
import {
  permissionModeConfigs,
  getModeConfig,
  needsConfirm,
} from '../renderer/components/PermissionSelector'
import {
  getRiskMeta,
  riskMeta,
} from '../renderer/components/PermissionConfirmDialog'
import {
  formatTimestamp,
  scopeLabel,
  modeLabel,
  filterByRisk,
} from '../renderer/components/PermissionLogView'
import type { PermissionLogEntry } from '../shared/ipc-channels'

/**
 * Permission UI Helpers Unit Tests (N17)
 * Tests selector configs, confirm-dialog risk metadata, and log formatting.
 */

describe('Permission Mode Configs', () => {
  test('two modes defined: default + full', () => {
    expect(permissionModeConfigs.map(m => m.id)).toEqual(['default', 'full'])
  })

  test('default does not require confirm, full does', () => {
    expect(getModeConfig('default').requiresConfirm).toBe(false)
    expect(getModeConfig('full').requiresConfirm).toBe(true)
  })

  test('getModeConfig falls back to default', () => {
    expect(getModeConfig('default').id).toBe('default')
  })
})

describe('needsConfirm', () => {
  test('switching to full requires confirm', () => {
    expect(needsConfirm('default', 'full')).toBe(true)
  })
  test('switching to default does not', () => {
    expect(needsConfirm('full', 'default')).toBe(false)
  })
  test('same mode never confirms', () => {
    expect(needsConfirm('full', 'full')).toBe(false)
    expect(needsConfirm('default', 'default')).toBe(false)
  })
})

describe('Risk Metadata', () => {
  test('all three risk levels defined', () => {
    expect(Object.keys(riskMeta).sort()).toEqual(['HIGH', 'LOW', 'MEDIUM'])
  })
  test('getRiskMeta returns label + color + icon', () => {
    const meta = getRiskMeta('HIGH')
    expect(meta.label).toBeTruthy()
    expect(meta.color).toBeTruthy()
    expect(meta.icon).toBeTruthy()
  })
})

describe('Log Formatting', () => {
  test('formatTimestamp formats ISO to MM-DD HH:mm:ss', () => {
    const out = formatTimestamp('2026-06-23T08:09:05.000Z')
    expect(out).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  test('formatTimestamp returns input on invalid date', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date')
  })

  test('scopeLabel maps all scopes', () => {
    expect(scopeLabel('once')).toBe('本次')
    expect(scopeLabel('session')).toBe('会话')
    expect(scopeLabel('auto')).toBe('自动')
  })

  test('modeLabel maps modes', () => {
    expect(modeLabel('default')).toBe('默认')
    expect(modeLabel('full')).toBe('完全访问')
  })
})

describe('filterByRisk', () => {
  const entries: PermissionLogEntry[] = [
    makeEntry('1', 'HIGH'),
    makeEntry('2', 'LOW'),
    makeEntry('3', 'HIGH'),
  ]

  test('all returns everything', () => {
    expect(filterByRisk(entries, 'all')).toHaveLength(3)
  })

  test('filters by risk level', () => {
    expect(filterByRisk(entries, 'HIGH')).toHaveLength(2)
    expect(filterByRisk(entries, 'LOW')).toHaveLength(1)
    expect(filterByRisk(entries, 'MEDIUM')).toHaveLength(0)
  })
})

function makeEntry(
  id: string,
  riskLevel: PermissionLogEntry['riskLevel'],
): PermissionLogEntry {
  return {
    id,
    tool: 'BashTool',
    inputSummary: 'command=ls',
    mode: 'default',
    decision: 'allow',
    scope: 'once',
    riskLevel,
    timestamp: '2026-06-23T08:00:00.000Z',
  }
}
