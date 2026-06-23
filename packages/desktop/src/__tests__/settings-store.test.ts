/**
 * SettingsStore (N21) — persistence layer unit tests.
 * Covers in-memory mode, on-disk persistence (atomic write), reset semantics,
 * default merging, and corrupt-file recovery.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  SettingsStore,
  getSettingsStore,
  initSettingsStore,
} from '../main/backend/settings-store'

const DEFAULTS = { theme: 'light', language: 'zh-CN', fontSize: 14 }

describe('SettingsStore (in-memory)', () => {
  test('starts from defaults', () => {
    const store = new SettingsStore(null, DEFAULTS)
    expect(store.all()).toEqual(DEFAULTS)
    expect(store.get('theme')).toBe('light')
  })

  test('set + get roundtrip', () => {
    const store = new SettingsStore(null, DEFAULTS)
    store.set('theme', 'dark')
    expect(store.get('theme')).toBe('dark')
  })

  test('setMany applies a batch', () => {
    const store = new SettingsStore(null, DEFAULTS)
    store.setMany({ fontSize: 18, language: 'ja' })
    expect(store.get('fontSize')).toBe(18)
    expect(store.get('language')).toBe('ja')
  })

  test('supports dotted keys alongside typed fields', () => {
    const store = new SettingsStore(null, DEFAULTS)
    store.set('apiKeys.anthropic', 'sk-test')
    expect(store.get('apiKeys.anthropic')).toBe('sk-test')
  })

  test('reset(key) with a default restores it', () => {
    const store = new SettingsStore(null, DEFAULTS)
    store.set('fontSize', 20)
    store.reset('fontSize')
    expect(store.get('fontSize')).toBe(14)
  })

  test('reset(key) without a default removes it', () => {
    const store = new SettingsStore(null, DEFAULTS)
    store.set('custom', 'x')
    store.reset('custom')
    expect(store.get('custom')).toBeUndefined()
  })

  test('reset() restores all defaults and drops extras', () => {
    const store = new SettingsStore(null, DEFAULTS)
    store.set('fontSize', 20)
    store.set('custom', 'x')
    store.reset()
    expect(store.all()).toEqual(DEFAULTS)
  })
})

describe('SettingsStore (on-disk)', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexawork-settings-'))
    file = join(dir, 'nested', 'settings.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('persists to disk and reloads in a new instance', () => {
    const a = new SettingsStore(file, DEFAULTS)
    a.set('theme', 'dark')
    a.set('fontSize', 16)
    expect(existsSync(file)).toBe(true)

    const b = new SettingsStore(file, DEFAULTS)
    expect(b.get('theme')).toBe('dark')
    expect(b.get('fontSize')).toBe(16)
  })

  test('merges persisted overrides over defaults', () => {
    const a = new SettingsStore(file, DEFAULTS)
    a.set('theme', 'dark')
    // New default key absent from file should still surface from defaults.
    const b = new SettingsStore(file, { ...DEFAULTS, newKey: 'present' })
    expect(b.get('theme')).toBe('dark')
    expect(b.get('newKey')).toBe('present')
  })

  test('recovers from a corrupt file by using defaults', () => {
    const a = new SettingsStore(file, DEFAULTS)
    a.set('theme', 'dark')
    writeFileSync(file, '{ this is not json', 'utf-8')
    const b = new SettingsStore(file, DEFAULTS)
    expect(b.all()).toEqual(DEFAULTS)
  })
})

describe('singleton management', () => {
  test('initSettingsStore replaces the singleton', () => {
    const a = initSettingsStore(null, DEFAULTS)
    expect(getSettingsStore()).toBe(a)
    const b = initSettingsStore(null, DEFAULTS)
    expect(getSettingsStore()).toBe(b)
    expect(b).not.toBe(a)
  })
})
