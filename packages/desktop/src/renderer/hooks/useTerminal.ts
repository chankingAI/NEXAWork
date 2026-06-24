/**
 * useTerminal — manage the multi-tab PTY terminal session list (N29).
 *
 * Responsibilities:
 *  - Mirror the live terminal-tab list owned by the main-process
 *    {@link TerminalManager} (created / closed tabs, exit status).
 *  - Expose create / close / setActive actions over IPC.
 *  - Track which tab is active so the panel can mount the matching xterm view.
 *
 * PTY stdout/stdin streaming is handled per-tab inside {@link TerminalView}
 * (it subscribes to `terminal:data` and writes back via `terminal:write`); this
 * hook only owns tab-list state so switching tabs never tears down a PTY.
 */
import { useCallback, useEffect, useState } from 'react'
import type { TerminalSessionInfo } from '../../shared/ipc-channels'
import { nextActiveAfterClose } from '../../shared/terminal'

export interface UseTerminalReturn {
  sessions: TerminalSessionInfo[]
  activeId: string | null
  available: boolean
  create: (input?: { cwd?: string; title?: string }) => Promise<void>
  close: (id: string) => Promise<void>
  setActive: (id: string) => void
}

export function useTerminal(): UseTerminalReturn {
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const available = typeof window !== 'undefined' && !!window.nexawork?.terminal

  // Hydrate from any PTYs the main process already owns (survives view switch).
  useEffect(() => {
    let mounted = true
    const api = window.nexawork?.terminal
    if (!api) return
    void api.list().then(({ sessions: list }) => {
      if (!mounted) return
      setSessions(list)
      setActiveId(prev => prev ?? list[0]?.id ?? null)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Track PTY exits so closed shells flip to the "exited" badge.
  useEffect(() => {
    const api = window.nexawork?.terminal
    if (!api) return
    const unsubscribe = api.onExit(({ id, exitCode }) => {
      setSessions(prev =>
        prev.map(s => (s.id === id ? { ...s, status: 'exited', exitCode } : s)),
      )
    })
    return () => unsubscribe?.()
  }, [])

  const create = useCallback(
    async (input?: { cwd?: string; title?: string }) => {
      const api = window.nexawork?.terminal
      if (!api) return
      const info = await api.create(input ?? {})
      setSessions(prev => [...prev, info])
      setActiveId(info.id)
    },
    [],
  )

  const close = useCallback(
    async (id: string) => {
      const api = window.nexawork?.terminal
      if (!api) return
      await api.kill({ id })
      setActiveId(current => nextActiveAfterClose(sessions, id, current))
      setSessions(prev => prev.filter(s => s.id !== id))
    },
    [sessions],
  )

  const setActive = useCallback((id: string) => setActiveId(id), [])

  return { sessions, activeId, available, create, close, setActive }
}
