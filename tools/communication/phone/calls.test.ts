/**
 * Tests for Voice Call Handling
 *
 * @module tools/communication/phone/calls.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CallManager,
  say,
  play,
  gather,
  dial,
  conference,
  record,
  pause,
  hangup,
  redirect,
  reject,
  isCallTerminal,
  isCallActive,
  calculateCallDuration,
  type ExtendedCallOptions,
} from './calls'
import type { PhoneProviderAdapter } from './providers'
import type { CallRecord, CallStatus, CallInstructions } from '../../../types/telephony'

describe('calls', () => {
  describe('CallAction helpers', () => {
    describe('say', () => {
      it('should create say action', () => {
        const action = say('Hello, world!')
        expect(action).toEqual({ type: 'say', text: 'Hello, world!' })
      })

      it('should include voice and language options', () => {
        const action = say('Hola!', { voice: 'alice', language: 'es-MX' })
        expect(action).toEqual({
          type: 'say',
          text: 'Hola!',
          voice: 'alice',
          language: 'es-MX',
        })
      })
    })

    describe('play', () => {
      it('should create play action', () => {
        const action = play('https://example.com/music.mp3')
        expect(action).toEqual({
          type: 'play',
          url: 'https://example.com/music.mp3',
        })
      })

      it('should include loop option', () => {
        const action = play('https://example.com/music.mp3', { loop: 3 })
        expect(action).toEqual({
          type: 'play',
          url: 'https://example.com/music.mp3',
          loop: 3,
        })
      })
    })

    describe('gather', () => {
      it('should create gather action with DTMF', () => {
        const action = gather({ input: ['dtmf'], numDigits: 1 })
        expect(action).toEqual({
          type: 'gather',
          input: ['dtmf'],
          numDigits: 1,
        })
      })

      it('should create gather action with speech', () => {
        const action = gather({
          input: ['speech'],
          timeout: 5,
          action: '/process-speech',
        })
        expect(action).toEqual({
          type: 'gather',
          input: ['speech'],
          timeout: 5,
          action: '/process-speech',
        })
      })
    })

    describe('dial', () => {
      it('should create dial action', () => {
        const action = dial('+14155551234')
        expect(action).toEqual({
          type: 'dial',
          number: '+14155551234',
        })
      })

      it('should include dial options', () => {
        const action = dial('+14155551234', {
          callerId: '+14155550000',
          timeout: 30,
          record: true,
        })
        expect(action).toEqual({
          type: 'dial',
          number: '+14155551234',
          callerId: '+14155550000',
          timeout: 30,
          record: true,
        })
      })
    })

    describe('conference', () => {
      it('should create conference action', () => {
        const action = conference('my-room')
        expect(action).toEqual({
          type: 'conference',
          name: 'my-room',
        })
      })

      it('should include conference options', () => {
        const action = conference('my-room', {
          startOnEnter: true,
          endOnExit: false,
        })
        expect(action).toEqual({
          type: 'conference',
          name: 'my-room',
          startOnEnter: true,
          endOnExit: false,
        })
      })
    })

    describe('record', () => {
      it('should create record action', () => {
        const action = record()
        expect(action).toEqual({ type: 'record' })
      })

      it('should include record options', () => {
        const action = record({
          maxLength: 60,
          transcribe: true,
          action: '/handle-recording',
        })
        expect(action).toEqual({
          type: 'record',
          maxLength: 60,
          transcribe: true,
          action: '/handle-recording',
        })
      })
    })

    describe('pause', () => {
      it('should create pause action', () => {
        const action = pause()
        expect(action).toEqual({ type: 'pause' })
      })

      it('should include length', () => {
        const action = pause(2)
        expect(action).toEqual({ type: 'pause', length: 2 })
      })
    })

    describe('hangup', () => {
      it('should create hangup action', () => {
        const action = hangup()
        expect(action).toEqual({ type: 'hangup' })
      })
    })

    describe('redirect', () => {
      it('should create redirect action', () => {
        const action = redirect('/alternative-flow')
        expect(action).toEqual({
          type: 'redirect',
          url: '/alternative-flow',
        })
      })
    })

    describe('reject', () => {
      it('should create reject action', () => {
        const action = reject()
        expect(action).toEqual({ type: 'reject' })
      })

      it('should include reason', () => {
        const action = reject('busy')
        expect(action).toEqual({ type: 'reject', reason: 'busy' })
      })
    })
  })

  describe('isCallTerminal', () => {
    it('should return true for terminal states', () => {
      expect(isCallTerminal('Completed')).toBe(true)
      expect(isCallTerminal('Failed')).toBe(true)
      expect(isCallTerminal('Busy')).toBe(true)
      expect(isCallTerminal('NoAnswer')).toBe(true)
      expect(isCallTerminal('Canceled')).toBe(true)
    })

    it('should return false for non-terminal states', () => {
      expect(isCallTerminal('Queued')).toBe(false)
      expect(isCallTerminal('Ringing')).toBe(false)
      expect(isCallTerminal('InProgress')).toBe(false)
    })
  })

  describe('isCallActive', () => {
    it('should return true for active states', () => {
      expect(isCallActive('Ringing')).toBe(true)
      expect(isCallActive('InProgress')).toBe(true)
    })

    it('should return false for non-active states', () => {
      expect(isCallActive('Queued')).toBe(false)
      expect(isCallActive('Completed')).toBe(false)
      expect(isCallActive('Failed')).toBe(false)
    })
  })

  describe('calculateCallDuration', () => {
    it('should return duration if already set', () => {
      const call: CallRecord = {
        id: 'call-1',
        duration: 120,
      } as CallRecord
      expect(calculateCallDuration(call)).toBe(120)
    })

    it('should calculate from answer and end time', () => {
      const call: CallRecord = {
        id: 'call-1',
        answerTime: 1000000,
        endTime: 1120000, // 120 seconds later
      } as CallRecord
      expect(calculateCallDuration(call)).toBe(120)
    })

    it('should return 0 if no duration data', () => {
      const call: CallRecord = {
        id: 'call-1',
      } as CallRecord
      expect(calculateCallDuration(call)).toBe(0)
    })
  })

  describe('CallManager', () => {
    let mockAdapter: PhoneProviderAdapter
    let manager: CallManager

    beforeEach(() => {
      mockAdapter = {
        provider: 'Twilio',
        makeCall: vi.fn(),
        getCall: vi.fn(),
        updateCall: vi.fn(),
        endCall: vi.fn(),
      } as unknown as PhoneProviderAdapter

      manager = new CallManager(mockAdapter)
    })

    describe('dial', () => {
      it.skip('should initiate an outbound call', async () => {
        // TODO: Implement when manager methods are ready
      })
    })

    describe('get', () => {
      it('should get call from adapter', async () => {
        const mockCall: CallRecord = {
          id: 'call-123',
          providerCallId: 'CA123',
          provider: 'Twilio',
          direction: 'Outbound',
          from: '+14155551234',
          to: '+14155559876',
          status: 'Completed',
          createdAt: Date.now(),
        }
        vi.mocked(mockAdapter.getCall).mockResolvedValue(mockCall)

        const result = await manager.get('call-123')
        expect(result).toEqual(mockCall)
        expect(mockAdapter.getCall).toHaveBeenCalledWith('call-123')
      })
    })

    describe('update', () => {
      it('should update call with instructions', async () => {
        const instructions: CallInstructions = {
          actions: [{ type: 'say', text: 'Updating...' }],
        }
        const mockCall: CallRecord = {
          id: 'call-123',
          status: 'InProgress',
        } as CallRecord
        vi.mocked(mockAdapter.updateCall).mockResolvedValue(mockCall)

        const result = await manager.update('call-123', instructions)
        expect(mockAdapter.updateCall).toHaveBeenCalledWith('call-123', instructions)
      })
    })

    describe('hangup', () => {
      it('should end the call', async () => {
        vi.mocked(mockAdapter.endCall).mockResolvedValue(true)

        const result = await manager.hangup('call-123')
        expect(result).toBe(true)
        expect(mockAdapter.endCall).toHaveBeenCalledWith('call-123')
      })
    })

    describe('transfer', () => {
      it('should update call with dial instructions', async () => {
        const mockCall: CallRecord = { id: 'call-123' } as CallRecord
        vi.mocked(mockAdapter.updateCall).mockResolvedValue(mockCall)

        await manager.transfer('call-123', '+14155550000', {
          callerId: '+14155551234',
          timeout: 30,
        })

        expect(mockAdapter.updateCall).toHaveBeenCalledWith('call-123', {
          actions: [
            { type: 'say', text: 'Transferring your call.' },
            { type: 'dial', number: '+14155550000', callerId: '+14155551234', timeout: 30 },
          ],
        })
      })
    })
  })
})
