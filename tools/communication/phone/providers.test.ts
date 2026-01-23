/**
 * Tests for Phone Provider Abstraction
 *
 * @module tools/communication/phone/providers.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createProviderAdapter,
  createPhoneClient,
  normalizePhoneNumber,
  isValidE164,
  shouldFailover,
  executeWithFailover,
  PhoneError,
  ProviderUnavailableError,
  RateLimitError,
  InvalidNumberError,
  InsufficientFundsError,
  type PhoneProviderAdapter,
  type FailoverCondition,
} from './providers'

describe('providers', () => {
  describe('normalizePhoneNumber', () => {
    it('should normalize US phone number without country code', () => {
      expect(normalizePhoneNumber('4155551234')).toBe('+14155551234')
    })

    it('should normalize phone number with formatting', () => {
      expect(normalizePhoneNumber('(415) 555-1234')).toBe('+14155551234')
    })

    it('should keep existing country code', () => {
      expect(normalizePhoneNumber('+442079460958')).toBe('+442079460958')
    })

    it('should handle dashes and spaces', () => {
      expect(normalizePhoneNumber('415-555-1234')).toBe('+14155551234')
      expect(normalizePhoneNumber('415 555 1234')).toBe('+14155551234')
    })

    it('should use custom default country code', () => {
      expect(normalizePhoneNumber('2079460958', '44')).toBe('+442079460958')
    })
  })

  describe('isValidE164', () => {
    it('should validate correct E.164 numbers', () => {
      expect(isValidE164('+14155551234')).toBe(true)
      expect(isValidE164('+442079460958')).toBe(true)
      expect(isValidE164('+8613800138000')).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(isValidE164('4155551234')).toBe(false) // Missing +
      expect(isValidE164('+0123456789')).toBe(false) // Starts with 0
      expect(isValidE164('+')).toBe(false) // Just +
      expect(isValidE164('+1')).toBe(false) // Too short
    })
  })

  describe('PhoneError', () => {
    it('should create error with all properties', () => {
      const error = new PhoneError('Test error', 'TEST_CODE', 'Twilio', true)
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.provider).toBe('Twilio')
      expect(error.retryable).toBe(true)
    })
  })

  describe('ProviderUnavailableError', () => {
    it('should create with default message', () => {
      const error = new ProviderUnavailableError('Telnyx')
      expect(error.message).toBe('Provider Telnyx is unavailable')
      expect(error.code).toBe('PROVIDER_UNAVAILABLE')
      expect(error.retryable).toBe(true)
    })

    it('should create with custom message', () => {
      const error = new ProviderUnavailableError('Telnyx', 'API is down')
      expect(error.message).toBe('API is down')
    })
  })

  describe('RateLimitError', () => {
    it('should create with retry after', () => {
      const error = new RateLimitError('Twilio', 60)
      expect(error.code).toBe('RATE_LIMITED')
      expect(error.retryAfter).toBe(60)
      expect(error.retryable).toBe(true)
    })
  })

  describe('InvalidNumberError', () => {
    it('should include the invalid number', () => {
      const error = new InvalidNumberError('Plivo', '+invalid')
      expect(error.message).toBe('Invalid phone number: +invalid')
      expect(error.retryable).toBe(false)
    })
  })

  describe('InsufficientFundsError', () => {
    it('should include provider name', () => {
      const error = new InsufficientFundsError('Bandwidth')
      expect(error.message).toBe('Insufficient funds in Bandwidth account')
      expect(error.retryable).toBe(false)
    })
  })

  describe('shouldFailover', () => {
    it('should return true for matching conditions', () => {
      const error = new ProviderUnavailableError('Twilio')
      expect(shouldFailover(error, ['service_unavailable'])).toBe(true)
    })

    it('should return true for rate limit', () => {
      const error = new RateLimitError('Twilio')
      expect(shouldFailover(error, ['rate_limit'])).toBe(true)
    })

    it('should return false for non-matching conditions', () => {
      const error = new InvalidNumberError('Twilio', '+invalid')
      expect(shouldFailover(error, ['timeout'])).toBe(false)
    })

    it('should return false for non-PhoneError', () => {
      const error = new Error('Generic error')
      expect(shouldFailover(error, ['timeout', 'rate_limit'])).toBe(false)
    })
  })

  describe('executeWithFailover', () => {
    it('should return result from first successful adapter', async () => {
      const mockAdapter = {
        provider: 'Twilio',
      } as PhoneProviderAdapter

      const operation = vi.fn().mockResolvedValue('success')

      const result = await executeWithFailover(operation, [mockAdapter], ['timeout'])

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should failover to next adapter on matching error', async () => {
      const adapter1 = { provider: 'Telnyx' } as PhoneProviderAdapter
      const adapter2 = { provider: 'Twilio' } as PhoneProviderAdapter

      const operation = vi.fn().mockRejectedValueOnce(new ProviderUnavailableError('Telnyx')).mockResolvedValueOnce('success from twilio')

      const result = await executeWithFailover(operation, [adapter1, adapter2], ['service_unavailable'])

      expect(result).toBe('success from twilio')
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should throw immediately for non-failover errors', async () => {
      const adapter1 = { provider: 'Telnyx' } as PhoneProviderAdapter
      const adapter2 = { provider: 'Twilio' } as PhoneProviderAdapter

      const operation = vi.fn().mockRejectedValueOnce(new InvalidNumberError('Telnyx', '+invalid'))

      await expect(executeWithFailover(operation, [adapter1, adapter2], ['timeout'])).rejects.toThrow('Invalid phone number')

      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should throw last error when all providers fail', async () => {
      const adapter1 = { provider: 'Telnyx' } as PhoneProviderAdapter
      const adapter2 = { provider: 'Twilio' } as PhoneProviderAdapter

      const operation = vi.fn().mockRejectedValueOnce(new ProviderUnavailableError('Telnyx')).mockRejectedValueOnce(new ProviderUnavailableError('Twilio'))

      await expect(executeWithFailover(operation, [adapter1, adapter2], ['service_unavailable'])).rejects.toThrow('Provider Twilio is unavailable')
    })
  })

  describe('createProviderAdapter', () => {
    it.skip('should create adapter for each provider', () => {
      // TODO: Implement when adapters are ready
    })
  })

  describe('createPhoneClient', () => {
    it.skip('should create client with primary provider', () => {
      // TODO: Implement when client is ready
    })

    it.skip('should support failover configuration', () => {
      // TODO: Implement when client is ready
    })
  })
})
