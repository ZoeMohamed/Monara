// Gmail Connection rules (PRD F2, docs/erd.md). The route handler resolves the
// signed-in User; this service decides what that User may connect or remove.
import {
  type GmailConnection,
  type GmailConnectionId,
  MAX_ACTIVE_GMAIL_CONNECTIONS,
  type OperationErrorCode,
  type UserId,
} from "@monara/contracts";

/** A failure the route can show the User. Messages never include provider details. */
export class GmailConnectionError extends Error {
  readonly code: OperationErrorCode;

  constructor(code: OperationErrorCode, message: string) {
    super(message);
    this.name = "GmailConnectionError";
    this.code = code;
  }
}

/** The Composio operations this service needs; @monara/integrations implements them. */
export interface GmailConnectionProvider {
  createConnectLink(input: {
    userId: string;
    callbackUrl: string;
  }): Promise<{ redirectUrl: string }>;
  completeConnection(input: {
    sessionUri: string;
    userId: string;
  }): Promise<
    | { ok: true; connectedAccountId: string; toolkit: string }
    | { ok: false; reason: "identity_mismatch" | "expired" }
  >;
  getGmailAddress(input: { userId: string; connectedAccountId: string }): Promise<string>;
  deleteConnection(connectedAccountId: string): Promise<void>;
}

export interface StoredGmailConnection extends GmailConnection {
  composioConnectedAccountId: string;
}

/** Every method is scoped to one verified User. */
export interface GmailConnectionRepository {
  listForUser(userId: UserId): Promise<StoredGmailConnection[]>;
  /**
   * Saves an active connection for this address, reusing the User's existing
   * row for it, and returns the Composio account it replaced, if any.
   */
  activate(input: {
    userId: UserId;
    gmailAddress: string;
    composioConnectedAccountId: string;
  }): Promise<{ connection: StoredGmailConnection; replacedComposioAccountId: string | null }>;
  markDisconnected(input: { userId: UserId; connectionId: GmailConnectionId }): Promise<void>;
}

const limitReached = () =>
  new GmailConnectionError(
    "CONFLICT",
    `You can connect at most ${MAX_ACTIVE_GMAIL_CONNECTIONS} Gmail accounts. Disconnect one first.`,
  );

const toPublic = ({ composioConnectedAccountId: _, ...connection }: StoredGmailConnection) =>
  connection;

export function createGmailConnectionService(deps: {
  repository: GmailConnectionRepository;
  provider: GmailConnectionProvider;
}) {
  const { repository, provider } = deps;

  const activeCount = (connections: StoredGmailConnection[]) =>
    connections.filter((connection) => connection.status === "active").length;

  /** Removes a Composio account we will not keep. Failure only leaves an unused grant. */
  async function discard(connectedAccountId: string) {
    try {
      await provider.deleteConnection(connectedAccountId);
    } catch {
      // The caller already reports the original failure.
    }
  }

  return {
    async list(userId: UserId): Promise<GmailConnection[]> {
      return (await repository.listForUser(userId)).map(toPublic);
    },

    /** Returns Composio's consent URL. The limit is checked again on completion. */
    async start(userId: UserId, callbackUrl: string) {
      if (activeCount(await repository.listForUser(userId)) >= MAX_ACTIVE_GMAIL_CONNECTIONS) {
        throw limitReached();
      }
      return provider.createConnectLink({ userId, callbackUrl });
    },

    /**
     * Finishes a connection for the User who came back from Google. Composio
     * rejects the session unless that User is the one who started it.
     */
    async complete(userId: UserId, sessionUri: string): Promise<GmailConnection> {
      const result = await provider.completeConnection({ sessionUri, userId });
      if (!result.ok) {
        throw result.reason === "identity_mismatch"
          ? new GmailConnectionError(
              "FORBIDDEN",
              "This Gmail connection was started by a different Monara account.",
            )
          : new GmailConnectionError(
              "VALIDATION_FAILED",
              "This Gmail connection link expired. Start again.",
            );
      }

      const { connectedAccountId } = result;
      try {
        if (result.toolkit !== "gmail") {
          throw new GmailConnectionError("VALIDATION_FAILED", "That connection is not Gmail.");
        }
        const gmailAddress = await provider.getGmailAddress({ userId, connectedAccountId });
        const existing = await repository.listForUser(userId);
        const reconnecting = existing.some(
          (connection) =>
            connection.gmailAddress === gmailAddress && connection.status === "active",
        );
        if (!reconnecting && activeCount(existing) >= MAX_ACTIVE_GMAIL_CONNECTIONS) {
          throw limitReached();
        }

        const saved = await repository.activate({
          userId,
          gmailAddress,
          composioConnectedAccountId: connectedAccountId,
        });
        if (saved.replacedComposioAccountId) await discard(saved.replacedComposioAccountId);
        return toPublic(saved.connection);
      } catch (error) {
        await discard(connectedAccountId);
        throw error;
      }
    },

    /** Revokes access at Composio first, so a failed revoke never looks disconnected. */
    async disconnect(userId: UserId, connectionId: GmailConnectionId) {
      const connection = (await repository.listForUser(userId)).find(
        (candidate) => candidate.id === connectionId,
      );
      if (!connection) {
        throw new GmailConnectionError("NOT_FOUND", "That Gmail connection was not found.");
      }
      if (connection.status === "disconnected") return;

      try {
        await provider.deleteConnection(connection.composioConnectedAccountId);
      } catch {
        throw new GmailConnectionError(
          "DEPENDENCY_UNAVAILABLE",
          "Gmail could not be disconnected right now. Try again.",
        );
      }
      await repository.markDisconnected({ userId, connectionId });
    },
  };
}

export type GmailConnectionService = ReturnType<typeof createGmailConnectionService>;
