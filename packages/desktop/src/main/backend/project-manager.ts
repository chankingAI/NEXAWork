/**
 * NexaWork Project Manager (N20)
 *
 * Owns the user's projects: their local directory association, source template
 * and creation metadata. Mirrors the AutomationManager pattern — in-memory now,
 * moving to SQLite (see N10) without changing this surface.
 *
 * Git initialization is a main-process side effect (`git init`), injected via
 * `setGitInit` so this module stays free of Node/Electron deps and testable in
 * isolation. When no initializer is wired (tests), `initGit` simply marks the
 * project as initialized.
 */
import type { ProjectInfo, ProjectCreateInput } from '../../shared/ipc-channels'

/** Initializes a git repo at `path`; returns true on success. */
export type ProjectGitInit = (path: string) => boolean

export class ProjectManager {
  private readonly projects = new Map<string, ProjectInfo>()
  private gitInit: ProjectGitInit | null = null
  private idCounter = 0

  constructor() {
    this.seed()
  }

  /** Wire the main-process git initializer. */
  setGitInit(fn: ProjectGitInit | null): void {
    this.gitInit = fn
  }

  private nextId(): string {
    this.idCounter += 1
    return `proj-${Date.now().toString(36)}-${this.idCounter}`
  }

  /** List projects newest-first, optionally filtered by a name/description query. */
  list(query?: string): ProjectInfo[] {
    const all = Array.from(this.projects.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    const q = query?.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    )
  }

  get(id: string): ProjectInfo | undefined {
    return this.projects.get(id)
  }

  create(input: ProjectCreateInput): ProjectInfo {
    const id = this.nextId()
    const gitInitialized = input.initGit
      ? (this.gitInit?.(input.path) ?? true)
      : false
    const project: ProjectInfo = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      template: input.template,
      path: input.path.trim(),
      createdAt: new Date().toISOString(),
      gitInitialized,
    }
    this.projects.set(id, project)
    return project
  }

  rename(id: string, name: string): boolean {
    const project = this.projects.get(id)
    if (!project) return false
    const trimmed = name.trim()
    if (!trimmed) return false
    project.name = trimmed
    return true
  }

  delete(id: string): boolean {
    return this.projects.delete(id)
  }

  /** Test/reset hook — clears state and re-seeds demo data. */
  reset(): void {
    this.projects.clear()
    this.idCounter = 0
    this.seed()
  }

  /** Seed demonstrative projects so the list is non-empty on first run. */
  private seed(): void {
    const now = Date.now()
    const day = 24 * 3_600_000
    const seeds: ProjectInfo[] = [
      {
        id: 'proj-seed-prd',
        name: '智能客服重构',
        description: '从需求到交付的产品全流程协同',
        template: 'tpl-prd-flow',
        path: '~/Projects/smart-support',
        createdAt: new Date(now - 3 * day).toISOString(),
        gitInitialized: true,
      },
      {
        id: 'proj-seed-research',
        name: 'Q3 竞品分析',
        description: '市场调研与竞品对比报告',
        template: 'tpl-market-research',
        path: '~/Projects/q3-research',
        createdAt: new Date(now - 8 * day).toISOString(),
        gitInitialized: false,
      },
    ]
    for (const p of seeds) this.projects.set(p.id, p)
  }
}

/** Shared singleton used by the IPC handlers. */
export const projectManager = new ProjectManager()
