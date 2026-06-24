/**
 * Monaco bootstrap (N28)
 * ======================
 * `@monaco-editor/react` defaults to fetching Monaco from a CDN, which does not
 * work inside an offline Electron app. We instead bundle `monaco-editor`
 * locally and point the loader at it, and wire the language web-workers through
 * Vite's `?worker` imports so syntax services (TS/JSON/CSS/HTML) run off the UI
 * thread.
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let configured = false

/** Configure Monaco once: local loader + per-language workers. Idempotent. */
export function setupMonaco(): void {
  if (configured) return
  configured = true

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case 'json':
          return new jsonWorker()
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker()
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker()
        case 'typescript':
        case 'javascript':
          return new tsWorker()
        default:
          return new editorWorker()
      }
    },
  }

  loader.config({ monaco })
}
