/// <reference types="vite/client" />

import type { NexaWorkAPI } from '../preload/index'

declare global {
  interface Window {
    nexawork: NexaWorkAPI
  }
}
