// Gmail ingestion operations the agent worker calls (AD2, AD4). The route
// authenticates the agent; these inputs are system jobs with no signed-in User,
// so ownership always comes from the stored connection, never from the caller.
import {
  type ClaimGmailMessageResult,
  claimGmailMessageInputSchema,
  type GmailConnectionId,
  type GmailSyncCounts,
  type ListActiveGmailConnectionsResult,
  markGmailConnectionSyncedInputSchema,
  type OperationErrorCode,
  type RecordGmailExtractionResult,
  type ResolvedGmailConnection,
  recordGmailExtractionInputSchema,
  reportGmailConnectionErrorInputSchema,
  resolveGmailConnectionInputSchema,
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

/** Every method that names a connection throws NOT_FOUND unless it is active. */
export interface GmailIngestionRepository {
  listActiveConnections(): Promise<ListActiveGmailConnectionsResult>;
  resolveConnection(connectionId: GmailConnectionId): Promise<ResolvedGmailConnection>;
  claimMessage(
    input: Parsed<typeof claimGmailMessageInputSchema>,
  ): Promise<ClaimGmailMessageResult>;
  recordExtraction(
    input: Parsed<typeof recordGmailExtractionInputSchema>,
  ): Promise<RecordGmailExtractionResult>;
  markSynced(input: Parsed<typeof markGmailConnectionSyncedInputSchema>): Promise<void>;
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
  "mark-synced",
  "report-connection-error",
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
    case "record-extraction":
      return repository.recordExtraction(parse(recordGmailExtractionInputSchema, input));
    case "mark-synced":
      await repository.markSynced(parse(markGmailConnectionSyncedInputSchema, input));
      return {};
    case "report-connection-error":
      await repository.markError(parse(reportGmailConnectionErrorInputSchema, input).connectionId);
      return {};
  }
}
