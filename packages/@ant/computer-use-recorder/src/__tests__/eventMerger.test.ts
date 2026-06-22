import { describe, expect, test } from 'bun:test'
import { mergeEvents } from '../eventMerger.js'
import type { RawActionEvent } from '../types.js'

function makeEvent(
  overrides: Partial<RawActionEvent> & { action: RawActionEvent['action'] },
): RawActionEvent {
  return {
    timestamp: Date.now(),
    screenshot_before: null,
    screenshot_after: null,
    window_context: { app_name: 'Chrome', window_title: 'Test' },
    ...overrides,
  }
}

describe('mergeEvents', () => {
  test('returns empty array for empty input', () => {
    expect(mergeEvents([])).toEqual([])
  })

  test('single event passes through unchanged', () => {
    const event = makeEvent({
      action: 'left_click',
      coordinate: [100, 200],
      timestamp: 1000,
    })
    const result = mergeEvents([event])
    expect(result).toHaveLength(1)
    expect(result[0]!.action).toBe('left_click')
  })

  describe('type event merging', () => {
    test('merges consecutive type events within gap', () => {
      const events: RawActionEvent[] = [
        makeEvent({ action: 'type', text: 'h', timestamp: 1000 }),
        makeEvent({ action: 'type', text: 'e', timestamp: 1050 }),
        makeEvent({ action: 'type', text: 'l', timestamp: 1100 }),
        makeEvent({ action: 'type', text: 'l', timestamp: 1150 }),
        makeEvent({ action: 'type', text: 'o', timestamp: 1200 }),
      ]
      const result = mergeEvents(events, { typeGapMs: 300 })
      expect(result).toHaveLength(1)
      expect(result[0]!.text).toBe('hello')
    })

    test('does not merge type events beyond gap', () => {
      const events: RawActionEvent[] = [
        makeEvent({ action: 'type', text: 'a', timestamp: 1000 }),
        makeEvent({ action: 'type', text: 'b', timestamp: 1100 }),
        makeEvent({ action: 'type', text: 'c', timestamp: 2000 }), // >300ms gap
      ]
      const result = mergeEvents(events, { typeGapMs: 300 })
      expect(result).toHaveLength(2)
      expect(result[0]!.text).toBe('ab')
      expect(result[1]!.text).toBe('c')
    })

    test('does not merge type events separated by other actions', () => {
      const events: RawActionEvent[] = [
        makeEvent({ action: 'type', text: 'a', timestamp: 1000 }),
        makeEvent({
          action: 'left_click',
          coordinate: [50, 50],
          timestamp: 1050,
        }),
        makeEvent({ action: 'type', text: 'b', timestamp: 1100 }),
      ]
      const result = mergeEvents(events, { typeGapMs: 300 })
      expect(result).toHaveLength(3)
      expect(result[0]!.text).toBe('a')
      expect(result[2]!.text).toBe('b')
    })
  })

  describe('double click merging', () => {
    test('merges rapid click pair into double_click', () => {
      const events: RawActionEvent[] = [
        makeEvent({
          action: 'left_click',
          coordinate: [100, 200],
          timestamp: 1000,
        }),
        makeEvent({
          action: 'left_click',
          coordinate: [101, 200],
          timestamp: 1100,
        }),
      ]
      const result = mergeEvents(events, { doubleClickGapMs: 300 })
      expect(result).toHaveLength(1)
      expect(result[0]!.action).toBe('double_click')
      expect(result[0]!.coordinate).toEqual([100, 200])
    })

    test('does not merge clicks too far apart in time', () => {
      const events: RawActionEvent[] = [
        makeEvent({
          action: 'left_click',
          coordinate: [100, 200],
          timestamp: 1000,
        }),
        makeEvent({
          action: 'left_click',
          coordinate: [100, 200],
          timestamp: 2000,
        }),
      ]
      const result = mergeEvents(events, { doubleClickGapMs: 300 })
      expect(result).toHaveLength(2)
    })

    test('does not merge clicks too far apart in space', () => {
      const events: RawActionEvent[] = [
        makeEvent({
          action: 'left_click',
          coordinate: [100, 200],
          timestamp: 1000,
        }),
        makeEvent({
          action: 'left_click',
          coordinate: [200, 300],
          timestamp: 1100,
        }),
      ]
      const result = mergeEvents(events, { doubleClickGapMs: 300 })
      expect(result).toHaveLength(2)
    })
  })

  describe('scroll merging', () => {
    test('merges consecutive scrolls in same direction', () => {
      const events: RawActionEvent[] = [
        makeEvent({
          action: 'scroll',
          scroll_direction: 'down',
          scroll_amount: 1,
          timestamp: 1000,
        }),
        makeEvent({
          action: 'scroll',
          scroll_direction: 'down',
          scroll_amount: 1,
          timestamp: 1050,
        }),
        makeEvent({
          action: 'scroll',
          scroll_direction: 'down',
          scroll_amount: 1,
          timestamp: 1100,
        }),
      ]
      const result = mergeEvents(events, { scrollGapMs: 200 })
      expect(result).toHaveLength(1)
      expect(result[0]!.scroll_amount).toBe(3)
    })

    test('does not merge scrolls in different directions', () => {
      const events: RawActionEvent[] = [
        makeEvent({
          action: 'scroll',
          scroll_direction: 'down',
          scroll_amount: 2,
          timestamp: 1000,
        }),
        makeEvent({
          action: 'scroll',
          scroll_direction: 'up',
          scroll_amount: 1,
          timestamp: 1050,
        }),
      ]
      const result = mergeEvents(events, { scrollGapMs: 200 })
      expect(result).toHaveLength(2)
    })
  })

  describe('mouse_move collapsing', () => {
    test('collapses rapid mouse_move sequence to final position', () => {
      const events: RawActionEvent[] = [
        makeEvent({
          action: 'mouse_move',
          coordinate: [10, 10],
          timestamp: 1000,
        }),
        makeEvent({
          action: 'mouse_move',
          coordinate: [20, 20],
          timestamp: 1010,
        }),
        makeEvent({
          action: 'mouse_move',
          coordinate: [30, 30],
          timestamp: 1020,
        }),
        makeEvent({
          action: 'mouse_move',
          coordinate: [40, 40],
          timestamp: 1030,
        }),
      ]
      const result = mergeEvents(events, { mouseMoveGapMs: 50 })
      expect(result).toHaveLength(1)
      expect(result[0]!.coordinate).toEqual([40, 40])
    })
  })

  describe('stripScreenshots option', () => {
    test('removes screenshots when enabled', () => {
      const events: RawActionEvent[] = [
        makeEvent({
          action: 'left_click',
          coordinate: [100, 200],
          timestamp: 1000,
          screenshot_before: 'base64data',
          screenshot_after: 'base64data',
        }),
      ]
      const result = mergeEvents(events, { stripScreenshots: true })
      expect(result[0]!.screenshot_before).toBeNull()
      expect(result[0]!.screenshot_after).toBeNull()
    })
  })
})
