/**
 * Secure Store (N22) — unit tests
 * Covers per-provider API-key set/get/has/delete/status, the base64 fallback
 * when OS encryption is unavailable, encrypted-at-rest behaviour with a fake
 * safeStorage, and the file-backed persistence round-trip.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SecureStore } from '../main/backend/secure-store'

/** A reversible fake of Electron safeStorage (XOR-ish, never plaintext). */
function makeFakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf-8'),
    decryptString: (buf: Buffer) => buf.toString('utf-8').replace(/^enc:/, ''),
  }
}

describe('SecureStore — in-memory (base64 fallback)', () => {
  let store: SecureStore
  beforeEach(() => {
    store = new SecureStore(null, null)
  })

  test('starts empty', () => {
    expect(store.status()).toEqual({})
    expect(store.has('anthropic')).toBe(false)
    expect(store.get('anthropic')).toBeUndefined()
  })

  test('set then get round-trips the key', () => {
    store.set('anthropic', 'sk-ant-123')
    expect(store.get('anthropic')).toBe('sk-ant-123')
    expect(store.has('anthropic')).toBe(true)
  })

  test('set with empty value clears the key', () => {
    store.set('openai', 'sk-1')
    store.set('openai', '')
    expect(store.has('openai')).toBe(false)
  })

  test('delete removes a configured key', () => {
    store.set('grok', 'xai-1')
    expect(store.delete('grok')).toBe(true)
    expect(store.has('grok')).toBe(false)
  })

  test('delete returns false for unknown provider', () => {
    expect(store.delete('nope')).toBe(false)
  })

  test('status reports configured providers without exposing values', () => {
    store.set('anthropic', 'sk-secretvalue')
    store.set('openai', 'pk-anothervalue')
    const status = store.status()
    expect(status).toEqual({ anthropic: true, openai: true })
    expect(Object.values(status).every(v => v === true)).toBe(true)
    expect(JSON.stringify(status)).not.toContain('secretvalue')
  })

  test('reports encryption unavailable in fallback mode', () => {
    expect(store.isEncryptionAvailable()).toBe(false)
  })
})

describe('SecureStore — with fake safeStorage', () => {
  test('uses OS encryption when available', () => {
    const store = new SecureStore(null, makeFakeSafeStorage(true))
    expect(store.isEncryptionAvailable()).toBe(true)
    store.set('anthropic', 'sk-secret')
    expect(store.get('anthropic')).toBe('sk-secret')
  })

  test('falls back to base64 when encryption unavailable', () => {
    const store = new SecureStore(null, makeFakeSafeStorage(false))
    expect(store.isEncryptionAvailable()).toBe(false)
    store.set('openai', 'sk-plain')
    expect(store.get('openai')).toBe('sk-plain')
  })
})

describe('SecureStore — file persistence', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexawork-secure-'))
    file = join(dir, 'keys.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('encrypted keys persist and reload (never plaintext on disk)', () => {
    const safe = makeFakeSafeStorage(true)
    const store = new SecureStore(file, safe)
    store.set('anthropic', 'sk-ant-topsecret')

    const onDisk = readFileSync(file, 'utf-8')
    expect(onDisk).not.toContain('sk-ant-topsecret')

    const reopened = new SecureStore(file, safe)
    expect(reopened.get('anthropic')).toBe('sk-ant-topsecret')
    expect(reopened.status()).toEqual({ anthropic: true })
  })

  test('delete is durable across reopen', () => {
    const safe = makeFakeSafeStorage(true)
    const store = new SecureStore(file, safe)
    store.set('a', '1')
    store.set('b', '2')
    store.delete('a')
    expect(new SecureStore(file, safe).has('a')).toBe(false)
    expect(new SecureStore(file, safe).has('b')).toBe(true)
  })
})
