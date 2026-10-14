import {
  type ClaimGmailMessageInput,
  type ClaimGmailMessageResult,
  claimGmailMessageInputSchema,
  claimGmailMessageResultSchema,
  type ListActiveGmailConnectionsResult,
  listActiveGmailConnectionsResultSchema,
  type MarkGmailConnectionSyncedInput,
  markGmailConnectionSyncedInputSchema,
  markGmailConnectionSyncedResultSchema,
  operationErrorSchema,
  type RecordGmailExtractionInput,
  type RecordGmailExtractionResult,
  type ReportGmailConnectionErrorInput,
  type ResolvedGmailConnection,
  recordGmailExtractionInputSchema,
  recordGmailExtractionResultSchema,
  reportGmailConnectionErrorInputSchema,
  reportGmailConnectionErrorResultSchema,
  resolvedGmailConnectionSchema,
  resolveGmailConnectionInputSchema,
} from "@monara/contracts";
import type { z } from "zod";

const REQUEST_TIMEOUT_MS = 15_000;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface BackendConfig {
  baseUrl: string;
  secret: string;
  fetcher?: Fetcher;
}

/** A failed backend operation. Carries the operation name and error code only. */
export class BackendOperationError extends Error {
  readonly operation: string;
  readonly status: number | null;
  readonly code: string | null;

  constructor(operation: string, status: number | null, code: string | null) {
    super(`Backend operation ${operation} failed${code ? ` with ${code}` : ""}.`);
    this.name = "BackendOperationError";
    this.operation = operation;
    this.status = status;
    this.code = code;
  }

  /**
   * The connection is gone or no longer active, so the job should stop rather than retry.
   * Requires the backend's JSON NOT_FOUND, so a missing route fails loudly instead of
   * silently dropping jobs.
   */
  get isNotFound(): boolean {
    return this.status === 404 && this.code === "NOT_FOUND";
  }
}

export type GmailBackend = ReturnType<typeof createGmailBackend>;

/**
 * Calls the Next.js backend's Gmail ingestion operations at /api/agent/gmail/<name>.
 * They stay apart from /api/agent/operations, which runs finance operations for one User.
 */
export function createGmailBackend(config: BackendConfig) {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const secret = config.secret.trim();
  if (!baseUrl || !secret) {
    throw new Error(
      "Missing required backend configuration: MONARA_BACKEND_URL, MONARA_AGENT_BACKEND_SECRET.",
    );
  }
  const fetcher = config.fetcher ?? fetch;

  async function call<T extends z.ZodType>(
    operation: string,
    input: unknown,
    resultSchema: T,
  ): Promise<z.infer<T>> {
    let response: Response;
    try {
      const path = operation.replace(/^gmail\./, "");
      response = await fetcher(`${baseUrl}/api/agent/gmail/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new BackendOperationError(operation, null, null);
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Reported below as a failed operation without a code.
    }
    if (!response.ok) {
      const error = operationErrorSchema.safeParse(payload);
      throw new BackendOperationError(
        operation,
        response.status,
        error.success ? error.data.code : null,
      );
    }
    const result = resultSchema.safeParse(payload);
    if (!result.success) throw new BackendOperationError(operation, response.status, null);
    return result.data;
  }

  return {
    listActiveConnections(): Promise<ListActiveGmailConnectionsResult> {
      return call("gmail.list-active-connections", {}, listActiveGmailConnectionsResultSchema);
    },

    resolveConnection(connectionId: string): Promise<ResolvedGmailConnection> {
      const input = resolveGmailConnectionInputSchema.parse({ connectionId });
      return call("gmail.resolve-connection", input, resolvedGmailConnectionSchema);
    },

    claimMessage(input: ClaimGmailMessageInput): Promise<ClaimGmailMessageResult> {
      return call(
        "gmail.claim-message",
        claimGmailMessageInputSchema.parse(input),
        claimGmailMessageResultSchema,
      );
    },

    recordExtraction(input: RecordGmailExtractionInput): Promise<RecordGmailExtractionResult> {
      return call(
        "gmail.record-extraction",
        recordGmailExtractionInputSchema.parse(input),
        recordGmailExtractionResultSchema,
      );
    },

    async markSynced(input: MarkGmailConnectionSyncedInput): Promise<void> {
      await call(
        "gmail.mark-synced",
        markGmailConnectionSyncedInputSchema.parse(input),
        markGmailConnectionSyncedResultSchema,
      );
    },

    async reportConnectionError(input: ReportGmailConnectionErrorInput): Promise<void> {
      await call(
        "gmail.report-connection-error",
        reportGmailConnectionErrorInputSchema.parse(input),
        reportGmailConnectionErrorResultSchema,
      );
    },
  };
}
