import { describe, test, expect } from 'bun:test'
import {
  defaultSkills,
  skillSections,
  filterSkills,
  groupSkills,
  countEnabled,
  permissionIcon,
  type MarketSkill,
} from '../renderer/components/SkillSearchPanel'

/**
 * SkillSearchPanel Unit Tests (N15)
 * Tests search filtering, section grouping, and skill metadata integrity.
 */

describe('Default Skills', () => {
  test('default skills are defined', () => {
    expect(defaultSkills.length).toBeGreaterThan(0)
  })

  test('all skills have required fields', () => {
    for (const skill of defaultSkills) {
      expect(skill.id).toBeTruthy()
      expect(skill.name).toBeTruthy()
      expect(skill.description).toBeTruthy()
      expect(skill.icon).toBeTruthy()
      expect(skill.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(['bundled', 'installed', 'available']).toContain(skill.source)
      expect(typeof skill.enabled).toBe('boolean')
      expect(Array.isArray(skill.permissions)).toBe(true)
    }
  })

  test('skill IDs are unique', () => {
    const ids = defaultSkills.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('covers all three sources', () => {
    const sources = new Set(defaultSkills.map(s => s.source))
    expect(sources.has('bundled')).toBe(true)
    expect(sources.has('installed')).toBe(true)
    expect(sources.has('available')).toBe(true)
  })
})

describe('Sections', () => {
  test('three sections defined in order', () => {
    expect(skillSections.map(s => s.id)).toEqual([
      'bundled',
      'installed',
      'available',
    ])
  })
})

describe('filterSkills', () => {
  test('empty query returns all', () => {
    expect(filterSkills(defaultSkills, '')).toHaveLength(defaultSkills.length)
    expect(filterSkills(defaultSkills, '   ')).toHaveLength(
      defaultSkills.length,
    )
  })

  test('matches by name (case-insensitive)', () => {
    const result = filterSkills(defaultSkills, 'PDF')
    expect(result.some(s => s.id === 'pdf-tools')).toBe(true)
  })

  test('matches by description', () => {
    const result = filterSkills(defaultSkills, '数据库')
    expect(result.some(s => s.id === 'sql-runner')).toBe(true)
  })

  test('no match returns empty', () => {
    expect(filterSkills(defaultSkills, 'zzz-nonexistent-zzz')).toHaveLength(0)
  })
})

describe('groupSkills', () => {
  test('groups into three buckets', () => {
    const grouped = groupSkills(defaultSkills)
    expect(grouped.bundled.every(s => s.source === 'bundled')).toBe(true)
    expect(grouped.installed.every(s => s.source === 'installed')).toBe(true)
    expect(grouped.available.every(s => s.source === 'available')).toBe(true)
  })

  test('total equals input', () => {
    const grouped = groupSkills(defaultSkills)
    const total =
      grouped.bundled.length +
      grouped.installed.length +
      grouped.available.length
    expect(total).toBe(defaultSkills.length)
  })
})

describe('countEnabled', () => {
  test('counts enabled skills', () => {
    const skills: MarketSkill[] = [
      { ...defaultSkills[0], enabled: true },
      { ...defaultSkills[1], enabled: false },
      { ...defaultSkills[2], enabled: true },
    ]
    expect(countEnabled(skills)).toBe(2)
  })

  test('empty list is zero', () => {
    expect(countEnabled([])).toBe(0)
  })
})

describe('permissionIcon', () => {
  test('returns an element for each type', () => {
    for (const type of ['file', 'network', 'command', 'env'] as const) {
      expect(permissionIcon(type)).toBeTruthy()
    }
  })
})
