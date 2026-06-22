/**
 * Event Merger — Consolidates raw action events into semantic operations.
 *
 * Performs intelligent merging of low-level events:
 * - Sequential character keystrokes → single "type" event
 * - Rapid click + click → "double_click"
 * - click + type → "focus and input" (preserved as separate events but annotated)
 * - Redundant mouse_move events → keeps final position only
 * - Consecutive scroll events → merged with accumulated amount
 *
 * Reference: OpenAdapt/legacy/openadapt/events.py — event merging patterns
 */

import type { RawActionEvent } from './types.js'

export interface MergeOptions {
  /** Max time gap (ms) between keystrokes to merge into single type event (default: 300). */
  typeGapMs?: number
  /** Max time gap (ms) between clicks to detect double-click (default: 300). */
  doubleClickGapMs?: number
  /** Max time gap (ms) between scrolls to merge (default: 200). */
  scrollGapMs?: number
  /** Max time gap (ms) between mouse_move events to collapse (default: 50). */
  mouseMoveGapMs?: number
  /** Whether to remove screenshot data from merged events to reduce size (default: false). */
  stripScreenshots?: boolean
}

const DEFAULT_OPTIONS: Required<MergeOptions> = {
  typeGapMs: 300,
  doubleClickGapMs: 300,
  scrollGapMs: 200,
  mouseMoveGapMs: 50,
  stripScreenshots: false,
}

/**
 * Merge a sequence of raw events into a more compact, semantic sequence.
 * This is a pure function — the input array is not modified.
 */
export function mergeEvents(
  events: readonly RawActionEvent[],
  options?: MergeOptions,
): RawActionEvent[] {
  if (events.length === 0) return []

  const opts = { ...DEFAULT_OPTIONS, ...options }
  let merged: RawActionEvent[] = [...events]

  // Pass 1: Merge consecutive type events (character keystrokes)
  merged = mergeConsecutiveTypes(merged, opts.typeGapMs)

  // Pass 2: Collapse rapid click pairs into double_click
  merged = mergeDoubleClicks(merged, opts.doubleClickGapMs)

  // Pass 3: Collapse sequential scrolls
  merged = mergeScrolls(merged, opts.scrollGapMs)

  // Pass 4: Collapse rapid mouse_move sequences
  merged = collapseMouseMoves(merged, opts.mouseMoveGapMs)

  // Pass 5: Strip screenshots if requested
  if (opts.stripScreenshots) {
    merged = merged.map(e => ({
      ...e,
      screenshot_before: null,
      screenshot_after: null,
    }))
  }

  return merged
}

/**
 * Merge consecutive 'type' events within the given time gap into single events.
 */
function mergeConsecutiveTypes(
  events: RawActionEvent[],
  gapMs: number,
): RawActionEvent[] {
  const result: RawActionEvent[] = []

  for (let i = 0; i < events.length; i++) {
    const current = events[i]!
    if (current.action !== 'type' || !current.text) {
      result.push(current)
      continue
    }

    // Collect consecutive type events within gap
    let mergedText = current.text
    let lastTimestamp = current.timestamp
    let j = i + 1

    while (j < events.length) {
      const next = events[j]!
      if (next.action !== 'type' || !next.text) break
      if (next.timestamp - lastTimestamp > gapMs) break
      mergedText += next.text
      lastTimestamp = next.timestamp
      j++
    }

    if (j > i + 1) {
      // Create merged type event
      result.push({
        ...current,
        text: mergedText,
        screenshot_after: events[j - 1]!.screenshot_after,
      })
      i = j - 1 // Skip merged events
    } else {
      result.push(current)
    }
  }

  return result
}

/**
 * Convert rapid click pairs into double_click events.
 */
function mergeDoubleClicks(
  events: RawActionEvent[],
  gapMs: number,
): RawActionEvent[] {
  const result: RawActionEvent[] = []

  for (let i = 0; i < events.length; i++) {
    const current = events[i]!
    const next = events[i + 1]

    if (
      current.action === 'left_click' &&
      next?.action === 'left_click' &&
      next.timestamp - current.timestamp < gapMs &&
      areSameCoordinate(current.coordinate, next.coordinate)
    ) {
      // Replace with double_click
      result.push({
        ...current,
        action: 'double_click',
        screenshot_after: next.screenshot_after,
      })
      i++ // Skip the second click
    } else {
      result.push(current)
    }
  }

  return result
}

/**
 * Merge consecutive scroll events in the same direction.
 */
function mergeScrolls(
  events: RawActionEvent[],
  gapMs: number,
): RawActionEvent[] {
  const result: RawActionEvent[] = []

  for (let i = 0; i < events.length; i++) {
    const current = events[i]!
    if (current.action !== 'scroll') {
      result.push(current)
      continue
    }

    let totalAmount = current.scroll_amount ?? 1
    let lastTimestamp = current.timestamp
    let j = i + 1

    while (j < events.length) {
      const next = events[j]!
      if (next.action !== 'scroll') break
      if (next.timestamp - lastTimestamp > gapMs) break
      if (next.scroll_direction !== current.scroll_direction) break
      totalAmount += next.scroll_amount ?? 1
      lastTimestamp = next.timestamp
      j++
    }

    if (j > i + 1) {
      result.push({
        ...current,
        scroll_amount: totalAmount,
        screenshot_after: events[j - 1]!.screenshot_after,
      })
      i = j - 1
    } else {
      result.push(current)
    }
  }

  return result
}

/**
 * Collapse rapid mouse_move events, keeping only the final position.
 */
function collapseMouseMoves(
  events: RawActionEvent[],
  gapMs: number,
): RawActionEvent[] {
  const result: RawActionEvent[] = []

  for (let i = 0; i < events.length; i++) {
    const current = events[i]!
    if (current.action !== 'mouse_move') {
      result.push(current)
      continue
    }

    // Find the last mouse_move in a rapid sequence
    let last = current
    let j = i + 1
    while (j < events.length) {
      const next = events[j]!
      if (next.action !== 'mouse_move') break
      if (next.timestamp - last.timestamp > gapMs) break
      last = next
      j++
    }

    // Only keep the final position
    result.push(last)
    i = j - 1
  }

  return result
}

/** Check if two coordinates are approximately the same (within 5px). */
function areSameCoordinate(
  a?: [number, number],
  b?: [number, number],
): boolean {
  if (!a || !b) return false
  return Math.abs(a[0] - b[0]) < 5 && Math.abs(a[1] - b[1]) < 5
}
