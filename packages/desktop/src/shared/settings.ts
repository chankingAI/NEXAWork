/**
 * NexaWork Settings Schema (N21)
 * ==============================
 * Shared, dependency-free settings contract used by both the Electron main
 * process (persistence) and the renderer (UI + live application).
 *
 * Keeping the schema, defaults, and coercion/validation helpers as pure
 * functions here means they can be unit-tested in isolation and reused on both
 * sides of the IPC bridge without duplicating logic.
 */

export type LanguageCode = 'zh-CN' | 'en' | 'ja'
export type SendKey = 'Enter' | 'Ctrl+Enter'
export type ThemeMode = 'light' | 'dark' | 'system'

/** The full, typed system-settings document. */
export interface AppSettings {
  /** Color theme (mirrors the renderer theme hook). */
  theme: ThemeMode
  /** Display language for the whole UI. */
  language: LanguageCode
  /** Base UI font size in px. */
  fontSize: number
  /** Render assistant messages as plain text (no markdown). */
  readingMode: boolean
  /** Which key sends a chat message. */
  sendKey: SendKey
  /** Auto-update installed skills. */
  skillAutoUpdate: boolean
  /** Auto-install non-high-risk skills without prompting. */
  skillAutoInstall: boolean
  /** Allow remote control while the screen is locked. */
  lockScreenRemote: boolean
  /** Confirm before writing to the default workspace storage path. */
  confirmDefaultStorage: boolean
  /** Active model id. */
  model: string
  /** Sampling temperature. */
  temperature: number
  /** Max output tokens. */
  maxTokens: number
}

// ─── Bounds & option lists ────────────────────────────────────
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 20
export const FONT_SIZE_STEP = 1

export const LANGUAGE_CODES: readonly LanguageCode[] = ['zh-CN', 'en', 'ja']
export const SEND_KEYS: readonly SendKey[] = ['Enter', 'Ctrl+Enter']

/** Canonical defaults. A fresh install / full reset lands here. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  language: 'zh-CN',
  fontSize: 14,
  readingMode: false,
  sendKey: 'Enter',
  skillAutoUpdate: true,
  skillAutoInstall: false,
  lockScreenRemote: false,
  confirmDefaultStorage: true,
  model: 'auto',
  temperature: 0.7,
  maxTokens: 4096,
}

// ─── Type guards ──────────────────────────────────────────────
export function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === 'string' &&
    (LANGUAGE_CODES as readonly string[]).includes(value)
  )
}

export function isSendKey(value: unknown): value is SendKey {
  return (
    typeof value === 'string' &&
    (SEND_KEYS as readonly string[]).includes(value)
  )
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

// ─── Coercion / clamping (pure) ───────────────────────────────
/** Clamp + round a font size into the supported [12, 20] range. */
export function clampFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.fontSize
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)))
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function coerceNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Build a fully-typed {@link AppSettings} from an arbitrary record, falling
 * back to defaults for missing/invalid fields. Unknown keys are ignored.
 */
export function coerceSettings(
  raw: Record<string, unknown> | null | undefined,
): AppSettings {
  const r = raw ?? {}
  return {
    theme: isThemeMode(r.theme) ? r.theme : DEFAULT_SETTINGS.theme,
    language: isLanguageCode(r.language)
      ? r.language
      : DEFAULT_SETTINGS.language,
    fontSize: clampFontSize(r.fontSize ?? DEFAULT_SETTINGS.fontSize),
    readingMode: coerceBoolean(r.readingMode, DEFAULT_SETTINGS.readingMode),
    sendKey: isSendKey(r.sendKey) ? r.sendKey : DEFAULT_SETTINGS.sendKey,
    skillAutoUpdate: coerceBoolean(
      r.skillAutoUpdate,
      DEFAULT_SETTINGS.skillAutoUpdate,
    ),
    skillAutoInstall: coerceBoolean(
      r.skillAutoInstall,
      DEFAULT_SETTINGS.skillAutoInstall,
    ),
    lockScreenRemote: coerceBoolean(
      r.lockScreenRemote,
      DEFAULT_SETTINGS.lockScreenRemote,
    ),
    confirmDefaultStorage: coerceBoolean(
      r.confirmDefaultStorage,
      DEFAULT_SETTINGS.confirmDefaultStorage,
    ),
    model: typeof r.model === 'string' ? r.model : DEFAULT_SETTINGS.model,
    temperature: coerceNumber(r.temperature, DEFAULT_SETTINGS.temperature),
    maxTokens: coerceNumber(r.maxTokens, DEFAULT_SETTINGS.maxTokens),
  }
}

// ─── Live-application descriptors (pure) ──────────────────────
export interface DocumentSettingsAttrs {
  /** Value for `documentElement.style` `--app-font-size`. */
  fontSize: string
  /** `data-reading-mode` attribute value. */
  readingMode: 'on' | 'off'
  /** `lang` / `data-lang` attribute value. */
  lang: LanguageCode
}

/**
 * Map settings to the DOM mutations the renderer applies for instant effect
 * (no restart). Returned as a plain descriptor so it can be asserted in tests
 * without a DOM.
 */
export function settingsToDocumentAttrs(
  settings: AppSettings,
): DocumentSettingsAttrs {
  return {
    fontSize: `${clampFontSize(settings.fontSize)}px`,
    readingMode: settings.readingMode ? 'on' : 'off',
    lang: settings.language,
  }
}
