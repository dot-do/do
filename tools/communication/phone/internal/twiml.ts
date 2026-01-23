/**
 * TwiML Builder (Internal)
 *
 * Type-safe builder for TwiML/XML voice and messaging instructions.
 * This is an internal module - use the phone provider's high-level API instead.
 *
 * @internal
 * @module tools/communication/phone/internal/twiml
 */

import type { CallAction } from '../../../../types/telephony'

// =============================================================================
// TwiML Element Types
// =============================================================================

/**
 * Options for the Say verb
 */
export interface SayOptions {
  /** Voice to use (e.g., 'alice', 'man', 'woman') */
  voice?: string
  /** Language code (e.g., 'en-US', 'es-MX') */
  language?: string
  /** Number of times to repeat */
  loop?: number
}

/**
 * Options for the Play verb
 */
export interface PlayOptions {
  /** Number of times to loop (0 for infinite) */
  loop?: number
  /** Digits to send as DTMF tones */
  digits?: string
}

/**
 * Options for the Gather verb
 */
export interface GatherOptions {
  /** Input types to accept */
  input?: ('dtmf' | 'speech')[]
  /** Timeout in seconds before giving up */
  timeout?: number
  /** Number of digits to collect (DTMF) */
  numDigits?: number
  /** Key that ends input (e.g., '#') */
  finishOnKey?: string
  /** URL to send gathered input to */
  action?: string
  /** HTTP method for action URL */
  method?: 'GET' | 'POST'
  /** Speech recognition hints */
  hints?: string
  /** Speech model to use */
  speechModel?: 'default' | 'phone_call' | 'numbers_and_commands'
  /** Enable partial results for speech */
  partialResultCallback?: string
  /** Language for speech recognition */
  language?: string
  /** Enable enhanced speech recognition */
  enhanced?: boolean
  /** Profanity filter for speech */
  profanityFilter?: boolean
}

/**
 * Options for the Dial verb
 */
export interface DialOptions {
  /** Caller ID to display */
  callerId?: string
  /** Timeout in seconds */
  timeout?: number
  /** Record the call */
  record?: 'do-not-record' | 'record-from-answer' | 'record-from-ringing'
  /** Trim silence from recordings */
  trim?: 'trim-silence' | 'do-not-trim'
  /** URL for call events */
  action?: string
  /** HTTP method for action URL */
  method?: 'GET' | 'POST'
  /** Ring tone */
  ringTone?: string
  /** Answer on bridge */
  answerOnBridge?: boolean
  /** Maximum call duration */
  timeLimit?: number
}

/**
 * Options for the Record verb
 */
export interface RecordOptions {
  /** Maximum recording length in seconds */
  maxLength?: number
  /** Key to stop recording */
  finishOnKey?: string
  /** Transcribe the recording */
  transcribe?: boolean
  /** URL for transcription callback */
  transcribeCallback?: string
  /** URL to send recording to */
  action?: string
  /** HTTP method for action URL */
  method?: 'GET' | 'POST'
  /** Play beep before recording */
  playBeep?: boolean
  /** Trim silence from recording */
  trim?: 'trim-silence' | 'do-not-trim'
  /** URL to send recording status to */
  recordingStatusCallback?: string
}

/**
 * Options for the Conference verb
 */
export interface ConferenceOptions {
  /** Whether to start conference when this participant joins */
  startConferenceOnEnter?: boolean
  /** Whether to end conference when this participant leaves */
  endConferenceOnExit?: boolean
  /** Mute the participant */
  muted?: boolean
  /** Play beep on join/leave */
  beep?: boolean | 'true' | 'false' | 'onEnter' | 'onExit'
  /** URL for conference events */
  statusCallback?: string
  /** Maximum participants */
  maxParticipants?: number
  /** Wait URL while waiting for others */
  waitUrl?: string
  /** Record the conference */
  record?: 'do-not-record' | 'record-from-start'
}

/**
 * Options for the Pause verb
 */
export interface PauseOptions {
  /** Pause duration in seconds */
  length?: number
}

/**
 * Options for the Reject verb
 */
export interface RejectOptions {
  /** Rejection reason */
  reason?: 'busy' | 'rejected'
}

/**
 * Options for the Message verb (SMS response)
 */
export interface MessageOptions {
  /** Recipient number */
  to?: string
  /** Sender number */
  from?: string
  /** Status callback URL */
  statusCallback?: string
}

/**
 * Options for the Redirect verb
 */
export interface RedirectOptions {
  /** HTTP method */
  method?: 'GET' | 'POST'
}

// =============================================================================
// TwiML Builder
// =============================================================================

/**
 * Internal representation of a TwiML element
 */
interface TwiMLElement {
  tag: string
  attributes?: Record<string, unknown>
  content?: string
  children?: TwiMLElement[]
}

/**
 * Type-safe TwiML builder for voice and messaging instructions
 *
 * Builds XML/TwiML responses for telephony providers. While named after
 * Twilio's TwiML, the output is compatible with most providers.
 *
 * @example
 * ```typescript
 * // Voice response with menu
 * const twiml = new TwiMLBuilder()
 *   .say('Welcome! Press 1 for sales, 2 for support.', { voice: 'alice' })
 *   .gather({
 *     input: ['dtmf'],
 *     numDigits: 1,
 *     action: '/voice/menu-selection',
 *   })
 *   .say('We didn\'t receive any input. Goodbye!')
 *   .hangup()
 *   .build()
 *
 * // SMS response
 * const smsResponse = new TwiMLBuilder()
 *   .message('Thanks for your message!')
 *   .build()
 * ```
 */
export class TwiMLBuilder {
  private elements: TwiMLElement[] = []

  /**
   * Add a Say verb for text-to-speech
   *
   * @param text - Text to speak
   * @param options - Voice options
   * @returns This builder for chaining
   */
  say(text: string, options?: SayOptions): this {
    this.elements.push({
      tag: 'Say',
      attributes: options as Record<string, unknown> | undefined,
      content: escapeXml(text),
    })
    return this
  }

  /**
   * Add a Play verb for audio playback
   *
   * @param url - URL of audio file to play
   * @param options - Playback options
   * @returns This builder for chaining
   */
  play(url: string, options?: PlayOptions): this {
    this.elements.push({
      tag: 'Play',
      attributes: options as Record<string, unknown> | undefined,
      content: escapeXml(url),
    })
    return this
  }

  /**
   * Add a Gather verb for collecting input
   *
   * @param options - Gather options
   * @param nested - Optional nested builder for prompts within gather
   * @returns This builder for chaining
   */
  gather(options?: GatherOptions, nested?: (builder: TwiMLBuilder) => void): this {
    const children: TwiMLElement[] = []

    if (nested) {
      const nestedBuilder = new TwiMLBuilder()
      nested(nestedBuilder)
      children.push(...nestedBuilder.elements)
    }

    // Convert input array to string
    const attrs = { ...options }
    if (attrs.input) {
      ;(attrs as Record<string, unknown>).input = attrs.input.join(' ')
    }

    this.elements.push({
      tag: 'Gather',
      attributes: attrs,
      children: children.length > 0 ? children : undefined,
    })
    return this
  }

  /**
   * Add a Dial verb for connecting to another party
   *
   * @param number - Number to dial (or conference name)
   * @param options - Dial options
   * @returns This builder for chaining
   */
  dial(number: string, options?: DialOptions): this {
    this.elements.push({
      tag: 'Dial',
      attributes: options as Record<string, unknown> | undefined,
      children: [{ tag: 'Number', content: escapeXml(number) }],
    })
    return this
  }

  /**
   * Add a Dial verb with multiple numbers (sequential dialing)
   *
   * @param numbers - Numbers to dial in sequence
   * @param options - Dial options
   * @returns This builder for chaining
   */
  dialMultiple(numbers: string[], options?: DialOptions): this {
    this.elements.push({
      tag: 'Dial',
      attributes: options as Record<string, unknown> | undefined,
      children: numbers.map((n) => ({ tag: 'Number', content: escapeXml(n) })),
    })
    return this
  }

  /**
   * Add a Dial verb with SIP endpoint
   *
   * @param sipUri - SIP URI to dial
   * @param options - Dial options
   * @returns This builder for chaining
   */
  dialSip(sipUri: string, options?: DialOptions): this {
    this.elements.push({
      tag: 'Dial',
      attributes: options as Record<string, unknown> | undefined,
      children: [{ tag: 'Sip', content: escapeXml(sipUri) }],
    })
    return this
  }

  /**
   * Add a Conference verb for joining a conference room
   *
   * @param name - Conference room name
   * @param options - Conference options
   * @returns This builder for chaining
   */
  conference(name: string, options?: ConferenceOptions): this {
    this.elements.push({
      tag: 'Dial',
      children: [
        {
          tag: 'Conference',
          attributes: options as Record<string, unknown> | undefined,
          content: escapeXml(name),
        },
      ],
    })
    return this
  }

  /**
   * Add a Record verb for recording
   *
   * @param options - Recording options
   * @returns This builder for chaining
   */
  record(options?: RecordOptions): this {
    this.elements.push({
      tag: 'Record',
      attributes: options as Record<string, unknown> | undefined,
    })
    return this
  }

  /**
   * Add a Pause verb
   *
   * @param options - Pause options
   * @returns This builder for chaining
   */
  pause(options?: PauseOptions): this {
    this.elements.push({
      tag: 'Pause',
      attributes: options as Record<string, unknown> | undefined,
    })
    return this
  }

  /**
   * Add a Hangup verb to end the call
   *
   * @returns This builder for chaining
   */
  hangup(): this {
    this.elements.push({ tag: 'Hangup' })
    return this
  }

  /**
   * Add a Redirect verb to transfer control
   *
   * @param url - URL to redirect to
   * @param options - Redirect options
   * @returns This builder for chaining
   */
  redirect(url: string, options?: RedirectOptions): this {
    this.elements.push({
      tag: 'Redirect',
      attributes: options as Record<string, unknown> | undefined,
      content: escapeXml(url),
    })
    return this
  }

  /**
   * Add a Reject verb to reject the call
   *
   * @param options - Reject options
   * @returns This builder for chaining
   */
  reject(options?: RejectOptions): this {
    this.elements.push({
      tag: 'Reject',
      attributes: options as Record<string, unknown> | undefined,
    })
    return this
  }

  /**
   * Add a Message verb for SMS response
   *
   * @param body - Message body
   * @param options - Message options
   * @returns This builder for chaining
   */
  message(body: string, options?: MessageOptions): this {
    this.elements.push({
      tag: 'Message',
      attributes: options as Record<string, unknown> | undefined,
      content: escapeXml(body),
    })
    return this
  }

  /**
   * Add raw TwiML content
   *
   * @param xml - Raw XML string to include
   * @returns This builder for chaining
   */
  raw(xml: string): this {
    // Store as special element that won't be escaped
    this.elements.push({
      tag: '__raw__',
      content: xml,
    })
    return this
  }

  /**
   * Build the TwiML XML string
   *
   * @returns Complete TwiML XML document
   */
  build(): string {
    const content = this.elements.map((el) => this.renderElement(el)).join('\n  ')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${content}\n</Response>`
  }

  /**
   * Build from CallAction array (types/telephony.ts format)
   *
   * @param actions - Array of call actions
   * @returns TwiML XML string
   */
  static fromActions(actions: CallAction[]): string {
    const builder = new TwiMLBuilder()

    for (const action of actions) {
      switch (action.type) {
        case 'say':
          builder.say(action.text, { voice: action.voice, language: action.language })
          break
        case 'play':
          builder.play(action.url, { loop: action.loop })
          break
        case 'gather':
          builder.gather({
            input: action.input,
            timeout: action.timeout,
            numDigits: action.numDigits,
            action: action.action,
          })
          break
        case 'dial':
          builder.dial(action.number, {
            callerId: action.callerId,
            timeout: action.timeout,
            record: action.record ? 'record-from-answer' : 'do-not-record',
          })
          break
        case 'conference':
          builder.conference(action.name, {
            startConferenceOnEnter: action.startOnEnter,
            endConferenceOnExit: action.endOnExit,
          })
          break
        case 'record':
          builder.record({
            maxLength: action.maxLength,
            transcribe: action.transcribe,
            action: action.action,
          })
          break
        case 'pause':
          builder.pause({ length: action.length })
          break
        case 'hangup':
          builder.hangup()
          break
        case 'redirect':
          builder.redirect(action.url)
          break
        case 'reject':
          builder.reject({ reason: action.reason })
          break
      }
    }

    return builder.build()
  }

  /**
   * Render a single element to XML
   */
  private renderElement(element: TwiMLElement, indent = ''): string {
    // Handle raw XML passthrough
    if (element.tag === '__raw__') {
      return element.content ?? ''
    }

    const attrs = element.attributes
      ? Object.entries(element.attributes)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
          .join('')
      : ''

    if (element.children && element.children.length > 0) {
      const childContent = element.children.map((child) => this.renderElement(child, indent + '  ')).join('\n' + indent + '  ')
      return `<${element.tag}${attrs}>\n${indent}  ${childContent}\n${indent}</${element.tag}>`
    }

    if (element.content !== undefined) {
      return `<${element.tag}${attrs}>${element.content}</${element.tag}>`
    }

    return `<${element.tag}${attrs}/>`
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Escape special XML characters
 *
 * @param str - String to escape
 * @returns XML-safe string
 */
export function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/**
 * Create a simple voice response with a single Say
 *
 * @param text - Text to speak
 * @param options - Say options
 * @returns TwiML XML string
 */
export function sayResponse(text: string, options?: SayOptions): string {
  return new TwiMLBuilder().say(text, options).build()
}

/**
 * Create a simple SMS response
 *
 * @param body - Message body
 * @param options - Message options
 * @returns TwiML XML string
 */
export function messageResponse(body: string, options?: MessageOptions): string {
  return new TwiMLBuilder().message(body, options).build()
}

/**
 * Create a voice menu (IVR) response
 *
 * @param prompt - Text to speak as menu prompt
 * @param actionUrl - URL to send gathered input to
 * @param options - Additional options
 * @returns TwiML XML string
 */
export function menuResponse(
  prompt: string,
  actionUrl: string,
  options?: {
    numDigits?: number
    timeout?: number
    voice?: string
    noInputMessage?: string
  }
): string {
  const builder = new TwiMLBuilder().gather(
    {
      input: ['dtmf'],
      numDigits: options?.numDigits ?? 1,
      timeout: options?.timeout ?? 5,
      action: actionUrl,
    },
    (gather) => {
      gather.say(prompt, { voice: options?.voice })
    }
  )

  if (options?.noInputMessage) {
    builder.say(options.noInputMessage, { voice: options?.voice })
  }

  return builder.build()
}

/**
 * Create a call forwarding response
 *
 * @param number - Number to forward to
 * @param options - Dial options
 * @returns TwiML XML string
 */
export function forwardResponse(number: string, options?: DialOptions): string {
  return new TwiMLBuilder().dial(number, options).build()
}

/**
 * Create a voicemail response
 *
 * @param greeting - Greeting message
 * @param actionUrl - URL to send recording to
 * @param options - Recording options
 * @returns TwiML XML string
 */
export function voicemailResponse(
  greeting: string,
  actionUrl: string,
  options?: {
    voice?: string
    maxLength?: number
    transcribe?: boolean
  }
): string {
  return new TwiMLBuilder()
    .say(greeting, { voice: options?.voice })
    .record({
      maxLength: options?.maxLength ?? 120,
      transcribe: options?.transcribe ?? true,
      action: actionUrl,
      playBeep: true,
    })
    .say('I did not receive a recording. Goodbye.', { voice: options?.voice })
    .hangup()
    .build()
}

/**
 * Create TwiML from call actions
 */
export function buildTwiML(actions: CallAction[]): string {
  return TwiMLBuilder.fromActions(actions)
}
