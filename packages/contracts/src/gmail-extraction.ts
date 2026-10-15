import { z } from "zod";
import {
  calendarDateSchema,
  gmailConnectionIdSchema,
  isoDateTimeSchema,
  localTimeSchema,
  positiveMoneySchema,
  transactionIdSchema,
  userIdSchema,
} from "./common.ts";
import { transactionKindSchema } from "./transactions.ts";

export const gmailMessageIdSchema = z.string().trim().min(1).max(500);
export const processedGmailMessageIdSchema = z.uuid();

const categoryNameSchema = z.string().trim().min(1).max(100);

/**
 * One transaction read from an email. Every field stays null when the email
 * does not state it. The extractor never sees ids: categoryName is one of the
 * User's own Category names, which the backend maps to that User's Category.
 */
export const extractedTransactionSchema = z
  .object({
    kind: transactionKindSchema.nullable(),
    merchantName: z.string().trim().min(1).max(200).nullable(),
    money: positiveMoneySchema.nullable(),
    occurredOn: calendarDateSchema.nullable(),
    occurredTime: localTimeSchema.nullable(),
    description: z.string().trim().min(1).max(1_000).nullable(),
    location: z.string().trim().min(1).max(300).nullable(),
    accountHint: z.string().trim().min(1).max(200).nullable(),
    categoryName: categoryNameSchema.nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

// Queue jobs carry no User identity; consumers resolve it through the backend.
export const gmailSyncJobSchema = z
  .object({
    kind: z.literal("gmail.sync"),
    connectionId: gmailConnectionIdSchema,
    /** Scan mail from this point; null scans the initial import window. */
    since: isoDateTimeSchema.nullable(),
    /** Set on follow-up jobs that continue a listing one page at a time. */
    pageToken: z.string().min(1).max(2_000).nullable(),
    /** When the first page of this sync started; recorded as the sync time after the last page. */
    startedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const gmailExtractionJobSchema = z
  .object({
    kind: z.literal("gmail.extract"),
    connectionId: gmailConnectionIdSchema,
    gmailMessageId: gmailMessageIdSchema,
    /** Null when the listing had no timestamp; the consumer reads it from the message. */
    receivedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const gmailJobSchema = z.discriminatedUnion("kind", [
  gmailSyncJobSchema,
  gmailExtractionJobSchema,
]);

// Gmail ingestion operations: POST /api/agent/gmail/<name without "gmail.">, authenticated
// with the agent backend credential. The backend derives the User from its own
// records, never from these inputs. Every operation that names a connection
// returns 404 NOT_FOUND once it is no longer active.

export const listActiveGmailConnectionsResultSchema = z
  .object({
    connections: z.array(
      z
        .object({
          connectionId: gmailConnectionIdSchema,
          lastSyncedAt: isoDateTimeSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const resolveGmailConnectionInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
  })
  .strict();

/** Manual sync input from the authenticated web backend to the Agent. */
export const requestGmailSyncInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    /** Null only for the first import; later syncs overlap the previous cursor. */
    since: isoDateTimeSchema.nullable(),
  })
  .strict();

export const resolvedGmailConnectionSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    userId: userIdSchema,
    composioConnectedAccountId: z.string().trim().min(1).max(300),
    /** The owner's unarchived Category names, offered to the extractor. */
    categoryNames: z.array(categoryNameSchema).max(200),
  })
  .strict();

export const claimGmailMessageInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    gmailMessageId: gmailMessageIdSchema,
    receivedAt: isoDateTimeSchema,
  })
  .strict();

/** alreadyFinished is true once the message was processed or skipped. */
export const claimGmailMessageResultSchema = z
  .object({
    processedMessageId: processedGmailMessageIdSchema,
    alreadyFinished: z.boolean(),
  })
  .strict();

export const gmailExtractionOutcomeSchema = z.enum(["transactions", "skipped", "failed"]);

export const recordGmailExtractionInputSchema = z
  .object({
    processedMessageId: processedGmailMessageIdSchema,
    outcome: gmailExtractionOutcomeSchema,
    items: z.array(extractedTransactionSchema).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outcome === "transactions" && value.items.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "A transactions outcome needs at least one item.",
      });
    }
    if (value.outcome !== "transactions" && value.items.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Only a transactions outcome carries items.",
      });
    }
  });

/** alreadyFinished: another run recorded this message first; its ids are returned unchanged. */
export const recordGmailExtractionResultSchema = z
  .object({
    transactionIds: z.array(transactionIdSchema),
    alreadyFinished: z.boolean(),
  })
  .strict();

export const markGmailConnectionSyncedInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    syncedAt: isoDateTimeSchema,
  })
  .strict();

export const markGmailConnectionSyncedResultSchema = z.object({}).strict();

/**
 * Sent only after Composio itself reports the connected account as no longer
 * usable. The backend sets the connection's status to error, which stops syncs.
 */
export const reportGmailConnectionErrorInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    reason: z.enum(["authorization_lost"]),
  })
  .strict();

export const reportGmailConnectionErrorResultSchema = z.object({}).strict();

export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;
export type GmailSyncJob = z.infer<typeof gmailSyncJobSchema>;
export type GmailExtractionJob = z.infer<typeof gmailExtractionJobSchema>;
export type GmailJob = z.infer<typeof gmailJobSchema>;
export type ListActiveGmailConnectionsResult = z.infer<
  typeof listActiveGmailConnectionsResultSchema
>;
export type ResolveGmailConnectionInput = z.input<typeof resolveGmailConnectionInputSchema>;
export type RequestGmailSyncInput = z.input<typeof requestGmailSyncInputSchema>;
export type ResolvedGmailConnection = z.infer<typeof resolvedGmailConnectionSchema>;
export type ClaimGmailMessageInput = z.input<typeof claimGmailMessageInputSchema>;
export type ClaimGmailMessageResult = z.infer<typeof claimGmailMessageResultSchema>;
export type GmailExtractionOutcome = z.infer<typeof gmailExtractionOutcomeSchema>;
export type RecordGmailExtractionInput = z.input<typeof recordGmailExtractionInputSchema>;
export type RecordGmailExtractionResult = z.infer<typeof recordGmailExtractionResultSchema>;
export type MarkGmailConnectionSyncedInput = z.input<typeof markGmailConnectionSyncedInputSchema>;
export type ReportGmailConnectionErrorInput = z.input<typeof reportGmailConnectionErrorInputSchema>;
