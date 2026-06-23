/**
 * ProjectPage (N20) — pure helper unit tests + template catalog checks.
 */
import { describe, test, expect } from 'bun:test'
import {
  filterProjects,
  WIZARD_STEPS,
} from '../renderer/components/ProjectPage'
import { PROJECT_TEMPLATES, getTemplate } from '../shared/project-templates'
import type { ProjectInfo } from '../shared/ipc-channels'

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  const now = new Date().toISOString()
  return {
    id: 'p',
    name: 'name',
    description: 'desc',
    template: 'blank',
    path: '',
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe('filterProjects', () => {
  const list = [
    proj({ id: '1', name: 'Marketing', description: 'q4 plan' }),
    proj({ id: '2', name: 'Bug board', description: 'regression tracking' }),
  ]
  test('empty query returns all', () => {
    expect(filterProjects(list, '')).toHaveLength(2)
    expect(filterProjects(list, '   ')).toHaveLength(2)
  })
  test('matches name (case-insensitive)', () => {
    expect(filterProjects(list, 'market').map(p => p.id)).toEqual(['1'])
  })
  test('matches description', () => {
    expect(filterProjects(list, 'tracking').map(p => p.id)).toEqual(['2'])
  })
  test('no match → empty', () => {
    expect(filterProjects(list, 'zzz')).toHaveLength(0)
  })
})

describe('WIZARD_STEPS', () => {
  test('has the four ordered steps', () => {
    expect(WIZARD_STEPS).toEqual(['template', 'details', 'directory', 'init'])
  })
})

describe('PROJECT_TEMPLATES', () => {
  test('exposes exactly 6 templates', () => {
    expect(PROJECT_TEMPLATES).toHaveLength(6)
  })
  test('every template has required fields + non-empty presets', () => {
    for (const t of PROJECT_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.icon).toBeTruthy()
      expect(t.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(t.presets.length).toBeGreaterThan(0)
    }
  })
  test('template ids are unique', () => {
    const ids = PROJECT_TEMPLATES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  test('getTemplate finds by id and returns undefined otherwise', () => {
    expect(getTemplate('prd-flow')?.name).toBe('产品需求全流程')
    expect(getTemplate('nope')).toBeUndefined()
  })
})
