/**
 * NexaWork Secure Store (N22)
 * ===========================
 * Encrypted-at-rest persistence for per-provider API keys, backed by Electron's
 * {@link https://www.electronjs.org/docs/latest/api/safe-storage safeStorage}
 * (OS keychain / DPAPI). Plaintext keys never touch disk.
 *
 * When OS encryption is unavailable (e.g. headless CI, unit tests mocking
 * electron), it transparently degrades to a clearly-marked base64 fallback so
 * the feature still works end-to-end without crashing. Stored blobs are tagged
 * with a format prefix so the two encodings can coexist.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'

/** Minimal shape of Electron's safeStorage we rely on. */
interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

const ENCRYPTED_PREFIX = 'v1:'
const PLAINTEXT_PREFIX = 'p1:'

function loadSafeStorage(): SafeStorageLike | null {
  try {
    // Lazy require keeps this module importable under test electron mocks
    // that don't provide safeStorage.

    const electron = require('electron') as { safeStorage?: SafeStorageLike }
    const ss = electron.safeStorage
    if (ss && typeof ss.isEncryptionAvailable === 'function') return ss
    return null
  } catch {
    return null
  }
}

export class SecureStore {
  private data: Record<string, string>
  private readonly filePath: string | null
  private readonly safeStorage: SafeStorageLike | null

  constructor(
    filePath: string | null = null,
    safeStorage: SafeStorageLike | null = loadSafeStorage(),
  ) {
    this.filePath = filePath
    this.safeStorage = safeStorage
    this.data = this.load()
  }

  private load(): Record<string, string> {
    if (!this.filePath || !existsSync(this.filePath)) return {}
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as Record<string, string>
    } catch {
      return {}
    }
  }

  private persist(): void {
    if (!this.filePath) return
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }

  private encrypt(plain: string): string {
    if (this.safeStorage?.isEncryptionAvailable()) {
      const buf = this.safeStorage.encryptString(plain)
      return ENCRYPTED_PREFIX + buf.toString('base64')
    }
    return PLAINTEXT_PREFIX + Buffer.from(plain, 'utf-8').toString('base64')
  }

  private decrypt(blob: string): string | undefined {
    try {
      if (blob.startsWith(ENCRYPTED_PREFIX)) {
        if (!this.safeStorage) return undefined
        const buf = Buffer.from(blob.slice(ENCRYPTED_PREFIX.length), 'base64')
        return this.safeStorage.decryptString(buf)
      }
      if (blob.startsWith(PLAINTEXT_PREFIX)) {
        return Buffer.from(
          blob.slice(PLAINTEXT_PREFIX.length),
          'base64',
        ).toString('utf-8')
      }
      return undefined
    } catch {
      return undefined
    }
  }

  /** Store (or clear, when value is empty) the API key for a provider. */
  set(provider: string, value: string): void {
    if (!value) {
      this.delete(provider)
      return
    }
    this.data[provider] = this.encrypt(value)
    this.persist()
  }

  /** Decrypted API key for a provider, or undefined when not set. */
  get(provider: string): string | undefined {
    const blob = this.data[provider]
    return blob ? this.decrypt(blob) : undefined
  }

  has(provider: string): boolean {
    return Boolean(this.data[provider])
  }

  delete(provider: string): boolean {
    if (!(provider in this.data)) return false
    delete this.data[provider]
    this.persist()
    return true
  }

  /** Map of provider → whether a key is configured (never exposes values). */
  status(): Record<string, boolean> {
    const out: Record<string, boolean> = {}
    for (const provider of Object.keys(this.data)) out[provider] = true
    return out
  }

  /** Whether OS-level encryption is actually in use (vs base64 fallback). */
  isEncryptionAvailable(): boolean {
    return Boolean(this.safeStorage?.isEncryptionAvailable())
  }
}

// ─── Singleton management ─────────────────────────────────────
let instance: SecureStore | null = null

/** Initialize the singleton secure store. Pass null for in-memory (tests). */
export function initSecureStore(filePath: string | null): SecureStore {
  instance = new SecureStore(filePath)
  return instance
}

/** Get the singleton store, initializing an in-memory one on first use. */
export function getSecureStore(): SecureStore {
  if (!instance) instance = new SecureStore(null)
  return instance
}
