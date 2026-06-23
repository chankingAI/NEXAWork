/**
 * useSettings — load, live-apply, and persist N21 system settings.
 *
 * Responsibilities:
 *  - Load the persisted settings snapshot from the main process on mount.
 *  - Apply settings to the DOM instantly (font size, reading mode, language)
 *    so changes take effect with no restart.
 *  - Persist every change back to the main process via IPC and stay in sync
 *    with `settings:changed` broadcasts (e.g. multi-window).
 */
import { useCallback, useEffect, useState } from 'react'
import {
  type AppSettings,
  coerceSettings,
  DEFAULT_SETTINGS,
  settingsToDocumentAttrs,
} from '../../shared/settings'
import { setLanguage } from '../i18n'

/** Apply settings to the document for instant effect (no restart). */
export function applyDocumentSettings(settings: AppSettings): void {
  // Keep the i18n singleton in sync regardless of DOM availability.
  setLanguage(settings.language)

  if (typeof document === 'undefined') return
  const attrs = settingsToDocumentAttrs(settings)
  const root = document.documentElement
  root.style.setProperty('--app-font-size', attrs.fontSize)
  root.setAttribute('data-reading-mode', attrs.readingMode)
  root.setAttribute('data-lang', attrs.lang)
  root.setAttribute('lang', attrs.lang)
}

export interface UseSettingsReturn {
  settings: AppSettings
  loading: boolean
  /** Update a single setting (optimistic + persisted). */
  setSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void
  /** Reset every setting back to defaults. */
  resetAll: () => void
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  // Load + subscribe to live changes.
  useEffect(() => {
    let mounted = true
    const api = window.nexawork?.settings

    const adopt = (raw: Record<string, unknown>) => {
      const next = coerceSettings(raw)
      applyDocumentSettings(next)
      if (mounted) setSettings(next)
    }

    if (api) {
      api
        .get()
        .then(raw => {
          if (mounted) adopt(raw as Record<string, unknown>)
        })
        .finally(() => {
          if (mounted) setLoading(false)
        })
    } else {
      applyDocumentSettings(DEFAULT_SETTINGS)
      setLoading(false)
    }

    const unsubscribe = api?.onChanged(raw => adopt(raw))
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const setSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings(prev => {
        const next = coerceSettings({ ...prev, [key]: value })
        applyDocumentSettings(next)
        return next
      })
      void window.nexawork?.settings.set(key, value)
    },
    [],
  )

  const resetAll = useCallback(() => {
    const next = DEFAULT_SETTINGS
    applyDocumentSettings(next)
    setSettings(next)
    void window.nexawork?.settings.reset()
  }, [])

  return { settings, loading, setSetting, resetAll }
}
