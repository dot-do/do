/**
 * Tests for Schedule Context
 *
 * @module context/__tests__/schedule
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createEveryContext, ScheduleRegistry, describeCron } from './schedule'
import type { EveryContext, DOContext } from '../types/context'

describe('ScheduleRegistry', () => {
  let registry: ScheduleRegistry

  beforeEach(() => {
    registry = new ScheduleRegistry()
  })

  describe('register', () => {
    it('should register a schedule', () => {
      const handler = vi.fn()
      registry.register('0 * * * *', 'hour', handler)

      const schedules = registry.getSchedules('0 * * * *')
      expect(schedules.length).toBe(1)
    })

    it('should register multiple schedules for same cron', () => {
      registry.register('0 * * * *', 'hour', vi.fn())
      registry.register('0 * * * *', 'hour', vi.fn())

      const schedules = registry.getSchedules('0 * * * *')
      expect(schedules.length).toBe(2)
    })
  })

  describe('execute', () => {
    it('should execute handlers for a cron expression', async () => {
      const handler = vi.fn()
      registry.register('0 * * * *', 'hour', handler)

      const mockContext = { $id: 'test' } as DOContext
      await registry.execute('0 * * * *', mockContext)

      expect(handler).toHaveBeenCalledWith(mockContext)
    })

    it('should handle errors gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'))
      registry.register('0 * * * *', 'hour', errorHandler)

      const mockContext = { $id: 'test' } as DOContext
      await expect(
        registry.execute('0 * * * *', mockContext)
      ).resolves.not.toThrow()
    })
  })

  describe('getCronExpressions', () => {
    it('should return all registered cron expressions', () => {
      registry.register('0 * * * *', 'hour', vi.fn())
      registry.register('0 0 * * *', 'day', vi.fn())

      const crons = registry.getCronExpressions()
      expect(crons).toContain('0 * * * *')
      expect(crons).toContain('0 0 * * *')
    })
  })
})

describe('EveryContext', () => {
  let every: EveryContext
  let registry: ScheduleRegistry

  beforeEach(() => {
    registry = new ScheduleRegistry()
    every = createEveryContext(registry)
  })

  describe('Simple intervals', () => {
    it('should register every.second', () => {
      every.second(vi.fn())
      expect(registry.getCronExpressions()).toContain('* * * * * *')
    })

    it('should register every.minute', () => {
      every.minute(vi.fn())
      expect(registry.getCronExpressions()).toContain('* * * * *')
    })

    it('should register every.hour', () => {
      every.hour(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 * * * *')
    })

    it('should register every.day', () => {
      every.day(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * *')
    })

    it('should register every.week', () => {
      every.week(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 0')
    })

    it('should register every.month', () => {
      every.month(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 1 * *')
    })
  })

  describe('Custom intervals', () => {
    it('should register every.minutes(n)', () => {
      every.minutes(15)(vi.fn())
      expect(registry.getCronExpressions()).toContain('*/15 * * * *')
    })

    it('should register every.hours(n)', () => {
      every.hours(4)(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 */4 * * *')
    })
  })

  describe('Day-based schedules', () => {
    it('should register every.Monday', () => {
      every.Monday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 1')
    })

    it('should register every.Tuesday', () => {
      every.Tuesday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 2')
    })

    it('should register every.Wednesday', () => {
      every.Wednesday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 3')
    })

    it('should register every.Thursday', () => {
      every.Thursday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 4')
    })

    it('should register every.Friday', () => {
      every.Friday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 5')
    })

    it('should register every.Saturday', () => {
      every.Saturday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 6')
    })

    it('should register every.Sunday', () => {
      every.Sunday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 0')
    })

    it('should register every.weekday', () => {
      every.weekday(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 1-5')
    })

    it('should register every.weekend', () => {
      every.weekend(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 0,6')
    })
  })

  describe('Time slots', () => {
    it('should register every.Monday.at9am', () => {
      every.Monday.at9am(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 9 * * 1')
    })

    it('should register every.Friday.at5pm', () => {
      every.Friday.at5pm(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 17 * * 5')
    })

    it('should register every.weekday.at6pm', () => {
      every.weekday.at6pm(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 18 * * 1-5')
    })

    it('should register every.Sunday.atmidnight', () => {
      every.Sunday.atmidnight(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 0 * * 0')
    })

    it('should register every.Tuesday.atnoon', () => {
      every.Tuesday.atnoon(vi.fn())
      expect(registry.getCronExpressions()).toContain('0 12 * * 2')
    })
  })
})

describe('describeCron', () => {
  it('should describe common patterns', () => {
    expect(describeCron('* * * * *')).toBe('every minute')
    expect(describeCron('0 * * * *')).toBe('every hour')
    expect(describeCron('0 0 * * *')).toBe('every day at midnight')
    expect(describeCron('0 0 * * 1')).toBe('every Monday at midnight')
  })

  it('should describe time-based patterns', () => {
    expect(describeCron('0 9 * * 1')).toBe('Monday at 9am')
    expect(describeCron('0 17 * * 5')).toBe('Friday at 5pm')
    expect(describeCron('0 12 * * 0,6')).toBe('weekend at 12pm')
  })

  it('should return cron string for unknown patterns', () => {
    expect(describeCron('*/5 */2 * * *')).toBe('*/5 */2 * * *')
  })
})
