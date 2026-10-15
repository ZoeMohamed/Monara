import { z } from "zod";
import { gmailConnectionIdSchema, isoDateTimeSchema } from "./common.ts";

export const MAX_ACTIVE_GMAIL_CONNECTIONS = 3;

export const gmailConnectionStatusSchema = z.enum(["active", "disconnected", "error"]);

// Never includes the Composio connected account id; only the backend uses it.
export const gmailConnectionSchema = z
  .object({
    id: gmailConnectionIdSchema,
    gmailAddress: z.email().max(320),
    status: gmailConnectionStatusSchema,
    lastSyncedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
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

const countSchema = z.number().int().nonnegative();

/**
 * How a connection's imported mail has turned out, for Sync Now. Counts are per
 * email; importedTransactions counts the Pending Transactions those emails created.
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

/** Sync Now queues a background sync; counts show progress as it runs. */
export const gmailSyncResultSchema = z
  .object({
    status: z.literal("queued"),
    counts: gmailSyncCountsSchema,
  })
  .strict();

export type GmailConnectionStatus = z.infer<typeof gmailConnectionStatusSchema>;
export type GmailSyncCounts = z.infer<typeof gmailSyncCountsSchema>;
export type GmailSyncResult = z.infer<typeof gmailSyncResultSchema>;
export type GmailConnection = z.infer<typeof gmailConnectionSchema>;
export type GmailConnectionList = z.infer<typeof gmailConnectionListSchema>;
export type StartGmailConnectionResult = z.infer<typeof startGmailConnectionResultSchema>;
export type DisconnectGmailConnectionInput = z.input<typeof disconnectGmailConnectionInputSchema>;
