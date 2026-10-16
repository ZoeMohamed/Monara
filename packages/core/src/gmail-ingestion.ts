// Gmail ingestion operations the agent worker calls (AD2, AD4). The route
// authenticates the agent; these inputs are system jobs with no signed-in User,
// so ownership always comes from the stored connection, never from the caller.
import {
  type ClaimGmailMessageResult,
  type ClaimGmailMessagesResult,
  type ClaimMerchantProfileResult,
  claimGmailMessageInputSchema,
  claimGmailMessagesInputSchema,
  claimMerchantProfileInputSchema,
  type GmailConnectionId,
  type GmailDiscovery,
  type GmailSyncCounts,
  type ListActiveGmailConnectionsResult,
  markGmailConnectionSyncedInputSchema,
  type OperationErrorCode,
  type RecordGmailExtractionResult,
  type ResolvedGmailConnection,
  type ResolvedImportedTransaction,
  recordGmailDiscoveryInputSchema,
  recordGmailExtractionInputSchema,
  releaseMerchantProfileInputSchema,
  reportGmailConnectionErrorInputSchema,
  reportGmailDiscoveryFailureInputSchema,
  reportGmailSyncFailureInputSchema,
  resolveGmailConnectionInputSchema,
  resolveImportedTransactionInputSchema,
  saveMerchantProfileInputSchema,
  setImportedCategoryInputSchema,
  startGmailDiscoveryInputSchema,
  startGmailSyncInputSchema,
  type UserId,
} from "@monara/contracts";
import type { z } from "zod";

/** A failure the route maps to a status. Messages never include stored data. */
export class GmailIngestionError extends Error {
  readonly code: OperationErrorCode;

  constructor(code: OperationErrorCode, message: string) {
    super(message);
    this.name = "GmailIngestionError";
    this.code = code;
  }
}

export const connectionNotActive = () =>
  new GmailIngestionError("NOT_FOUND", "The Gmail connection is not active.");

type Parsed<T extends z.ZodType> = z.output<T>;

/** A recorded extraction, plus what the backend needs to follow up on confirmed items. */
interface RecordedGmailExtraction extends RecordGmailExtractionResult {
  userId: UserId;
  /** Items confirmed without review because they were confident and complete. */
  confirmedTransactionIds: string[];
}

/** Runs after an extraction confirmed Transactions without review, e.g. to check budgets. */
export type ConfirmedTransactionsHook = (
  userId: UserId,
  transactionIds: readonly string[],
) => Promise<void>;

/** Every method that names a connection throws NOT_FOUND unless it is active. */
export interface GmailIngestionRepository {
  listActiveConnections(): Promise<ListActiveGmailConnectionsResult>;
  resolveConnection(connectionId: GmailConnectionId): Promise<ResolvedGmailConnection>;
  claimMessage(
    input: Parsed<typeof claimGmailMessageInputSchema>,
  ): Promise<ClaimGmailMessageResult>;
  recordExtraction(
    input: Parsed<typeof recordGmailExtractionInputSchema>,
  ): Promise<RecordedGmailExtraction>;
  /** Moves the connection's sync to listing; a scheduled sync starts a new one here. */
  startSync(connectionId: GmailConnectionId): Promise<void>;
  /** Claims one listed page so the sync can track it; already claimed messages are kept. */
  claimMessages(
    input: Parsed<typeof claimGmailMessagesInputSchema>,
  ): Promise<ClaimGmailMessagesResult>;
  markSynced(input: Parsed<typeof markGmailConnectionSyncedInputSchema>): Promise<void>;
  /** Records why a sync stopped. Never overwrites a newer request when requestedAt is given. */
  failSync(input: {
    connectionId: GmailConnectionId;
    error: "agent_unavailable" | "gmail_unavailable" | "sync_failed";
    requestedAt?: string;
  }): Promise<void>;
  /**
   * Marks a sync of one of the User's active connections as queued and returns when.
   * CONFLICT while another sync is queued or running; NOT_FOUND if not theirs or inactive.
   */
  requestSync(userId: UserId, connectionId: GmailConnectionId): Promise<string>;
  startDiscovery(connectionId: GmailConnectionId): Promise<void>;
  recordDiscovery(input: Parsed<typeof recordGmailDiscoveryInputSchema>): Promise<void>;
  failDiscovery(connectionId: GmailConnectionId): Promise<void>;
  /** The User's own discovery view for one connection; NOT_FOUND if it is not theirs. */
  discoveryFor(userId: UserId, connectionId: GmailConnectionId): Promise<GmailDiscovery>;
  /** NOT_FOUND unless the id is a Gmail-imported transaction. */
  resolveImportedTransaction(transactionId: string): Promise<ResolvedImportedTransaction>;
  claimMerchantProfile(merchantName: string): Promise<ClaimMerchantProfileResult>;
  saveMerchantProfile(input: Parsed<typeof saveMerchantProfileInputSchema>): Promise<void>;
  releaseMerchantProfile(merchantName: string): Promise<void>;
  /** Fills an imported transaction's empty Category; never overrides the User. */
  setImportedCategory(input: Parsed<typeof setImportedCategoryInputSchema>): Promise<{
    applied: boolean;
    userId: UserId;
    confirmed: boolean;
  }>;
  /** Sets an active connection to error so syncs stop until the User reconnects. */
  markError(connectionId: GmailConnectionId): Promise<void>;
  /** Message outcomes for one of the User's connections; NOT_FOUND if it is not theirs. */
  syncCounts(userId: UserId, connectionId: GmailConnectionId): Promise<GmailSyncCounts>;
}

const GMAIL_INGESTION_OPERATIONS = [
  "list-active-connections",
  "resolve-connection",
  "claim-message",
  "record-extraction",
  "start-sync",
  "claim-messages",
  "mark-synced",
  "report-sync-failure",
  "report-connection-error",
  "start-discovery",
  "record-discovery",
  "report-discovery-failure",
  "resolve-imported-transaction",
  "claim-merchant-profile",
  "save-merchant-profile",
  "release-merchant-profile",
  "set-imported-category",
] as const;

export type GmailIngestionOperation = (typeof GMAIL_INGESTION_OPERATIONS)[number];

export function isGmailIngestionOperation(value: string): value is GmailIngestionOperation {
  return (GMAIL_INGESTION_OPERATIONS as readonly string[]).includes(value);
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new GmailIngestionError("VALIDATION_FAILED", "The request is not valid.");
  }
  return result.data;
}

/** Validates one operation's input and runs it. Results match the contract schemas. */
export async function runGmailIngestionOperation(
  repository: GmailIngestionRepository,
  operation: GmailIngestionOperation,
  input: unknown,
  hooks: { onTransactionsConfirmed?: ConfirmedTransactionsHook } = {},
): Promise<unknown> {
  switch (operation) {
    case "list-active-connections":
      return repository.listActiveConnections();
    case "resolve-connection":
      return repository.resolveConnection(
        parse(resolveGmailConnectionInputSchema, input).connectionId,
      );
    case "claim-message":
      return repository.claimMessage(parse(claimGmailMessageInputSchema, input));
    case "record-extraction": {
      const { userId, confirmedTransactionIds, ...result } = await repository.recordExtraction(
        parse(recordGmailExtractionInputSchema, input),
      );
      // A retried record returns alreadyFinished; its follow-up already ran the first time.
      if (!result.alreadyFinished && confirmedTransactionIds.length > 0) {
        await hooks.onTransactionsConfirmed?.(userId, confirmedTransactionIds);
      }
      return result;
    }
    case "start-sync":
      await repository.startSync(parse(startGmailSyncInputSchema, input).connectionId);
      return {};
    case "claim-messages":
      return repository.claimMessages(parse(claimGmailMessagesInputSchema, input));
    case "report-sync-failure": {
      const failure = parse(reportGmailSyncFailureInputSchema, input);
      await repository.failSync({ connectionId: failure.connectionId, error: failure.reason });
      return {};
    }
    case "start-discovery":
      await repository.startDiscovery(parse(startGmailDiscoveryInputSchema, input).connectionId);
      return {};
    case "record-discovery":
      await repository.recordDiscovery(parse(recordGmailDiscoveryInputSchema, input));
      return {};
    case "report-discovery-failure":
      await repository.failDiscovery(
        parse(reportGmailDiscoveryFailureInputSchema, input).connectionId,
      );
      return {};
    case "resolve-imported-transaction":
      return repository.resolveImportedTransaction(
        parse(resolveImportedTransactionInputSchema, input).transactionId,
      );
    case "claim-merchant-profile":
      return repository.claimMerchantProfile(
        parse(claimMerchantProfileInputSchema, input).merchantName,
      );
    case "save-merchant-profile":
      await repository.saveMerchantProfile(parse(saveMerchantProfileInputSchema, input));
      return {};
    case "release-merchant-profile":
      await repository.releaseMerchantProfile(
        parse(releaseMerchantProfileInputSchema, input).merchantName,
      );
      return {};
    case "set-imported-category": {
      const values = parse(setImportedCategoryInputSchema, input);
      const { applied, userId, confirmed } = await repository.setImportedCategory(values);
      // A Category can move a confirmed expense into a Budget, so check thresholds again.
      if (applied && confirmed) {
        await hooks.onTransactionsConfirmed?.(userId, [values.transactionId]);
      }
      return { applied };
    }
    case "mark-synced":
      await repository.markSynced(parse(markGmailConnectionSyncedInputSchema, input));
      return {};
    case "report-connection-error":
      await repository.markError(parse(reportGmailConnectionErrorInputSchema, input).connectionId);
      return {};
  }
}
