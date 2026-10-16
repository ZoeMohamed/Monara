import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGmailConnectionService, GmailConnectionError } from "./gmail-connections.ts";

const userA = "00000000-0000-4000-8000-00000000000a";
const userB = "00000000-0000-4000-8000-00000000000b";
const createdAt = "2026-10-13T09:00:00+00:00";
const callbackUrl = "https://monara.example/api/gmail/connections/callback";

let nextId = 1;
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;

function connection(userId, gmailAddress, status = "active") {
  return {
    userId,
    id: uuid(),
    gmailAddress,
    status,
    lastSyncedAt: null,
    createdAt,
    composioConnectedAccountId: `ca_${gmailAddress}`,
  };
}

/** In-memory repository with the same per-User scoping as the Supabase one. */
function fakeRepository(rows) {
  const strip = ({ userId: _, ...stored }) => stored;
  return {
    rows,
    async listForUser(userId) {
      return rows.filter((row) => row.userId === userId).map(strip);
    },
    async activate({ userId, gmailAddress, composioConnectedAccountId }) {
      let row = rows.find((r) => r.userId === userId && r.gmailAddress === gmailAddress);
      const previous = row?.composioConnectedAccountId ?? null;
      if (row) Object.assign(row, { composioConnectedAccountId, status: "active" });
      else {
        row = { ...connection(userId, gmailAddress), composioConnectedAccountId };
        rows.push(row);
      }
      return {
        connection: strip(row),
        replacedComposioAccountId: previous !== composioConnectedAccountId ? previous : null,
      };
    },
    async markDisconnected({ userId, connectionId }) {
      const row = rows.find((r) => r.userId === userId && r.id === connectionId);
      if (row) row.status = "disconnected";
    },
  };
}

function fakeProvider(overrides = {}) {
  const deleted = [];
  const removed = [];
  return {
    deleted,
    removed,
    async createConnectLink() {
      return { redirectUrl: "https://connect.composio.dev/link/abc" };
    },
    async completeConnection() {
      return { ok: true, connectedAccountId: "ca_new", toolkit: "gmail" };
    },
    async getGmailAddress() {
      return "new@gmail.com";
    },
    async deleteConnection(id) {
      deleted.push(id);
    },
    async removeConnection(id) {
      removed.push(id);
    },
    ...overrides,
  };
}

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (error) => error instanceof GmailConnectionError && error.code === code);

describe("listing Gmail connections", () => {
  it("returns active and error connections but hides disconnected ones", async () => {
    const repository = fakeRepository([
      connection(userA, "a@gmail.com"),
      connection(userA, "b@gmail.com", "error"),
      connection(userA, "c@gmail.com", "disconnected"),
      connection(userB, "d@gmail.com"),
    ]);
    const service = createGmailConnectionService({ repository, provider: fakeProvider() });
    const listed = await service.list(userA);
    assert.deepEqual(
      listed.map((c) => [c.gmailAddress, c.status]),
      [
        ["a@gmail.com", "active"],
        ["b@gmail.com", "error"],
      ],
    );
    assert.ok(listed.every((c) => !("composioConnectedAccountId" in c)));
  });

  it("shows a disconnected mailbox again after it is reconnected, reusing its row", async () => {
    const old = connection(userA, "new@gmail.com", "disconnected");
    const repository = fakeRepository([old]);
    const service = createGmailConnectionService({ repository, provider: fakeProvider() });
    assert.deepEqual(await service.list(userA), []);
    await service.complete(userA, "session-uri");
    const listed = await service.list(userA);
    assert.deepEqual(
      listed.map((c) => [c.id, c.status]),
      [[old.id, "active"]],
    );
    assert.equal(repository.rows.length, 1);
  });
});

describe("starting a Gmail connection", () => {
  it("returns the consent URL while the User has fewer than three active connections", async () => {
    const repository = fakeRepository([
      connection(userA, "a@gmail.com"),
      connection(userA, "b@gmail.com", "disconnected"),
    ]);
    const service = createGmailConnectionService({ repository, provider: fakeProvider() });
    assert.deepEqual(await service.start(userA, callbackUrl), {
      redirectUrl: "https://connect.composio.dev/link/abc",
    });
  });

  it("refuses a fourth active connection", async () => {
    const repository = fakeRepository(
      ["a", "b", "c"].map((n) => connection(userA, `${n}@gmail.com`)),
    );
    const service = createGmailConnectionService({ repository, provider: fakeProvider() });
    await rejectsWith(service.start(userA, callbackUrl), "CONFLICT");
  });
});

describe("completing a Gmail connection", () => {
  it("saves the verified mailbox and hides the Composio account id", async () => {
    const repository = fakeRepository([]);
    const service = createGmailConnectionService({ repository, provider: fakeProvider() });
    const saved = await service.complete(userA, "session");
    assert.equal(saved.gmailAddress, "new@gmail.com");
    assert.equal(saved.status, "active");
    assert.equal("composioConnectedAccountId" in saved, false);
  });

  it("rejects a session that Composio says belongs to another User", async () => {
    const repository = fakeRepository([]);
    const provider = fakeProvider({
      async completeConnection() {
        return { ok: false, reason: "identity_mismatch" };
      },
    });
    const service = createGmailConnectionService({ repository, provider });
    await rejectsWith(service.complete(userA, "session"), "FORBIDDEN");
    assert.equal(repository.rows.length, 0);
  });

  it("deletes the new Composio account when the limit is already reached", async () => {
    const repository = fakeRepository(
      ["a", "b", "c"].map((n) => connection(userA, `${n}@gmail.com`)),
    );
    const provider = fakeProvider();
    const service = createGmailConnectionService({ repository, provider });
    await rejectsWith(service.complete(userA, "session"), "CONFLICT");
    assert.deepEqual(provider.deleted, ["ca_new"]);
  });

  it("deletes the new Composio account when the connection is not Gmail", async () => {
    const provider = fakeProvider({
      async completeConnection() {
        return { ok: true, connectedAccountId: "ca_other", toolkit: "slack" };
      },
    });
    const service = createGmailConnectionService({ repository: fakeRepository([]), provider });
    await rejectsWith(service.complete(userA, "session"), "VALIDATION_FAILED");
    assert.deepEqual(provider.deleted, ["ca_other"]);
  });

  it("reconnects an active mailbox at the limit, deleting the replaced account but keeping the grant", async () => {
    const rows = ["a", "b", "new"].map((n) => connection(userA, `${n}@gmail.com`));
    const provider = fakeProvider();
    const service = createGmailConnectionService({ repository: fakeRepository(rows), provider });
    await service.complete(userA, "session");
    // Revoking would revoke the Google grant the new account was just given.
    assert.deepEqual(provider.removed, ["ca_new@gmail.com"]);
    assert.deepEqual(provider.deleted, []);
    assert.equal(rows.length, 3);
  });

  it("keeps the grant when a reconnect fails after the mailbox is known", async () => {
    const row = connection(userA, "new@gmail.com");
    const repository = {
      ...fakeRepository([row]),
      async activate() {
        throw new GmailConnectionError("INTERNAL", "Gmail connections could not be saved.");
      },
    };
    const provider = fakeProvider();
    const service = createGmailConnectionService({ repository, provider });
    await rejectsWith(service.complete(userA, "session"), "INTERNAL");
    assert.deepEqual(provider.removed, ["ca_new"]);
    assert.deepEqual(provider.deleted, []);
  });
});

describe("disconnecting a Gmail connection", () => {
  it("revokes at Composio, then marks the row disconnected", async () => {
    const row = connection(userA, "a@gmail.com");
    const provider = fakeProvider();
    const service = createGmailConnectionService({ repository: fakeRepository([row]), provider });
    await service.disconnect(userA, row.id);
    assert.deepEqual(provider.deleted, ["ca_a@gmail.com"]);
    assert.equal(row.status, "disconnected");
  });

  it("treats another User's connection as not found", async () => {
    const row = connection(userB, "b@gmail.com");
    const provider = fakeProvider();
    const service = createGmailConnectionService({ repository: fakeRepository([row]), provider });
    await rejectsWith(service.disconnect(userA, row.id), "NOT_FOUND");
    assert.deepEqual(provider.deleted, []);
    assert.equal(row.status, "active");
  });

  it("keeps the connection active when Composio cannot revoke it", async () => {
    const row = connection(userA, "a@gmail.com");
    const provider = fakeProvider({
      async deleteConnection() {
        throw new Error("unreachable");
      },
    });
    const service = createGmailConnectionService({ repository: fakeRepository([row]), provider });
    await rejectsWith(service.disconnect(userA, row.id), "DEPENDENCY_UNAVAILABLE");
    assert.equal(row.status, "active");
  });
});
