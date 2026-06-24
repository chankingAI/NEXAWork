/**
 * useFileBrowser — project file-tree state + IPC orchestration (N30).
 *
 * Responsibilities:
 *  - Resolve the project root then lazily list directories over the `file:*`
 *    IPC channels (all disk IO happens in the main process).
 *  - Own the {@link TreeNode} forest: expand/collapse, lazy "load more" batches
 *    for big directories (>100 entries), and immutable updates via the pure
 *    helpers in `../../shared/file-tree`.
 *  - Drive file mutations (create / rename / delete / move) and refresh the
 *    affected directory afterwards.
 *  - Debounce a fuzzy filename search backed by `file:search`.
 *  - Subscribe to `file:changed` pushes (fs.watch) and live-refresh the
 *    changed directory, preserving expanded subtrees.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileEntry, FileNodeKind } from '../../shared/ipc-channels'
import {
  type TreeNode,
  LAZY_BATCH_SIZE,
  collapseNode,
  findNode,
  flattenVisible,
  makeTreeNode,
  markNodeLoading,
  reconcileChildren,
  setNodeChildren,
  updateNode,
} from '../../shared/file-tree'

export interface UseFileBrowserReturn {
  available: boolean
  root: string | null
  nodes: TreeNode[]
  rows: TreeNode[]
  loading: boolean
  error: string | null
  search: string
  setSearch: (query: string) => void
  searchResults: FileEntry[] | null
  searching: boolean
  toggle: (node: TreeNode) => void
  loadMore: (path: string) => Promise<void>
  refresh: (dir?: string) => Promise<void>
  createEntry: (
    parentDir: string,
    name: string,
    kind: FileNodeKind,
  ) => Promise<void>
  rename: (path: string, newName: string) => Promise<void>
  remove: (path: string) => Promise<void>
  move: (path: string, targetDir: string) => Promise<void>
}

/** Join a directory and a basename with a POSIX/Windows-agnostic separator. */
function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`
}

/** Parent directory of an absolute path. */
function parentDir(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const idx = Math.max(
    normalized.lastIndexOf('/'),
    normalized.lastIndexOf('\\'),
  )
  return idx > 0 ? normalized.slice(0, idx) : normalized
}

export function useFileBrowser(): UseFileBrowserReturn {
  const available = typeof window !== 'undefined' && !!window.nexawork?.files
  const [root, setRoot] = useState<string | null>(null)
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearchState] = useState('')
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null)
  const [searching, setSearching] = useState(false)

  const rootRef = useRef<string | null>(root)
  const nodesRef = useRef<TreeNode[]>(nodes)
  rootRef.current = root
  nodesRef.current = nodes

  // ─── Initial load: resolve root + list its top-level entries. ────────────────
  useEffect(() => {
    const api = window.nexawork?.files
    if (!api) return
    let mounted = true
    setLoading(true)
    void (async () => {
      try {
        const { root: r } = await api.root()
        const result = await api.list({ path: r })
        if (!mounted) return
        setRoot(result.root)
        setNodes(result.entries.map(e => makeTreeNode(e, 0)))
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const expand = useCallback(async (node: TreeNode) => {
    const api = window.nexawork?.files
    if (!api) return
    if (node.children) {
      setNodes(prev =>
        updateNode(prev, node.entry.path, n => ({ ...n, expanded: true })),
      )
      return
    }
    setNodes(prev => markNodeLoading(prev, node.entry.path))
    try {
      const result = await api.list({ path: node.entry.path })
      setNodes(prev =>
        setNodeChildren(
          prev,
          node.entry.path,
          result.entries,
          node.depth + 1,
          result.hasMore,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setNodes(prev =>
        updateNode(prev, node.entry.path, n => ({ ...n, loading: false })),
      )
    }
  }, [])

  const toggle = useCallback(
    (node: TreeNode) => {
      if (node.entry.kind !== 'directory') return
      if (node.expanded) {
        setNodes(prev => collapseNode(prev, node.entry.path))
      } else {
        void expand(node)
      }
    },
    [expand],
  )

  const loadMore = useCallback(async (path: string) => {
    const api = window.nexawork?.files
    if (!api) return
    const node = findNode(nodesRef.current, path)
    if (!node) return
    try {
      const result = await api.list({ path, offset: node.loadedCount })
      setNodes(prev =>
        updateNode(prev, path, n => ({
          ...n,
          children: reconcileChildren(n.children, result.entries, n.depth + 1),
          loadedCount: result.entries.length,
          hasMore: result.hasMore,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const refresh = useCallback(async (dir?: string) => {
    const api = window.nexawork?.files
    const r = rootRef.current
    if (!api || !r) return
    const target = dir ?? r
    // A directory not currently loaded in the tree needs no refresh.
    if (target !== r && !findNode(nodesRef.current, target)) return
    try {
      if (target === r) {
        const result = await api.list({ path: r })
        setNodes(prev => reconcileChildren(prev, result.entries, 0))
        return
      }
      const node = findNode(nodesRef.current, target)
      if (!node || !node.expanded) return
      // Keep at least one batch so a freshly-created entry that sorts past the
      // previously-loaded window still surfaces; large paged dirs keep extent.
      const limit = Math.max(node.loadedCount, LAZY_BATCH_SIZE)
      const result = await api.list({ path: target, limit })
      setNodes(prev =>
        updateNode(prev, target, n => ({
          ...n,
          children: reconcileChildren(n.children, result.entries, n.depth + 1),
          loadedCount: result.entries.length,
          hasMore: result.hasMore,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const createEntry = useCallback(
    async (parent: string, name: string, kind: FileNodeKind) => {
      const api = window.nexawork?.files
      if (!api || !name.trim()) return
      try {
        await api.create({ path: joinPath(parent, name.trim()), kind })
        await refresh(parent)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refresh],
  )

  const rename = useCallback(
    async (path: string, newName: string) => {
      const api = window.nexawork?.files
      if (!api || !newName.trim()) return
      const dir = parentDir(path)
      try {
        await api.rename({ path, newPath: joinPath(dir, newName.trim()) })
        await refresh(dir)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refresh],
  )

  const remove = useCallback(
    async (path: string) => {
      const api = window.nexawork?.files
      if (!api) return
      const dir = parentDir(path)
      try {
        await api.delete({ path })
        await refresh(dir)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refresh],
  )

  const move = useCallback(
    async (path: string, targetDir: string) => {
      const api = window.nexawork?.files
      if (!api || parentDir(path) === targetDir) return
      try {
        await api.move({ path, targetDir })
        await refresh(parentDir(path))
        await refresh(targetDir)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refresh],
  )

  // ─── Debounced fuzzy search over the project. ─────────────────────────────────
  const setSearch = useCallback((query: string) => setSearchState(query), [])

  useEffect(() => {
    const api = window.nexawork?.files
    if (!api) return
    const q = search.trim()
    if (!q) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      void api
        .search({ query: q })
        .then(({ matches }) => setSearchResults(matches))
        .catch(err =>
          setError(err instanceof Error ? err.message : String(err)),
        )
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(handle)
  }, [search])

  // ─── Live fs-watch refresh (debounced per directory). ─────────────────────────
  useEffect(() => {
    const api = window.nexawork?.files
    if (!api) return
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const unsubscribe = api.onChanged(({ dir }) => {
      const existing = timers.get(dir)
      if (existing) clearTimeout(existing)
      timers.set(
        dir,
        setTimeout(() => {
          timers.delete(dir)
          void refresh(dir)
        }, 120),
      )
    })
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      unsubscribe?.()
    }
  }, [refresh])

  const rows = useMemo(() => flattenVisible(nodes), [nodes])

  return {
    available,
    root,
    nodes,
    rows,
    loading,
    error,
    search,
    setSearch,
    searchResults,
    searching,
    toggle,
    loadMore,
    refresh,
    createEntry,
    rename,
    remove,
    move,
  }
}
