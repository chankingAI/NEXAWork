/**
 * Cross-platform desktop event capture for recording user interactions.
 *
 * Architecture follows computer-use-input's dispatcher pattern:
 * - Platform detection at load time
 * - Separate backends for darwin/win32/linux
 * - Events output as RawActionEvent (unified format)
 *
 * References:
 * - OpenAdapt/legacy/openadapt/record.py: pynput keyboard.Listener + mouse.Listener
 * - OpenAdapt/legacy/openadapt/capture/: platform-specific capture
 * - UI-TARS-desktop/apps/ui-tars/src/main/agent/operator.ts: NutJS + Electron
 * - computer-use-input/src/index.ts: platform dispatcher pattern
 */

import type {
  Platform,
  RawActionEvent,
  RecordableAction,
  RecorderEvent,
  RecorderStartOptions,
  RecorderStopResult,
  RecordingSession,
  RecordingStatus,
  ScrollDirection,
  WindowContext,
  ElementContext,
} from './types.js'

// ─── Input Capture Backend Interface ──────────────────────────────────────────

/**
 * Raw input event from the platform capture layer.
 * Each backend translates OS-specific events into this uniform format.
 */
export interface RawInputEvent {
  /** Event kind from the OS layer. */
  kind:
    | 'mouse_move'
    | 'mouse_click'
    | 'mouse_down'
    | 'mouse_up'
    | 'mouse_scroll'
    | 'mouse_drag'
    | 'key_down'
    | 'key_up'
    | 'window_focus'
  /** Unix timestamp in ms. */
  timestamp: number
  /** Mouse position (if applicable). */
  x?: number
  y?: number
  /** Mouse button (if applicable). */
  button?: 'left' | 'right' | 'middle'
  /** Scroll deltas (if applicable). */
  scrollDx?: number
  scrollDy?: number
  /** Key name (if applicable). */
  key?: string
  /** Whether the key is a character key vs special key. */
  isChar?: boolean
  /** Window info (if available from the OS). */
  windowTitle?: string
  appName?: string
  /** Drag start coordinates (for mouse_drag events). */
  dragStartX?: number
  dragStartY?: number
}

/**
 * Platform-specific capture backend interface.
 * Each platform implements this to capture native input events.
 */
export interface InputCaptureBackend {
  /** Whether this backend is available on the current platform. */
  readonly isAvailable: boolean
  /** Platform identifier. */
  readonly platform: Platform
  /**
   * Start capturing events. The callback is invoked for each input event.
   * Returns a cleanup function to stop capturing.
   */
  startCapture(callback: (event: RawInputEvent) => void): Promise<CaptureHandle>
  /** Get current window information (frontmost app). */
  getWindowContext(): WindowContext | null
  /** Capture a screenshot (returns base64 PNG or null). */
  captureScreenshot(): Promise<string | null>
}

/** Handle returned by startCapture — used to stop the capture loop. */
export interface CaptureHandle {
  /** Stop the capture loop. */
  stop(): void
  /** Whether the capture is currently active. */
  readonly isActive: boolean
}

// ─── Linux Capture Backend ────────────────────────────────────────────────────

/**
 * Linux input capture using xinput + xdotool for event monitoring.
 *
 * Strategy:
 * - Uses `xinput test-xi2 --root` to listen for all XI2 raw events
 * - Parses the output stream for mouse/keyboard events
 * - Uses `xdotool` for window context (same as computer-use-input/linux.ts)
 * - Uses `import` (ImageMagick) or `scrot` for screenshots
 *
 * This is a polling-free approach — xinput test-xi2 emits events as they occur.
 */
class LinuxCaptureBackend implements InputCaptureBackend {
  readonly platform: Platform = 'linux'

  get isAvailable(): boolean {
    try {
      const result = Bun.spawnSync({
        cmd: ['which', 'xinput'],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  async startCapture(
    callback: (event: RawInputEvent) => void,
  ): Promise<CaptureHandle> {
    let active = true

    // Use xinput test-xi2 --root to monitor all input events
    const proc = Bun.spawn(['xinput', 'test-xi2', '--root'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const handle: CaptureHandle = {
      stop() {
        active = false
        proc.kill()
      },
      get isActive() {
        return active
      },
    }

    // Process xinput output in background
    const reader = proc.stdout.getReader()
    void this._processXinputStream(reader, callback, () => active)

    return handle
  }

  private async _processXinputStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    callback: (event: RawInputEvent) => void,
    isActive: () => boolean,
  ): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent: Partial<RawInputEvent> | null = null

    try {
      while (isActive()) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const parsed = this._parseXinputLine(line, currentEvent)
          if (parsed.event) {
            currentEvent = null
            callback(parsed.event)
          } else if (parsed.partial) {
            currentEvent = parsed.partial
          }
        }
      }
    } catch {
      // Stream ended (process killed)
    }
  }

  private _parseXinputLine(
    line: string,
    current: Partial<RawInputEvent> | null,
  ): { event?: RawInputEvent; partial?: Partial<RawInputEvent> } {
    const trimmed = line.trim()

    // Detect event type headers
    if (trimmed.startsWith('EVENT type')) {
      const timestamp = Date.now()

      if (trimmed.includes('RawMotion')) {
        return { partial: { kind: 'mouse_move', timestamp } }
      }
      if (trimmed.includes('RawButtonPress')) {
        return { partial: { kind: 'mouse_down', timestamp } }
      }
      if (trimmed.includes('RawButtonRelease')) {
        return { partial: { kind: 'mouse_up', timestamp } }
      }
      if (trimmed.includes('RawKeyPress')) {
        return { partial: { kind: 'key_down', timestamp } }
      }
      if (trimmed.includes('RawKeyRelease')) {
        return { partial: { kind: 'key_up', timestamp } }
      }
      return {}
    }

    // Parse detail (button/key code)
    if (current && trimmed.startsWith('detail:')) {
      const detail = Number.parseInt(trimmed.slice(7).trim(), 10)

      if (current.kind === 'mouse_down' || current.kind === 'mouse_up') {
        // Button mapping: 1=left, 2=middle, 3=right, 4/5=scroll
        if (detail === 4 || detail === 5) {
          const scrollEvent: RawInputEvent = {
            kind: 'mouse_scroll',
            timestamp: current.timestamp!,
            scrollDy: detail === 4 ? -1 : 1,
            scrollDx: 0,
          }
          return { event: scrollEvent }
        }
        if (detail === 6 || detail === 7) {
          const scrollEvent: RawInputEvent = {
            kind: 'mouse_scroll',
            timestamp: current.timestamp!,
            scrollDx: detail === 6 ? -1 : 1,
            scrollDy: 0,
          }
          return { event: scrollEvent }
        }

        const button: 'left' | 'right' | 'middle' =
          detail === 1 ? 'left' : detail === 3 ? 'right' : 'middle'

        const event: RawInputEvent = {
          ...current,
          kind: current.kind,
          button,
          timestamp: current.timestamp!,
        }
        // Attach mouse position
        const pos = this._getMousePosition()
        if (pos) {
          event.x = pos.x
          event.y = pos.y
        }
        return { event }
      }

      if (current.kind === 'key_down' || current.kind === 'key_up') {
        const keyName = this._keycodeToName(detail)
        const event: RawInputEvent = {
          kind: current.kind,
          timestamp: current.timestamp!,
          key: keyName,
          isChar: keyName.length === 1,
        }
        return { event }
      }
    }

    // Parse valuator values for motion events
    if (current?.kind === 'mouse_move' && trimmed.startsWith('valuators:')) {
      const pos = this._getMousePosition()
      if (pos) {
        const event: RawInputEvent = {
          kind: 'mouse_move',
          timestamp: current.timestamp!,
          x: pos.x,
          y: pos.y,
        }
        return { event }
      }
    }

    return {}
  }

  private _getMousePosition(): { x: number; y: number } | null {
    try {
      const result = Bun.spawnSync({
        cmd: ['xdotool', 'getmouselocation'],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const out = new TextDecoder().decode(result.stdout).trim()
      const xMatch = out.match(/x:(\d+)/)
      const yMatch = out.match(/y:(\d+)/)
      if (xMatch && yMatch) {
        return { x: Number(xMatch[1]), y: Number(yMatch[1]) }
      }
    } catch {
      // Ignore
    }
    return null
  }

  private _keycodeToName(keycode: number): string {
    // Use xdotool key-name lookup (xmodmap -pke)
    try {
      const result = Bun.spawnSync({
        cmd: [
          'xdotool',
          'key',
          '--clearmodifiers',
          `--delay`,
          '0',
          `keycode ${keycode}`,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      // Fallback: use xmodmap
      const xmodResult = Bun.spawnSync({
        cmd: [
          'sh',
          '-c',
          `xmodmap -pke | grep "keycode  ${keycode} =" | head -1`,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const line = new TextDecoder().decode(xmodResult.stdout).trim()
      const parts = line.split('=')
      if (parts[1]) {
        const keyNames = parts[1].trim().split(/\s+/)
        if (keyNames[0]) return keyNames[0]
      }
    } catch {
      // Ignore
    }
    return `keycode_${keycode}`
  }

  getWindowContext(): WindowContext | null {
    try {
      const windowId = Bun.spawnSync({
        cmd: ['xdotool', 'getactivewindow'],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const wid = new TextDecoder().decode(windowId.stdout).trim()
      if (!wid) return null

      const nameResult = Bun.spawnSync({
        cmd: ['xdotool', 'getwindowname', wid],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const windowTitle = new TextDecoder().decode(nameResult.stdout).trim()

      const pidResult = Bun.spawnSync({
        cmd: ['xdotool', 'getwindowpid', wid],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const pid = new TextDecoder().decode(pidResult.stdout).trim()

      let appName = 'unknown'
      if (pid) {
        const commResult = Bun.spawnSync({
          cmd: ['cat', `/proc/${pid}/comm`],
          stdout: 'pipe',
          stderr: 'pipe',
        })
        appName =
          new TextDecoder().decode(commResult.stdout).trim() || 'unknown'
      }

      return { app_name: appName, window_title: windowTitle }
    } catch {
      return null
    }
  }

  async captureScreenshot(): Promise<string | null> {
    try {
      const tmpPath = `/tmp/desktop-recorder-${Date.now()}.png`
      // Try scrot first (lighter), fall back to import (ImageMagick)
      let result = Bun.spawnSync({
        cmd: ['scrot', '-o', tmpPath],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (result.exitCode !== 0) {
        result = Bun.spawnSync({
          cmd: ['import', '-window', 'root', tmpPath],
          stdout: 'pipe',
          stderr: 'pipe',
        })
      }
      if (result.exitCode !== 0) return null

      const file = Bun.file(tmpPath)
      const buffer = await file.arrayBuffer()
      // Clean up temp file
      Bun.spawnSync({
        cmd: ['rm', '-f', tmpPath],
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const base64 = Buffer.from(buffer).toString('base64')
      return `data:image/png;base64,${base64}`
    } catch {
      return null
    }
  }
}

// ─── macOS Capture Backend ────────────────────────────────────────────────────

/**
 * macOS input capture using CoreGraphics CGEvent tap via osascript/JXA.
 *
 * Strategy:
 * - Uses a subprocess that runs a JXA script with ObjC bridge to create
 *   a CGEvent tap and log events to stdout as JSON lines.
 * - Window context via NSWorkspace (frontmostApplication).
 * - Screenshots via screencapture CLI.
 *
 * Note: CGEvent tap requires Accessibility permissions.
 */
class DarwinCaptureBackend implements InputCaptureBackend {
  readonly platform: Platform = 'darwin'

  get isAvailable(): boolean {
    return process.platform === 'darwin'
  }

  async startCapture(
    callback: (event: RawInputEvent) => void,
  ): Promise<CaptureHandle> {
    let active = true

    // Use osascript with JXA + ObjC bridge to set up CGEvent tap
    // This script creates a CGEvent tap, logs events as JSON lines to stdout
    const tapScript = `
ObjC.import("CoreGraphics");
ObjC.import("Foundation");
ObjC.import("AppKit");

var mask = (1 << 1) | (1 << 2) | (1 << 5) | (1 << 6) |  // mouse down/up/moved/dragged
           (1 << 3) | (1 << 4) |  // right mouse
           (1 << 25) | (1 << 26) | (1 << 27) |  // other mouse
           (1 << 10) | (1 << 11) |  // key down/up
           (1 << 22);  // scroll wheel

function eventCallback(proxy, type, event, userInfo) {
  var loc = $.CGEventGetLocation(event);
  var ts = Date.now();
  var obj = {ts: ts, type: type, x: loc.x, y: loc.y};

  if (type === 10 || type === 11) {
    var keycode = $.CGEventGetIntegerValueField(event, 9);
    obj.keycode = keycode;
  }
  if (type === 22) {
    var dy = $.CGEventGetIntegerValueField(event, 11);
    var dx = $.CGEventGetIntegerValueField(event, 12);
    obj.dx = dx;
    obj.dy = dy;
  }
  if (type === 1 || type === 2 || type === 3 || type === 4 || type === 25 || type === 26) {
    var btn = $.CGEventGetIntegerValueField(event, 3);
    obj.button = btn;
  }
  $.NSFileHandle.fileHandleWithStandardOutput.writeData(
    $.NSString.stringWithString(JSON.stringify(obj) + "\\n")
      .dataUsingEncoding($.NSUTF8StringEncoding)
  );
  return event;
}

var tap = $.CGEventTapCreate(
  $.kCGSessionEventTap,
  $.kCGHeadInsertEventTap,
  $.kCGEventTapOptionListenOnly,
  mask,
  ObjC.wrap(eventCallback),
  null
);

if (!tap) {
  $.NSFileHandle.fileHandleWithStandardError.writeData(
    $.NSString.stringWithString("ERROR: Could not create event tap. Enable Accessibility.\\n")
      .dataUsingEncoding($.NSUTF8StringEncoding)
  );
  $.exit(1);
}

var source = $.CFMachPortCreateRunLoopSource(null, tap, 0);
$.CFRunLoopAddSource($.CFRunLoopGetCurrent(), source, $.kCFRunLoopDefaultMode);
$.CGEventTapEnable(tap, true);
$.CFRunLoopRun();
`

    const proc = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', tapScript], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const handle: CaptureHandle = {
      stop() {
        active = false
        proc.kill()
      },
      get isActive() {
        return active
      },
    }

    // Process stdout JSON lines
    const reader = proc.stdout.getReader()
    void this._processEventStream(reader, callback, () => active)

    return handle
  }

  private async _processEventStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    callback: (event: RawInputEvent) => void,
    isActive: () => boolean,
  ): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (isActive()) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line) as {
              ts: number
              type: number
              x: number
              y: number
              keycode?: number
              dx?: number
              dy?: number
              button?: number
            }
            const event = this._convertCGEvent(data)
            if (event) callback(event)
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Stream ended
    }
  }

  private _convertCGEvent(data: {
    ts: number
    type: number
    x: number
    y: number
    keycode?: number
    dx?: number
    dy?: number
    button?: number
  }): RawInputEvent | null {
    const { ts, type, x, y } = data

    // CGEventType mapping
    switch (type) {
      case 1: // kCGEventLeftMouseDown
        return { kind: 'mouse_down', timestamp: ts, x, y, button: 'left' }
      case 2: // kCGEventLeftMouseUp
        return { kind: 'mouse_up', timestamp: ts, x, y, button: 'left' }
      case 3: // kCGEventRightMouseDown
        return { kind: 'mouse_down', timestamp: ts, x, y, button: 'right' }
      case 4: // kCGEventRightMouseUp
        return { kind: 'mouse_up', timestamp: ts, x, y, button: 'right' }
      case 5: // kCGEventMouseMoved
      case 6: // kCGEventLeftMouseDragged
        return { kind: 'mouse_move', timestamp: ts, x, y }
      case 10: // kCGEventKeyDown
        return {
          kind: 'key_down',
          timestamp: ts,
          key: this._keycodeToName(data.keycode ?? 0),
          isChar: false,
        }
      case 11: // kCGEventKeyUp
        return {
          kind: 'key_up',
          timestamp: ts,
          key: this._keycodeToName(data.keycode ?? 0),
          isChar: false,
        }
      case 22: {
        // kCGEventScrollWheel
        return {
          kind: 'mouse_scroll',
          timestamp: ts,
          x,
          y,
          scrollDx: data.dx ?? 0,
          scrollDy: data.dy ?? 0,
        }
      }
      case 25: // kCGEventOtherMouseDown
        return { kind: 'mouse_down', timestamp: ts, x, y, button: 'middle' }
      case 26: // kCGEventOtherMouseUp
        return { kind: 'mouse_up', timestamp: ts, x, y, button: 'middle' }
      default:
        return null
    }
  }

  private _keycodeToName(keycode: number): string {
    // macOS virtual keycodes → key names
    const MAC_KEYCODE_MAP: Record<number, string> = {
      0: 'a',
      1: 's',
      2: 'd',
      3: 'f',
      4: 'h',
      5: 'g',
      6: 'z',
      7: 'x',
      8: 'c',
      9: 'v',
      11: 'b',
      12: 'q',
      13: 'w',
      14: 'e',
      15: 'r',
      16: 'y',
      17: 't',
      18: '1',
      19: '2',
      20: '3',
      21: '4',
      22: '6',
      23: '5',
      24: '=',
      25: '9',
      26: '7',
      27: '-',
      28: '8',
      29: '0',
      30: ']',
      31: 'o',
      32: 'u',
      33: '[',
      34: 'i',
      35: 'p',
      36: 'Return',
      37: 'l',
      38: 'j',
      39: "'",
      40: 'k',
      41: ';',
      42: '\\',
      43: ',',
      44: '/',
      45: 'n',
      46: 'm',
      47: '.',
      48: 'Tab',
      49: 'space',
      50: '`',
      51: 'BackSpace',
      53: 'Escape',
      55: 'Meta',
      56: 'Shift',
      57: 'CapsLock',
      58: 'Alt',
      59: 'Control',
      60: 'RShift',
      61: 'RAlt',
      62: 'RControl',
      123: 'Left',
      124: 'Right',
      125: 'Down',
      126: 'Up',
      115: 'Home',
      116: 'PageUp',
      117: 'Delete',
      119: 'End',
      121: 'PageDown',
      122: 'F1',
      120: 'F2',
      99: 'F3',
      118: 'F4',
      96: 'F5',
      97: 'F6',
      98: 'F7',
      100: 'F8',
      101: 'F9',
      109: 'F10',
      103: 'F11',
      111: 'F12',
    }
    return MAC_KEYCODE_MAP[keycode] ?? `keycode_${keycode}`
  }

  getWindowContext(): WindowContext | null {
    try {
      const result = Bun.spawnSync({
        cmd: [
          'osascript',
          '-e',
          `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set winTitle to ""
  try
    set winTitle to name of front window of frontApp
  end try
  return appName & "|" & winTitle
end tell`,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const out = new TextDecoder().decode(result.stdout).trim()
      if (!out.includes('|')) return null
      const [appName, windowTitle] = out.split('|', 2)
      return { app_name: appName!, window_title: windowTitle ?? '' }
    } catch {
      return null
    }
  }

  async captureScreenshot(): Promise<string | null> {
    try {
      const tmpPath = `/tmp/desktop-recorder-${Date.now()}.png`
      const result = Bun.spawnSync({
        cmd: ['screencapture', '-x', tmpPath],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (result.exitCode !== 0) return null

      const file = Bun.file(tmpPath)
      const buffer = await file.arrayBuffer()
      Bun.spawnSync({
        cmd: ['rm', '-f', tmpPath],
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const base64 = Buffer.from(buffer).toString('base64')
      return `data:image/png;base64,${base64}`
    } catch {
      return null
    }
  }
}

// ─── Windows Capture Backend ──────────────────────────────────────────────────

/**
 * Windows input capture using PowerShell + .NET SetWindowsHookEx.
 *
 * Strategy:
 * - Runs a PowerShell script that sets up low-level keyboard/mouse hooks
 *   via SetWindowsHookEx (WH_KEYBOARD_LL + WH_MOUSE_LL)
 * - Events are written to stdout as JSON lines
 * - Window context via GetForegroundWindow + GetWindowText
 */
class Win32CaptureBackend implements InputCaptureBackend {
  readonly platform: Platform = 'win32'

  get isAvailable(): boolean {
    return process.platform === 'win32'
  }

  async startCapture(
    callback: (event: RawInputEvent) => void,
  ): Promise<CaptureHandle> {
    let active = true

    const hookScript = `
Add-Type -Language CSharp @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class InputHook {
    public delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string lpModuleName);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);

    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)] public struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr dwExtraInfo; }

    static IntPtr kbHook, msHook;
    static LowLevelProc kbProc, msProc;

    public static void Run() {
        kbProc = KbCallback;
        msProc = MsCallback;
        using (var proc = Process.GetCurrentProcess())
        using (var mod = proc.MainModule) {
            var hMod = GetModuleHandle(mod.ModuleName);
            kbHook = SetWindowsHookEx(13, kbProc, hMod, 0);
            msHook = SetWindowsHookEx(14, msProc, hMod, 0);
        }
        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0)) {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }

    static IntPtr KbCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            var kb = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            var kind = ((int)wParam == 0x100 || (int)wParam == 0x104) ? "key_down" : "key_up";
            Console.WriteLine("{\\"kind\\":\\"" + kind + "\\",\\"ts\\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + ",\\"vk\\":" + kb.vkCode + "}");
            Console.Out.Flush();
        }
        return CallNextHookEx(kbHook, nCode, wParam, lParam);
    }

    static IntPtr MsCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            var ms = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
            var w = (int)wParam;
            string kind = "mouse_move";
            int scrollData = 0;
            if (w == 0x201) kind = "mouse_down_left";
            else if (w == 0x202) kind = "mouse_up_left";
            else if (w == 0x204) kind = "mouse_down_right";
            else if (w == 0x205) kind = "mouse_up_right";
            else if (w == 0x207) kind = "mouse_down_middle";
            else if (w == 0x208) kind = "mouse_up_middle";
            else if (w == 0x20A) { kind = "mouse_scroll"; scrollData = (short)(ms.mouseData >> 16); }
            else if (w == 0x200) kind = "mouse_move";
            Console.WriteLine("{\\"kind\\":\\"" + kind + "\\",\\"ts\\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + ",\\"x\\":" + ms.pt.X + ",\\"y\\":" + ms.pt.Y + ",\\"scroll\\":" + scrollData + "}");
            Console.Out.Flush();
        }
        return CallNextHookEx(msHook, nCode, wParam, lParam);
    }
}
'@

[InputHook]::Run()
`

    const proc = Bun.spawn(
      ['powershell', '-NoProfile', '-NonInteractive', '-Command', hookScript],
      { stdout: 'pipe', stderr: 'pipe' },
    )

    const handle: CaptureHandle = {
      stop() {
        active = false
        proc.kill()
      },
      get isActive() {
        return active
      },
    }

    // Process stdout JSON lines
    const reader = proc.stdout.getReader()
    void this._processEventStream(reader, callback, () => active)

    return handle
  }

  private async _processEventStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    callback: (event: RawInputEvent) => void,
    isActive: () => boolean,
  ): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (isActive()) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line) as Record<string, unknown>
            const event = this._convertWin32Event(data)
            if (event) callback(event)
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Stream ended
    }
  }

  private _convertWin32Event(
    data: Record<string, unknown>,
  ): RawInputEvent | null {
    const kind = data['kind'] as string
    const ts = data['ts'] as number
    const x = data['x'] as number | undefined
    const y = data['y'] as number | undefined

    if (kind === 'key_down' || kind === 'key_up') {
      const vk = data['vk'] as number
      return {
        kind,
        timestamp: ts,
        key: this._vkToName(vk),
        isChar: vk >= 0x30 && vk <= 0x5a,
      }
    }

    if (kind === 'mouse_move') {
      return { kind: 'mouse_move', timestamp: ts, x, y }
    }
    if (kind === 'mouse_down_left') {
      return { kind: 'mouse_down', timestamp: ts, x, y, button: 'left' }
    }
    if (kind === 'mouse_up_left') {
      return { kind: 'mouse_up', timestamp: ts, x, y, button: 'left' }
    }
    if (kind === 'mouse_down_right') {
      return { kind: 'mouse_down', timestamp: ts, x, y, button: 'right' }
    }
    if (kind === 'mouse_up_right') {
      return { kind: 'mouse_up', timestamp: ts, x, y, button: 'right' }
    }
    if (kind === 'mouse_down_middle') {
      return { kind: 'mouse_down', timestamp: ts, x, y, button: 'middle' }
    }
    if (kind === 'mouse_up_middle') {
      return { kind: 'mouse_up', timestamp: ts, x, y, button: 'middle' }
    }
    if (kind === 'mouse_scroll') {
      const scroll = data['scroll'] as number
      return {
        kind: 'mouse_scroll',
        timestamp: ts,
        x,
        y,
        scrollDy: scroll > 0 ? -1 : 1,
        scrollDx: 0,
      }
    }

    return null
  }

  private _vkToName(vk: number): string {
    const VK_NAMES: Record<number, string> = {
      8: 'BackSpace',
      9: 'Tab',
      13: 'Return',
      16: 'Shift',
      17: 'Control',
      18: 'Alt',
      19: 'Pause',
      20: 'CapsLock',
      27: 'Escape',
      32: 'space',
      33: 'PageUp',
      34: 'PageDown',
      35: 'End',
      36: 'Home',
      37: 'Left',
      38: 'Up',
      39: 'Right',
      40: 'Down',
      44: 'PrintScreen',
      45: 'Insert',
      46: 'Delete',
      91: 'Meta',
      92: 'Meta',
      112: 'F1',
      113: 'F2',
      114: 'F3',
      115: 'F4',
      116: 'F5',
      117: 'F6',
      118: 'F7',
      119: 'F8',
      120: 'F9',
      121: 'F10',
      122: 'F11',
      123: 'F12',
      144: 'NumLock',
      145: 'ScrollLock',
      160: 'Shift',
      161: 'Shift',
      162: 'Control',
      163: 'Control',
      164: 'Alt',
      165: 'Alt',
    }
    if (VK_NAMES[vk]) return VK_NAMES[vk]!
    // 0-9
    if (vk >= 0x30 && vk <= 0x39) return String.fromCharCode(vk)
    // A-Z
    if (vk >= 0x41 && vk <= 0x5a) return String.fromCharCode(vk + 32)
    return `vk_${vk}`
  }

  getWindowContext(): WindowContext | null {
    try {
      const script = `
Add-Type -Language CSharp @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
public class WinCtx {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
}
'@
$h = [WinCtx]::GetForegroundWindow()
$sb = New-Object Text.StringBuilder 256
[WinCtx]::GetWindowText($h, $sb, 256) | Out-Null
$pid = [uint32]0
[WinCtx]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
$p = Get-Process -Id $pid -EA SilentlyContinue
"$($p.ProcessName)|$($sb.ToString())"
`
      const result = Bun.spawnSync({
        cmd: [
          'powershell',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          script,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const out = new TextDecoder().decode(result.stdout).trim()
      if (!out.includes('|')) return null
      const [appName, windowTitle] = out.split('|', 2)
      return { app_name: appName!, window_title: windowTitle ?? '' }
    } catch {
      return null
    }
  }

  async captureScreenshot(): Promise<string | null> {
    try {
      const tmpPath = `${process.env['TEMP'] ?? 'C:\\\\Temp'}\\desktop-recorder-${Date.now()}.png`
      const script = `
Add-Type -AssemblyName System.Windows.Forms
$bmp = New-Object Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)
$g = [Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
$bmp.Save('${tmpPath}')
$g.Dispose()
$bmp.Dispose()
[Convert]::ToBase64String([IO.File]::ReadAllBytes('${tmpPath}'))
Remove-Item '${tmpPath}' -ErrorAction SilentlyContinue
`
      const result = Bun.spawnSync({
        cmd: [
          'powershell',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          script,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const base64 = new TextDecoder().decode(result.stdout).trim()
      if (!base64) return null
      return `data:image/png;base64,${base64}`
    } catch {
      return null
    }
  }
}

// ─── Desktop Recorder (Orchestrator) ──────────────────────────────────────────

/** Configuration for the desktop recorder. */
export interface DesktopRecorderOptions {
  /** Override platform detection (for testing). */
  platform?: Platform
  /** Custom capture backend (for testing/mocking). */
  backend?: InputCaptureBackend
  /** Whether to capture screenshots (default: true). */
  captureScreenshots?: boolean
  /** Minimum interval between screenshots in ms (default: 500). */
  screenshotIntervalMs?: number
  /** Mouse move throttle interval in ms (default: 50). */
  mouseMoveThrottleMs?: number
  /** Click timeout for detecting double/triple clicks in ms (default: 300). */
  multiClickTimeoutMs?: number
}

/**
 * DesktopRecorder — orchestrates platform-specific input capture
 * and transforms raw input events into RawActionEvent format.
 *
 * Follows the same pattern as CdpRecorder but for native desktop events.
 */
export class DesktopRecorder {
  private _backend: InputCaptureBackend | null
  private _captureHandle: CaptureHandle | null = null
  private _session: RecordingSession | null = null
  private _status: RecordingStatus = 'stopped'
  private _options: Required<
    Omit<DesktopRecorderOptions, 'platform' | 'backend'>
  >
  private _eventListeners: Array<(event: RecorderEvent) => void> = []
  private _lastScreenshotTime = 0
  private _lastMouseMoveTime = 0
  private _clickBuffer: Array<{
    timestamp: number
    x: number
    y: number
    button: string
  }> = []
  private _clickTimer: ReturnType<typeof setTimeout> | null = null
  private _dragState: {
    startX: number
    startY: number
    startTime: number
  } | null = null
  private _keyDownState: Map<string, number> = new Map() // key → timestamp

  constructor(options: DesktopRecorderOptions = {}) {
    this._options = {
      captureScreenshots: options.captureScreenshots ?? true,
      screenshotIntervalMs: options.screenshotIntervalMs ?? 500,
      mouseMoveThrottleMs: options.mouseMoveThrottleMs ?? 50,
      multiClickTimeoutMs: options.multiClickTimeoutMs ?? 300,
    }

    if (options.backend) {
      this._backend = options.backend
    } else {
      this._backend = this._loadBackend(options.platform)
    }
  }

  /** Whether the recorder is available on the current platform. */
  get isAvailable(): boolean {
    return this._backend?.isAvailable ?? false
  }

  /** Current recording status. */
  get status(): RecordingStatus {
    return this._status
  }

  /** Current recording session (null if not recording). */
  get session(): RecordingSession | null {
    return this._session
  }

  /** Register an event listener. */
  on(listener: (event: RecorderEvent) => void): void {
    this._eventListeners.push(listener)
  }

  /** Remove an event listener. */
  off(listener: (event: RecorderEvent) => void): void {
    this._eventListeners = this._eventListeners.filter(l => l !== listener)
  }

  /** Start recording desktop events. */
  async start(options?: RecorderStartOptions): Promise<void> {
    if (!this._backend) {
      throw new Error('No capture backend available for current platform')
    }
    if (this._status === 'recording') {
      throw new Error('Already recording')
    }

    const sessionId = `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this._session = {
      id: sessionId,
      startTime: Date.now(),
      endTime: 0,
      status: 'recording',
      events: [],
      metadata: {
        platform: this._backend.platform,
        screen_width: 1920, // Will be updated on first screenshot
        screen_height: 1080,
        task_description: options?.taskDescription,
      },
    }
    this._status = 'recording'
    this._lastScreenshotTime = 0
    this._lastMouseMoveTime = 0
    this._clickBuffer = []
    this._dragState = null
    this._keyDownState.clear()

    // Start capture
    this._captureHandle = await this._backend.startCapture(rawEvent => {
      if (this._status === 'recording') {
        this._handleRawEvent(rawEvent)
      }
    })

    this._emit({ type: 'started', sessionId })
  }

  /** Stop recording and return the session. */
  async stop(): Promise<RecorderStopResult> {
    if (!this._session || !this._captureHandle) {
      throw new Error('Not recording')
    }

    this._captureHandle.stop()
    this._captureHandle = null
    this._status = 'stopped'
    this._session.endTime = Date.now()
    this._session.status = 'stopped'

    // Flush any pending click buffer
    this._flushClickBuffer()

    const session = this._session
    const outputPath = `recording-${session.id}.json`

    this._emit({ type: 'stopped', session })

    return { session, outputPath }
  }

  /** Pause recording (stops capturing events but keeps session active). */
  pause(): void {
    if (this._status !== 'recording') return
    this._status = 'paused'
    this._emit({ type: 'paused' })
  }

  /** Resume recording after pause. */
  resume(): void {
    if (this._status !== 'paused') return
    this._status = 'recording'
    this._emit({ type: 'resumed' })
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  private _loadBackend(platform?: Platform): InputCaptureBackend | null {
    const p = platform ?? (process.platform as Platform)

    if (p === 'linux') {
      const backend = new LinuxCaptureBackend()
      return backend.isAvailable ? backend : null
    }
    if (p === 'darwin') {
      const backend = new DarwinCaptureBackend()
      return backend.isAvailable ? backend : null
    }
    if (p === 'win32') {
      const backend = new Win32CaptureBackend()
      return backend.isAvailable ? backend : null
    }
    return null
  }

  private _emit(event: RecorderEvent): void {
    for (const listener of this._eventListeners) {
      listener(event)
    }
  }

  private _handleRawEvent(raw: RawInputEvent): void {
    switch (raw.kind) {
      case 'mouse_move':
        this._handleMouseMove(raw)
        break
      case 'mouse_down':
        this._handleMouseDown(raw)
        break
      case 'mouse_up':
        this._handleMouseUp(raw)
        break
      case 'mouse_scroll':
        this._handleMouseScroll(raw)
        break
      case 'key_down':
        this._handleKeyDown(raw)
        break
      case 'key_up':
        this._handleKeyUp(raw)
        break
      case 'window_focus':
        // Window focus changes are tracked implicitly via getWindowContext()
        break
    }
  }

  private _handleMouseMove(raw: RawInputEvent): void {
    // Throttle mouse move events
    if (
      raw.timestamp - this._lastMouseMoveTime <
      this._options.mouseMoveThrottleMs
    ) {
      return
    }
    this._lastMouseMoveTime = raw.timestamp

    // If we have a drag state, this is a drag operation (don't emit move)
    if (this._dragState) return

    this._addEvent({
      action: 'mouse_move',
      coordinate: [raw.x ?? 0, raw.y ?? 0],
      timestamp: raw.timestamp,
      screenshot_before: null,
      screenshot_after: null,
      window_context: this._getWindowContext(),
    })
  }

  private _handleMouseDown(raw: RawInputEvent): void {
    // Track drag start
    if (raw.button === 'left') {
      this._dragState = {
        startX: raw.x ?? 0,
        startY: raw.y ?? 0,
        startTime: raw.timestamp,
      }
    }
  }

  private _handleMouseUp(raw: RawInputEvent): void {
    const x = raw.x ?? 0
    const y = raw.y ?? 0

    // Check if this was a drag (significant movement from down position)
    if (this._dragState && raw.button === 'left') {
      const dx = Math.abs(x - this._dragState.startX)
      const dy = Math.abs(y - this._dragState.startY)

      if (dx > 5 || dy > 5) {
        // This was a drag
        this._addEvent({
          action: 'left_click_drag',
          start_coordinate: [this._dragState.startX, this._dragState.startY],
          coordinate: [x, y],
          timestamp: raw.timestamp,
          screenshot_before: null,
          screenshot_after: null,
          window_context: this._getWindowContext(),
        })
        this._dragState = null
        return
      }
      this._dragState = null
    }

    // This is a click — add to click buffer for multi-click detection
    this._clickBuffer.push({
      timestamp: raw.timestamp,
      x,
      y,
      button: raw.button ?? 'left',
    })

    if (this._clickTimer) clearTimeout(this._clickTimer)
    this._clickTimer = setTimeout(() => {
      this._flushClickBuffer()
    }, this._options.multiClickTimeoutMs)
  }

  private _flushClickBuffer(): void {
    if (this._clickBuffer.length === 0) return

    const clicks = this._clickBuffer
    this._clickBuffer = []
    if (this._clickTimer) {
      clearTimeout(this._clickTimer)
      this._clickTimer = null
    }

    // Group rapid clicks at same position
    const lastClick = clicks[clicks.length - 1]!
    const button = lastClick.button

    let action: RecordableAction
    if (button === 'right') {
      action = 'right_click'
    } else if (button === 'middle') {
      action = 'middle_click'
    } else if (clicks.length >= 3) {
      action = 'triple_click'
    } else if (clicks.length === 2) {
      action = 'double_click'
    } else {
      action = 'left_click'
    }

    this._addEvent({
      action,
      coordinate: [lastClick.x, lastClick.y],
      timestamp: lastClick.timestamp,
      screenshot_before: null,
      screenshot_after: null,
      window_context: this._getWindowContext(),
    })
  }

  private _handleMouseScroll(raw: RawInputEvent): void {
    let direction: ScrollDirection
    const dy = raw.scrollDy ?? 0
    const dx = raw.scrollDx ?? 0

    if (Math.abs(dy) >= Math.abs(dx)) {
      direction = dy > 0 ? 'down' : 'up'
    } else {
      direction = dx > 0 ? 'right' : 'left'
    }

    this._addEvent({
      action: 'scroll',
      coordinate: [raw.x ?? 0, raw.y ?? 0],
      scroll_direction: direction,
      scroll_amount: Math.max(Math.abs(dy), Math.abs(dx)),
      timestamp: raw.timestamp,
      screenshot_before: null,
      screenshot_after: null,
      window_context: this._getWindowContext(),
    })
  }

  private _handleKeyDown(raw: RawInputEvent): void {
    const key = raw.key ?? ''
    // Track key down for hold_key detection
    if (!this._keyDownState.has(key)) {
      this._keyDownState.set(key, raw.timestamp)
    }
  }

  private _handleKeyUp(raw: RawInputEvent): void {
    const key = raw.key ?? ''
    const downTime = this._keyDownState.get(key)
    this._keyDownState.delete(key)

    if (!downTime) return

    const holdDuration = raw.timestamp - downTime

    // If held for more than 500ms, emit as hold_key
    if (holdDuration > 500) {
      this._addEvent({
        action: 'hold_key',
        text: key,
        duration: holdDuration / 1000,
        timestamp: downTime,
        screenshot_before: null,
        screenshot_after: null,
        window_context: this._getWindowContext(),
      })
    } else if (raw.isChar && key.length === 1) {
      // Character key — emit as type
      this._addEvent({
        action: 'type',
        text: key,
        timestamp: raw.timestamp,
        screenshot_before: null,
        screenshot_after: null,
        window_context: this._getWindowContext(),
      })
    } else {
      // Special key — emit as key
      this._addEvent({
        action: 'key',
        text: key,
        timestamp: raw.timestamp,
        screenshot_before: null,
        screenshot_after: null,
        window_context: this._getWindowContext(),
      })
    }
  }

  private _getWindowContext(): WindowContext {
    const ctx = this._backend?.getWindowContext()
    return ctx ?? { app_name: 'unknown', window_title: '' }
  }

  private _addEvent(event: RawActionEvent): void {
    if (!this._session) return

    this._session.events.push(event)
    this._emit({ type: 'event_captured', event })

    // Trigger screenshot if enough time has passed
    if (this._options.captureScreenshots) {
      this._maybeCapture(event)
    }
  }

  private _maybeCapture(event: RawActionEvent): void {
    const now = event.timestamp
    if (now - this._lastScreenshotTime < this._options.screenshotIntervalMs)
      return
    this._lastScreenshotTime = now

    // Async screenshot capture — don't block event processing
    void this._backend?.captureScreenshot().then(screenshot => {
      if (screenshot) {
        event.screenshot_after = screenshot
      }
    })
  }
}

// ─── Factory & Exports ────────────────────────────────────────────────────────

/**
 * Load the platform-appropriate capture backend.
 */
export function loadCaptureBackend(
  platform?: Platform,
): InputCaptureBackend | null {
  const p = platform ?? (process.platform as Platform)

  if (p === 'linux') {
    const backend = new LinuxCaptureBackend()
    return backend.isAvailable ? backend : null
  }
  if (p === 'darwin') {
    const backend = new DarwinCaptureBackend()
    return backend.isAvailable ? backend : null
  }
  if (p === 'win32') {
    const backend = new Win32CaptureBackend()
    return backend.isAvailable ? backend : null
  }
  return null
}
