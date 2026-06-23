import { describe, test, expect, beforeEach } from 'bun:test'
import { ProjectManager, projectManager } from '../main/backend/project-manager'

describe('ProjectManager', () => {
  let mgr: ProjectManager

  beforeEach(() => {
    mgr = new ProjectManager()
  })

  test('seeds demo projects on construction', () => {
    expect(mgr.list().length).toBeGreaterThan(0)
  })

  test('list is newest-first', () => {
    const list = mgr.list()
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].createdAt >= list[i].createdAt).toBe(true)
    }
  })

  test('create assigns id, trims fields and stores metadata', () => {
    const p = mgr.create({
      name: '  My App  ',
      description: '  build it  ',
      template: 'tpl-prd-flow',
      path: '  ~/Projects/my-app  ',
    })
    expect(p.id).toContain('proj-')
    expect(p.name).toBe('My App')
    expect(p.description).toBe('build it')
    expect(p.template).toBe('tpl-prd-flow')
    expect(p.path).toBe('~/Projects/my-app')
    expect(p.createdAt).toBeDefined()
    expect(mgr.get(p.id)).toBeDefined()
  })

  test('create with a blank project leaves template undefined', () => {
    const p = mgr.create({ name: 'Blank', path: '~/p' })
    expect(p.template).toBeUndefined()
    expect(p.description).toBe('')
  })

  test('create newest project appears first in list', () => {
    const p = mgr.create({ name: 'Latest', path: '~/latest' })
    expect(mgr.list()[0].id).toBe(p.id)
  })

  test('initGit=false does not mark gitInitialized', () => {
    const p = mgr.create({ name: 'NoGit', path: '~/nogit', initGit: false })
    expect(p.gitInitialized).toBe(false)
  })

  test('initGit=true marks gitInitialized (defaults to true without an initializer)', () => {
    const p = mgr.create({ name: 'Git', path: '~/git', initGit: true })
    expect(p.gitInitialized).toBe(true)
  })

  test('initGit=true delegates to the injected initializer result', () => {
    const calls: string[] = []
    mgr.setGitInit(path => {
      calls.push(path)
      return false
    })
    const p = mgr.create({ name: 'Git2', path: '~/git2', initGit: true })
    expect(calls).toEqual(['~/git2'])
    expect(p.gitInitialized).toBe(false)
  })

  test('list filters by name or description query', () => {
    mgr.reset()
    mgr.create({ name: 'Alpha Service', description: 'auth', path: '~/a' })
    mgr.create({ name: 'Beta', description: 'payment gateway', path: '~/b' })
    expect(mgr.list('alpha').length).toBe(1)
    expect(mgr.list('gateway').length).toBe(1)
    expect(mgr.list('zzz').length).toBe(0)
  })

  test('rename updates the name and rejects empty / missing', () => {
    const p = mgr.create({ name: 'Old', path: '~/o' })
    expect(mgr.rename(p.id, 'New')).toBe(true)
    expect(mgr.get(p.id)?.name).toBe('New')
    expect(mgr.rename(p.id, '   ')).toBe(false)
    expect(mgr.rename('missing', 'X')).toBe(false)
  })

  test('delete removes the project', () => {
    const p = mgr.create({ name: 'Del', path: '~/d' })
    expect(mgr.delete(p.id)).toBe(true)
    expect(mgr.get(p.id)).toBeUndefined()
    expect(mgr.delete(p.id)).toBe(false)
  })

  test('reset clears custom projects and re-seeds', () => {
    const p = mgr.create({ name: 'Temp', path: '~/t' })
    mgr.reset()
    expect(mgr.get(p.id)).toBeUndefined()
    expect(mgr.list().length).toBeGreaterThan(0)
  })

  test('shared singleton is a ProjectManager', () => {
    expect(projectManager).toBeInstanceOf(ProjectManager)
  })
})
