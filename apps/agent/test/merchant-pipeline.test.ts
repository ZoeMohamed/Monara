import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClaimMerchantProfileResult, SaveMerchantProfileInput } from "@monara/contracts";
import { type BraveSearchClient, BraveSearchError } from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "../src/gmail/backend.ts";
import type { JsonCompletionRequest, LlmClient } from "../src/gmail/llm.ts";
import { summarizeSearchResults } from "../src/merchant/categorize.ts";
import { createMerchantPipeline, MerchantBusyError } from "../src/merchant/pipeline.ts";

const transactionId = "00000000-0000-4000-8000-000000000030";
const job = { kind: "merchant.categorize", transactionId } as const;

interface Overrides {
  needsCategory?: boolean;
  merchantName?: string | null;
  missing?: boolean;
  claim?: ClaimMerchantProfileResult;
  searchFails?: boolean;
  model?: unknown;
  applied?: boolean;
}

/** Fake backend, search and model that record every call categorization makes. */
function setup(overrides: Overrides = {}) {
  const calls = {
    searches: [] as string[],
    saved: [] as SaveMerchantProfileInput[],
    released: [] as string[],
    set: [] as { transactionId: string; categoryName: string }[],
    prompts: [] as JsonCompletionRequest[],
  };
  const backend = {
    async resolveImportedTransaction() {
      if (overrides.missing) {
        throw new BackendOperationError("gmail.resolve-imported-transaction", 404, "NOT_FOUND");
      }
      return {
        merchantName:
          overrides.merchantName === undefined ? "Kopi Kenangan" : overrides.merchantName,
        location: "Jl. Senopati 10, Jakarta",
        needsCategory: overrides.needsCategory ?? true,
        categoryNames: ["Food & Drinks", "Transport"],
      };
    },
    async claimMerchantProfile() {
      return overrides.claim ?? { status: "claimed" };
    },
    async saveMerchantProfile(input: SaveMerchantProfileInput) {
      calls.saved.push(input);
    },
    async releaseMerchantProfile(name: string) {
      calls.released.push(name);
    },
    async setImportedCategory(input: { transactionId: string; categoryName: string }) {
      calls.set.push(input);
      return overrides.applied ?? true;
    },
  } as unknown as GmailBackend;
  const search: BraveSearchClient = {
    async search(query) {
      calls.searches.push(query);
      if (overrides.searchFails) throw new BraveSearchError("Brave Search failed.", 429);
      return [
        { title: "Kopi Kenangan", description: "Coffee shop chain", url: "https://k.example" },
      ];
    },
  };
  const llm: LlmClient = {
    async completeJson(request) {
      calls.prompts.push(request);
      return overrides.model ?? { categoryName: "food & drinks", confidence: 0.9 };
    },
  };
  return { pipeline: createMerchantPipeline({ backend, llm, search }), calls };
}

describe("merchant categorization", () => {
  it("searches only the merchant name, caches it, and sets the User's own category", async () => {
    const { pipeline, calls } = setup();
    assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
    assert.deepEqual(calls.searches, ["Kopi Kenangan"]);
    assert.deepEqual(calls.saved, [
      { merchantName: "Kopi Kenangan", summary: "Kopi Kenangan: Coffee shop chain" },
    ]);
    assert.deepEqual(calls.set, [{ transactionId, categoryName: "Food & Drinks" }]);
    // Search results reach the model only inside the untrusted-data delimiters.
    assert.match(
      calls.prompts[0]?.user ?? "",
      /<search>\nKopi Kenangan: Coffee shop chain\n<\/search>/,
    );
  });

  it("uses a cached profile without searching", async () => {
    const { pipeline, calls } = setup({ claim: { status: "ready", summary: "Coffee shop" } });
    assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
    assert.deepEqual(calls.searches, []);
  });

  it("waits for another job searching the same merchant", async () => {
    const { pipeline, calls } = setup({ claim: { status: "busy" } });
    await assert.rejects(pipeline.runJob(job), MerchantBusyError);
    assert.deepEqual(calls.set, []);
  });

  it("releases its claim when the search fails, so a retry can search again", async () => {
    const { pipeline, calls } = setup({ searchFails: true });
    await assert.rejects(pipeline.runJob(job), { name: "BraveSearchError" });
    assert.deepEqual(calls.released, ["Kopi Kenangan"]);
    assert.deepEqual(calls.saved, []);
  });

  it("leaves the category empty when the model is unsure or picks something unlisted", async () => {
    for (const model of [
      { categoryName: "Food & Drinks", confidence: 0.4 },
      { categoryName: "Coffee", confidence: 0.95 },
      { categoryName: null, confidence: 0.9 },
    ]) {
      const { pipeline, calls } = setup({ model });
      assert.deepEqual(await pipeline.runJob(job), ["uncategorized"]);
      assert.deepEqual(calls.set, []);
    }
  });

  it("does nothing once the User or history already decided", async () => {
    for (const overrides of [{ needsCategory: false }, { merchantName: null }, { missing: true }]) {
      const { pipeline, calls } = setup(overrides);
      assert.deepEqual(await pipeline.runJob(job), ["not_needed"]);
      assert.deepEqual(calls.searches, []);
    }
  });

  it("categorizes every transaction of a batched job, then retries if any failed", async () => {
    const other = "00000000-0000-4000-8000-000000000031";
    const done = setup();
    assert.deepEqual(
      await done.pipeline.runJob({
        kind: "merchant.categorize",
        transactionIds: [transactionId, other],
      }),
      ["categorized", "categorized"],
    );
    assert.deepEqual(
      done.calls.set.map((entry) => entry.transactionId),
      [transactionId, other],
    );

    const busy = setup({ claim: { status: "busy" } });
    await assert.rejects(
      busy.pipeline.runJob({ kind: "merchant.categorize", transactionIds: [transactionId, other] }),
      MerchantBusyError,
    );
  });

  it("looks a merchant up once per job, however many of its transactions it carries", async () => {
    const other = "00000000-0000-4000-8000-000000000031";
    const { pipeline, calls } = setup();
    await pipeline.runJob({ kind: "merchant.categorize", transactionIds: [transactionId, other] });
    assert.deepEqual(calls.searches, ["Kopi Kenangan"]);
    assert.equal(calls.prompts.length, 1);
    assert.equal(calls.set.length, 2);
  });

  it("keeps search summaries short and free of markup", () => {
    const summary = summarizeSearchResults([
      { title: "<script>Kopi</script>", description: "x".repeat(3_000), url: "" },
    ]);
    assert.ok(summary !== null && summary.length <= 1_500);
    assert.doesNotMatch(summary ?? "", /[<>]/);
    assert.equal(summarizeSearchResults([]), null);
  });
});
