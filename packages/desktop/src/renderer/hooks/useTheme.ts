/**
 * NexaWork Theme Hook
 * Manages theme state (light/dark/system) with persistence and system detection.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeState {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
}

// Detect system preference
function getSystemPreference(): 'light' | 'dark' {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }
  return 'light'
}

// Resolve effective theme
function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return getSystemPreference()
  return mode
}

// Apply theme to DOM
function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const resolved = resolveTheme(mode)

  // Add transition class for smooth switching
  root.classList.add('theme-transitioning')

  // Set data-theme attribute
  root.setAttribute('data-theme', mode)

  // Remove transition class after animation completes
  setTimeout(() => {
    root.classList.remove('theme-transitioning')
  }, 350)

  // Update meta theme-color for mobile/Electron frame
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#1a1a1a' : '#ffffff')
  }
}

// Persist to localStorage
function persistTheme(mode: ThemeMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('nexawork-theme', mode)
  }
}

// Load from localStorage
function loadPersistedTheme(): ThemeMode {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('nexawork-theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  }
  return 'light' // Default: light (Apple aesthetic)
}

/**
 * Theme state singleton (non-React usage)
 */
let currentMode: ThemeMode = 'light'
const listeners: Set<() => void> = new Set()

function notify(): void {
  for (const fn of listeners) fn()
}

export function initTheme(): void {
  currentMode = loadPersistedTheme()
  applyTheme(currentMode)

  // Listen for system preference changes
  if (typeof window !== 'undefined' && window.matchMedia) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (currentMode === 'system') {
          applyTheme('system')
          notify()
        }
      })
  }
}

export function getThemeState(): ThemeState {
  return {
    mode: currentMode,
    resolved: resolveTheme(currentMode),
    setTheme(mode: ThemeMode) {
      currentMode = mode
      applyTheme(mode)
      persistTheme(mode)
      notify()
    },
    toggleTheme() {
      const next: ThemeMode =
        currentMode === 'light'
          ? 'dark'
          : currentMode === 'dark'
            ? 'system'
            : 'light'
      currentMode = next
      applyTheme(next)
      persistTheme(next)
      notify()
    },
  }
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * React hook for theme (compatible with React 19 useSyncExternalStore)
 * Usage: const { mode, resolved, setTheme, toggleTheme } = useTheme()
 */
export function useTheme(): ThemeState {
  // For environments without React, return state directly
  return getThemeState()
}

// Export utilities for testing
export const themeUtils = {
  getSystemPreference,
  resolveTheme,
  loadPersistedTheme,
}
