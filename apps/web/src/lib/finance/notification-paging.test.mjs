import assert from "node:assert/strict";
import test from "node:test";
import { completeNotificationPage, failNotificationPage } from "./notification-paging.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const reminder = (id, status = "unread") => ({
  id,
  kind: "budget",
  message: "Synthetic budget update",
  status,
});

test("a delayed old notification page cannot replace refreshed rows, read state, or cursor", async () => {
  let attempt = 0;
  let state = { attempt, items: [reminder("existing")], nextCursor: "50", error: null };
  const request = { attempt, cursor: state.nextCursor };
  const delayed = deferred();
  const completed = delayed.promise.then((page) => {
    state = completeNotificationPage(state, request, attempt, page);
  });
  attempt = 1;
  // Invalidation must take effect even before the new first page settles.
  assert.equal(
    completeNotificationPage(state, request, attempt, {
      items: [reminder("stale")],
      nextCursor: null,
    }),
    state,
  );
  const refreshed = {
    attempt,
    items: [reminder("existing", "read")],
    nextCursor: "fresh-50",
    error: null,
  };
  state = refreshed;
  delayed.resolve({ items: [reminder("existing"), reminder("stale")], nextCursor: null });
  await completed;
  assert.equal(state, refreshed);
  assert.equal(state.items[0].status, "read");
  assert.equal(state.nextCursor, "fresh-50");
});

test("an obsolete page failure cannot paint an error over a successful refresh", async () => {
  let attempt = 0;
  let state = { attempt, items: [reminder("old")], nextCursor: "50", error: null };
  const request = { attempt, cursor: state.nextCursor };
  const delayed = deferred();
  const completed = delayed.promise.catch((error) => {
    state = failNotificationPage(state, request, attempt, error.message);
  });
  attempt = 1;
  const refreshed = { attempt, items: [reminder("current")], nextCursor: null, error: null };
  state = refreshed;
  delayed.reject(new Error("Obsolete network failure"));
  await completed;
  assert.equal(state, refreshed);
  assert.equal(state.error, null);
});

test("current pagination preserves read and archived duplicates and rejects already-consumed cursors", async () => {
  const state = {
    attempt: 2,
    items: [reminder("read", "read"), reminder("archived", "dismissed")],
    nextCursor: "50",
    error: null,
  };
  const request = { attempt: 2, cursor: "50" };
  const delayed = deferred();
  const completed = delayed.promise.then((page) =>
    completeNotificationPage(state, request, 2, page),
  );
  delayed.resolve({
    items: [reminder("read"), reminder("archived"), reminder("next")],
    nextCursor: "100",
  });
  const result = await completed;
  assert.deepEqual(
    result.items.map((item) => [item.id, item.status]),
    [
      ["read", "read"],
      ["archived", "dismissed"],
      ["next", "unread"],
    ],
  );
  assert.equal(
    completeNotificationPage(result, request, 2, { items: [reminder("late")], nextCursor: null }),
    result,
  );
  assert.equal(failNotificationPage(result, request, 2, "Late error"), result);
});
