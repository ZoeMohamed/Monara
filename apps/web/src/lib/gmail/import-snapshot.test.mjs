import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, it } from "node:test";

const testKey = Symbol.for("monara.import-snapshot-test");
const sourceUrl = new URL("./import-snapshot.ts", import.meta.url).href;
const clientMock = `export const loadGmailConnections = options => globalThis[Symbol.for("monara.import-snapshot-test")].connections(options);`;
const feedMock = `export const loadImportFeed = (...args) => globalThis[Symbol.for("monara.import-snapshot-test")].feed(...args);`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL === sourceUrl &&
      ["./client.ts", "./import-feed.ts"].includes(specifier)
    ) {
      const source = specifier === "./client.ts" ? clientMock : feedMock;
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { loadImportSnapshot } = await import(sourceUrl);
hooks.deregister();
after(() => {
  delete globalThis[testKey];
});

const mailboxId = "synthetic-mailbox";
const completed = { state: "completed", transactions: 1, needsReview: 0 };

it("rereads classified rows after completion instead of freezing the earlier parallel feed", async () => {
  let finishSync;
  const sync = new Promise((resolve) => {
    finishSync = resolve;
  });
  const events = [];
  const oldRow = { id: "same-row", kind: "expense", needsReview: true };
  const finalRow = { ...oldRow, kind: "exclusion", needsReview: false };
  globalThis[testKey] = {
    async connections() {
      const result = await sync;
      events.push("completion observed");
      return result;
    },
    async feed() {
      events.push("feed read");
      return events.length === 1 ? [oldRow] : [finalRow];
    },
  };
  const reading = loadImportSnapshot(mailboxId);
  await Promise.resolve();
  assert.deepEqual(events, ["feed read"]);
  finishSync([{ id: mailboxId, sync: completed }]);
  const result = await reading;
  assert.deepEqual(events, ["feed read", "completion observed", "feed read"]);
  assert.deepEqual(result, { sync: completed, feed: [finalRow] });
});

it("does not publish completion when the final feed read fails, allowing the next poll to retry", async () => {
  let calls = 0;
  globalThis[testKey] = {
    async connections() {
      return [{ id: mailboxId, sync: completed }];
    },
    async feed() {
      calls += 1;
      if (calls === 2) throw new Error("Final read failed");
      return [{ id: "row", needsReview: false }];
    },
  };
  await assert.rejects(loadImportSnapshot(mailboxId), /Final read failed/);
  const retried = await loadImportSnapshot(mailboxId);
  assert.equal(retried.sync.state, "completed");
  assert.equal(calls, 4);
});

it("keeps running polls concurrent without an extra feed request", async () => {
  let calls = 0;
  const signal = new AbortController().signal;
  const running = { state: "running", transactions: 1, categorizing: 1, needsReview: 0 };
  globalThis[testKey] = {
    async connections(options) {
      assert.equal(options.signal, signal);
      return [{ id: mailboxId, sync: running }];
    },
    async feed(id, requestSignal) {
      calls += 1;
      assert.equal(id, mailboxId);
      assert.equal(requestSignal, signal);
      return [];
    },
  };
  assert.deepEqual(await loadImportSnapshot(mailboxId, signal), { sync: running, feed: [] });
  assert.equal(calls, 1);
});
