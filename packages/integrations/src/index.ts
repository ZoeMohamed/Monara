export type {
  CompleteConnectionResult,
  ComposioGmailClient,
  ComposioGmailConfig,
  GmailConnector,
} from "./gmail.ts";
export { ComposioRequestError, createComposioGmailClient } from "./gmail.ts";
export type {
  ComposioGmailReader,
  GmailMailbox,
  GmailMessageContent,
  GmailMessagePage,
  GmailMessageSummary,
} from "./gmail-read.ts";
export { createComposioGmailReader, decodeBase64Url, GmailReadError } from "./gmail-read.ts";
export type { KapsoInboundMedia, KapsoInboundMessage, WhatsAppTransport } from "./whatsapp.ts";
export {
  createKapsoTransport,
  KAPSO_MESSAGE_RECEIVED_EVENT,
  parseKapsoInboundMessages,
  verifyKapsoSignature,
} from "./whatsapp.ts";
