import { describe, expect, test, beforeEach } from 'bun:test'
import {
  VisualMatcher,
  locateByAccessibility,
  locateByRelativeCoords,
  locateByVisualTemplate,
  locateByClaudeVision,
  buildTargetDescription,
  compareTemplatePatches,
} from '../visualMatcher.js'
import type {
  AccessibilityLocator,
  VisionProvider,
  ScreenshotProvider,
  MatchContext,
  MatchLevel,
} from '../visualMatcher.js'
import type { RawActionEvent, ElementContext, WindowContext } from '../types.js'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<RawActionEvent> = {}): RawActionEvent {
  return {
    action: 'left_click',
    timestamp: 1000,
    screenshot_before: null,
    screenshot_after: null,
    window_context: { app_name: 'TestApp', window_title: 'Test Window' },
    ...overrides,
  }
}

function makeContext(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    event: makeEvent(),
    originalCoordinate: [500, 300],
    elementContext: {
      accessible_name: 'Save',
      role: 'Button',
      bounding_box: [480, 280, 520, 320],
    },
    windowContext: { app_name: 'TestApp', window_title: 'Test Window' },
    ...overrides,
  }
}

class MockAccessibilityLocator implements AccessibilityLocator {
  private _result: { x: number; y: number; confidence: number } | null = null
  private _shouldThrow = false

  setResult(result: { x: number; y: number; confidence: number } | null): void {
    this._result = result
  }

  setShouldThrow(v: boolean): void {
    this._shouldThrow = v
  }

  async findElement(
    _query: any,
  ): Promise<{ x: number; y: number; confidence: number } | null> {
    if (this._shouldThrow) throw new Error('Accessibility API unavailable')
    return this._result
  }
}

class MockVisionProvider implements VisionProvider {
  private _result: { x: number; y: number; confidence: number } | null = null
  private _delay = 0

  setResult(result: { x: number; y: number; confidence: number } | null): void {
    this._result = result
  }

  setDelay(ms: number): void {
    this._delay = ms
  }

  async locateTarget(
    _screenshot: string,
    _description: string,
    _ref?: string,
  ): Promise<{ x: number; y: number; confidence: number } | null> {
    if (this._delay > 0) {
      await new Promise(r => setTimeout(r, this._delay))
    }
    return this._result
  }
}

class MockScreenshotProvider implements ScreenshotProvider {
  private _screenshot: string | null = 'base64-current-screenshot-data'

  setScreenshot(s: string | null): void {
    this._screenshot = s
  }

  async capture(): Promise<string | null> {
    return this._screenshot
  }
}

// ─── Level 1: Accessibility Tests ─────────────────────────────────────────────

describe('locateByAccessibility', () => {
  test('returns bounding_box center when no locator but box exists', async () => {
    const context = makeContext()
    const result = await locateByAccessibility(context, undefined)
    expect(result.found).toBe(true)
    expect(result.coordinate).toEqual([500, 300])
    expect(result.level).toBe('accessibility')
    expect(result.confidence).toBe(0.85)
  })

  test('returns not found when no element_context', async () => {
    const context = makeContext({ elementContext: undefined })
    const result = await locateByAccessibility(context, undefined)
    expect(result.found).toBe(false)
  })

  test('returns not found when element_context has no identifying fields', async () => {
    const context = makeContext({ elementContext: {} })
    const result = await locateByAccessibility(context, undefined)
    expect(result.found).toBe(false)
  })

  test('uses locator when provided', async () => {
    const locator = new MockAccessibilityLocator()
    locator.setResult({ x: 510, y: 310, confidence: 0.95 })
    const context = makeContext()
    const result = await locateByAccessibility(context, locator)
    expect(result.found).toBe(true)
    expect(result.coordinate).toEqual([510, 310])
    expect(result.confidence).toBe(0.95)
  })

  test('returns not found when locator finds nothing', async () => {
    const locator = new MockAccessibilityLocator()
    locator.setResult(null)
    const context = makeContext()
    const result = await locateByAccessibility(context, locator)
    expect(result.found).toBe(false)
  })

  test('handles locator errors gracefully', async () => {
    const locator = new MockAccessibilityLocator()
    locator.setShouldThrow(true)
    const context = makeContext()
    const result = await locateByAccessibility(context, locator)
    expect(result.found).toBe(false)
    expect(result.reason).toContain('error')
  })
})

// ─── Level 2: Relative Coordinates Tests ──────────────────────────────────────

describe('locateByRelativeCoords', () => {
  test('uses bounding_box for relative positioning', () => {
    const context = makeContext({
      originalCoordinate: [500, 300],
      elementContext: { bounding_box: [480, 280, 520, 320] },
    })
    const result = locateByRelativeCoords(context, {
      width: 1920,
      height: 1080,
    })
    expect(result.found).toBe(true)
    expect(result.coordinate).toEqual([500, 300])
    expect(result.level).toBe('relative_coords')
    expect(result.confidence).toBe(0.7)
  })

  test('uses screen proportional when no bounding_box', () => {
    const context = makeContext({
      originalCoordinate: [960, 540],
      elementContext: { accessible_name: 'Test' },
    })
    const result = locateByRelativeCoords(context, {
      width: 1920,
      height: 1080,
    })
    expect(result.found).toBe(true)
    expect(result.coordinate).toEqual([960, 540])
    expect(result.confidence).toBe(0.5)
  })

  test('direct passthrough when no geometry', () => {
    const context = makeContext({
      originalCoordinate: [100, 200],
      elementContext: undefined,
    })
    const result = locateByRelativeCoords(context, undefined)
    expect(result.found).toBe(true)
    expect(result.coordinate).toEqual([100, 200])
    expect(result.confidence).toBe(0.4)
  })

  test('returns not found when no coordinate', () => {
    const context = makeContext({ originalCoordinate: undefined })
    const result = locateByRelativeCoords(context, undefined)
    expect(result.found).toBe(false)
  })
})

// ─── Level 3: Visual Template Tests ───────────────────────────────────────────

describe('locateByVisualTemplate', () => {
  test('returns not found when no coordinate', async () => {
    const context = makeContext({ originalCoordinate: undefined })
    const result = await locateByVisualTemplate(context)
    expect(result.found).toBe(false)
  })

  test('returns not found when no recorded screenshot', async () => {
    const context = makeContext({
      recordedScreenshot: undefined,
      event: makeEvent({ screenshot_before: null }),
    })
    const result = await locateByVisualTemplate(context)
    expect(result.found).toBe(false)
  })

  test('matches identical screenshots with high confidence', async () => {
    const screenshot = 'identical-screenshot-base64-data'
    const provider = new MockScreenshotProvider()
    provider.setScreenshot(screenshot)

    const context = makeContext({
      recordedScreenshot: screenshot,
      currentScreenshot: screenshot,
    })
    const result = await locateByVisualTemplate(context, provider)
    expect(result.found).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
    expect(result.coordinate).toEqual([500, 300])
  })

  test('matches similar-size screenshots with moderate confidence', async () => {
    const recorded = 'a'.repeat(1000)
    const current = 'b'.repeat(990) // 99% similar size
    const provider = new MockScreenshotProvider()
    provider.setScreenshot(current)

    const context = makeContext({
      recordedScreenshot: recorded,
      currentScreenshot: current,
    })
    const result = await locateByVisualTemplate(context, provider)
    expect(result.found).toBe(true)
    expect(result.confidence).toBe(0.6)
  })

  test('returns not found for very different screenshots', async () => {
    const recorded = 'a'.repeat(1000)
    const current = 'b'.repeat(100) // Very different size
    const provider = new MockScreenshotProvider()
    provider.setScreenshot(current)

    const context = makeContext({
      recordedScreenshot: recorded,
      currentScreenshot: current,
    })
    const result = await locateByVisualTemplate(context, provider)
    expect(result.found).toBe(false)
  })

  test('uses screenshotProvider when no current screenshot in context', async () => {
    const provider = new MockScreenshotProvider()
    provider.setScreenshot('matching-screenshot')

    const context = makeContext({
      recordedScreenshot: 'matching-screenshot',
      currentScreenshot: undefined,
    })
    const result = await locateByVisualTemplate(context, provider)
    expect(result.found).toBe(true)
    expect(result.confidence).toBe(0.95) // identical
  })
})

// ─── Level 4: Claude Vision Tests ─────────────────────────────────────────────

describe('locateByClaudeVision', () => {
  test('returns not found when no provider', async () => {
    const context = makeContext()
    const result = await locateByClaudeVision(context)
    expect(result.found).toBe(false)
    expect(result.reason).toContain('No vision provider')
  })

  test('locates target via vision provider', async () => {
    const vision = new MockVisionProvider()
    vision.setResult({ x: 505, y: 305, confidence: 0.88 })
    const screenshot = new MockScreenshotProvider()

    const context = makeContext({ currentScreenshot: 'some-screenshot' })
    const result = await locateByClaudeVision(context, vision, screenshot)
    expect(result.found).toBe(true)
    expect(result.coordinate).toEqual([505, 305])
    expect(result.confidence).toBe(0.88)
    expect(result.level).toBe('claude_vision')
  })

  test('returns not found when vision provider returns null', async () => {
    const vision = new MockVisionProvider()
    vision.setResult(null)
    const screenshot = new MockScreenshotProvider()

    const context = makeContext({ currentScreenshot: 'some-screenshot' })
    const result = await locateByClaudeVision(context, vision, screenshot)
    expect(result.found).toBe(false)
  })

  test('times out if vision is too slow', async () => {
    const vision = new MockVisionProvider()
    vision.setResult({ x: 100, y: 100, confidence: 0.9 })
    vision.setDelay(500) // Slow
    const screenshot = new MockScreenshotProvider()

    const context = makeContext({ currentScreenshot: 'some-screenshot' })
    const result = await locateByClaudeVision(context, vision, screenshot, 50) // 50ms timeout
    expect(result.found).toBe(false)
    expect(result.reason).toContain('timed out')
  })

  test('returns not found when no screenshot available', async () => {
    const vision = new MockVisionProvider()
    const screenshot = new MockScreenshotProvider()
    screenshot.setScreenshot(null)

    const context = makeContext({ currentScreenshot: undefined })
    const result = await locateByClaudeVision(context, vision, screenshot)
    expect(result.found).toBe(false)
    expect(result.reason).toContain('No current screenshot')
  })
})

// ─── VisualMatcher Orchestrator Tests ─────────────────────────────────────────

describe('VisualMatcher', () => {
  let locator: MockAccessibilityLocator
  let vision: MockVisionProvider
  let screenshot: MockScreenshotProvider

  beforeEach(() => {
    locator = new MockAccessibilityLocator()
    vision = new MockVisionProvider()
    screenshot = new MockScreenshotProvider()
  })

  test('uses accessibility (Level 1) when element has bounding_box', async () => {
    const matcher = new VisualMatcher({
      accessibilityLocator: locator,
      visionProvider: vision,
      screenshotProvider: screenshot,
    })
    locator.setResult({ x: 510, y: 305, confidence: 0.92 })

    const context = makeContext()
    const result = await matcher.locate(context)
    expect(result.found).toBe(true)
    expect(result.level).toBe('accessibility')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  test('falls through to Level 2 when accessibility fails', async () => {
    const matcher = new VisualMatcher({
      accessibilityLocator: locator,
      screenshotProvider: screenshot,
      screenSize: { width: 1920, height: 1080 },
    })
    locator.setResult(null)

    const context = makeContext({
      elementContext: { accessible_name: 'NotFound', role: 'Button' },
    })
    const result = await matcher.locate(context)
    expect(result.found).toBe(true)
    // Level 2 (relative_coords) uses screen proportional
    expect(result.level).toBe('relative_coords')
  })

  test('falls through to Level 3 when coords below threshold', async () => {
    const matcher = new VisualMatcher({
      accessibilityLocator: locator,
      screenshotProvider: screenshot,
      minConfidence: 0.8, // High threshold
    })
    locator.setResult(null)

    const sameScreenshot = 'identical-data'
    const context = makeContext({
      elementContext: undefined, // No element context
      originalCoordinate: [400, 300],
      recordedScreenshot: sameScreenshot,
      currentScreenshot: sameScreenshot,
    })
    const result = await matcher.locate(context)
    expect(result.found).toBe(true)
    // visual_template should match with 0.95 confidence (identical screenshots)
    expect(result.level).toBe('visual_template')
  })

  test('reaches Level 4 (Claude Vision) when earlier levels fail', async () => {
    vision.setResult({ x: 450, y: 250, confidence: 0.82 })

    const matcher = new VisualMatcher({
      accessibilityLocator: locator,
      visionProvider: vision,
      screenshotProvider: screenshot,
      minConfidence: 0.8,
    })
    locator.setResult(null)

    // No element context, very different screenshots
    const context = makeContext({
      elementContext: undefined,
      originalCoordinate: [400, 300],
      recordedScreenshot: 'a'.repeat(1000),
      currentScreenshot: 'b'.repeat(100), // Very different
    })
    const result = await matcher.locate(context)
    expect(result.found).toBe(true)
    expect(result.level).toBe('claude_vision')
    expect(result.coordinate).toEqual([450, 250])
  })

  test('returns original coordinate when all levels fail', async () => {
    const matcher = new VisualMatcher({
      accessibilityLocator: locator,
      visionProvider: vision,
      screenshotProvider: screenshot,
      minConfidence: 0.99, // Very high threshold
    })
    locator.setResult(null)
    vision.setResult(null)

    const context = makeContext({
      elementContext: undefined,
      originalCoordinate: [777, 333],
      recordedScreenshot: undefined,
    })
    const result = await matcher.locate(context)
    expect(result.found).toBe(true)
    expect(result.coordinate).toEqual([777, 333])
    expect(result.confidence).toBe(0.3)
  })

  test('respects enabledLevels configuration', async () => {
    const matcher = new VisualMatcher({
      enabledLevels: ['claude_vision'],
      visionProvider: vision,
      screenshotProvider: screenshot,
    })
    vision.setResult({ x: 100, y: 200, confidence: 0.9 })

    const context = makeContext({ currentScreenshot: 'screenshot' })
    const result = await matcher.locate(context)
    expect(result.found).toBe(true)
    expect(result.level).toBe('claude_vision')
  })

  test('isDryRun property', () => {
    const matcher1 = new VisualMatcher({ dryRun: false })
    expect(matcher1.isDryRun).toBe(false)

    const matcher2 = new VisualMatcher({ dryRun: true })
    expect(matcher2.isDryRun).toBe(true)
  })

  test('enabledLevels property', () => {
    const matcher = new VisualMatcher({
      enabledLevels: ['accessibility', 'visual_template'],
    })
    expect(matcher.enabledLevels).toEqual(['accessibility', 'visual_template'])
  })
})

describe('VisualMatcher.dryRun', () => {
  test('attempts all levels and reports results', async () => {
    const locator = new MockAccessibilityLocator()
    const vision = new MockVisionProvider()
    const screenshot = new MockScreenshotProvider()

    locator.setResult({ x: 500, y: 300, confidence: 0.9 })
    vision.setResult({ x: 505, y: 305, confidence: 0.85 })

    const matcher = new VisualMatcher({
      accessibilityLocator: locator,
      visionProvider: vision,
      screenshotProvider: screenshot,
      screenSize: { width: 1920, height: 1080 },
    })

    const sameScreenshot = 'same-data'
    const context = makeContext({
      recordedScreenshot: sameScreenshot,
      currentScreenshot: sameScreenshot,
    })

    const dryRunResult = await matcher.dryRun(context)
    expect(dryRunResult.attempts.length).toBe(4) // All 4 levels
    expect(dryRunResult.best).not.toBeNull()
    expect(dryRunResult.best!.found).toBe(true)

    // Check all levels were attempted
    const levels = dryRunResult.attempts.map(a => a.level)
    expect(levels).toEqual([
      'accessibility',
      'relative_coords',
      'visual_template',
      'claude_vision',
    ])

    // Each attempt has duration
    for (const attempt of dryRunResult.attempts) {
      expect(attempt.durationMs).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─── Utility Function Tests ───────────────────────────────────────────────────

describe('buildTargetDescription', () => {
  test('builds description from element context', () => {
    const context = makeContext()
    const desc = buildTargetDescription(context)
    expect(desc).toContain('Button')
    expect(desc).toContain('Save')
    expect(desc).toContain('TestApp')
  })

  test('returns null when no identifying info', () => {
    const context = makeContext({
      elementContext: undefined,
      windowContext: undefined,
      originalCoordinate: undefined,
      event: makeEvent({ action: undefined as any }),
    })
    const desc = buildTargetDescription(context)
    expect(desc).toBeNull()
  })

  test('uses coordinate when no element info', () => {
    const context = makeContext({
      elementContext: undefined,
      windowContext: undefined,
      event: makeEvent({ action: undefined as any }),
    })
    const desc = buildTargetDescription(context)
    expect(desc).toContain('500')
    expect(desc).toContain('300')
  })
})

describe('compareTemplatePatches', () => {
  test('identical base64 returns high confidence', () => {
    const data = 'same-base64-string'
    const result = compareTemplatePatches(data, data, [100, 200])
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(0.95)
    expect(result!.coordinate).toEqual([100, 200])
  })

  test('similar size returns moderate confidence', () => {
    const recorded = 'x'.repeat(1000)
    const current = 'y'.repeat(960) // 96% size
    const result = compareTemplatePatches(recorded, current, [50, 50])
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(0.6)
  })

  test('moderately different returns low confidence', () => {
    const recorded = 'x'.repeat(1000)
    const current = 'y'.repeat(850) // 85% size
    const result = compareTemplatePatches(recorded, current, [50, 50])
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(0.35)
  })

  test('very different returns null', () => {
    const recorded = 'x'.repeat(1000)
    const current = 'y'.repeat(500) // 50% size
    const result = compareTemplatePatches(recorded, current, [50, 50])
    expect(result).toBeNull()
  })
})
