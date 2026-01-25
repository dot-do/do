/**
 * Financial Metrics Tests
 *
 * @module financial/__tests__/metrics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MetricsCalculator,
  MetricsError,
  MetricsErrorCodes,
} from './metrics'
import type { Subscription, MRRMetrics } from '../../../types/financial'

describe('MetricsCalculator', () => {
  let calculator: MetricsCalculator

  beforeEach(() => {
    calculator = new MetricsCalculator()
  })

  // =========================================================================
  // MRR Metrics
  // =========================================================================

  describe('getMRRMetrics', () => {
    it.todo('should calculate starting MRR')
    it.todo('should calculate new MRR')
    it.todo('should calculate expansion MRR')
    it.todo('should calculate contraction MRR')
    it.todo('should calculate churned MRR')
    it.todo('should calculate reactivation MRR')
    it.todo('should calculate ending MRR')
    it.todo('should calculate net new MRR')
    it.todo('should calculate growth rate')
  })

  describe('getMRRMovements', () => {
    it.todo('should return list of movements')
    it.todo('should categorize new subscriptions')
    it.todo('should categorize upgrades')
    it.todo('should categorize downgrades')
    it.todo('should categorize cancellations')
    it.todo('should categorize reactivations')
  })

  describe('calculateSubscriptionMRR', () => {
    it('should calculate monthly subscription MRR', () => {
      const subscription: Partial<Subscription> = { quantity: 1 }
      const mrr = calculator.calculateSubscriptionMRR(
        subscription as Subscription,
        2900, // $29
        'month'
      )
      expect(mrr).toBe(2900)
    })

    it('should calculate annual subscription MRR', () => {
      const subscription: Partial<Subscription> = { quantity: 1 }
      const mrr = calculator.calculateSubscriptionMRR(
        subscription as Subscription,
        29900, // $299/year
        'year'
      )
      expect(mrr).toBe(2492) // $299/12 rounded
    })

    it('should multiply by quantity', () => {
      const subscription: Partial<Subscription> = { quantity: 5 }
      const mrr = calculator.calculateSubscriptionMRR(
        subscription as Subscription,
        1000, // $10/seat
        'month'
      )
      expect(mrr).toBe(5000) // $50
    })

    it('should default quantity to 1', () => {
      const subscription: Partial<Subscription> = {}
      const mrr = calculator.calculateSubscriptionMRR(
        subscription as Subscription,
        2900,
        'month'
      )
      expect(mrr).toBe(2900)
    })
  })

  describe('calculateARR', () => {
    it('should calculate ARR from MRR', () => {
      expect(calculator.calculateARR(10000)).toBe(120000)
    })
  })

  describe('getMRRTrend', () => {
    it.todo('should return MRR for each period')
    it.todo('should handle multiple periods')
  })

  // =========================================================================
  // Customer Metrics
  // =========================================================================

  describe('getCustomerMetrics', () => {
    it.todo('should calculate total customers')
    it.todo('should calculate new customers')
    it.todo('should calculate churned customers')
    it.todo('should calculate churn rate')
    it.todo('should calculate revenue churn rate')
    it.todo('should calculate ARPC')
  })

  describe('calculateChurnRate', () => {
    it('should calculate churn rate percentage', () => {
      expect(calculator.calculateChurnRate(5, 100)).toBe(5)
    })

    it('should handle zero starting customers', () => {
      expect(calculator.calculateChurnRate(0, 0)).toBe(0)
    })
  })

  describe('calculateRevenueChurnRate', () => {
    it('should calculate revenue churn rate', () => {
      expect(calculator.calculateRevenueChurnRate(1000, 50000)).toBe(2)
    })

    it('should handle zero starting MRR', () => {
      expect(calculator.calculateRevenueChurnRate(0, 0)).toBe(0)
    })
  })

  describe('calculateNetRevenueRetention', () => {
    it('should calculate NRR above 100%', () => {
      const metrics: MRRMetrics = {
        period: { start: 0, end: 0 },
        startingMRR: 100000,
        newMRR: 0,
        expansionMRR: 20000,
        contractionMRR: 5000,
        churnedMRR: 5000,
        reactivationMRR: 0,
        endingMRR: 110000,
        netNewMRR: 10000,
        growthRate: 10,
      }
      expect(calculator.calculateNetRevenueRetention(metrics)).toBeCloseTo(110, 5)
    })

    it('should calculate NRR below 100%', () => {
      const metrics: MRRMetrics = {
        period: { start: 0, end: 0 },
        startingMRR: 100000,
        newMRR: 0,
        expansionMRR: 5000,
        contractionMRR: 10000,
        churnedMRR: 15000,
        reactivationMRR: 0,
        endingMRR: 80000,
        netNewMRR: -20000,
        growthRate: -20,
      }
      expect(calculator.calculateNetRevenueRetention(metrics)).toBe(80)
    })

    it('should handle zero starting MRR', () => {
      const metrics: MRRMetrics = {
        period: { start: 0, end: 0 },
        startingMRR: 0,
        newMRR: 10000,
        expansionMRR: 0,
        contractionMRR: 0,
        churnedMRR: 0,
        reactivationMRR: 0,
        endingMRR: 10000,
        netNewMRR: 10000,
        growthRate: 100,
      }
      expect(calculator.calculateNetRevenueRetention(metrics)).toBe(100)
    })
  })

  describe('calculateGrossRevenueRetention', () => {
    it('should calculate GRR', () => {
      const metrics: MRRMetrics = {
        period: { start: 0, end: 0 },
        startingMRR: 100000,
        newMRR: 20000,
        expansionMRR: 10000,
        contractionMRR: 5000,
        churnedMRR: 5000,
        reactivationMRR: 0,
        endingMRR: 120000,
        netNewMRR: 20000,
        growthRate: 20,
      }
      // GRR = (100000 - 5000 - 5000) / 100000 = 90%
      expect(calculator.calculateGrossRevenueRetention(metrics)).toBe(90)
    })
  })

  // =========================================================================
  // Unit Economics
  // =========================================================================

  describe('getUnitEconomics', () => {
    it.todo('should calculate LTV')
    it.todo('should calculate CAC')
    it.todo('should calculate LTV/CAC ratio')
    it.todo('should calculate payback period')
    it.todo('should calculate gross margin')
  })

  describe('calculateLTV', () => {
    it('should calculate LTV', () => {
      // LTV = ARPU * Gross Margin / Churn Rate
      // LTV = 100 * 0.8 / 0.05 = 1600
      expect(calculator.calculateLTV(100, 80, 5)).toBe(1600)
    })

    it('should cap LTV when no churn', () => {
      const ltv = calculator.calculateLTV(100, 80, 0)
      expect(ltv).toBe(100 * 0.8 * 120) // 10 year cap
    })
  })

  describe('calculateCAC', () => {
    it('should calculate CAC', () => {
      expect(calculator.calculateCAC(50000, 100)).toBe(500)
    })

    it('should handle zero customers', () => {
      expect(calculator.calculateCAC(50000, 0)).toBe(0)
    })
  })

  describe('calculateCACPayback', () => {
    it('should calculate payback period', () => {
      // Payback = CAC / (ARPU * Gross Margin)
      // Payback = 500 / (100 * 0.8) = 6.25 months
      expect(calculator.calculateCACPayback(500, 100, 80)).toBe(6.25)
    })

    it('should handle zero contribution', () => {
      expect(calculator.calculateCACPayback(500, 0, 80)).toBe(Infinity)
    })
  })

  describe('calculateQuickRatio', () => {
    it('should calculate Quick Ratio', () => {
      const metrics: MRRMetrics = {
        period: { start: 0, end: 0 },
        startingMRR: 100000,
        newMRR: 15000,
        expansionMRR: 5000,
        contractionMRR: 2000,
        churnedMRR: 3000,
        reactivationMRR: 0,
        endingMRR: 115000,
        netNewMRR: 15000,
        growthRate: 15,
      }
      // Quick Ratio = (15000 + 5000 + 0) / (3000 + 2000) = 4
      expect(calculator.calculateQuickRatio(metrics)).toBe(4)
    })

    it('should handle zero losses', () => {
      const metrics: MRRMetrics = {
        period: { start: 0, end: 0 },
        startingMRR: 100000,
        newMRR: 10000,
        expansionMRR: 5000,
        contractionMRR: 0,
        churnedMRR: 0,
        reactivationMRR: 0,
        endingMRR: 115000,
        netNewMRR: 15000,
        growthRate: 15,
      }
      expect(calculator.calculateQuickRatio(metrics)).toBe(Infinity)
    })
  })

  // =========================================================================
  // Cohort Analysis
  // =========================================================================

  describe('getCohortAnalysis', () => {
    it.todo('should group customers by cohort')
    it.todo('should calculate retention by month')
    it.todo('should calculate average retention')
  })

  describe('getCohortRetention', () => {
    it.todo('should return cohort with retention data')
    it.todo('should calculate customer retention')
    it.todo('should calculate revenue retention')
  })

  // =========================================================================
  // Revenue Analysis
  // =========================================================================

  describe('getRevenueAnalysis', () => {
    it.todo('should calculate ARPU')
    it.todo('should calculate ARPPU')
    it.todo('should breakdown by tier')
    it.todo('should calculate concentration')
  })

  describe('calculateARPU', () => {
    it('should calculate ARPU', () => {
      expect(calculator.calculateARPU(50000, 100)).toBe(500)
    })

    it('should handle zero customers', () => {
      expect(calculator.calculateARPU(50000, 0)).toBe(0)
    })
  })

  // =========================================================================
  // Forecasting
  // =========================================================================

  describe('forecastMRR', () => {
    it('should forecast MRR growth', () => {
      const forecast = calculator.forecastMRR(100000, 10, 3)
      expect(forecast).toHaveLength(3)
      expect(forecast[0]).toBe(110000) // Month 1: 100000 * 1.1
      expect(forecast[1]).toBe(121000) // Month 2: 110000 * 1.1
      expect(forecast[2]).toBe(133100) // Month 3: 121000 * 1.1
    })
  })

  describe('calculateTimeToTarget', () => {
    it('should calculate months to reach target', () => {
      // 100000 * 1.1^n = 200000
      // n = ln(2) / ln(1.1) = 7.27
      const months = calculator.calculateTimeToTarget(100000, 200000, 10)
      expect(months).toBe(8) // Rounded up
    })

    it('should return 0 when already at target', () => {
      expect(calculator.calculateTimeToTarget(200000, 100000, 10)).toBe(0)
    })

    it('should return 0 for zero or negative growth', () => {
      expect(calculator.calculateTimeToTarget(100000, 200000, 0)).toBe(0)
      expect(calculator.calculateTimeToTarget(100000, 200000, -5)).toBe(0)
    })
  })
})

describe('MetricsError', () => {
  it('should create error with code and message', () => {
    const error = new MetricsError(
      MetricsErrorCodes.NO_DATA,
      'No subscription data available'
    )
    expect(error.code).toBe('NO_DATA')
    expect(error.message).toBe('No subscription data available')
    expect(error.name).toBe('MetricsError')
  })

  it('should include details when provided', () => {
    const error = new MetricsError(
      MetricsErrorCodes.CALCULATION_ERROR,
      'Division by zero',
      { numerator: 100, denominator: 0 }
    )
    expect(error.details).toEqual({ numerator: 100, denominator: 0 })
  })
})
