/**
 * NexaWork useAutomations — Automation list state + actions (N18)
 *
 * Bridges the renderer AutomationPanel to the main-process AutomationManager:
 * - loads the automation list (scheduled + completed)
 * - subscribes to AUTOMATION_RUN_EVENT for real-time refresh after a run
 * - drives a 1s countdown tick used to render "距下次执行"
 * - exposes create / toggle (pause-resume) / delete / runNow actions
 *
 * Works without the Electron bridge (dev/browser) by falling back to local state.
 */
import { useState, useEffect, useCallback } from 'react'
import type {
  AutomationInfo,
  AutomationCreateInput,
} from '../../shared/ipc-channels'

export interface UseAutomationsReturn {
  automations: AutomationInfo[]
  /** Ticks every second; consumers use it to recompute countdowns. */
  now: number
  loading: boolean
  refresh: () => void
  create: (input: AutomationCreateInput) => Promise<void>
  toggle: (id: string, status: 'active' | 'paused') => Promise<void>
  remove: (id: string) => Promise<void>
  runNow: (id: string) => Promise<void>
}

export function useAutomations(): UseAutomationsReturn {
  const [automations, setAutomations] = useState<AutomationInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(() => {
    const api = window.nexawork?.automation
    if (!api) {
      setLoading(false)
      return
    }
    api
      .list()
      .then(res => setAutomations(res.automations))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Initial load + subscribe to run-completion events for live refresh.
  useEffect(() => {
    refresh()
    const api = window.nexawork?.automation
    if (!api?.onRunEvent) return
    const unsubscribe = api.onRunEvent(() => refresh())
    return unsubscribe
  }, [refresh])

  // Countdown tick.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const create = useCallback(
    async (input: AutomationCreateInput) => {
      await window.nexawork?.automation?.create(input).catch(() => {})
      refresh()
    },
    [refresh],
  )

  const toggle = useCallback(
    async (id: string, status: 'active' | 'paused') => {
      setAutomations(prev =>
        prev.map(a => (a.id === id ? { ...a, status } : a)),
      )
      await window.nexawork?.automation?.toggle({ id, status }).catch(() => {})
      refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      setAutomations(prev => prev.filter(a => a.id !== id))
      await window.nexawork?.automation?.delete({ id }).catch(() => {})
      refresh()
    },
    [refresh],
  )

  const runNow = useCallback(
    async (id: string) => {
      await window.nexawork?.automation?.runNow({ id }).catch(() => {})
      refresh()
    },
    [refresh],
  )

  return { automations, now, loading, refresh, create, toggle, remove, runNow }
}
