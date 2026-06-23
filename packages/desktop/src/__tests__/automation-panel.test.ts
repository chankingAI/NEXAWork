import { describe, test, expect } from 'bun:test'
import type { AutomationInfo } from '../shared/ipc-channels'
import {
  splitAutomations,
  scheduledDotColor,
  automationTemplates,
} from '../renderer/components/AutomationPanel'

function make(
  id: string,
  status: AutomationInfo['status'],
  extra: Partial<AutomationInfo> = {},
): AutomationInfo {
  return {
    id,
    name: id,
    prompt: 'p',
    cron: '0 8 * * *',
    workspace: 'ws',
    status,
    ...extra,
  }
}

describe('splitAutomations', () => {
  test('groups active/paused into scheduled and completed separately', () => {
    const list = [
      make('a', 'active'),
      make('b', 'paused'),
      make('c', 'completed'),
      make('d', 'active'),
    ]
    const { scheduled, completed } = splitAutomations(list)
    expect(scheduled.map(a => a.id)).toEqual(['a', 'b', 'd'])
    expect(completed.map(a => a.id)).toEqual(['c'])
  })

  test('empty input', () => {
    const { scheduled, completed } = splitAutomations([])
    expect(scheduled).toHaveLength(0)
    expect(completed).toHaveLength(0)
  })
})

describe('scheduledDotColor', () => {
  test('active is green, paused is orange', () => {
    expect(scheduledDotColor('active')).toBe('var(--color-accent-green)')
    expect(scheduledDotColor('paused')).toBe('var(--color-accent-orange)')
  })
})

describe('automationTemplates', () => {
  test('every template carries a valid 5-field cron and required fields', () => {
    expect(automationTemplates.length).toBeGreaterThan(0)
    for (const tpl of automationTemplates) {
      expect(tpl.id).toBeTruthy()
      expect(tpl.name).toBeTruthy()
      expect(tpl.prompt).toBeTruthy()
      expect(tpl.workspace).toBeTruthy()
      expect(tpl.cron.trim().split(/\s+/)).toHaveLength(5)
    }
  })

  test('template ids are unique', () => {
    const ids = automationTemplates.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
