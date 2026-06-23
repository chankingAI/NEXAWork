import { describe, test, expect } from 'bun:test'
import {
  defaultSkills,
  skillCategoryTabs,
  filterSkills,
  countByCategory,
  resolveSkillSource,
  permissionLabel,
} from '../renderer/components/skillCatalog'
import type { SkillInfo } from '../shared/ipc-channels'

/**
 * SkillSearchPanel logic tests (N15)
 *
 * Exercises the pure catalog helpers that drive the panel: category tiers,
 * realtime search filtering, per-tier counts, source resolution and the
 * permission label map. Components consume these directly, so covering them
 * guarantees the panel's filtering / tab behaviour without a DOM.
 */

describe('Skill catalog: shape', () => {
  test('exposes three category tabs (builtin / installed / available)', () => {
    expect(skillCategoryTabs.map(t => t.id)).toEqual([
      'builtin',
      'installed',
      'available',
    ])
  })

  test('default catalog spans all three tiers with valid items', () => {
    expect(defaultSkills.length).toBeGreaterThan(0)
    for (const skill of defaultSkills) {
      expect(skill.id).toBeTruthy()
      expect(skill.name).toBeTruthy()
      expect(skill.description).toBeTruthy()
      expect(skill.icon).toBeTruthy()
      expect(skill.color).toMatch(/^#/)
      expect(['builtin', 'installed', 'available']).toContain(
        resolveSkillSource(skill),
      )
    }
    const counts = countByCategory(defaultSkills)
    expect(counts.builtin).toBeGreaterThan(0)
    expect(counts.installed).toBeGreaterThan(0)
    expect(counts.available).toBeGreaterThan(0)
  })

  test('matches the WorkBuddy reference skills', () => {
    const names = defaultSkills.map(s => s.name)
    expect(names).toContain('技能创建指南')
    expect(names).toContain('self-improving-agent')
    expect(names).toContain('Brave Search CLI')
  })
})

describe('resolveSkillSource', () => {
  test('honours explicit source field', () => {
    const skill = { ...defaultSkills[0], source: 'available' as const }
    expect(resolveSkillSource(skill)).toBe('available')
  })

  test('derives from installed flag when source is absent', () => {
    const installed: SkillInfo = {
      id: 'x',
      name: 'x',
      description: 'x',
      category: 'tools',
      installed: true,
      enabled: true,
      version: '1.0.0',
    }
    const uninstalled: SkillInfo = { ...installed, id: 'y', installed: false }
    expect(resolveSkillSource(installed)).toBe('installed')
    expect(resolveSkillSource(uninstalled)).toBe('available')
  })
})

describe('filterSkills: category scoping', () => {
  test('only returns skills for the active tier', () => {
    const builtin = filterSkills(defaultSkills, 'builtin', '')
    expect(builtin.length).toBeGreaterThan(0)
    expect(builtin.every(s => resolveSkillSource(s) === 'builtin')).toBe(true)

    const available = filterSkills(defaultSkills, 'available', '')
    expect(available.every(s => resolveSkillSource(s) === 'available')).toBe(
      true,
    )
  })
})

describe('filterSkills: realtime search', () => {
  test('empty query returns the full tier', () => {
    const all = defaultSkills.filter(s => resolveSkillSource(s) === 'builtin')
    expect(filterSkills(defaultSkills, 'builtin', '').length).toBe(all.length)
  })

  test('matches by name (case-insensitive)', () => {
    const result = filterSkills(defaultSkills, 'builtin', 'WEB')
    expect(result.some(s => s.name === 'Web Search')).toBe(true)
  })

  test('matches by description', () => {
    const result = filterSkills(defaultSkills, 'builtin', 'sandbox')
    expect(result.some(s => s.id === 'skill-code-run')).toBe(true)
  })

  test('matches by permission', () => {
    const result = filterSkills(defaultSkills, 'builtin', 'network')
    expect(result.some(s => s.id === 'skill-web-search')).toBe(true)
  })

  test('respects tier boundary while searching', () => {
    // "search" appears in both a builtin (Web Search) and an available
    // (Brave Search CLI) skill — filtering must stay within the active tier.
    const builtin = filterSkills(defaultSkills, 'builtin', 'search')
    expect(builtin.every(s => resolveSkillSource(s) === 'builtin')).toBe(true)
    const available = filterSkills(defaultSkills, 'available', 'search')
    expect(available.some(s => s.name === 'Brave Search CLI')).toBe(true)
  })

  test('non-matching query returns empty', () => {
    expect(filterSkills(defaultSkills, 'builtin', 'zzzznotaskill')).toEqual([])
  })

  test('whitespace-only query is treated as empty', () => {
    const all = filterSkills(defaultSkills, 'installed', '')
    expect(filterSkills(defaultSkills, 'installed', '   ').length).toBe(
      all.length,
    )
  })
})

describe('countByCategory', () => {
  test('sums to the catalog size', () => {
    const counts = countByCategory(defaultSkills)
    expect(counts.builtin + counts.installed + counts.available).toBe(
      defaultSkills.length,
    )
  })
})

describe('permissionLabel', () => {
  test('maps known permission keys to Chinese labels', () => {
    expect(permissionLabel('network')).toBe('网络访问')
    expect(permissionLabel('filesystem:read')).toBe('读取文件')
    expect(permissionLabel('shell')).toBe('执行 Shell 命令')
  })

  test('falls back to the raw key for unknown permissions', () => {
    expect(permissionLabel('custom:thing')).toBe('custom:thing')
  })
})
