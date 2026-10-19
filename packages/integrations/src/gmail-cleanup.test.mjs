import assert from "node:assert/strict";
import { it } from "node:test";
import { createComposioUserCleanup } from "./gmail-cleanup.ts";

function cleanup(responses) {
  const calls = [];
  const adapter = createComposioUserCleanup({
    apiUrl: "https://provider.test/api/v3.1",
    apiKey: "synthetic-only",
    fetcher: async (url, init) => {
      calls.push({
        path: new URL(url).pathname,
        query: new URL(url).searchParams,
        method: init.method,
      });
      const value = responses.shift();
      assert.ok(value, "no unexpected provider calls");
      return Response.json(value.body ?? {}, { status: value.status ?? 200 });
    },
  });
  return { adapter, calls };
}

it("only reports clean after both upstream User-filtered inventories are empty", async () => {
  const h = cleanup([
    { body: { items: [], next_cursor: null } },
    { body: { items: [], next_cursor: null } },
  ]);
  assert.equal(await h.adapter.removeNext("user-one"), true);
  assert.ok(h.calls.every((call) => call.query.get("user_ids") === "user-one"));
  assert.equal(h.calls[0].query.get("show_disabled"), "true");
});

it("cleans an abandoned consent account without revoking a grant it never acquired", async () => {
  const h = cleanup([
    { body: { items: [] } },
    { body: { items: [{ id: "pending", user_id: "user-one", status: "INITIATED" }] } },
    {},
  ]);
  assert.equal(await h.adapter.removeNext("user-one"), false);
  assert.equal(h.calls.at(-1).method, "DELETE");
  assert.ok(h.calls.every((call) => !call.path.endsWith("/revoke")));
});

it("revokes an orphan active connection before deleting its upstream record", async () => {
  const h = cleanup([
    { body: { items: [] } },
    { body: { items: [{ id: "orphan", user_id: "user-one", status: "ACTIVE" }] } },
    {},
    {},
  ]);
  assert.equal(await h.adapter.removeNext("user-one"), false);
  assert.deepEqual(
    h.calls.slice(2).map((call) => [call.path, call.method]),
    [
      ["/api/v3.1/connected_accounts/orphan/revoke", "POST"],
      ["/api/v3.1/connected_accounts/orphan", "DELETE"],
    ],
  );
});

it("never deletes a different User's resource or accepts a malformed inventory", async () => {
  for (const body of [
    { items: [{ id: "foreign", user_id: "user-two" }] },
    { items: "bad" },
    { items: [], next_cursor: "unread-page" },
  ]) {
    const h = cleanup([{ body }]);
    await assert.rejects(() => h.adapter.removeNext("user-one"));
    assert.equal(h.calls.length, 1);
  }
});

it("a failed revocation cannot be mistaken for complete cleanup", async () => {
  const h = cleanup([
    { body: { items: [] } },
    { body: { items: [{ id: "orphan", user_id: "user-one", status: "ACTIVE" }] } },
    { status: 503 },
  ]);
  await assert.rejects(() => h.adapter.removeNext("user-one"));
  assert.equal(h.calls.at(-1).method, "POST");
});
