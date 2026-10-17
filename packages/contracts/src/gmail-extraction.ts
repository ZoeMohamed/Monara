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
import { institutionKeySchema } from "./institutions.ts";
import { transactionKindSchema } from "./transactions.ts";

export const gmailMessageIdSchema = z.string().trim().min(1).max(500);
export const processedGmailMessageIdSchema = z.uuid();

const categoryNameSchema = z.string().trim().min(1).max(100);
const lastFourSchema = z.string().regex(/^[0-9]{4}$/);

/**
 * One transaction read from an email. Every field stays null when the email does
 * not state it. The Financial Account comes from the email's sender, not from the
 * extractor; accountLastFour only tells apart several accounts of that sender's
 * institution. The Category is set later, by categorization.
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
    accountLastFour: lastFourSchema.nullable(),
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
    /** Only these registry entries' senders; null reads every entry the mailbox's accounts have. */
    institutionKeys: z.array(institutionKeySchema).min(1).max(100).nullable().default(null),
    /** Exactly these messages, e.g. from a new-mail trigger; null lists the import window. */
    messageIds: z.array(gmailMessageIdSchema).min(1).max(100).nullable().default(null),
    /**
     * Whether this run drives the connection's sync status. A run that starts while
     * another is going adds its messages to that one instead of restarting its status.
     */
    tracksSync: z.boolean().default(true),
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

/** The most emails one parse job carries. Keeps a job inside one consumer invocation's request budget. */
export const GMAIL_PARSE_JOB_MAX_EMAILS = 10;

/**
 * Parses up to ten claimed messages of one connection. Ingest claims them first and
 * passes the claim ids along, so parsing needs no claim call of its own.
 */
export const gmailParseJobSchema = z
  .object({
    kind: z.literal("gmail.parse"),
    connectionId: gmailConnectionIdSchema,
    emails: z
      .array(
        z
          .object({
            processedMessageId: processedGmailMessageIdSchema,
            gmailMessageId: gmailMessageIdSchema,
            /** As claimed; the real time is read from the message itself. */
            receivedAt: isoDateTimeSchema,
          })
          .strict(),
      )
      .min(1)
      .max(GMAIL_PARSE_JOB_MAX_EMAILS),
  })
  .strict();

/** After a connection, finds which registry entries have emailed the mailbox. Reads metadata only. */
export const gmailDiscoveryJobSchema = z
  .object({
    kind: z.literal("gmail.discover"),
    connectionId: gmailConnectionIdSchema,
  })
  .strict();

export const gmailJobSchema = z.discriminatedUnion("kind", [
  gmailSyncJobSchema,
  gmailParseJobSchema,
  // Single-message jobs queued before parse jobs existed; still run until they drain.
  gmailExtractionJobSchema,
  gmailDiscoveryJobSchema,
]);

export const MERCHANT_JOB_MAX_TRANSACTIONS = 10;

/**
 * Categorizes imported transactions by their merchants. Runs on its own queue so
 * web searches never hold up extraction and can be throttled separately. The
 * single transactionId form was queued before batching and still runs until it drains.
 */
export const merchantCategorizeJobSchema = z.union([
  z
    .object({
      kind: z.literal("merchant.categorize"),
      transactionIds: z.array(transactionIdSchema).min(1).max(MERCHANT_JOB_MAX_TRANSACTIONS),
    })
    .strict(),
  z
    .object({
      kind: z.literal("merchant.categorize"),
      transactionId: transactionIdSchema,
    })
    .strict(),
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
          /** Whether any active account reads from this mailbox. */
          hasAccounts: z.boolean(),
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

export const gmailIngestReasonSchema = z.enum([
  "onboarding",
  "account_added",
  "account_moved",
  "connection_added",
  "trigger",
  "daily",
]);

/** Asks the agent to import a connection's mail. Only the authenticated web backend sends it. */
export const requestGmailIngestInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    reason: gmailIngestReasonSchema,
    institutionKeys: z.array(institutionKeySchema).min(1).max(100).nullable().default(null),
    messageIds: z.array(gmailMessageIdSchema).min(1).max(100).nullable().default(null),
    tracksSync: z.boolean().default(true),
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
    /** The owner's unarchived Category names, offered to categorization. */
    categoryNames: z.array(categoryNameSchema).max(200),
    /**
     * The owner's name, to tell transfers between their own accounts apart: the
     * profile's full name, else the Google account name. Null when neither is known.
     */
    holderName: z.string().trim().min(1).max(100).nullable().default(null),
    /**
     * Registry entries the owner has as active Financial Accounts. Sync reads mail
     * only from these entries' senders.
     */
    institutionKeys: z.array(institutionKeySchema).max(100),
  })
  .strict();

/** The agent began listing a connection's mail, for Sync Now or the schedule. */
export const startGmailSyncInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
  })
  .strict();

export const startGmailSyncResultSchema = z.object({}).strict();

/**
 * One listed page of messages, claimed before extraction jobs are queued so the
 * sync's progress and completion can be derived from stored message outcomes.
 */
export const claimGmailMessagesInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    messages: z
      .array(
        z
          .object({
            gmailMessageId: gmailMessageIdSchema,
            receivedAt: isoDateTimeSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const claimGmailMessagesResultSchema = z
  .object({
    /** Listed messages that still need extraction; finished ones are left out. */
    pendingGmailMessageIds: z.array(gmailMessageIdSchema).max(100),
    /** The same messages with their claim ids, which parse jobs carry. */
    pending: z
      .array(
        z
          .object({
            gmailMessageId: gmailMessageIdSchema,
            processedMessageId: processedGmailMessageIdSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

/** Sent when a sync job gave up, so the User sees the failure instead of a sync that never ends. */
export const reportGmailSyncFailureInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    reason: z.enum(["gmail_unavailable", "sync_failed"]),
  })
  .strict();

export const reportGmailSyncFailureResultSchema = z.object({}).strict();

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
    /** The registry entry of the email's sender; null when the sender is not listed. */
    institutionKey: institutionKeySchema.nullable(),
    /** Gmail authenticated the sender's domain with DKIM or SPF. Required for auto-confirm. */
    senderVerified: z.boolean(),
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
    /** Transactions with a merchant whose Category the User's history could not supply. */
    uncategorizedTransactionIds: z.array(transactionIdSchema),
  })
  .strict();

/** One parse job's outcomes, recorded together. Each message is still finished once, under its own lock. */
export const recordGmailExtractionsInputSchema = z
  .object({
    results: z.array(recordGmailExtractionInputSchema).min(1).max(GMAIL_PARSE_JOB_MAX_EMAILS),
  })
  .strict();

/** In the same order as the input. */
export const recordGmailExtractionsResultSchema = z
  .object({
    results: z.array(recordGmailExtractionResultSchema).max(GMAIL_PARSE_JOB_MAX_EMAILS),
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
export type GmailParseJob = z.infer<typeof gmailParseJobSchema>;
export type GmailJob = z.infer<typeof gmailJobSchema>;
export type GmailDiscoveryJob = z.infer<typeof gmailDiscoveryJobSchema>;
export type MerchantCategorizeJob = z.infer<typeof merchantCategorizeJobSchema>;
export type ListActiveGmailConnectionsResult = z.infer<
  typeof listActiveGmailConnectionsResultSchema
>;
export type ResolveGmailConnectionInput = z.input<typeof resolveGmailConnectionInputSchema>;
export type RequestGmailSyncInput = z.input<typeof requestGmailSyncInputSchema>;
export type RequestGmailIngestInput = z.input<typeof requestGmailIngestInputSchema>;
export type GmailIngestReason = z.infer<typeof gmailIngestReasonSchema>;
export type ResolvedGmailConnection = z.infer<typeof resolvedGmailConnectionSchema>;
export type StartGmailSyncInput = z.input<typeof startGmailSyncInputSchema>;
export type ClaimGmailMessagesInput = z.input<typeof claimGmailMessagesInputSchema>;
export type ClaimGmailMessagesResult = z.infer<typeof claimGmailMessagesResultSchema>;
export type ReportGmailSyncFailureInput = z.input<typeof reportGmailSyncFailureInputSchema>;
export type ClaimGmailMessageInput = z.input<typeof claimGmailMessageInputSchema>;
export type ClaimGmailMessageResult = z.infer<typeof claimGmailMessageResultSchema>;
export type GmailExtractionOutcome = z.infer<typeof gmailExtractionOutcomeSchema>;
export type RecordGmailExtractionInput = z.input<typeof recordGmailExtractionInputSchema>;
export type RecordGmailExtractionResult = z.infer<typeof recordGmailExtractionResultSchema>;
export type RecordGmailExtractionsInput = z.input<typeof recordGmailExtractionsInputSchema>;
export type RecordGmailExtractionsResult = z.infer<typeof recordGmailExtractionsResultSchema>;
export type MarkGmailConnectionSyncedInput = z.input<typeof markGmailConnectionSyncedInputSchema>;
export type ReportGmailConnectionErrorInput = z.input<typeof reportGmailConnectionErrorInputSchema>;

export const startGmailDiscoveryInputSchema = z
  .object({ connectionId: gmailConnectionIdSchema })
  .strict();

export const gmailDiscoveryFindingSchema = z
  .object({
    institutionKey: institutionKeySchema,
    emailCount: z.number().int().positive(),
    /** Card or account endings seen in the senders' subjects, at most ten. */
    lastFours: z.array(lastFourSchema).max(10),
    lastSeenAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const recordGmailDiscoveryInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    findings: z.array(gmailDiscoveryFindingSchema).max(100),
  })
  .strict();

export const reportGmailDiscoveryFailureInputSchema = z
  .object({ connectionId: gmailConnectionIdSchema })
  .strict();

/** Normalizes a merchant name the same way as the database: lowercase, single spaces. */
export function merchantKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const merchantNameSchema = z.string().trim().min(1).max(200);

export const resolveImportedTransactionInputSchema = z
  .object({ transactionId: transactionIdSchema })
  .strict();

/** What categorization needs. Carries no User id, amounts, or email content. */
export const resolvedImportedTransactionSchema = z
  .object({
    merchantName: merchantNameSchema.nullable(),
    location: z.string().trim().min(1).max(300).nullable(),
    /** False once the transaction has a Category or the User edited or deleted it. */
    needsCategory: z.boolean(),
    categoryNames: z.array(categoryNameSchema).max(200),
  })
  .strict();

export const claimMerchantProfileInputSchema = z
  .object({ merchantName: merchantNameSchema })
  .strict();

/**
 * claimed: this job must search and save; ready: use the cached summary (null when
 * nothing useful was found); busy: another job is searching, so retry shortly.
 */
export const claimMerchantProfileResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("claimed") }).strict(),
  z.object({ status: z.literal("busy") }).strict(),
  z.object({ status: z.literal("ready"), summary: z.string().max(2_000).nullable() }).strict(),
]);

export const saveMerchantProfileInputSchema = z
  .object({
    merchantName: merchantNameSchema,
    /** Public facts from web search only; null records that nothing useful was found. */
    summary: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict();

export const releaseMerchantProfileInputSchema = z
  .object({ merchantName: merchantNameSchema })
  .strict();

export const setImportedCategoryInputSchema = z
  .object({
    transactionId: transactionIdSchema,
    categoryName: categoryNameSchema,
  })
  .strict();

/** applied is false when the transaction already had a Category or the User changed it. */
export const setImportedCategoryResultSchema = z.object({ applied: z.boolean() }).strict();

export const emptyResultSchema = z.object({}).strict();

export type StartGmailDiscoveryInput = z.input<typeof startGmailDiscoveryInputSchema>;
export type GmailDiscoveryFinding = z.infer<typeof gmailDiscoveryFindingSchema>;
export type RecordGmailDiscoveryInput = z.input<typeof recordGmailDiscoveryInputSchema>;
export type ResolvedImportedTransaction = z.infer<typeof resolvedImportedTransactionSchema>;
export type ClaimMerchantProfileResult = z.infer<typeof claimMerchantProfileResultSchema>;
export type SaveMerchantProfileInput = z.input<typeof saveMerchantProfileInputSchema>;
export type SetImportedCategoryInput = z.input<typeof setImportedCategoryInputSchema>;
