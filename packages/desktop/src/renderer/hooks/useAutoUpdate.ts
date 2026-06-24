/**
 * useAutoUpdate — renderer state for the N36 auto-update flow.
 *
 * Wraps `window.nexawork.update` (the IPC bridge to the main-process
 * UpdateManager). The manager owns the electron-updater lifecycle and pushes
 * `update:changed` with the full state (incl. download progress) on every
 * transition, so this hook simply mirrors that state and exposes the three user
 * actions: check, download (after confirming), and restart-to-install. No
 * network / updater access happens here — everything is funnelled through IPC.
 */
import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '../../shared/ipc-channels'
import {
  canDownload,
  canInstall,
  initialUpdateState,
} from '../../shared/auto-updater'

export interface UseAutoUpdateResult {
  available: boolean
  state: UpdateState
  /** Whether the update dialog should be visible. */
  visible: boolean
  /** True when an available/downloaded update can be acted on. */
  canDownload: boolean
  canInstall: boolean
  checkForUpdates: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  /** Hide the dialog without changing the underlying update state. */
  dismiss: () => void
}

export function useAutoUpdate(): UseAutoUpdateResult {
  const api =
    typeof window !== 'undefined' ? window.nexawork?.update : undefined
  const available = Boolean(api)

  const [state, setState] = useState<UpdateState>(() =>
    initialUpdateState('0.0.0', false),
  )
  const [dismissed, setDismissed] = useState(false)

  const checkForUpdates = useCallback(async () => {
    if (!api) return
    setDismissed(false)
    const next = await api.check()
    setState(next)
  }, [api])

  const download = useCallback(async () => {
    if (!api) return
    const next = await api.download()
    setState(next)
  }, [api])

  const install = useCallback(async () => {
    if (!api) return
    await api.install()
  }, [api])

  const dismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  // Initial pull of the current state.
  useEffect(() => {
    if (!api) return
    let active = true
    void api.getState().then(s => {
      if (active) setState(s)
    })
    return () => {
      active = false
    }
  }, [api])

  // Live updates: the manager pushes the full state on every transition.
  useEffect(() => {
    if (!api?.onChanged) return
    const unsubscribe = api.onChanged(next => {
      setState(next)
      // A fresh available / downloaded update re-surfaces a dismissed dialog.
      if (next.status === 'available' || next.status === 'downloaded') {
        setDismissed(false)
      }
    })
    return unsubscribe
  }, [api])

  // The dialog is shown for any actionable / in-flight state, unless dismissed.
  const isActionable =
    state.status === 'available' ||
    state.status === 'downloading' ||
    state.status === 'downloaded' ||
    state.status === 'error'
  const visible = isActionable && !dismissed

  return {
    available,
    state,
    visible,
    canDownload: canDownload(state),
    canInstall: canInstall(state),
    checkForUpdates,
    download,
    install,
    dismiss,
  }
}
