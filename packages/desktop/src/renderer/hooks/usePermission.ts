/**
 * NexaWork usePermission — Permission mode + confirm queue + log state (N17)
 *
 * Bridges the renderer permission UI to the main-process PermissionManager:
 * - tracks current mode + bypass availability
 * - subscribes to PERMISSION_REQUEST events and exposes the active prompt
 * - exposes setMode / respond / log fetch+clear
 *
 * Works without the Electron bridge (dev/browser) by falling back to local state.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  DesktopPermissionMode,
  PermissionDecisionAction,
  PermissionLogEntry,
  PermissionRequest,
  PermissionScope,
} from '../../shared/ipc-channels'

const STORAGE_KEY = 'nexawork-permission-mode'

export function loadPersistedMode(): DesktopPermissionMode {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'default' || stored === 'full') return stored
  }
  return 'default'
}

export function persistMode(mode: DesktopPermissionMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode)
  }
}

export interface UsePermissionReturn {
  mode: DesktopPermissionMode
  bypassAvailable: boolean
  /** The active permission prompt, or null when none is pending. */
  activeRequest: PermissionRequest | null
  log: PermissionLogEntry[]
  setMode: (mode: DesktopPermissionMode) => void
  respond: (decision: PermissionDecisionAction, scope: PermissionScope) => void
  refreshLog: () => void
  clearLog: () => void
}

export function usePermission(): UsePermissionReturn {
  const [mode, setModeState] =
    useState<DesktopPermissionMode>(loadPersistedMode)
  const [bypassAvailable, setBypassAvailable] = useState(true)
  const [queue, setQueue] = useState<PermissionRequest[]>([])
  const [log, setLog] = useState<PermissionLogEntry[]>([])
  const queueRef = useRef(queue)
  queueRef.current = queue

  // Sync initial mode + subscribe to permission requests.
  useEffect(() => {
    const api = window.nexawork?.permission
    if (!api) return

    let cancelled = false
    api
      .getMode()
      .then(res => {
        if (cancelled) return
        setModeState(res.mode)
        setBypassAvailable(res.bypassAvailable)
      })
      .catch(() => {})

    const unsubscribe = api.onRequest((request: PermissionRequest) => {
      setQueue(prev => [...prev, request])
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const refreshLog = useCallback(() => {
    const api = window.nexawork?.permission
    if (!api) return
    api
      .logList({})
      .then(res => setLog(res.entries))
      .catch(() => {})
  }, [])

  const setMode = useCallback((next: DesktopPermissionMode) => {
    persistMode(next)
    setModeState(next)
    const api = window.nexawork?.permission
    if (!api) return
    api
      .setMode({ mode: next })
      .then(res => setModeState(res.mode))
      .catch(() => {})
  }, [])

  const respond = useCallback(
    (decision: PermissionDecisionAction, scope: PermissionScope) => {
      const current = queueRef.current[0]
      if (!current) return
      setQueue(prev => prev.slice(1))
      const api = window.nexawork?.permission
      if (api) {
        api
          .respond({ requestId: current.requestId, decision, scope })
          .then(() => refreshLog())
          .catch(() => {})
      }
    },
    [refreshLog],
  )

  const clearLog = useCallback(() => {
    setLog([])
    window.nexawork?.permission?.logClear().catch(() => {})
  }, [])

  return {
    mode,
    bypassAvailable,
    activeRequest: queue[0] ?? null,
    log,
    setMode,
    respond,
    refreshLog,
    clearLog,
  }
}
