/**
 * useReplay — drive and live-track replay of a recorded session (N26).
 *
 * Responsibilities:
 *  - Load the available recordings list on mount.
 *  - Load a recording into the replay manager and keep its live status synced
 *    via `replay:changed` broadcasts (pushed ~5x/second while a run is active).
 *  - Expose play / pause / step / stop / setSpeed actions over IPC.
 *  - Surface the completion report (pushed via `replay:done`) so the panel can
 *    show the quality report.
 */
import { useCallback, useEffect, useState } from 'react'
import type {
  RecordingSummary,
  ReplayReport,
  ReplayStatus,
} from '../../shared/ipc-channels'
import { IDLE_REPLAY_STATUS } from '../../shared/replay'

export interface UseReplayReturn {
  status: ReplayStatus
  recordings: RecordingSummary[]
  report: ReplayReport | null
  loadingList: boolean
  refreshRecordings: () => Promise<void>
  load: (recordingId: string) => Promise<void>
  play: () => Promise<void>
  pause: () => Promise<void>
  step: () => Promise<void>
  stop: () => Promise<void>
  setSpeed: (speed: number) => Promise<void>
  clearReport: () => void
}

export function useReplay(): UseReplayReturn {
  const [status, setStatus] = useState<ReplayStatus>(IDLE_REPLAY_STATUS)
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [report, setReport] = useState<ReplayReport | null>(null)
  const [loadingList, setLoadingList] = useState(false)

  const refreshRecordings = useCallback(async () => {
    const record = window.nexawork?.record
    if (!record) return
    setLoadingList(true)
    try {
      const result = await record.list()
      setRecordings(result.recordings)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const api = window.nexawork?.replay
    if (!api) return

    const load = async () => {
      const next = await api.status()
      if (mounted) setStatus(next)
    }

    void load()
    void refreshRecordings()

    const unsubscribeChanged = api.onChanged(next => {
      if (mounted) setStatus(next)
    })
    const unsubscribeDone = api.onDone(next => {
      if (mounted) setReport(next)
    })
    return () => {
      mounted = false
      unsubscribeChanged?.()
      unsubscribeDone?.()
    }
  }, [refreshRecordings])

  const load = useCallback(async (recordingId: string) => {
    const api = window.nexawork?.replay
    if (!api) return
    setReport(null)
    setStatus(await api.load({ recordingId }))
  }, [])

  const play = useCallback(async () => {
    const api = window.nexawork?.replay
    if (!api) return
    setStatus(await api.play())
  }, [])

  const pause = useCallback(async () => {
    const api = window.nexawork?.replay
    if (!api) return
    setStatus(await api.pause())
  }, [])

  const step = useCallback(async () => {
    const api = window.nexawork?.replay
    if (!api) return
    setStatus(await api.step())
  }, [])

  const stop = useCallback(async () => {
    const api = window.nexawork?.replay
    if (!api) return
    setStatus(await api.stop())
  }, [])

  const setSpeed = useCallback(async (speed: number) => {
    const api = window.nexawork?.replay
    if (!api) return
    setStatus(await api.setSpeed({ speed }))
  }, [])

  const clearReport = useCallback(() => setReport(null), [])

  return {
    status,
    recordings,
    report,
    loadingList,
    refreshRecordings,
    load,
    play,
    pause,
    step,
    stop,
    setSpeed,
    clearReport,
  }
}
