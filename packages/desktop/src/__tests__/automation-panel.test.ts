/**
 * AutomationPanel (N18) — pure helper unit tests
 * splitAutomations / statusDotColor / resultTag.
 */
import { describe, test, expect } from 'bun:test'
import {
  splitAutomations,
  statusDotColor,
  resultTag,
} from '../renderer/components/AutomationPanel'
import type { AutomationInfo } from '../shared/ipc-channels'

function auto(over: Partial<AutomationInfo>): AutomationInfo {
  return {
    id: 'x',
    name: 'n',
    prompt: 'p',
    cron: 'P|day|08:00',
    workspace: '',
    status: 'active',
    ...over,
  }
}

describe('splitAutomations', () => {
  test('partitions active/paused into scheduled, completed separately', () => {
    const list = [
      auto({ id: '1', status: 'active' }),
      auto({ id: '2', status: 'paused' }),
      auto({ id: '3', status: 'completed' }),
    ]
    const { scheduled, completed } = splitAutomations(list)
    expect(scheduled.map(a => a.id)).toEqual(['1', '2'])
    expect(completed.map(a => a.id)).toEqual(['3'])
  })

  test('empty list → empty partitions', () => {
    const { scheduled, completed } = splitAutomations([])
    expect(scheduled).toHaveLength(0)
    expect(completed).toHaveLength(0)
  })
})

describe('statusDotColor', () => {
  test('active = green, paused = yellow, completed = neutral', () => {
    expect(statusDotColor('active')).toContain('green')
    expect(statusDotColor('paused')).toContain('yellow')
    // completed falls through to a neutral/tertiary color token.
    expect(typeof statusDotColor('completed')).toBe('string')
  })
})

describe('resultTag', () => {
  test('failure → 失败 red', () => {
    const tag = resultTag('failure')
    expect(tag.label).toBe('失败')
    expect(tag.color).toContain('red')
  })
  test('success / undefined → 成功 green', () => {
    expect(resultTag('success').label).toBe('成功')
    expect(resultTag(undefined).label).toBe('成功')
  })
})
