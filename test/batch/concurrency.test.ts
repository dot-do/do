import { describe, it, expect, beforeEach } from 'vitest'
import { ConcurrencyController } from '../../src/batch/concurrency'

describe('ConcurrencyController', () => {
  let controller: ConcurrencyController

  beforeEach(() => {
    controller = new ConcurrencyController({ initial: 20 })
  })

  describe('success tracking', () => {
    it('starts with initial concurrency', () => {
      expect(controller.current).toBe(20)
    })

    it('increases by 25% after 10 successes', () => {
      for (let i = 0; i < 10; i++) {
        controller.recordSuccess()
      }
      expect(controller.current).toBe(25) // 20 * 1.25 = 25
    })

    it('caps at maxConcurrency', () => {
      const ctrl = new ConcurrencyController({ initial: 90, max: 100 })
      for (let i = 0; i < 20; i++) {
        ctrl.recordSuccess()
      }
      expect(ctrl.current).toBeLessThanOrEqual(100)
    })

    it('resets streak on failure', () => {
      for (let i = 0; i < 5; i++) {
        controller.recordSuccess()
      }
      controller.recordError(new Error('test'))
      for (let i = 0; i < 5; i++) {
        controller.recordSuccess()
      }
      // Streak was reset, so 10 more successes needed
      expect(controller.current).toBeLessThan(25)
    })
  })

  describe('error handling', () => {
    it('decreases by 50% on rate limit (429)', () => {
      const error = new Error('Rate limited')
      ;(error as any).status = 429
      controller.recordError(error)
      expect(controller.current).toBe(10) // 20 * 0.5 = 10
    })

    it('decreases by 25% on other errors', () => {
      controller.recordError(new Error('Some error'))
      expect(controller.current).toBe(15) // 20 * 0.75 = 15
    })

    it('enforces minimum of 1', () => {
      const ctrl = new ConcurrencyController({ initial: 2 })
      ctrl.recordError(new Error())
      ctrl.recordError(new Error())
      ctrl.recordError(new Error())
      expect(ctrl.current).toBeGreaterThanOrEqual(1)
    })
  })

  describe('configuration', () => {
    it('accepts custom successStreak threshold', () => {
      const ctrl = new ConcurrencyController({
        initial: 10,
        successStreakThreshold: 5,
      })
      for (let i = 0; i < 5; i++) {
        ctrl.recordSuccess()
      }
      expect(ctrl.current).toBeGreaterThan(10)
    })

    it('calls onAdjust callback', () => {
      const adjustments: number[] = []
      const ctrl = new ConcurrencyController({
        initial: 20,
        onAdjust: (newValue) => adjustments.push(newValue),
      })
      ctrl.recordError(new Error())
      expect(adjustments).toContain(15)
    })
  })

  describe('canProceed', () => {
    it('returns true when under limit', () => {
      expect(controller.canProceed(5)).toBe(true)
    })

    it('returns false when at limit', () => {
      expect(controller.canProceed(20)).toBe(false)
    })
  })
})
