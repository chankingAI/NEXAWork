/**
 * NexaWork useProjects — Project list state + actions (N20)
 *
 * Bridges the renderer ProjectPage to the main-process ProjectManager:
 * - loads the project list (newest-first)
 * - exposes create / rename / remove actions with optimistic refresh
 * - exposes pickDir to open a native directory picker (wizard step 3)
 *
 * Works without the Electron bridge (dev/browser) by falling back to local state.
 */
import { useState, useEffect, useCallback } from 'react'
import type { ProjectInfo, ProjectCreateInput } from '../../shared/ipc-channels'

export interface UseProjectsReturn {
  projects: ProjectInfo[]
  loading: boolean
  refresh: () => void
  create: (input: ProjectCreateInput) => Promise<string | undefined>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  pickDir: () => Promise<string | null>
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    const api = window.nexawork?.project
    if (!api) {
      setLoading(false)
      return
    }
    api
      .list()
      .then(res => setProjects(res.projects))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (input: ProjectCreateInput) => {
      const res = await window.nexawork?.project
        ?.create(input)
        .catch(() => undefined)
      refresh()
      return res?.id
    },
    [refresh],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      setProjects(prev => prev.map(p => (p.id === id ? { ...p, name } : p)))
      await window.nexawork?.project?.rename({ id, name }).catch(() => {})
      refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      setProjects(prev => prev.filter(p => p.id !== id))
      await window.nexawork?.project?.delete({ id }).catch(() => {})
      refresh()
    },
    [refresh],
  )

  const pickDir = useCallback(async () => {
    const res = await window.nexawork?.project?.pickDir().catch(() => null)
    return res?.path ?? null
  }, [])

  return { projects, loading, refresh, create, rename, remove, pickDir }
}
