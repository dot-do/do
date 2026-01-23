/**
 * Tests for TwiML Builder
 *
 * @module tools/communication/phone/internal/twiml.test
 */

import { describe, it, expect } from 'vitest'
import { TwiMLBuilder, escapeXml, sayResponse, messageResponse, menuResponse, forwardResponse, voicemailResponse } from './twiml'
import type { CallAction } from '../../../../types/telephony'

describe('twiml', () => {
  describe('escapeXml', () => {
    it('should escape ampersand', () => {
      expect(escapeXml('A & B')).toBe('A &amp; B')
    })

    it('should escape less than', () => {
      expect(escapeXml('A < B')).toBe('A &lt; B')
    })

    it('should escape greater than', () => {
      expect(escapeXml('A > B')).toBe('A &gt; B')
    })

    it('should escape quotes', () => {
      expect(escapeXml('"Hello"')).toBe('&quot;Hello&quot;')
      expect(escapeXml("It's")).toBe('It&apos;s')
    })

    it('should escape multiple characters', () => {
      expect(escapeXml('<A & B>')).toBe('&lt;A &amp; B&gt;')
    })
  })

  describe('TwiMLBuilder', () => {
    describe('say', () => {
      it('should build Say element', () => {
        const twiml = new TwiMLBuilder().say('Hello').build()

        expect(twiml).toContain('<Say>Hello</Say>')
      })

      it('should include voice option', () => {
        const twiml = new TwiMLBuilder().say('Hello', { voice: 'alice' }).build()

        expect(twiml).toContain('<Say voice="alice">Hello</Say>')
      })

      it('should include language option', () => {
        const twiml = new TwiMLBuilder().say('Hola', { voice: 'alice', language: 'es-MX' }).build()

        expect(twiml).toContain('language="es-MX"')
      })

      it('should escape special characters', () => {
        const twiml = new TwiMLBuilder().say('Press <1> for help').build()

        expect(twiml).toContain('Press &lt;1&gt; for help')
      })
    })

    describe('play', () => {
      it('should build Play element', () => {
        const twiml = new TwiMLBuilder().play('https://example.com/music.mp3').build()

        expect(twiml).toContain('<Play>https://example.com/music.mp3</Play>')
      })

      it('should include loop option', () => {
        const twiml = new TwiMLBuilder().play('https://example.com/music.mp3', { loop: 3 }).build()

        expect(twiml).toContain('loop="3"')
      })
    })

    describe('gather', () => {
      it('should build Gather element', () => {
        const twiml = new TwiMLBuilder().gather({ input: ['dtmf'], numDigits: 1 }).build()

        expect(twiml).toContain('<Gather')
        expect(twiml).toContain('input="dtmf"')
        expect(twiml).toContain('numDigits="1"')
      })

      it('should support nested elements', () => {
        const twiml = new TwiMLBuilder()
          .gather({ input: ['dtmf'] }, (g) => {
            g.say('Press a key')
          })
          .build()

        expect(twiml).toContain('<Gather')
        expect(twiml).toContain('<Say>Press a key</Say>')
        expect(twiml).toContain('</Gather>')
      })

      it('should support speech input', () => {
        const twiml = new TwiMLBuilder().gather({ input: ['speech', 'dtmf'], timeout: 5 }).build()

        expect(twiml).toContain('input="speech dtmf"')
        expect(twiml).toContain('timeout="5"')
      })
    })

    describe('dial', () => {
      it('should build Dial element', () => {
        const twiml = new TwiMLBuilder().dial('+14155551234').build()

        expect(twiml).toContain('<Dial>')
        expect(twiml).toContain('<Number>+14155551234</Number>')
        expect(twiml).toContain('</Dial>')
      })

      it('should include dial options', () => {
        const twiml = new TwiMLBuilder().dial('+14155551234', { callerId: '+14155550000', timeout: 30 }).build()

        expect(twiml).toContain('callerId="+14155550000"')
        expect(twiml).toContain('timeout="30"')
      })
    })

    describe('dialMultiple', () => {
      it('should dial multiple numbers', () => {
        const twiml = new TwiMLBuilder().dialMultiple(['+14155551234', '+14155559876']).build()

        expect(twiml).toContain('<Number>+14155551234</Number>')
        expect(twiml).toContain('<Number>+14155559876</Number>')
      })
    })

    describe('conference', () => {
      it('should build Conference element', () => {
        const twiml = new TwiMLBuilder().conference('my-room').build()

        expect(twiml).toContain('<Conference>my-room</Conference>')
      })

      it('should include conference options', () => {
        const twiml = new TwiMLBuilder().conference('my-room', { startConferenceOnEnter: true }).build()

        expect(twiml).toContain('startConferenceOnEnter="true"')
      })
    })

    describe('record', () => {
      it('should build Record element', () => {
        const twiml = new TwiMLBuilder().record({ maxLength: 60, transcribe: true }).build()

        expect(twiml).toContain('<Record')
        expect(twiml).toContain('maxLength="60"')
        expect(twiml).toContain('transcribe="true"')
      })
    })

    describe('pause', () => {
      it('should build Pause element', () => {
        const twiml = new TwiMLBuilder().pause({ length: 2 }).build()

        expect(twiml).toContain('<Pause length="2"/>')
      })

      it('should build empty Pause', () => {
        const twiml = new TwiMLBuilder().pause().build()

        expect(twiml).toContain('<Pause/>')
      })
    })

    describe('hangup', () => {
      it('should build Hangup element', () => {
        const twiml = new TwiMLBuilder().hangup().build()

        expect(twiml).toContain('<Hangup/>')
      })
    })

    describe('redirect', () => {
      it('should build Redirect element', () => {
        const twiml = new TwiMLBuilder().redirect('/alternative').build()

        expect(twiml).toContain('<Redirect>/alternative</Redirect>')
      })
    })

    describe('reject', () => {
      it('should build Reject element', () => {
        const twiml = new TwiMLBuilder().reject({ reason: 'busy' }).build()

        expect(twiml).toContain('<Reject reason="busy"/>')
      })
    })

    describe('message', () => {
      it('should build Message element', () => {
        const twiml = new TwiMLBuilder().message('Hello!').build()

        expect(twiml).toContain('<Message>Hello!</Message>')
      })

      it('should include message options', () => {
        const twiml = new TwiMLBuilder().message('Hello!', { to: '+14155551234' }).build()

        expect(twiml).toContain('to="+14155551234"')
      })
    })

    describe('build', () => {
      it('should include XML declaration', () => {
        const twiml = new TwiMLBuilder().say('Hello').build()

        expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      })

      it('should wrap in Response element', () => {
        const twiml = new TwiMLBuilder().say('Hello').build()

        expect(twiml).toContain('<Response>')
        expect(twiml).toContain('</Response>')
      })

      it('should chain multiple elements', () => {
        const twiml = new TwiMLBuilder().say('Welcome!').pause({ length: 1 }).say('Goodbye!').hangup().build()

        expect(twiml).toContain('<Say>Welcome!</Say>')
        expect(twiml).toContain('<Pause')
        expect(twiml).toContain('<Say>Goodbye!</Say>')
        expect(twiml).toContain('<Hangup/>')
      })
    })

    describe('fromActions', () => {
      it('should build from CallAction array', () => {
        const actions: CallAction[] = [
          { type: 'say', text: 'Hello', voice: 'alice' },
          { type: 'gather', input: ['dtmf'], numDigits: 1 },
          { type: 'hangup' },
        ]

        const twiml = TwiMLBuilder.fromActions(actions)

        expect(twiml).toContain('<Say voice="alice">Hello</Say>')
        expect(twiml).toContain('<Gather')
        expect(twiml).toContain('<Hangup/>')
      })

      it('should handle all action types', () => {
        const actions: CallAction[] = [
          { type: 'say', text: 'Hello' },
          { type: 'play', url: 'https://example.com/music.mp3' },
          { type: 'pause', length: 1 },
          { type: 'dial', number: '+14155551234' },
          { type: 'record', maxLength: 60 },
          { type: 'redirect', url: '/next' },
          { type: 'reject', reason: 'busy' },
        ]

        const twiml = TwiMLBuilder.fromActions(actions)

        expect(twiml).toContain('<Say>')
        expect(twiml).toContain('<Play>')
        expect(twiml).toContain('<Pause')
        expect(twiml).toContain('<Dial') // May have attributes
        expect(twiml).toContain('<Record')
        expect(twiml).toContain('<Redirect>')
        expect(twiml).toContain('<Reject')
      })
    })
  })

  describe('Helper functions', () => {
    describe('sayResponse', () => {
      it('should create simple say response', () => {
        const twiml = sayResponse('Hello!')

        expect(twiml).toContain('<Response>')
        expect(twiml).toContain('<Say>Hello!</Say>')
        expect(twiml).toContain('</Response>')
      })
    })

    describe('messageResponse', () => {
      it('should create simple message response', () => {
        const twiml = messageResponse('Thanks!')

        expect(twiml).toContain('<Response>')
        expect(twiml).toContain('<Message>Thanks!</Message>')
        expect(twiml).toContain('</Response>')
      })
    })

    describe('menuResponse', () => {
      it('should create IVR menu', () => {
        const twiml = menuResponse('Press 1 for sales, 2 for support', '/process-input', { numDigits: 1, timeout: 5 })

        expect(twiml).toContain('<Gather')
        expect(twiml).toContain('numDigits="1"')
        expect(twiml).toContain('timeout="5"')
        expect(twiml).toContain('action="/process-input"')
        expect(twiml).toContain('Press 1 for sales')
      })

      it('should include no-input message', () => {
        const twiml = menuResponse('Press 1 for sales', '/process', { noInputMessage: 'We did not receive input.' })

        expect(twiml).toContain('We did not receive input.')
      })
    })

    describe('forwardResponse', () => {
      it('should create call forwarding response', () => {
        const twiml = forwardResponse('+14155551234')

        expect(twiml).toContain('<Dial>')
        expect(twiml).toContain('+14155551234')
      })
    })

    describe('voicemailResponse', () => {
      it('should create voicemail response', () => {
        const twiml = voicemailResponse('Please leave a message.', '/handle-voicemail', { maxLength: 60, transcribe: true })

        expect(twiml).toContain('Please leave a message.')
        expect(twiml).toContain('<Record')
        expect(twiml).toContain('maxLength="60"')
        expect(twiml).toContain('transcribe="true"')
        expect(twiml).toContain('action="/handle-voicemail"')
        expect(twiml).toContain('<Hangup/>')
      })
    })
  })
})
