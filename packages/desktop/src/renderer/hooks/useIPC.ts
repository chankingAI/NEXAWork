import { useState, useCallback, useRef, useEffect } from 'react'
import type { IPCError, StreamEvent } from '../../shared/ipc-channels'

/**
 * useIPC — React Hook for type-safe IPC calls
 * Handles loading, error states, and automatic cleanup
 */
export interface UseIPCState<T> {
  data: T | null
  loading: boolean
  error: IPCError | null
}

export interface UseIPCReturn<TInput, TOutput> extends UseIPCState<TOutput> {
  execute: (input: TInput) => Promise<TOutput>
  reset: () => void
}

export function useIPC<TInput, TOutput>(
  method: (input: TInput) => Promise<TOutput>,
): UseIPCReturn<TInput, TOutput> {
  const [state, setState] = useState<UseIPCState<TOutput>>({
    data: null,
    loading: false,
    error: null,
  })

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(
    async (input: TInput): Promise<TOutput> => {
      setState({ data: null, loading: true, error: null })
      try {
        const result = await method(input)
        if (mountedRef.current) {
          setState({ data: result, loading: false, error: null })
        }
        return result
      } catch (err: unknown) {
        const error: IPCError =
          err && typeof err === 'object' && 'code' in err
            ? (err as IPCError)
            : { code: 'UNKNOWN', message: String(err) }
        if (mountedRef.current) {
          setState({ data: null, loading: false, error })
        }
        throw error
      }
    },
    [method],
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, execute, reset }
}

/**
 * useIPCStream — React Hook for streaming IPC communication
 * Handles token-by-token stream events with cancel support
 */
export interface UseIPCStreamReturn {
  tokens: string
  streaming: boolean
  error: IPCError | null
  start: (input: {
    sessionId: string
    message: string
    model?: string
  }) => Promise<void>
  stop: () => void
  reset: () => void
}

export function useIPCStream(): UseIPCStreamReturn {
  const [tokens, setTokens] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<IPCError | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [])

  const start = useCallback(
    async (input: { sessionId: string; message: string; model?: string }) => {
      const api = window.nexawork
      if (!api) {
        setError({ code: 'NO_API', message: 'NexaWork API not available' })
        return
      }

      setTokens('')
      setStreaming(true)
      setError(null)

      const unsubscribe = api.chat.onStreamEvent((event: StreamEvent) => {
        if (!mountedRef.current) return

        switch (event.type) {
          case 'token':
            setTokens(prev => prev + event.data)
            break
          case 'done':
            setStreaming(false)
            break
          case 'error':
            setError(event.data)
            setStreaming(false)
            break
        }
      })

      cleanupRef.current = unsubscribe

      try {
        await api.chat.stream(input)
      } catch (err: unknown) {
        if (mountedRef.current) {
          setError({
            code: 'STREAM_ERROR',
            message: String(err),
          })
          setStreaming(false)
        }
      }
    },
    [],
  )

  const stop = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    setStreaming(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    setTokens('')
    setError(null)
  }, [stop])

  return { tokens, streaming, error, start, stop, reset }
}

/**
 * useIPCQuery — Auto-execute IPC call on mount (query pattern)
 * Similar to React Query / SWR pattern
 */
export interface UseIPCQueryReturn<T> {
  data: T | null
  loading: boolean
  error: IPCError | null
  refetch: () => Promise<void>
}

export function useIPCQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseIPCQueryReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<IPCError | null>(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (mountedRef.current) {
        setData(result)
        setLoading(false)
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(
          err && typeof err === 'object' && 'code' in err
            ? (err as IPCError)
            : { code: 'UNKNOWN', message: String(err) },
        )
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    mountedRef.current = true
    fetch()
    return () => {
      mountedRef.current = false
    }
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}
