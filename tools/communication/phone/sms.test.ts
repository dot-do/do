/**
 * Tests for SMS/MMS Messaging
 *
 * @module tools/communication/phone/sms.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SMSManager,
  requiresUCS2,
  calculateSegments,
  splitIntoSegments,
  estimateCost,
  isSMSTerminal,
  isSMSDelivered,
  truncateMessage,
  validateRecipients,
  SMS_SEGMENT_LENGTH_GSM7,
  SMS_SEGMENT_LENGTH_UCS2,
  SMS_CONCAT_LENGTH_GSM7,
  SMS_CONCAT_LENGTH_UCS2,
} from './sms'
import type { PhoneProviderAdapter } from './providers'
import type { SMSRecord, SMSStatus } from '../../../types/telephony'

describe('sms', () => {
  describe('constants', () => {
    it('should have correct segment lengths', () => {
      expect(SMS_SEGMENT_LENGTH_GSM7).toBe(160)
      expect(SMS_SEGMENT_LENGTH_UCS2).toBe(70)
      expect(SMS_CONCAT_LENGTH_GSM7).toBe(153)
      expect(SMS_CONCAT_LENGTH_UCS2).toBe(67)
    })
  })

  describe('requiresUCS2', () => {
    it('should return false for GSM-7 characters', () => {
      expect(requiresUCS2('Hello, World!')).toBe(false)
      expect(requiresUCS2('123-456-7890')).toBe(false)
      expect(requiresUCS2('Test @ message')).toBe(false)
    })

    it('should return true for non-GSM-7 characters', () => {
      expect(requiresUCS2('Hello! \u4e2d\u6587')).toBe(true) // Chinese
      expect(requiresUCS2('\u{1F600}')).toBe(true) // Emoji
      expect(requiresUCS2('\u03B1\u03B2\u03B3')).toBe(true) // Greek (some)
    })
  })

  describe('calculateSegments', () => {
    it('should return 1 for short messages', () => {
      expect(calculateSegments('Hello!')).toBe(1)
      expect(calculateSegments('A'.repeat(160))).toBe(1)
    })

    it('should calculate multiple segments for long GSM-7 messages', () => {
      expect(calculateSegments('A'.repeat(161))).toBe(2)
      expect(calculateSegments('A'.repeat(306))).toBe(2)
      expect(calculateSegments('A'.repeat(307))).toBe(3)
    })

    it('should use UCS-2 limits for unicode messages', () => {
      const emoji = '\u{1F600}'
      expect(calculateSegments(emoji.repeat(35))).toBe(1) // 35 * 2 = 70
      expect(calculateSegments(emoji.repeat(36))).toBe(2) // 36 * 2 = 72 > 70
    })
  })

  describe('splitIntoSegments', () => {
    it('should return single element for short messages', () => {
      const segments = splitIntoSegments('Hello!')
      expect(segments).toEqual(['Hello!'])
    })

    it('should split long messages into segments', () => {
      const longMessage = 'A'.repeat(306)
      const segments = splitIntoSegments(longMessage)
      expect(segments.length).toBe(2)
      expect(segments[0].length).toBe(153)
      expect(segments[1].length).toBe(153)
    })

    it('should handle uneven splits', () => {
      // 161 chars requires 2 segments since it exceeds single segment limit
      const message = 'A'.repeat(161)
      const segments = splitIntoSegments(message)
      expect(segments.length).toBe(2)
      expect(segments[0].length).toBe(153)
      expect(segments[1].length).toBe(8)
    })
  })

  describe('estimateCost', () => {
    it('should calculate cost for single segment', () => {
      expect(estimateCost('Hello!', 1)).toBe(1) // 1 cent
    })

    it('should calculate cost for multiple segments', () => {
      const longMessage = 'A'.repeat(306)
      expect(estimateCost(longMessage, 1)).toBe(2) // 2 segments * 1 cent
    })

    it('should use per-segment price', () => {
      expect(estimateCost('Hello!', 5)).toBe(5) // 1 segment * 5 cents
    })
  })

  describe('isSMSTerminal', () => {
    it('should return true for terminal states', () => {
      expect(isSMSTerminal('Delivered')).toBe(true)
      expect(isSMSTerminal('Undelivered')).toBe(true)
      expect(isSMSTerminal('Failed')).toBe(true)
      expect(isSMSTerminal('Received')).toBe(true)
    })

    it('should return false for non-terminal states', () => {
      expect(isSMSTerminal('Queued')).toBe(false)
      expect(isSMSTerminal('Sending')).toBe(false)
      expect(isSMSTerminal('Sent')).toBe(false)
    })
  })

  describe('isSMSDelivered', () => {
    it('should return true only for delivered status', () => {
      expect(isSMSDelivered('Delivered')).toBe(true)
      expect(isSMSDelivered('Sent')).toBe(false)
      expect(isSMSDelivered('Failed')).toBe(false)
    })
  })

  describe('truncateMessage', () => {
    it('should not truncate short messages', () => {
      expect(truncateMessage('Hello!')).toBe('Hello!')
    })

    it('should truncate long messages with suffix', () => {
      const result = truncateMessage('A'.repeat(200), 1, '...')
      expect(result.length).toBe(160)
      expect(result.endsWith('...')).toBe(true)
    })

    it('should respect maxSegments', () => {
      const result = truncateMessage('A'.repeat(500), 2, '...')
      expect(calculateSegments(result)).toBe(2)
    })

    it('should use custom suffix', () => {
      const result = truncateMessage('A'.repeat(200), 1, ' [more]')
      expect(result.endsWith(' [more]')).toBe(true)
    })
  })

  describe('validateRecipients', () => {
    it('should separate valid and invalid numbers', () => {
      const result = validateRecipients(['+14155551234', 'invalid', '+442079460958', '4155551234'])

      expect(result.valid).toEqual(['+14155551234', '+442079460958'])
      expect(result.invalid).toEqual(['invalid', '4155551234'])
    })

    it('should handle empty array', () => {
      const result = validateRecipients([])
      expect(result.valid).toEqual([])
      expect(result.invalid).toEqual([])
    })

    it('should handle all valid numbers', () => {
      const result = validateRecipients(['+14155551234', '+14155559876'])
      expect(result.valid.length).toBe(2)
      expect(result.invalid.length).toBe(0)
    })
  })

  describe('SMSManager', () => {
    let mockAdapter: PhoneProviderAdapter
    let manager: SMSManager

    beforeEach(() => {
      mockAdapter = {
        provider: 'Twilio',
        sendSMS: vi.fn(),
        getSMS: vi.fn(),
      } as unknown as PhoneProviderAdapter

      manager = new SMSManager(mockAdapter)
    })

    describe('send', () => {
      it.skip('should send SMS via adapter', async () => {
        // TODO: Implement when manager methods are ready
      })
    })

    describe('sendMMS', () => {
      it.skip('should send MMS with media URLs', async () => {
        // TODO: Implement when manager methods are ready
      })
    })

    describe('sendBulk', () => {
      it.skip('should send to multiple recipients', async () => {
        // TODO: Implement when manager methods are ready
      })
    })

    describe('get', () => {
      it('should get message from adapter', async () => {
        const mockMessage: SMSRecord = {
          id: 'msg-123',
          providerMessageId: 'SM123',
          provider: 'Twilio',
          direction: 'Outbound',
          from: '+14155551234',
          to: '+14155559876',
          body: 'Hello!',
          status: 'Delivered',
          createdAt: Date.now(),
        }
        vi.mocked(mockAdapter.getSMS).mockResolvedValue(mockMessage)

        const result = await manager.get('msg-123')
        expect(result).toEqual(mockMessage)
        expect(mockAdapter.getSMS).toHaveBeenCalledWith('msg-123')
      })
    })

    describe('list', () => {
      it.skip('should list messages with filters', async () => {
        // TODO: Implement when manager methods are ready
      })
    })

    describe('schedule', () => {
      it.skip('should schedule message for future delivery', async () => {
        // TODO: Implement when manager methods are ready
      })
    })
  })
})
