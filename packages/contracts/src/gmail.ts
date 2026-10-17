import { z } from "zod";
import { financialAccountIdSchema, gmailConnectionIdSchema, isoDateTimeSchema } from "./common.ts";
import { institutionKeySchema, institutionPlatformSchema } from "./institutions.ts";

export const MAX_ACTIVE_GMAIL_CONNECTIONS = 3;

export const gmailConnectionStatusSchema = z.enum(["active", "disconnected", "error"]);

const countSchema = z.number().int().nonnegative();

/**
 * How a connection's imported mail has turned out, for Sync Now. Counts are per
 * email; importedTransactions counts the Transactions those emails created.
 */
export const gmailSyncCountsSchema = z
  .object({
    imported: countSchema,
    skipped: countSchema,
    failed: countSchema,
    inProgress: countSchema,
    importedTransactions: countSchema,
  })
  .strict();

export const gmailSyncStateSchema = z.enum(["idle", "queued", "running", "completed", "failed"]);

export const gmailSyncErrorSchema = z.enum([
  "agent_unavailable",
  "gmail_unavailable",
  "sync_failed",
  "stalled",
]);

/**
 * The latest sync of a connection, stored on the server so it survives reloads.
 * Counts cover only the emails that sync claimed; confirmedTransactions are the
 * ones confirmed automatically because the extraction was confident and complete.
 */
export const gmailSyncStatusSchema = z
  .object({
    state: gmailSyncStateSchema,
    error: gmailSyncErrorSchema.nullable(),
    requestedAt: isoDateTimeSchema.nullable(),
    counts: gmailSyncCountsSchema.extend({ confirmedTransactions: countSchema }).strict(),
  })
  .strict();

// Never includes the Composio connected account id; only the backend uses it.
export const gmailConnectionSchema = z
  .object({
    id: gmailConnectionIdSchema,
    gmailAddress: z.email().max(320),
    status: gmailConnectionStatusSchema,
    lastSyncedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    sync: gmailSyncStatusSchema,
    /** Banks, cards, and wallets found after the first scan that have no account yet. */
    newAccounts: z.number().int().nonnegative().default(0),
  })
  .strict();

export const gmailConnectionListSchema = z
  .object({
    connections: z.array(gmailConnectionSchema),
  })
  .strict();

// The browser navigates to redirectUrl, Composio's hosted Google consent page.
export const startGmailConnectionResultSchema = z
  .object({
    redirectUrl: z.url({ protocol: /^https$/ }),
  })
  .strict();

export const disconnectGmailConnectionInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
  })
  .strict();

/** Sync Now queues a background sync; counts show progress as it runs. */
export const gmailSyncResultSchema = z
  .object({
    status: z.literal("queued"),
    counts: gmailSyncCountsSchema,
  })
  .strict();

export type GmailConnectionStatus = z.infer<typeof gmailConnectionStatusSchema>;
export type GmailSyncCounts = z.infer<typeof gmailSyncCountsSchema>;
export type GmailSyncStatus = z.infer<typeof gmailSyncStatusSchema>;
export type GmailSyncResult = z.infer<typeof gmailSyncResultSchema>;
export type GmailConnection = z.infer<typeof gmailConnectionSchema>;
export type GmailConnectionList = z.infer<typeof gmailConnectionListSchema>;
export type StartGmailConnectionResult = z.infer<typeof startGmailConnectionResultSchema>;
export type DisconnectGmailConnectionInput = z.input<typeof disconnectGmailConnectionInputSchema>;

export const gmailDiscoveryStateSchema = z.enum(["idle", "running", "completed", "failed"]);

/**
 * A registry entry that has emailed the mailbox. linkedAccounts are the User's
 * accounts already set to this entry; when empty, the app suggests adding one.
 */
export const gmailAccountSuggestionSchema = z
  .object({
    institutionKey: institutionKeySchema,
    name: z.string().min(1).max(100),
    provider: z.string().min(1).max(100),
    platform: institutionPlatformSchema,
    emailCount: z.number().int().positive(),
    lastFours: z.array(z.string().regex(/^[0-9]{4}$/)).max(10),
    linkedAccounts: z.array(
      z.object({ id: financialAccountIdSchema, name: z.string().min(1).max(100) }).strict(),
    ),
    /** Found by a later scan, not yet added or dismissed. */
    isNew: z.boolean().default(false),
  })
  .strict();

/** Which banks, cards, and wallets were found in one of the User's mailboxes. */
export const gmailDiscoverySchema = z
  .object({
    state: gmailDiscoveryStateSchema,
    suggestions: z.array(gmailAccountSuggestionSchema),
  })
  .strict();

/** Hides a newly found bank, card, or wallet from the "new account" notice. */
export const dismissGmailDiscoveryInputSchema = z
  .object({
    connectionId: gmailConnectionIdSchema,
    institutionKey: institutionKeySchema,
  })
  .strict();

export type GmailAccountSuggestion = z.infer<typeof gmailAccountSuggestionSchema>;
export type GmailDiscovery = z.infer<typeof gmailDiscoverySchema>;
