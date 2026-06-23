/**
 * Operation Memory Store (N22) — unit tests
 * Covers add/list/delete/clear/prune ordering and the file-backed
 * persistence round-trip (write → reopen).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MemoryStore } from '../main/backend/memory-store'

describe('MemoryStore — in-memory', () => {
  let store: MemoryStore
  beforeEach(() => {
    store = new MemoryStore(null)
  })

  test('starts empty', () => {
    expect(store.list()).toHaveLength(0)
    expect(store.count()).toBe(0)
  })

  test('add returns an entry with id/category/createdAt', () => {
    const entry = store.add({ content: 'remember this' })
    expect(entry.id).toMatch(/^mem-/)
    expect(entry.content).toBe('remember this')
    expect(entry.category).toBe('general')
    expect(entry.createdAt).toBeTruthy()
    expect(store.count()).toBe(1)
  })

  test('add honours an explicit category', () => {
    const entry = store.add({ content: 'pref', category: 'preference' })
    expect(entry.category).toBe('preference')
  })

  test('list returns newest entries first', () => {
    const older = store.add({ content: 'a' })
    older.createdAt = '2020-01-01T00:00:00.000Z'
    const newer = store.add({ content: 'b' })
    newer.createdAt = '2024-01-01T00:00:00.000Z'
    const list = store.list()
    expect(list[0].content).toBe('b')
    expect(list[1].content).toBe('a')
  })

  test('delete removes a single entry by id', () => {
    const a = store.add({ content: 'a' })
    store.add({ content: 'b' })
    expect(store.delete(a.id)).toBe(true)
    expect(store.count()).toBe(1)
    expect(store.list().some(e => e.id === a.id)).toBe(false)
  })

  test('delete returns false for unknown id', () => {
    expect(store.delete('nope')).toBe(false)
  })

  test('clear removes everything', () => {
    store.add({ content: 'a' })
    store.add({ content: 'b' })
    store.clear()
    expect(store.count()).toBe(0)
  })

  test('prune drops entries older than retentionDays', () => {
    const old = store.add({ content: 'old' })
    old.createdAt = new Date(Date.now() - 40 * 86400000).toISOString()
    store.add({ content: 'fresh' })
    const pruned = store.prune(30)
    expect(pruned).toBe(1)
    expect(store.count()).toBe(1)
    expect(store.list()[0].content).toBe('fresh')
  })

  test('prune is a no-op when nothing is stale', () => {
    store.add({ content: 'fresh' })
    expect(store.prune(30)).toBe(0)
    expect(store.count()).toBe(1)
  })
})

describe('MemoryStore — file persistence', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexawork-mem-'))
    file = join(dir, 'memory.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('persists to disk and reloads on reopen', () => {
    const store = new MemoryStore(file)
    store.add({ content: 'persisted', category: 'fact' })
    expect(existsSync(file)).toBe(true)

    const reopened = new MemoryStore(file)
    const list = reopened.list()
    expect(list).toHaveLength(1)
    expect(list[0].content).toBe('persisted')
    expect(list[0].category).toBe('fact')
  })

  test('delete and clear are durable across reopen', () => {
    const store = new MemoryStore(file)
    const a = store.add({ content: 'a' })
    store.add({ content: 'b' })
    store.delete(a.id)
    expect(new MemoryStore(file).count()).toBe(1)

    store.clear()
    expect(new MemoryStore(file).count()).toBe(0)
  })

  test('a missing file yields an empty store', () => {
    const store = new MemoryStore(join(dir, 'does-not-exist.json'))
    expect(store.count()).toBe(0)
  })
})
