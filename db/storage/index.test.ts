/**
 * Storage Factory Tests
 *
 * Tests for the unified storage interface and factory function.
 *
 * @module @do/core/storage/__tests__/index.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  createStorage,
  StorageError,
  isTierAvailable,
  getTierInfo,
  type StorageConfig,
  type UnifiedStorage,
} from './index'

describe('createStorage', () => {
  describe('factory function', () => {
    it.todo('should create storage with all tiers when all bindings provided')

    it.todo('should create storage with hot only when only sqlite provided')

    it.todo('should create storage with hot and warm when sqlite and cache provided')

    it.todo('should throw when no bindings provided')
  })

  describe('unified interface', () => {
    it.todo('should insert to hot and invalidate warm')

    it.todo('should query from warm cache on cache hit')

    it.todo('should fall back to hot on warm cache miss')

    it.todo('should update in hot and invalidate warm')

    it.todo('should delete from hot and invalidate warm')

    it.todo('should emit CDC events for all mutations')
  })

  describe('archive', () => {
    it.todo('should archive old data to cold storage')

    it.todo('should delete archived data from hot when configured')

    it.todo('should apply partition configuration')
  })

  describe('sync', () => {
    it.todo('should sync changes between tiers')

    it.todo('should respect batch size limits')

    it.todo('should update sync state after successful sync')

    it.todo('should handle sync failures gracefully')
  })
})

describe('StorageError', () => {
  it('should include tier and operation info', () => {
    const error = new StorageError('Test error', 'Hot', 'insert')

    expect(error.message).toBe('Test error')
    expect(error.tier).toBe('Hot')
    expect(error.operation).toBe('insert')
    expect(error.name).toBe('StorageError')
  })

  it('should include cause when provided', () => {
    const cause = new Error('Original error')
    const error = new StorageError('Wrapper', 'Cold', 'query', cause)

    expect(error.cause).toBe(cause)
  })
})

describe('isTierAvailable', () => {
  it('should return true for hot when sqlite is configured', () => {
    const config: StorageConfig = {
      sqlite: {} as SqlStorage,
    }

    expect(isTierAvailable('Hot', config)).toBe(true)
  })

  it('should return false for hot when sqlite is not configured', () => {
    const config: StorageConfig = {}

    expect(isTierAvailable('Hot', config)).toBe(false)
  })

  it('should return true for warm when cache is configured', () => {
    const config: StorageConfig = {
      cache: {} as CacheStorage,
    }

    expect(isTierAvailable('Warm', config)).toBe(true)
  })

  it('should return true for cold when r2 is configured', () => {
    const config: StorageConfig = {
      r2: {} as R2Bucket,
    }

    expect(isTierAvailable('Cold', config)).toBe(true)
  })
})

describe('getTierInfo', () => {
  it('should return correct info for hot tier', () => {
    const info = getTierInfo('Hot')

    expect(info.tier).toBe('Hot')
    expect(info.name).toBe('Hot Storage')
    expect(info.technology).toContain('SQLite')
  })

  it('should return correct info for warm tier', () => {
    const info = getTierInfo('Warm')

    expect(info.tier).toBe('Warm')
    expect(info.name).toBe('Warm Storage')
    expect(info.cost).toBe('Free')
  })

  it('should return correct info for cold tier', () => {
    const info = getTierInfo('Cold')

    expect(info.tier).toBe('Cold')
    expect(info.name).toBe('Cold Storage')
    expect(info.technology).toContain('Iceberg')
  })
})
