/**
 * Tests for Communication Context (Email, Slack, SMS)
 *
 * @module context/__tests__/communication
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createEmailContext, createSlackContext, createSMSContext } from './communication'
import type { EmailContext, SlackContext, SMSContext } from '../types/context'

describe('EmailContext', () => {
  let email: EmailContext
  let mockState: { env: Record<string, unknown> }

  beforeEach(() => {
    mockState = { env: {} }
    email = createEmailContext(mockState)
  })

  describe('$.email`template`', () => {
    it('should be a function', () => {
      expect(typeof email).toBe('function')
    })

    it('should send email with template', async () => {
      const result = await email`welcome John to john@example.com`
      expect(result).toHaveProperty('messageId')
    })

    it('should extract email from template', async () => {
      const result = await email`Hello to user@test.com`
      expect(result.messageId).toBeDefined()
    })

    it('should throw if no email found', async () => {
      await expect(email`Hello World`).rejects.toThrow('Email recipient not found')
    })
  })

  describe('$.email.to(address)`template`', () => {
    it('should send to specific recipient', async () => {
      const result = await email.to('test@example.com')`Welcome to our platform!`
      expect(result).toHaveProperty('messageId')
    })
  })

  describe('$.email.template()', () => {
    it('should send using template', async () => {
      const result = await email.template('welcome', 'user@example.com', {
        name: 'John',
      })
      expect(result).toHaveProperty('messageId')
    })
  })
})

describe('SlackContext', () => {
  let slack: SlackContext
  let mockState: { env: Record<string, unknown> }

  beforeEach(() => {
    mockState = { env: {} }
    slack = createSlackContext(mockState)
  })

  describe('$.slack`template`', () => {
    it('should be a function', () => {
      expect(typeof slack).toBe('function')
    })

    it('should post message with channel', async () => {
      const result = await slack`#general Hello team!`
      expect(result).toHaveProperty('ts')
    })

    it('should throw if no channel found', async () => {
      await expect(slack`Hello without channel`).rejects.toThrow('Slack channel not found')
    })
  })

  describe('$.slack.channel(id)`template`', () => {
    it('should post to specific channel', async () => {
      const result = await slack.channel('C12345')`Deployment complete`
      expect(result).toHaveProperty('ts')
    })
  })
})

describe('SMSContext', () => {
  let sms: SMSContext
  let mockState: { env: Record<string, unknown> }

  beforeEach(() => {
    mockState = { env: {} }
    sms = createSMSContext(mockState)
  })

  describe('$.sms`template`', () => {
    it('should be a function', () => {
      expect(typeof sms).toBe('function')
    })

    it('should send SMS with phone number', async () => {
      const result = await sms`+12345678901 Your order shipped!`
      expect(result).toHaveProperty('messageId')
    })

    it('should extract phone from template', async () => {
      const result = await sms`Message to 12345678901`
      expect(result.messageId).toBeDefined()
    })

    it('should throw if no phone found', async () => {
      await expect(sms`Hello World`).rejects.toThrow('Phone number not found')
    })
  })

  describe('$.sms.to(phone)`template`', () => {
    it('should send to specific number', async () => {
      const result = await sms.to('+12345678901')`Your order has shipped!`
      expect(result).toHaveProperty('messageId')
    })
  })
})
