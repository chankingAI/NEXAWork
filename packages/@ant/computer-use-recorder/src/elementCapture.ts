/**
 * Cross-platform UI element context capture at the point of user interaction.
 *
 * Retrieves accessibility information (name, role, automationId, bounding_box)
 * for the element under the cursor during click/type events.
 *
 * Platform implementations:
 * - Windows: UI Automation COM API via PowerShell
 * - macOS: Accessibility API via JXA (AXUIElement)
 * - Linux: AT-SPI2 via python-atspi2 or gdbus
 *
 * References:
 * - computer-use-mcp/src/tools.ts: click_element/type_into_element (UI Automation schema)
 * - computer-use-mcp/src/executor.ts: clickElement({ name, role, automationId })
 * - UI-TARS-desktop operator.ts: ACTION_SPACES bounding_box [x1, y1, x2, y2]
 */

import type { ElementContext, Platform } from './types.js'

// ─── Element Capture Backend Interface ────────────────────────────────────────

/**
 * Query parameters for element lookup.
 */
export interface ElementQuery {
  /** Screen coordinates (x, y) to query the element at. */
  x: number
  y: number
}

/**
 * Platform-specific backend for querying accessibility information
 * about UI elements at a given screen position.
 */
export interface ElementCaptureBackend {
  /** Whether this backend is available on the current platform. */
  readonly isAvailable: boolean
  /** Platform identifier. */
  readonly platform: Platform
  /**
   * Query the UI element at the given screen coordinates.
   * Returns null if the element cannot be identified.
   * This method MUST be non-blocking and fast (< 100ms target).
   */
  queryElementAt(query: ElementQuery): Promise<ElementContext | null>
}

// ─── Windows UI Automation Backend ────────────────────────────────────────────

/**
 * Windows element capture using UI Automation COM API.
 *
 * Uses PowerShell to invoke System.Windows.Automation:
 * - AutomationElement.FromPoint(x, y) to get the element
 * - Reads Name, ControlType, AutomationId, BoundingRectangle
 *
 * This matches the same path used by computer-use-mcp's
 * click_element/type_into_element tools.
 */
class Win32ElementBackend implements ElementCaptureBackend {
  readonly platform: Platform = 'win32'

  get isAvailable(): boolean {
    return process.platform === 'win32'
  }

  async queryElementAt(query: ElementQuery): Promise<ElementContext | null> {
    const { x, y } = query

    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

try {
  $point = New-Object System.Windows.Point(${x}, ${y})
  $el = [System.Windows.Automation.AutomationElement]::FromPoint($point)
  if ($el -eq $null) { Write-Output "NULL"; exit }

  $name = $el.Current.Name
  $ctrlType = $el.Current.ControlType.ProgrammaticName -replace "ControlType\\.", ""
  $autoId = $el.Current.AutomationId
  $rect = $el.Current.BoundingRectangle

  $x1 = [int]$rect.X
  $y1 = [int]$rect.Y
  $x2 = [int]($rect.X + $rect.Width)
  $y2 = [int]($rect.Y + $rect.Height)

  Write-Output "$name|$ctrlType|$autoId|$x1|$y1|$x2|$y2"
} catch {
  Write-Output "ERROR"
}
`
    try {
      const proc = Bun.spawn(
        ['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const out = await new Response(proc.stdout).text()
      await proc.exited
      const trimmed = out.trim()

      if (!trimmed || trimmed === 'NULL' || trimmed === 'ERROR') return null

      const parts = trimmed.split('|')
      if (parts.length < 7) return null

      const [name, role, automationId, x1, y1, x2, y2] = parts

      const result: ElementContext = {}

      if (name && name !== '') result.accessible_name = name
      if (role && role !== '') result.role = role
      if (automationId && automationId !== '') result.selector = automationId

      const bx1 = Number.parseInt(x1!, 10)
      const by1 = Number.parseInt(y1!, 10)
      const bx2 = Number.parseInt(x2!, 10)
      const by2 = Number.parseInt(y2!, 10)

      if (
        !Number.isNaN(bx1) &&
        !Number.isNaN(by1) &&
        !Number.isNaN(bx2) &&
        !Number.isNaN(by2)
      ) {
        if (bx2 > bx1 && by2 > by1) {
          result.bounding_box = [bx1, by1, bx2, by2]
        }
      }

      // Only return if we got meaningful data
      if (
        result.accessible_name ||
        result.role ||
        result.selector ||
        result.bounding_box
      ) {
        return result
      }
      return null
    } catch {
      return null
    }
  }
}

// ─── macOS Accessibility Backend ──────────────────────────────────────────────

/**
 * macOS element capture using Accessibility API via JXA + ObjC bridge.
 *
 * Uses AXUIElementCopyElementAtPosition to find the element under cursor,
 * then reads AXRole, AXTitle/AXDescription, AXPosition, AXSize.
 *
 * Requires Accessibility permissions (System Preferences → Privacy → Accessibility).
 */
class DarwinElementBackend implements ElementCaptureBackend {
  readonly platform: Platform = 'darwin'

  get isAvailable(): boolean {
    return process.platform === 'darwin'
  }

  async queryElementAt(query: ElementQuery): Promise<ElementContext | null> {
    const { x, y } = query

    const script = `
ObjC.import("ApplicationServices");
ObjC.import("CoreFoundation");

var systemWide = $.AXUIElementCreateSystemWide();
var elementRef = Ref();
var err = $.AXUIElementCopyElementAtPosition(systemWide, ${x}, ${y}, elementRef);

if (err !== 0) {
  "ERROR";
} else {
  var el = elementRef[0];

  function getAttr(element, attr) {
    var val = Ref();
    var r = $.AXUIElementCopyAttributeValue(element, attr, val);
    if (r === 0 && val[0] !== undefined) {
      var v = val[0];
      if (typeof v === 'object' && v.js !== undefined) return v.js;
      return String(v);
    }
    return "";
  }

  var role = getAttr(el, "AXRole");
  var title = getAttr(el, "AXTitle");
  var desc = getAttr(el, "AXDescription");
  var roleDesc = getAttr(el, "AXRoleDescription");

  var posRef = Ref();
  var sizeRef = Ref();
  var posErr = $.AXUIElementCopyAttributeValue(el, "AXPosition", posRef);
  var sizeErr = $.AXUIElementCopyAttributeValue(el, "AXSize", sizeRef);

  var x1 = 0, y1 = 0, w = 0, h = 0;
  if (posErr === 0 && sizeErr === 0) {
    var pos = $.CGPoint();
    $.AXValueGetValue(posRef[0], 1, pos); // kAXValueTypeCGPoint = 1
    var size = $.CGSize();
    $.AXValueGetValue(sizeRef[0], 2, size); // kAXValueTypeCGSize = 2
    x1 = pos.x;
    y1 = pos.y;
    w = size.width;
    h = size.height;
  }

  var name = title || desc || "";
  var x2 = x1 + w;
  var y2 = y1 + h;

  name + "|" + role + "|" + roleDesc + "|" + Math.round(x1) + "|" + Math.round(y1) + "|" + Math.round(x2) + "|" + Math.round(y2);
}
`
    try {
      const proc = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', script], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const out = await new Response(proc.stdout).text()
      await proc.exited
      const trimmed = out.trim()

      if (!trimmed || trimmed === 'ERROR') return null

      const parts = trimmed.split('|')
      if (parts.length < 7) return null

      const [name, role, _roleDesc, x1, y1, x2, y2] = parts

      const result: ElementContext = {}

      if (name && name !== '') result.accessible_name = name
      if (role && role !== '') {
        // Convert AX prefixed roles to simpler format
        result.role = role!.replace(/^AX/, '')
      }

      const bx1 = Number.parseInt(x1!, 10)
      const by1 = Number.parseInt(y1!, 10)
      const bx2 = Number.parseInt(x2!, 10)
      const by2 = Number.parseInt(y2!, 10)

      if (
        !Number.isNaN(bx1) &&
        !Number.isNaN(by1) &&
        !Number.isNaN(bx2) &&
        !Number.isNaN(by2)
      ) {
        if (bx2 > bx1 && by2 > by1) {
          result.bounding_box = [bx1, by1, bx2, by2]
        }
      }

      if (result.accessible_name || result.role || result.bounding_box) {
        return result
      }
      return null
    } catch {
      return null
    }
  }
}

// ─── Linux AT-SPI2 Backend ────────────────────────────────────────────────────

/**
 * Linux element capture using AT-SPI2 via gdbus or python-atspi2.
 *
 * Strategy:
 * - Uses `gdbus call` to query org.a11y.atspi.Registry
 * - Falls back to xdotool getactivewindow + xprop for basic info
 * - AT-SPI2 provides: Name, Role, BoundingBox (extents)
 *
 * Requires: at-spi2-core (most Linux desktops have this)
 */
class LinuxElementBackend implements ElementCaptureBackend {
  readonly platform: Platform = 'linux'

  get isAvailable(): boolean {
    // Check if AT-SPI2 bus is available
    try {
      const result = Bun.spawnSync({
        cmd: [
          'gdbus',
          'call',
          '--session',
          '--dest',
          'org.a11y.atspi.Registry',
          '--object-path',
          '/org/a11y/atspi/accessible/root',
          '--method',
          'org.a11y.atspi.Accessible.GetRole',
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  async queryElementAt(query: ElementQuery): Promise<ElementContext | null> {
    const { x, y } = query

    // Use python3 with pyatspi2 for accessible element query
    // This is the most reliable cross-distro approach
    const pyScript = `
import sys
try:
    import pyatspi
    desktop = pyatspi.Registry.getDesktop(0)

    # Find element at coordinates
    found = None
    for app in desktop:
        try:
            for window in app:
                try:
                    comp = window.queryComponent()
                    if comp.contains(${x}, ${y}, pyatspi.DESKTOP_COORDS):
                        child = comp.getAccessibleAtPoint(${x}, ${y}, pyatspi.DESKTOP_COORDS)
                        if child:
                            found = child
                except:
                    pass
        except:
            pass

    if found:
        name = found.name or ""
        role = found.getRoleName() or ""
        try:
            comp = found.queryComponent()
            ext = comp.getExtents(pyatspi.DESKTOP_COORDS)
            x1, y1, w, h = ext.x, ext.y, ext.width, ext.height
            x2, y2 = x1 + w, y1 + h
        except:
            x1, y1, x2, y2 = 0, 0, 0, 0
        print(f"{name}|{role}|{x1}|{y1}|{x2}|{y2}")
    else:
        print("NULL")
except ImportError:
    print("NO_PYATSPI")
except Exception as e:
    print("ERROR")
`
    try {
      const proc = Bun.spawn(['python3', '-c', pyScript], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const out = await new Response(proc.stdout).text()
      await proc.exited
      const trimmed = out.trim()

      if (
        !trimmed ||
        trimmed === 'NULL' ||
        trimmed === 'ERROR' ||
        trimmed === 'NO_PYATSPI'
      ) {
        // Fallback: use xdotool to get at least the window name
        return this._fallbackXdotool()
      }

      const parts = trimmed.split('|')
      if (parts.length < 6) return null

      const [name, role, x1, y1, x2, y2] = parts

      const result: ElementContext = {}

      if (name && name !== '') result.accessible_name = name
      if (role && role !== '') result.role = this._normalizeRole(role!)

      const bx1 = Number.parseInt(x1!, 10)
      const by1 = Number.parseInt(y1!, 10)
      const bx2 = Number.parseInt(x2!, 10)
      const by2 = Number.parseInt(y2!, 10)

      if (
        !Number.isNaN(bx1) &&
        !Number.isNaN(by1) &&
        !Number.isNaN(bx2) &&
        !Number.isNaN(by2)
      ) {
        if (bx2 > bx1 && by2 > by1) {
          result.bounding_box = [bx1, by1, bx2, by2]
        }
      }

      if (result.accessible_name || result.role || result.bounding_box) {
        return result
      }
      return null
    } catch {
      return this._fallbackXdotool()
    }
  }

  private _fallbackXdotool(): ElementContext | null {
    try {
      const result = Bun.spawnSync({
        cmd: ['xdotool', 'getactivewindow', 'getwindowname'],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const windowName = new TextDecoder().decode(result.stdout).trim()
      if (windowName) {
        return { accessible_name: windowName, role: 'Window' }
      }
    } catch {
      // Ignore
    }
    return null
  }

  private _normalizeRole(atspiRole: string): string {
    // Normalize AT-SPI role names to match Windows UI Automation naming
    const ROLE_MAP: Record<string, string> = {
      'push button': 'Button',
      text: 'Edit',
      entry: 'Edit',
      link: 'Link',
      'menu item': 'MenuItem',
      'menu bar': 'MenuBar',
      'combo box': 'ComboBox',
      'check box': 'CheckBox',
      'radio button': 'RadioButton',
      'list item': 'ListItem',
      'tree item': 'TreeItem',
      tab: 'Tab',
      'page tab': 'Tab',
      'scroll bar': 'ScrollBar',
      slider: 'Slider',
      panel: 'Pane',
      frame: 'Window',
      dialog: 'Dialog',
      label: 'Text',
      static: 'Text',
      image: 'Image',
      table: 'Table',
      'table cell': 'DataItem',
      'tool bar': 'ToolBar',
      'status bar': 'StatusBar',
      separator: 'Separator',
      'progress bar': 'ProgressBar',
      'spin button': 'Spinner',
      'toggle button': 'Button',
    }
    const lower = atspiRole.toLowerCase()
    return (
      ROLE_MAP[lower] ?? atspiRole.charAt(0).toUpperCase() + atspiRole.slice(1)
    )
  }
}

// ─── Element Capture Service ──────────────────────────────────────────────────

/** Options for the ElementCaptureService. */
export interface ElementCaptureOptions {
  /** Override platform detection (for testing). */
  platform?: Platform
  /** Custom backend (for testing/mocking). */
  backend?: ElementCaptureBackend
  /**
   * Maximum time to wait for element query (ms).
   * If exceeded, returns null to avoid blocking the recorder. Default: 200.
   */
  timeoutMs?: number
  /**
   * Whether element capture is enabled. Default: true.
   * Set to false to skip all element queries (reduces overhead).
   */
  enabled?: boolean
}

/**
 * Service that captures UI element context at interaction points.
 *
 * Design principles:
 * - Non-blocking: queries run async and are race-timed to avoid blocking the recorder
 * - Graceful degradation: returns null if element can't be identified
 * - Platform-adaptive: uses the best available mechanism per OS
 *
 * Usage with DesktopRecorder:
 * ```ts
 * const captureService = new ElementCaptureService()
 * // On each click/type event:
 * const context = await captureService.captureAt({ x: 100, y: 200 })
 * event.element_context = context ?? undefined
 * ```
 */
export class ElementCaptureService {
  private _backend: ElementCaptureBackend | null
  private _timeoutMs: number
  private _enabled: boolean
  private _pendingQueries = 0

  constructor(options: ElementCaptureOptions = {}) {
    this._timeoutMs = options.timeoutMs ?? 200
    this._enabled = options.enabled ?? true

    if (options.backend) {
      this._backend = options.backend
    } else {
      this._backend = this._loadBackend(options.platform)
    }
  }

  /** Whether element capture is available on this platform. */
  get isAvailable(): boolean {
    return this._enabled && (this._backend?.isAvailable ?? false)
  }

  /** Number of pending element queries currently in flight. */
  get pendingQueries(): number {
    return this._pendingQueries
  }

  /**
   * Capture element context at the given screen coordinates.
   *
   * Returns null if:
   * - Capture is disabled
   * - Backend is not available
   * - Query times out (exceeds timeoutMs)
   * - Element cannot be identified
   */
  async captureAt(query: ElementQuery): Promise<ElementContext | null> {
    if (!this._enabled || !this._backend?.isAvailable) {
      return null
    }

    this._pendingQueries++
    try {
      const result = await this._withTimeout(
        this._backend.queryElementAt(query),
        this._timeoutMs,
      )
      return result
    } catch {
      return null
    } finally {
      this._pendingQueries--
    }
  }

  /**
   * Enrich a RawActionEvent with element context.
   * Non-blocking — if the query is too slow, the event keeps element_context as undefined.
   */
  async enrichEvent(event: {
    coordinate?: [number, number]
    element_context?: ElementContext
  }): Promise<void> {
    if (!event.coordinate) return
    const [x, y] = event.coordinate
    const context = await this.captureAt({ x, y })
    if (context) {
      event.element_context = context
    }
  }

  /** Enable or disable element capture at runtime. */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _loadBackend(platform?: Platform): ElementCaptureBackend | null {
    const p = platform ?? (process.platform as Platform)

    if (p === 'win32') {
      const backend = new Win32ElementBackend()
      return backend.isAvailable ? backend : null
    }
    if (p === 'darwin') {
      const backend = new DarwinElementBackend()
      return backend.isAvailable ? backend : null
    }
    if (p === 'linux') {
      const backend = new LinuxElementBackend()
      return backend.isAvailable ? backend : null
    }
    return null
  }

  private _withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return new Promise<T | null>(resolve => {
      const timer = setTimeout(() => resolve(null), ms)
      promise
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(() => {
          clearTimeout(timer)
          resolve(null)
        })
    })
  }
}

// ─── Factory Exports ──────────────────────────────────────────────────────────

/**
 * Load the platform-appropriate element capture backend.
 */
export function loadElementBackend(
  platform?: Platform,
): ElementCaptureBackend | null {
  const p = platform ?? (process.platform as Platform)

  if (p === 'win32') {
    const backend = new Win32ElementBackend()
    return backend.isAvailable ? backend : null
  }
  if (p === 'darwin') {
    const backend = new DarwinElementBackend()
    return backend.isAvailable ? backend : null
  }
  if (p === 'linux') {
    const backend = new LinuxElementBackend()
    return backend.isAvailable ? backend : null
  }
  return null
}
