/**
 * Phone Internal Modules
 *
 * Internal implementation details for the phone channel.
 * These are not part of the public API.
 *
 * @internal
 * @module tools/communication/phone/internal
 */

export {
  TwiMLBuilder,
  escapeXml,
  buildTwiML,
  sayResponse,
  messageResponse,
  menuResponse,
  forwardResponse,
  voicemailResponse,
  type SayOptions,
  type PlayOptions,
  type GatherOptions,
  type DialOptions,
  type RecordOptions,
  type ConferenceOptions,
  type PauseOptions,
  type RejectOptions,
  type MessageOptions,
  type RedirectOptions,
} from './twiml'

export {
  WebhookHandler,
  detectProvider,
  hmacSha1,
  hmacSha256,
  buildTwilioSignatureString,
  validateTwilioSignature,
  parseInboundCallEvent,
  parseInboundSMSEvent,
  parseCallStatusEvent,
  parseSMSStatusEvent,
  type CallStatusEvent,
  type SMSStatusEvent,
  type RecordingStatusEvent,
  type WebhookParseOptions,
} from './webhooks'
