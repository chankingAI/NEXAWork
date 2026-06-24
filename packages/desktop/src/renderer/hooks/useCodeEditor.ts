/**
 * useCodeEditor — multi-tab editor state + IPC orchestration (N28).
 *
 * Responsibilities:
 *  - Own the open-tab array + active path, restoring the persisted session on
 *    mount (re-reading each file from disk so contents are always fresh).
 *  - Expose open/close/select/edit/save actions backed by the `editor:*` IPC
 *    channels (all disk IO happens in the main process).
 *  - Debounce dirty buffers to disk (autosave, 1s) and flush on Ctrl+S.
 *  - Persist the open-path set whenever tabs change so the next launch reopens
 *    the same files.
 *  - Subscribe to `editor:openFile` pushes (emitted after the AI mutates a file)
 *    so freshly-written files pop open + flash-highlight their changed lines.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type EditorTab,
  type LineRange,
  closeTab as closeTabPure,
  computeChangedLineRanges,
  makeTab,
  markTabSaved,
  openTab as openTabPure,
  setTabContent as setTabContentPure,
  toPersistState,
} from '../../shared/editor'

interface ReadFileResult {
  path: string
  content: string
  language: string
  tooLarge: boolean
  binary: boolean
  mtime: number
}

/** Pending flash-highlight ranges keyed by path (consumed by CodeEditor). */
export type HighlightMap = Record<string, LineRange[]>

export interface UseCodeEditorReturn {
  tabs: EditorTab[]
  activePath: string | null
  activeTab: EditorTab | null
  loading: boolean
  error: string | null
  highlights: HighlightMap
  open: (path: string, opts?: { highlight?: boolean }) => Promise<void>
  close: (path: string) => void
  select: (path: string) => void
  edit: (path: string, content: string) => void
  save: (path?: string) => Promise<void>
  clearHighlight: (path: string) => void
}

export function useCodeEditor(): UseCodeEditorReturn {
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlights, setHighlights] = useState<HighlightMap>({})

  // Mirror tabs/active into refs so callbacks + timers read current values
  // without re-subscribing on every keystroke.
  const tabsRef = useRef<EditorTab[]>(tabs)
  const activeRef = useRef<string | null>(activePath)
  tabsRef.current = tabs
  activeRef.current = activePath

  const autosaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )

  const persist = useCallback((next: EditorTab[], active: string | null) => {
    const api = window.nexawork?.editor
    if (!api) return
    void api.saveState(toPersistState(next, active))
  }, [])

  const writeTab = useCallback(async (tab: EditorTab): Promise<boolean> => {
    const api = window.nexawork?.editor
    if (!api || tab.readOnly) return false
    try {
      const result = await api.writeFile({
        path: tab.path,
        content: tab.content,
      })
      if (result?.success) {
        setTabs(prev => markTabSaved(prev, tab.path, tab.content))
        return true
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    return false
  }, [])

  const open = useCallback<UseCodeEditorReturn['open']>(
    async (path, opts) => {
      const api = window.nexawork?.editor
      if (!api || !path) return
      setLoading(true)
      setError(null)
      try {
        const result: ReadFileResult = await api.readFile({ path })
        const tab = makeTab(path, result.content, {
          language: result.language,
          readOnly: result.tooLarge || result.binary,
        })
        // Compute the AI-edit flash-highlight against the previously open buffer.
        if (opts?.highlight) {
          const prev = tabsRef.current.find(t => t.path === path)
          const ranges = computeChangedLineRanges(
            prev?.content ?? '',
            result.content,
          )
          if (ranges.length > 0) {
            setHighlights(h => ({ ...h, [path]: ranges }))
          }
        }
        const { tabs: nextTabs, activePath: nextActive } = openTabPure(
          tabsRef.current,
          tab,
        )
        setTabs(nextTabs)
        setActivePath(nextActive)
        persist(nextTabs, nextActive)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [persist],
  )

  const close = useCallback<UseCodeEditorReturn['close']>(
    path => {
      const timer = autosaveTimers.current.get(path)
      if (timer) {
        clearTimeout(timer)
        autosaveTimers.current.delete(path)
      }
      const { tabs: nextTabs, activePath: nextActive } = closeTabPure(
        tabsRef.current,
        path,
        activeRef.current,
      )
      setTabs(nextTabs)
      setActivePath(nextActive)
      persist(nextTabs, nextActive)
    },
    [persist],
  )

  const select = useCallback<UseCodeEditorReturn['select']>(
    path => {
      setActivePath(path)
      persist(tabsRef.current, path)
    },
    [persist],
  )

  const save = useCallback<UseCodeEditorReturn['save']>(
    async path => {
      const target = path ?? activeRef.current
      if (!target) return
      const timer = autosaveTimers.current.get(target)
      if (timer) {
        clearTimeout(timer)
        autosaveTimers.current.delete(target)
      }
      const tab = tabsRef.current.find(t => t.path === target)
      if (tab && tab.dirty) await writeTab(tab)
    },
    [writeTab],
  )

  const edit = useCallback<UseCodeEditorReturn['edit']>(
    (path, content) => {
      const next = setTabContentPure(tabsRef.current, path, content)
      setTabs(next)
      // (Re)arm the autosave debounce for this path.
      const existing = autosaveTimers.current.get(path)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        autosaveTimers.current.delete(path)
        const tab = tabsRef.current.find(t => t.path === path)
        if (tab && tab.dirty) void writeTab(tab)
      }, 1000)
      autosaveTimers.current.set(path, timer)
    },
    [writeTab],
  )

  const clearHighlight = useCallback<UseCodeEditorReturn['clearHighlight']>(
    path => {
      setHighlights(h => {
        if (!(path in h)) return h
        const next = { ...h }
        delete next[path]
        return next
      })
    },
    [],
  )

  // Restore persisted session on mount: reopen each path from disk in order.
  useEffect(() => {
    let mounted = true
    const api = window.nexawork?.editor
    if (!api) return
    void (async () => {
      try {
        const state = await api.loadState()
        const restored: EditorTab[] = []
        for (const p of state.openPaths) {
          try {
            const result: ReadFileResult = await api.readFile({ path: p })
            restored.push(
              makeTab(p, result.content, {
                language: result.language,
                readOnly: result.tooLarge || result.binary,
              }),
            )
          } catch {
            // Skip files that vanished since last session.
          }
        }
        if (!mounted) return
        setTabs(restored)
        const active =
          state.activePath && restored.some(t => t.path === state.activePath)
            ? state.activePath
            : (restored[restored.length - 1]?.path ?? null)
        setActivePath(active)
      } catch {
        // No persisted state — start empty.
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Auto-open files the AI just wrote, flash-highlighting the changed lines.
  useEffect(() => {
    const api = window.nexawork?.editor
    if (!api) return
    const unsubscribe = api.onOpenFile(data => {
      if (data?.path) void open(data.path, { highlight: true })
    })
    return () => {
      unsubscribe?.()
    }
  }, [open])

  // Flush all pending autosave timers on unmount.
  useEffect(() => {
    const timers = autosaveTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const activeTab = tabs.find(t => t.path === activePath) ?? null

  return {
    tabs,
    activePath,
    activeTab,
    loading,
    error,
    highlights,
    open,
    close,
    select,
    edit,
    save,
    clearHighlight,
  }
}
