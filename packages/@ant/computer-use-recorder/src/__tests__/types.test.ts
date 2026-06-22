import { describe, expect, test } from 'bun:test'
import type {
  RawActionEvent,
  RecordableAction,
  RecorderEvent,
  RecorderStartOptions,
  RecorderStopResult,
  RecordingMetadata,
  RecordingSession,
  RecordingStatus,
  ScrollDirection,
  WindowContext,
  ElementContext,
  Platform,
} from '../types.js'

describe('RawActionEvent', () => {
  test('minimal click event is valid', () => {
    const event: RawActionEvent = {
      action: 'left_click',
      coordinate: [100, 200],
      timestamp: Date.now(),
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'Test Page',
      },
    }
    expect(event.action).toBe('left_click')
    expect(event.coordinate).toEqual([100, 200])
    expect(event.timestamp).toBeGreaterThan(0)
  })

  test('type event with text is valid', () => {
    const event: RawActionEvent = {
      action: 'type',
      text: 'hello world',
      timestamp: Date.now(),
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'Input Field',
        url: 'https://example.com',
      },
    }
    expect(event.action).toBe('type')
    expect(event.text).toBe('hello world')
  })

  test('scroll event with direction and amount is valid', () => {
    const event: RawActionEvent = {
      action: 'scroll',
      coordinate: [500, 300],
      scroll_direction: 'down',
      scroll_amount: 3,
      timestamp: Date.now(),
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'Long Page',
      },
    }
    expect(event.scroll_direction).toBe('down')
    expect(event.scroll_amount).toBe(3)
  })

  test('drag event with start and end coordinates is valid', () => {
    const event: RawActionEvent = {
      action: 'left_click_drag',
      start_coordinate: [100, 100],
      coordinate: [300, 300],
      timestamp: Date.now(),
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'Finder',
        window_title: 'Documents',
      },
    }
    expect(event.start_coordinate).toEqual([100, 100])
    expect(event.coordinate).toEqual([300, 300])
  })

  test('event with element context is valid', () => {
    const event: RawActionEvent = {
      action: 'left_click',
      coordinate: [200, 150],
      timestamp: Date.now(),
      screenshot_before: 'base64data...',
      screenshot_after: 'base64data...',
      window_context: {
        app_name: 'Google Chrome',
        window_title: 'Form Page',
        url: 'https://example.com/form',
      },
      element_context: {
        accessible_name: 'Submit Button',
        role: 'Button',
        selector: '#submit-btn',
        bounding_box: [180, 140, 220, 160],
      },
    }
    expect(event.element_context?.accessible_name).toBe('Submit Button')
    expect(event.element_context?.bounding_box).toEqual([180, 140, 220, 160])
  })

  test('hold_key event with duration is valid', () => {
    const event: RawActionEvent = {
      action: 'hold_key',
      text: 'shift+down',
      duration: 0.5,
      timestamp: Date.now(),
      screenshot_before: null,
      screenshot_after: null,
      window_context: {
        app_name: 'VS Code',
        window_title: 'editor.ts',
      },
    }
    expect(event.duration).toBe(0.5)
    expect(event.text).toBe('shift+down')
  })
})

describe('RecordingSession', () => {
  test('complete session structure is valid', () => {
    const session: RecordingSession = {
      id: 'rec_abc123',
      startTime: 1719066000000,
      endTime: 1719066060000,
      status: 'stopped',
      events: [
        {
          action: 'left_click',
          coordinate: [100, 200],
          timestamp: 1719066001000,
          screenshot_before: null,
          screenshot_after: null,
          window_context: {
            app_name: 'Chrome',
            window_title: 'Tab 1',
          },
        },
        {
          action: 'type',
          text: 'search term',
          timestamp: 1719066002000,
          screenshot_before: null,
          screenshot_after: null,
          window_context: {
            app_name: 'Chrome',
            window_title: 'Tab 1',
          },
        },
      ],
      metadata: {
        platform: 'darwin',
        screen_width: 2560,
        screen_height: 1440,
        task_description: 'Search on website',
        scale_factor: 2,
      },
    }
    expect(session.id).toBe('rec_abc123')
    expect(session.events).toHaveLength(2)
    expect(session.metadata.platform).toBe('darwin')
    expect(session.status).toBe('stopped')
  })

  test('active recording session (endTime = 0)', () => {
    const session: RecordingSession = {
      id: 'rec_live',
      startTime: Date.now(),
      endTime: 0,
      status: 'recording',
      events: [],
      metadata: {
        platform: 'win32',
        screen_width: 1920,
        screen_height: 1080,
      },
    }
    expect(session.endTime).toBe(0)
    expect(session.status).toBe('recording')
    expect(session.events).toHaveLength(0)
  })
})

describe('RecordableAction enum coverage', () => {
  test('all action types are valid', () => {
    const allActions: RecordableAction[] = [
      'key',
      'type',
      'mouse_move',
      'left_click',
      'left_click_drag',
      'right_click',
      'middle_click',
      'double_click',
      'triple_click',
      'scroll',
      'hold_key',
      'screenshot',
      'cursor_position',
      'left_mouse_down',
      'left_mouse_up',
      'wait',
    ]
    expect(allActions).toHaveLength(16)
  })
})

describe('ScrollDirection enum coverage', () => {
  test('all scroll directions are valid', () => {
    const allDirections: ScrollDirection[] = ['up', 'down', 'left', 'right']
    expect(allDirections).toHaveLength(4)
  })
})

describe('Platform enum coverage', () => {
  test('all platforms are valid', () => {
    const allPlatforms: Platform[] = ['darwin', 'win32', 'linux']
    expect(allPlatforms).toHaveLength(3)
  })
})

describe('RecordingStatus enum coverage', () => {
  test('all statuses are valid', () => {
    const allStatuses: RecordingStatus[] = [
      'recording',
      'paused',
      'stopped',
      'error',
    ]
    expect(allStatuses).toHaveLength(4)
  })
})

describe('RecorderEvent union type', () => {
  test('started event', () => {
    const event: RecorderEvent = { type: 'started', sessionId: 'rec_1' }
    expect(event.type).toBe('started')
  })

  test('event_captured event', () => {
    const captured: RecorderEvent = {
      type: 'event_captured',
      event: {
        action: 'left_click',
        coordinate: [50, 50],
        timestamp: Date.now(),
        screenshot_before: null,
        screenshot_after: null,
        window_context: { app_name: 'App', window_title: 'Win' },
      },
    }
    expect(captured.type).toBe('event_captured')
  })

  test('error event', () => {
    const event: RecorderEvent = {
      type: 'error',
      error: 'Permission denied',
    }
    expect(event.type).toBe('error')
  })
})

describe('RecorderStartOptions', () => {
  test('default options', () => {
    const opts: RecorderStartOptions = {}
    expect(opts.taskDescription).toBeUndefined()
    expect(opts.captureScreenshots).toBeUndefined()
  })

  test('full options', () => {
    const opts: RecorderStartOptions = {
      taskDescription: 'Record login flow',
      captureScreenshots: true,
      screenshotIntervalMs: 1000,
    }
    expect(opts.taskDescription).toBe('Record login flow')
    expect(opts.screenshotIntervalMs).toBe(1000)
  })
})

describe('RecorderStopResult', () => {
  test('stop result structure', () => {
    const result: RecorderStopResult = {
      session: {
        id: 'rec_done',
        startTime: 1000,
        endTime: 2000,
        status: 'stopped',
        events: [],
        metadata: {
          platform: 'linux',
          screen_width: 1920,
          screen_height: 1080,
        },
      },
      outputPath: '/home/user/.claude/recordings/rec_done.json',
    }
    expect(result.session.status).toBe('stopped')
    expect(result.outputPath).toContain('rec_done')
  })
})
