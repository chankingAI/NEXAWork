/**
 * useGit — renderer state for the N31 Git panel + diff viewer.
 *
 * Wraps `window.nexawork.git` (the IPC bridge to the main-process GitManager)
 * with React state for the working-tree status (staged / unstaged), branch list
 * and commit/sync/branch actions. Live updates arrive through `git:changed`
 * (the manager watches `.git` + the working tree) and are debounced so a burst
 * of filesystem events triggers a single refresh.
 *
 * No git/disk access happens here — everything is funnelled through IPC.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  GitBranch,
  GitDiffData,
  GitFileState,
  ParsedFileDiff,
} from '../../shared/ipc-channels'
import { splitStaged } from '../../shared/git-panel'

export interface GitActionResult {
  success: boolean
  message?: string
}

export interface DiffSelection {
  path: string
  staged: boolean
}

const REFRESH_DEBOUNCE_MS = 150

export interface UseGitResult {
  available: boolean
  repoRoot: string | null
  branch: string | null
  ahead: number
  behind: number
  files: GitFileState[]
  staged: GitFileState[]
  unstaged: GitFileState[]
  branches: GitBranch[]
  loading: boolean
  busy: boolean
  error: string | null
  selection: DiffSelection | null
  diff: GitDiffData | null
  diffHunks: ParsedFileDiff | null
  refresh: () => Promise<void>
  selectFile: (path: string, staged: boolean) => Promise<void>
  clearSelection: () => void
  stage: (paths: string[]) => Promise<GitActionResult>
  unstage: (paths: string[]) => Promise<GitActionResult>
  stageAll: () => Promise<GitActionResult>
  unstageAll: () => Promise<GitActionResult>
  discard: (path: string) => Promise<GitActionResult>
  stageHunk: (patch: string) => Promise<GitActionResult>
  unstageHunk: (patch: string) => Promise<GitActionResult>
  commit: (message: string) => Promise<GitActionResult>
  commitAndPush: (message: string) => Promise<GitActionResult>
  push: () => Promise<GitActionResult>
  pull: () => Promise<GitActionResult>
  createBranch: (name: string) => Promise<GitActionResult>
  checkout: (name: string) => Promise<GitActionResult>
  merge: (name: string) => Promise<GitActionResult>
}

export function useGit(): UseGitResult {
  const api = typeof window !== 'undefined' ? window.nexawork?.git : undefined
  const available = Boolean(api)

  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [ahead, setAhead] = useState(0)
  const [behind, setBehind] = useState(0)
  const [files, setFiles] = useState<GitFileState[]>([])
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<DiffSelection | null>(null)
  const [diff, setDiff] = useState<GitDiffData | null>(null)
  const [diffHunks, setDiffHunks] = useState<ParsedFileDiff | null>(null)

  const selectionRef = useRef<DiffSelection | null>(null)
  selectionRef.current = selection

  const refresh = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      const [status, branchInfo] = await Promise.all([
        api.status(),
        api.branches(),
      ])
      setRepoRoot(status.repoRoot)
      setBranch(status.branch ?? branchInfo.current)
      setAhead(status.ahead)
      setBehind(status.behind)
      setFiles(status.files)
      setBranches(branchInfo.branches)
      setError(null)
    } catch (err) {
      setError((err as Error)?.message ?? 'git status failed')
    } finally {
      setLoading(false)
    }
  }, [api])

  const loadDiff = useCallback(
    async (sel: DiffSelection) => {
      if (!api) return
      const [data, hunks] = await Promise.all([
        api.diff({ path: sel.path, staged: sel.staged }),
        api.diffHunks({ path: sel.path, staged: sel.staged }),
      ])
      // Ignore a stale response if the selection changed meanwhile.
      if (
        selectionRef.current?.path === sel.path &&
        selectionRef.current?.staged === sel.staged
      ) {
        setDiff(data)
        setDiffHunks(hunks)
      }
    },
    [api],
  )

  const selectFile = useCallback(
    async (path: string, staged: boolean) => {
      const sel = { path, staged }
      setSelection(sel)
      setDiff(null)
      setDiffHunks(null)
      await loadDiff(sel)
    },
    [loadDiff],
  )

  const clearSelection = useCallback(() => {
    setSelection(null)
    setDiff(null)
    setDiffHunks(null)
  }, [])

  // Run a mutating action, then refresh status (and the open diff).
  const runAction = useCallback(
    async (
      action: () => Promise<GitActionResult>,
    ): Promise<GitActionResult> => {
      if (!api) return { success: false, message: 'unavailable' }
      setBusy(true)
      setError(null)
      try {
        const result = await action()
        if (!result.success && result.message) setError(result.message)
        await refresh()
        const sel = selectionRef.current
        if (sel) await loadDiff(sel)
        return result
      } catch (err) {
        const message = (err as Error)?.message ?? 'git action failed'
        setError(message)
        return { success: false, message }
      } finally {
        setBusy(false)
      }
    },
    [api, refresh, loadDiff],
  )

  const stage = useCallback(
    (paths: string[]) => runAction(() => api!.stage({ paths })),
    [api, runAction],
  )
  const unstage = useCallback(
    (paths: string[]) => runAction(() => api!.unstage({ paths })),
    [api, runAction],
  )
  const stageAll = useCallback(
    () => runAction(() => api!.stageAll()),
    [api, runAction],
  )
  const unstageAll = useCallback(
    () => runAction(() => api!.unstageAll()),
    [api, runAction],
  )
  const discard = useCallback(
    (path: string) => runAction(() => api!.discard({ path })),
    [api, runAction],
  )
  const stageHunk = useCallback(
    (patch: string) => runAction(() => api!.stageHunk({ patch })),
    [api, runAction],
  )
  const unstageHunk = useCallback(
    (patch: string) => runAction(() => api!.unstageHunk({ patch })),
    [api, runAction],
  )
  const commit = useCallback(
    (message: string) => runAction(() => api!.commit({ message })),
    [api, runAction],
  )
  const commitAndPush = useCallback(
    (message: string) => runAction(() => api!.commitAndPush({ message })),
    [api, runAction],
  )
  const push = useCallback(() => runAction(() => api!.push()), [api, runAction])
  const pull = useCallback(() => runAction(() => api!.pull()), [api, runAction])
  const createBranch = useCallback(
    (name: string) => runAction(() => api!.createBranch({ name })),
    [api, runAction],
  )
  const checkout = useCallback(
    (name: string) => runAction(() => api!.checkout({ name })),
    [api, runAction],
  )
  const merge = useCallback(
    (name: string) => runAction(() => api!.merge({ name })),
    [api, runAction],
  )

  // Initial load.
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Live updates: debounce a burst of `.git` / working-tree events.
  useEffect(() => {
    if (!api?.onChanged) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = api.onChanged(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void refresh()
        const sel = selectionRef.current
        if (sel) void loadDiff(sel)
      }, REFRESH_DEBOUNCE_MS)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [api, refresh, loadDiff])

  const { staged, unstaged } = useMemo(() => splitStaged(files), [files])

  return {
    available,
    repoRoot,
    branch,
    ahead,
    behind,
    files,
    staged,
    unstaged,
    branches,
    loading,
    busy,
    error,
    selection,
    diff,
    diffHunks,
    refresh,
    selectFile,
    clearSelection,
    stage,
    unstage,
    stageAll,
    unstageAll,
    discard,
    stageHunk,
    unstageHunk,
    commit,
    commitAndPush,
    push,
    pull,
    createBranch,
    checkout,
    merge,
  }
}
