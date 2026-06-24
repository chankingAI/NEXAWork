/**
 * useSecurityCenter — renderer state for the N32 security center.
 *
 * Wraps `window.nexawork.security` (the IPC bridge to the main-process
 * SecurityManager) with React state for the security policy and the audit log.
 * Policy changes are sent as partial patches; the manager persists them and
 * pushes `security:changed`, which (debounced) re-pulls config + audit so every
 * window stays in sync. No sandbox / permission / disk access happens here —
 * everything is funnelled through IPC.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AuditExportFormat,
  AuditFilter,
  AuditLogEntry,
  RuleCategory,
  RuleDecision,
  RuntimeId,
  SecurityConfig,
  SecurityConfigPatch,
  SecurityRules,
} from '../../shared/ipc-channels'
import { DEFAULT_SECURITY_CONFIG } from '../../shared/security-center'

const REFRESH_DEBOUNCE_MS = 120

export interface UseSecurityCenterResult {
  available: boolean
  config: SecurityConfig
  auditLog: AuditLogEntry[]
  loading: boolean
  busy: boolean
  error: string | null
  refresh: () => Promise<void>
  updateConfig: (patch: SecurityConfigPatch) => Promise<boolean>
  updateRules: (rules: Partial<SecurityRules>) => Promise<boolean>
  testRule: (
    category: RuleCategory,
    target: string,
  ) => Promise<RuleDecision | null>
  installRuntime: (id: RuntimeId) => Promise<boolean>
  uninstallRuntime: (id: RuntimeId) => Promise<boolean>
  clearAudit: () => Promise<boolean>
  exportAudit: (options?: {
    format?: AuditExportFormat
    filter?: AuditFilter
  }) => Promise<{ content: string; filename: string } | null>
}

export function useSecurityCenter(): UseSecurityCenterResult {
  const api =
    typeof window !== 'undefined' ? window.nexawork?.security : undefined
  const available = Boolean(api)

  const [config, setConfig] = useState<SecurityConfig>(DEFAULT_SECURITY_CONFIG)
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      const [cfg, audit] = await Promise.all([api.getConfig(), api.auditList()])
      setConfig(cfg)
      setAuditLog(audit.entries)
      setError(null)
    } catch (err) {
      setError((err as Error)?.message ?? 'failed to load security config')
    } finally {
      setLoading(false)
    }
  }, [api])

  const updateConfig = useCallback(
    async (patch: SecurityConfigPatch): Promise<boolean> => {
      if (!api) return false
      setBusy(true)
      setError(null)
      try {
        const result = await api.updateConfig({ patch })
        if (result?.config) setConfig(result.config)
        return Boolean(result?.success)
      } catch (err) {
        setError((err as Error)?.message ?? 'failed to update security config')
        return false
      } finally {
        setBusy(false)
      }
    },
    [api],
  )

  const updateRules = useCallback(
    async (rules: Partial<SecurityRules>): Promise<boolean> => {
      if (!api?.updateRules) return false
      setBusy(true)
      setError(null)
      try {
        const result = await api.updateRules({ rules })
        if (result?.config) setConfig(result.config)
        return Boolean(result?.success)
      } catch (err) {
        setError((err as Error)?.message ?? 'failed to update rules')
        return false
      } finally {
        setBusy(false)
      }
    },
    [api],
  )

  const testRule = useCallback(
    async (
      category: RuleCategory,
      target: string,
    ): Promise<RuleDecision | null> => {
      if (!api?.testRule) return null
      try {
        const result = await api.testRule({ category, target })
        return result?.decision ?? null
      } catch (err) {
        setError((err as Error)?.message ?? 'failed to test rule')
        return null
      }
    },
    [api],
  )

  const installRuntime = useCallback(
    async (id: RuntimeId): Promise<boolean> => {
      if (!api?.installRuntime) return false
      setBusy(true)
      setError(null)
      try {
        const result = await api.installRuntime({ id })
        return Boolean(result?.success)
      } catch (err) {
        setError((err as Error)?.message ?? 'failed to install runtime')
        return false
      } finally {
        setBusy(false)
      }
    },
    [api],
  )

  const uninstallRuntime = useCallback(
    async (id: RuntimeId): Promise<boolean> => {
      if (!api?.uninstallRuntime) return false
      setBusy(true)
      setError(null)
      try {
        const result = await api.uninstallRuntime({ id })
        return Boolean(result?.success)
      } catch (err) {
        setError((err as Error)?.message ?? 'failed to uninstall runtime')
        return false
      } finally {
        setBusy(false)
      }
    },
    [api],
  )

  const clearAudit = useCallback(async (): Promise<boolean> => {
    if (!api) return false
    setBusy(true)
    try {
      const result = await api.auditClear()
      if (result?.success) setAuditLog([])
      return Boolean(result?.success)
    } catch (err) {
      setError((err as Error)?.message ?? 'failed to clear audit log')
      return false
    } finally {
      setBusy(false)
    }
  }, [api])

  const exportAudit = useCallback(
    async (options?: { format?: AuditExportFormat; filter?: AuditFilter }) => {
      if (!api) return null
      try {
        const result = await api.auditExport(options)
        return { content: result.content, filename: result.filename }
      } catch (err) {
        setError((err as Error)?.message ?? 'failed to export audit log')
        return null
      }
    },
    [api],
  )

  // Initial load.
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Live updates: debounce a burst of policy/audit change pushes.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!api?.onChanged) return
    const unsubscribe = api.onChanged(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void refresh()
      }, REFRESH_DEBOUNCE_MS)
    })
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unsubscribe()
    }
  }, [api, refresh])

  return {
    available,
    config,
    auditLog,
    loading,
    busy,
    error,
    refresh,
    updateConfig,
    updateRules,
    testRule,
    installRuntime,
    uninstallRuntime,
    clearAudit,
    exportAudit,
  }
}
