import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  disconnectGmailConnection,
  GmailClientError,
  gmailCallbackError,
  gmailConnectionsErrorState,
  loadGmailConnections,
  startGmailConnection,
} from "./client.ts";

const connectionId = "6548c640-4dd8-4df7-8f41-a086f6c5f947";
const connection = {
  id: connectionId,
  gmailAddress: "mailbox@example.com",
  status: "active",
  lastSyncedAt: null,
  createdAt: "2026-10-14T04:00:00Z",
  sync: {
    state: "idle",
    error: null,
    requestedAt: null,
    counts: {
      imported: 0,
      skipped: 0,
      failed: 0,
      inProgress: 0,
      importedTransactions: 0,
      confirmedTransactions: 0,
    },
  },
};

describe("Gmail connection response boundary", () => {
  it("keeps polling while categorization remains and reports terminal review separately", async () => {
    for (const categorizing of [2, 0]) {
      const mailboxes = await loadGmailConnections({
        fetcher: async () =>
          Response.json({
            connections: [
              {
                ...connection,
                sync: {
                  ...connection.sync,
                  state: "completed",
                  counts: {
                    ...connection.sync.counts,
                    imported: 3,
                    importedTransactions: 3,
                    categorizing,
                    needsReview: 1,
                  },
                },
              },
            ],
          }),
      });
      assert.equal(mailboxes[0].sync.state, categorizing > 0 ? "running" : "completed");
      assert.equal(mailboxes[0].sync.needsReview, 1);
    }
  });

  it("maps public active/error records and removes disconnected records", async () => {
    const mailboxes = await loadGmailConnections({
      fetcher: async (path, init) => {
        assert.equal(path, "/api/gmail/connections");
        assert.equal(init.method, "GET");
        assert.equal(init.cache, "no-store");
        assert.equal(init.credentials, "same-origin");
        assert.equal(init.redirect, "error");
        assert.equal(init.body, undefined);
        assert.ok(init.signal instanceof AbortSignal);
        return Response.json({
          connections: [
            connection,
            {
              ...connection,
              id: "ce9e8c47-9249-4121-9f4f-dce7b6f26bfd",
              status: "error",
              gmailAddress: "reconnect@example.com",
              lastSyncedAt: "2026-10-12T06:00:00Z",
            },
            { ...connection, status: "disconnected" },
          ],
        });
      },
    });
    assert.deepEqual(mailboxes, [
      {
        id: connectionId,
        email: "mailbox@example.com",
        status: "active",
        lastSyncedAt: null,
        newAccounts: 0,
        sync: { state: "idle" },
      },
      {
        id: "ce9e8c47-9249-4121-9f4f-dce7b6f26bfd",
        email: "reconnect@example.com",
        status: "reconnect-required",
        lastSyncedAt: "2026-10-12T06:00:00Z",
        newAccounts: 0,
        sync: { state: "idle" },
      },
    ]);
  });

  it("shows the stored sync status, including how a finished or failed sync ended", async () => {
    const counts = {
      ...connection.sync.counts,
      importedTransactions: 3,
      confirmedTransactions: 2,
      skipped: 7,
    };
    const mailboxes = await loadGmailConnections({
      fetcher: async () =>
        Response.json({
          connections: [
            { ...connection, sync: { ...connection.sync, state: "running" } },
            {
              ...connection,
              id: "ce9e8c47-9249-4121-9f4f-dce7b6f26bfd",
              sync: { state: "completed", error: null, requestedAt: connection.createdAt, counts },
            },
            {
              ...connection,
              id: "0d6c5f1e-8f53-4a42-9d0a-6a1f4f8f2b10",
              sync: {
                state: "failed",
                error: "stalled",
                requestedAt: connection.createdAt,
                counts,
              },
            },
          ],
        }),
    });
    assert.deepEqual(
      mailboxes.map((mailbox) => mailbox.sync),
      [
        {
          state: "running",
          transactions: 0,
          emailsRead: 0,
          totalEmails: 0,
          categorizing: 0,
          needsReview: 0,
        },
        {
          state: "completed",
          emailsRead: 7,
          totalEmails: 7,
          transactions: 3,
          confirmed: 2,
          needsReview: 0,
          skipped: 7,
          failed: 0,
        },
        {
          state: "failed",
          message: "The import stopped making progress. Monara tries again tonight.",
        },
      ],
    );
  });

  it("rejects malformed lists and provider-only fields", async () => {
    for (const payload of [
      { connections: [{ ...connection, id: "invalid-id" }] },
      { connections: [{ ...connection, gmailAddress: "invalid-email" }] },
      { connections: [{ ...connection, lastSyncedAt: "yesterday" }] },
      { connections: [{ ...connection, composioConnectedAccountId: "provider-id" }] },
      { connections: null },
    ]) {
      await assert.rejects(
        loadGmailConnections({ fetcher: async () => Response.json(payload) }),
        (error) =>
          error instanceof GmailClientError && /invalid connection list/.test(error.message),
      );
    }
  });

  it("represents an empty validated list without inventing a mailbox", async () => {
    assert.deepEqual(
      await loadGmailConnections({ fetcher: async () => Response.json({ connections: [] }) }),
      [],
    );
  });

  it("distinguishes expired sign-in and unavailable provider responses", async () => {
    for (const [status, expected] of [
      [401, { status: "requires-sign-in" }],
      [503, { status: "unavailable" }],
    ]) {
      await assert.rejects(
        loadGmailConnections({ fetcher: async () => new Response(null, { status }) }),
        (error) => {
          assert.deepEqual(gmailConnectionsErrorState(error), expected);
          return true;
        },
      );
    }
  });

  it("preserves validated public operation errors and hides malformed bodies", async () => {
    await assert.rejects(
      startGmailConnection({
        fetcher: async () =>
          Response.json(
            { code: "CONFLICT", message: "Disconnect one mailbox first.", requestId: null },
            { status: 409 },
          ),
      }),
      { message: "Disconnect one mailbox first." },
    );
    await assert.rejects(
      loadGmailConnections({
        fetcher: async () => Response.json({ debug: "private provider detail" }, { status: 500 }),
      }),
      { message: "The Gmail request could not be completed. Try again." },
    );
  });

  it("reports network failures without exposing transport details", async () => {
    await assert.rejects(
      loadGmailConnections({
        fetcher: async () => {
          throw new Error("private transport detail");
        },
      }),
      { message: "Could not reach your Gmail connections. Check your connection and try again." },
    );
  });
});

describe("Gmail consent redirect boundary", () => {
  it("accepts a validated HTTPS link from the owned POST response", async () => {
    const url = "https://connect.composio.dev/link/synthetic-session";
    assert.equal(
      await startGmailConnection({
        fetcher: async (path, init) => {
          assert.equal(path, "/api/gmail/connections");
          assert.equal(init.method, "POST");
          assert.equal(init.cache, "no-store");
          assert.equal(init.credentials, "same-origin");
          assert.equal(init.body, undefined);
          assert.equal(init.headers, undefined);
          return Response.json({ redirectUrl: url });
        },
      }),
      url,
    );
  });

  it("rejects non-HTTPS, relative, credential-bearing, or malformed URLs", async () => {
    for (const redirectUrl of [
      "http://connect.composio.dev/link/example",
      "javascript:alert(1)",
      "/connections/gmail",
      "//connect.composio.dev/link/example",
      "https://user:password@connect.composio.dev/link/example",
      null,
    ]) {
      await assert.rejects(
        startGmailConnection({ fetcher: async () => Response.json({ redirectUrl }) }),
        (error) =>
          error instanceof GmailClientError && /valid authorization link/.test(error.message),
      );
    }
  });

  it("never treats callback query values as connection success", () => {
    assert.equal(gmailCallbackError("connected"), undefined);
    assert.equal(gmailCallbackError("https://attacker.example"), undefined);
    assert.equal(gmailCallbackError(["FORBIDDEN"]), undefined);
    assert.match(gmailCallbackError("VALIDATION_FAILED"), /invalid or expired/);
    assert.match(gmailCallbackError("FORBIDDEN"), /different Monara account/);
  });
});

describe("Gmail disconnect boundary", () => {
  it("requires a valid connection id before making an owned DELETE request", async () => {
    let calls = 0;
    await assert.rejects(
      disconnectGmailConnection("../other-user", {
        fetcher: async () => {
          calls += 1;
          return new Response(null, { status: 204 });
        },
      }),
      { message: "Invalid Gmail connection id." },
    );
    assert.equal(calls, 0);

    await disconnectGmailConnection(connectionId, {
      fetcher: async (path, init) => {
        assert.equal(path, `/api/gmail/connections/${connectionId}`);
        assert.equal(init.method, "DELETE");
        assert.equal(init.cache, "no-store");
        assert.equal(init.credentials, "same-origin");
        assert.equal(init.body, undefined);
        return new Response(null, { status: 204 });
      },
    });
  });

  it("does not accept fake success or claim a failed operation changed nothing", async () => {
    await assert.rejects(
      disconnectGmailConnection(connectionId, {
        fetcher: async () => Response.json({ success: true }),
      }),
      { message: "Gmail did not confirm that the mailbox was disconnected." },
    );
    await assert.rejects(
      disconnectGmailConnection(connectionId, {
        fetcher: async () => {
          throw new Error("connection closed");
        },
      }),
      {
        message: "Could not confirm the Gmail change. Reload your connections before trying again.",
      },
    );
  });
});
