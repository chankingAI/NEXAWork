/**
 * useRecordedSkills — manage the recorded-skill catalog (N27).
 *
 * Responsibilities:
 *  - Load the skill summary list on mount and keep it synced via the
 *    `skill:recorded:changed` broadcast (pushed after every mutation).
 *  - Expose CRUD + step-editing actions over IPC, returning the freshly
 *    mutated full skill so callers can refresh an open detail pane.
 *  - Drive skill execution (build a replay file + auto-play) and persist the
 *    resulting execution record for success-rate stats.
 */
import { useCallback, useEffect, useState } from 'react'
import type {
  RecordedSkill,
  RecordingAnalysis,
  SkillSummary,
  SkillVariable,
} from '../../shared/ipc-channels'

export interface SkillExecutionOutcome {
  startedAt: number
  finishedAt: number
  durationMs: number
  success: boolean
  params: Record<string, string>
  error?: string
}

export interface UseRecordedSkillsReturn {
  skills: SkillSummary[]
  loading: boolean
  refresh: () => Promise<void>
  get: (id: string) => Promise<RecordedSkill | null>
  analyze: (recordingId: string) => Promise<RecordingAnalysis | null>
  create: (input: {
    recordingId: string
    name: string
    description?: string
    icon?: string
    tags?: string[]
    whenToUse?: string
    variables?: SkillVariable[]
  }) => Promise<RecordedSkill | null>
  update: (input: {
    id: string
    name?: string
    description?: string
    icon?: string
    tags?: string[]
    whenToUse?: string
    variables?: SkillVariable[]
  }) => Promise<RecordedSkill | null>
  reorderSteps: (
    id: string,
    fromIndex: number,
    toIndex: number,
  ) => Promise<RecordedSkill | null>
  updateStep: (input: {
    id: string
    stepId: string
    detail?: string
    description?: string
    waitMs?: number
  }) => Promise<RecordedSkill | null>
  removeStep: (id: string, stepId: string) => Promise<RecordedSkill | null>
  addWaitStep: (
    id: string,
    afterIndex: number,
    waitMs?: number,
  ) => Promise<RecordedSkill | null>
  duplicate: (id: string) => Promise<RecordedSkill | null>
  remove: (id: string) => Promise<boolean>
  execute: (id: string, params: Record<string, string>) => Promise<void>
  recordExecution: (
    id: string,
    outcome: SkillExecutionOutcome,
  ) => Promise<RecordedSkill | null>
  exportSkill: (
    id: string,
  ) => Promise<{ fileName: string; content: string } | null>
}

export function useRecordedSkills(): UseRecordedSkillsReturn {
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const api = window.nexawork?.recordedSkill
    if (!api) return
    setLoading(true)
    try {
      const result = await api.list()
      setSkills(result.skills)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const api = window.nexawork?.recordedSkill
    if (!api) return

    void (async () => {
      const result = await api.list()
      if (mounted) setSkills(result.skills)
    })()

    const unsubscribe = api.onChanged(data => {
      if (mounted) setSkills(data.skills)
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const get = useCallback(async (id: string) => {
    const api = window.nexawork?.recordedSkill
    if (!api) return null
    return (await api.get({ id })).skill
  }, [])

  const analyze = useCallback(async (recordingId: string) => {
    const api = window.nexawork?.recordedSkill
    if (!api) return null
    return (await api.analyze({ recordingId })).analysis
  }, [])

  const create = useCallback<UseRecordedSkillsReturn['create']>(async input => {
    const api = window.nexawork?.recordedSkill
    if (!api) return null
    return (await api.create(input)).skill
  }, [])

  const update = useCallback<UseRecordedSkillsReturn['update']>(async input => {
    const api = window.nexawork?.recordedSkill
    if (!api) return null
    return (await api.update(input)).skill
  }, [])

  const reorderSteps = useCallback(
    async (id: string, fromIndex: number, toIndex: number) => {
      const api = window.nexawork?.recordedSkill
      if (!api) return null
      return (await api.reorderSteps({ id, fromIndex, toIndex })).skill
    },
    [],
  )

  const updateStep = useCallback<UseRecordedSkillsReturn['updateStep']>(
    async input => {
      const api = window.nexawork?.recordedSkill
      if (!api) return null
      return (await api.updateStep(input)).skill
    },
    [],
  )

  const removeStep = useCallback(async (id: string, stepId: string) => {
    const api = window.nexawork?.recordedSkill
    if (!api) return null
    return (await api.removeStep({ id, stepId })).skill
  }, [])

  const addWaitStep = useCallback(
    async (id: string, afterIndex: number, waitMs?: number) => {
      const api = window.nexawork?.recordedSkill
      if (!api) return null
      return (await api.addWaitStep({ id, afterIndex, waitMs })).skill
    },
    [],
  )

  const duplicate = useCallback(async (id: string) => {
    const api = window.nexawork?.recordedSkill
    if (!api) return null
    return (await api.duplicate({ id })).skill
  }, [])

  const remove = useCallback(async (id: string) => {
    const api = window.nexawork?.recordedSkill
    if (!api) return false
    return (await api.delete({ id })).ok
  }, [])

  const execute = useCallback(
    async (id: string, params: Record<string, string>) => {
      const api = window.nexawork?.recordedSkill
      if (!api) return
      await api.execute({ id, params })
    },
    [],
  )

  const recordExecution = useCallback(
    async (id: string, outcome: SkillExecutionOutcome) => {
      const api = window.nexawork?.recordedSkill
      if (!api) return null
      return (await api.recordExecution({ id, ...outcome })).skill
    },
    [],
  )

  const exportSkill = useCallback(async (id: string) => {
    const api = window.nexawork?.recordedSkill
    if (!api) return null
    return api.export({ id })
  }, [])

  return {
    skills,
    loading,
    refresh,
    get,
    analyze,
    create,
    update,
    reorderSteps,
    updateStep,
    removeStep,
    addWaitStep,
    duplicate,
    remove,
    execute,
    recordExecution,
    exportSkill,
  }
}
