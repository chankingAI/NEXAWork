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
/** Assistant reply tone (N22 assistant settings). */
export type ReplyStyle = 'professional' | 'friendly' | 'concise'
/** How often operation memories are captured (N22 memory settings). */
export type MemoryFrequency = 'always' | 'smart' | 'manual'

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

  // ── Agent (N22) ──
  /** System prompt that steers AI behaviour (Markdown supported). */
  systemPrompt: string
  /** Tool ids the agent is allowed to use. */
  enabledTools: string[]

  // ── Assistant (N22) ──
  /** Display name of the assistant persona. */
  assistantName: string
  /** Avatar emoji/preset id for the assistant. */
  assistantAvatar: string
  /** Greeting shown when a new conversation starts. */
  assistantGreeting: string
  /** Tone of the assistant's replies. */
  replyStyle: ReplyStyle

  // ── Memory (N22) ──
  /** Master switch for the operation-memory system. */
  memoryEnabled: boolean
  /** How often operation memories are recorded. */
  memoryFrequency: MemoryFrequency
  /** Days to retain operation memories before pruning. */
  memoryRetentionDays: number

  // ── Model (N22) ──
  /** Optional custom API endpoint (overrides the provider default). */
  customEndpoint: string
}

// ─── Bounds & option lists ────────────────────────────────────
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 20
export const FONT_SIZE_STEP = 1

export const LANGUAGE_CODES: readonly LanguageCode[] = ['zh-CN', 'en', 'ja']
export const SEND_KEYS: readonly SendKey[] = ['Enter', 'Ctrl+Enter']

// N22 agent bounds.
export const TEMPERATURE_MIN = 0
export const TEMPERATURE_MAX = 1
export const TEMPERATURE_STEP = 0.1
export const MAX_TOKENS_MIN = 256
export const MAX_TOKENS_MAX = 8192
export const MAX_TOKENS_STEP = 256

// N22 memory bounds.
export const MEMORY_RETENTION_MIN = 1
export const MEMORY_RETENTION_MAX = 365

export const REPLY_STYLES: readonly ReplyStyle[] = [
  'professional',
  'friendly',
  'concise',
]
export const MEMORY_FREQUENCIES: readonly MemoryFrequency[] = [
  'always',
  'smart',
  'manual',
]

/** Catalog of selectable agent tools (N22 enabled-tools multi-select). */
export const AVAILABLE_TOOLS: readonly string[] = [
  'file_read',
  'file_edit',
  'file_write',
  'bash',
  'glob',
  'grep',
  'web_search',
  'web_fetch',
  'task',
]

/** Preset assistant avatars (N22 assistant settings). */
export const ASSISTANT_AVATARS: readonly string[] = [
  '🤖',
  '🐱',
  '🦊',
  '🐼',
  '🦉',
  '🚀',
  '✨',
  '🧠',
]

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
  systemPrompt:
    '你是 NexaWork 智能助理，请专业、准确、简洁地帮助用户完成任务。',
  enabledTools: [...AVAILABLE_TOOLS],
  assistantName: 'NexaWork',
  assistantAvatar: '🤖',
  assistantGreeting: '你好，我是 NexaWork，有什么可以帮你的吗？',
  replyStyle: 'professional',
  memoryEnabled: true,
  memoryFrequency: 'smart',
  memoryRetentionDays: 30,
  customEndpoint: '',
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

export function isReplyStyle(value: unknown): value is ReplyStyle {
  return (
    typeof value === 'string' &&
    (REPLY_STYLES as readonly string[]).includes(value)
  )
}

export function isMemoryFrequency(value: unknown): value is MemoryFrequency {
  return (
    typeof value === 'string' &&
    (MEMORY_FREQUENCIES as readonly string[]).includes(value)
  )
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

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Clamp + round the operation-memory retention window into [1, 365] days. */
export function clampMemoryRetention(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.memoryRetentionDays
  return Math.min(
    MEMORY_RETENTION_MAX,
    Math.max(MEMORY_RETENTION_MIN, Math.round(n)),
  )
}

/** Keep only known tool ids, preserving the catalog order. */
export function coerceEnabledTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.enabledTools]
  const requested = new Set(value.filter(v => typeof v === 'string'))
  return AVAILABLE_TOOLS.filter(tool => requested.has(tool))
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
    temperature: clampNumber(
      r.temperature,
      TEMPERATURE_MIN,
      TEMPERATURE_MAX,
      DEFAULT_SETTINGS.temperature,
    ),
    maxTokens: clampNumber(
      r.maxTokens,
      MAX_TOKENS_MIN,
      MAX_TOKENS_MAX,
      DEFAULT_SETTINGS.maxTokens,
    ),
    systemPrompt: coerceString(r.systemPrompt, DEFAULT_SETTINGS.systemPrompt),
    enabledTools: coerceEnabledTools(r.enabledTools),
    assistantName: coerceString(
      r.assistantName,
      DEFAULT_SETTINGS.assistantName,
    ),
    assistantAvatar: coerceString(
      r.assistantAvatar,
      DEFAULT_SETTINGS.assistantAvatar,
    ),
    assistantGreeting: coerceString(
      r.assistantGreeting,
      DEFAULT_SETTINGS.assistantGreeting,
    ),
    replyStyle: isReplyStyle(r.replyStyle)
      ? r.replyStyle
      : DEFAULT_SETTINGS.replyStyle,
    memoryEnabled: coerceBoolean(
      r.memoryEnabled,
      DEFAULT_SETTINGS.memoryEnabled,
    ),
    memoryFrequency: isMemoryFrequency(r.memoryFrequency)
      ? r.memoryFrequency
      : DEFAULT_SETTINGS.memoryFrequency,
    memoryRetentionDays: clampMemoryRetention(r.memoryRetentionDays),
    customEndpoint: coerceString(
      r.customEndpoint,
      DEFAULT_SETTINGS.customEndpoint,
    ),
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
