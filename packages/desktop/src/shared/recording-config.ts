/**
 * NexaWork Recording Configuration (N25)
 * ======================================
 * Pure, dependency-free helpers for the pre-recording config panel: the
 * factory default, a defensive `coerce` that normalizes arbitrary persisted /
 * IPC input into a valid {@link RecordingConfig}, and `maskSensitive` which the
 * recorder uses to redact password-field input before it ever touches disk.
 *
 * Kept free of Electron / fs imports so it runs identically in the renderer,
 * the main process, and under `bun test`.
 */
import type {
  RecordingConfig,
  RecordMode,
  ScreenshotFrequency,
} from './ipc-channels'

const RECORD_MODES: readonly RecordMode[] = ['cdp', 'desktop', 'hybrid']
const SCREENSHOT_FREQUENCIES: readonly ScreenshotFrequency[] = [
  'on-action',
  'every-3s',
  'every-5s',
]

/** The placeholder written in place of redacted sensitive input. */
export const MASK_PLACEHOLDER = '••••••'

/** Factory default applied on first run / reset. */
export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  mode: 'cdp',
  screenshotFrequency: 'on-action',
  maskPasswords: true,
  windowFilter: [],
  captureMouseTrail: false,
  elementCapture: true,
  mergeOperations: true,
  maxDurationMs: 0,
}

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Normalize a duration: non-negative finite integer, else the fallback. */
function coerceDuration(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback
  }
  return Math.floor(value)
}

/** Normalize a window-filter list: trimmed, de-duplicated, non-empty strings. */
function coerceWindowFilter(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (trimmed) seen.add(trimmed)
  }
  return Array.from(seen)
}

/**
 * Coerce arbitrary input into a fully-populated, valid {@link RecordingConfig}.
 * Unknown / malformed fields fall back to {@link DEFAULT_RECORDING_CONFIG}.
 * `base` lets callers merge a partial update onto an existing config.
 */
export function coerceRecordingConfig(
  input: unknown,
  base: RecordingConfig = DEFAULT_RECORDING_CONFIG,
): RecordingConfig {
  const raw = (input ?? {}) as Partial<RecordingConfig>
  return {
    mode: coerceEnum(raw.mode, RECORD_MODES, base.mode),
    screenshotFrequency: coerceEnum(
      raw.screenshotFrequency,
      SCREENSHOT_FREQUENCIES,
      base.screenshotFrequency,
    ),
    maskPasswords: coerceBool(raw.maskPasswords, base.maskPasswords),
    windowFilter:
      raw.windowFilter === undefined
        ? [...base.windowFilter]
        : coerceWindowFilter(raw.windowFilter),
    captureMouseTrail: coerceBool(
      raw.captureMouseTrail,
      base.captureMouseTrail,
    ),
    elementCapture: coerceBool(raw.elementCapture, base.elementCapture),
    mergeOperations: coerceBool(raw.mergeOperations, base.mergeOperations),
    maxDurationMs: coerceDuration(raw.maxDurationMs, base.maxDurationMs),
  }
}

/**
 * Redact sensitive detail when password masking is on. Returns the placeholder
 * for any non-empty input so secrets never get persisted; leaves empty / absent
 * detail untouched.
 */
export function maskSensitive(
  detail: string | undefined,
  maskPasswords: boolean,
): string | undefined {
  if (!maskPasswords) return detail
  if (detail === undefined || detail.length === 0) return detail
  return MASK_PLACEHOLDER
}

/** True when the active recording duration has reached the configured limit. */
export function isOverMaxDuration(
  elapsedMs: number,
  maxDurationMs: number,
): boolean {
  return maxDurationMs > 0 && elapsedMs >= maxDurationMs
}
