/**
 * useRecorder — drive and live-track the operation recorder (N24).
 *
 * Responsibilities:
 *  - Load the current recorder status on mount.
 *  - Stay in sync with `record:changed` broadcasts (pushed every second while a
 *    recording is live) so the timer + event count update in real time.
 *  - Expose start / pause / resume / stop / discard actions over IPC.
 *  - Surface the most recent stop result so the completion dialog can react.
 */
import { useCallback, useEffect, useState } from 'react'
import type {
  RecorderStatus,
  RecordStopResult,
} from '../../shared/ipc-channels'

const IDLE_STATUS: RecorderStatus = {
  sessionId: null,
  state: 'idle',
  eventCount: 0,
  elapsedMs: 0,
}

export interface UseRecorderReturn {
  status: RecorderStatus
  lastResult: RecordStopResult | null
  start: (taskDescription?: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<RecordStopResult | null>
  discard: (id: string) => Promise<void>
  clearResult: () => void
}

export function useRecorder(): UseRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>(IDLE_STATUS)
  const [lastResult, setLastResult] = useState<RecordStopResult | null>(null)

  useEffect(() => {
    let mounted = true
    const api = window.nexawork?.record
    if (!api) return

    const load = async () => {
      const next = await api.status()
      if (mounted) setStatus(next)
    }

    void load()
    const unsubscribe = api.onChanged(next => {
      if (mounted) setStatus(next)
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const start = useCallback(async (taskDescription?: string) => {
    const api = window.nexawork?.record
    if (!api) return
    const next = await api.start({ taskDescription })
    setStatus(next)
  }, [])

  const pause = useCallback(async () => {
    const api = window.nexawork?.record
    if (!api) return
    setStatus(await api.pause())
  }, [])

  const resume = useCallback(async () => {
    const api = window.nexawork?.record
    if (!api) return
    setStatus(await api.resume())
  }, [])

  const stop = useCallback(async (): Promise<RecordStopResult | null> => {
    const api = window.nexawork?.record
    if (!api) return null
    const result = await api.stop()
    setStatus(IDLE_STATUS)
    setLastResult(result)
    return result
  }, [])

  const discard = useCallback(async (id: string) => {
    const api = window.nexawork?.record
    if (!api) return
    await api.discard({ id })
    setLastResult(null)
  }, [])

  const clearResult = useCallback(() => setLastResult(null), [])

  return {
    status,
    lastResult,
    start,
    pause,
    resume,
    stop,
    discard,
    clearResult,
  }
}
