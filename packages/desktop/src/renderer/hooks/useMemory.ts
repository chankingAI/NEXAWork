/**
 * useMemory — load, mutate, and live-refresh the operation-memory list (N22).
 *
 * Responsibilities:
 *  - Load the persisted memory entries from the main process on mount.
 *  - Expose add / remove / clear actions that persist via IPC.
 *  - Stay in sync with `memory:changed` broadcasts so every window refreshes.
 */
import { useCallback, useEffect, useState } from 'react'
import type { MemoryEntry } from '../../shared/ipc-channels'

export interface UseMemoryReturn {
  entries: MemoryEntry[]
  loading: boolean
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
  add: (content: string, category?: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useMemory(): UseMemoryReturn {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const api = window.nexawork?.memory
    if (!api) {
      setLoading(false)
      return
    }
    const { entries: list } = await api.list()
    setEntries(list)
  }, [])

  useEffect(() => {
    let mounted = true
    const api = window.nexawork?.memory

    const load = async () => {
      if (!api) {
        if (mounted) setLoading(false)
        return
      }
      try {
        const { entries: list } = await api.list()
        if (mounted) setEntries(list)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()
    const unsubscribe = api?.onChanged(() => {
      void load()
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    await window.nexawork?.memory.delete({ id })
  }, [])

  const clear = useCallback(async () => {
    await window.nexawork?.memory.clear()
  }, [])

  const add = useCallback(async (content: string, category?: string) => {
    await window.nexawork?.memory.add({ content, category })
  }, [])

  return { entries, loading, remove, clear, add, refresh }
}
