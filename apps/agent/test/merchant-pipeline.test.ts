import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brands,
  type ClaimMerchantProfileResult,
  type ResolvedImportedTransaction,
  resolvedImportedTransactionSchema,
  type SaveMerchantProfileInput,
  type SetImportedCategoryInput,
} from "@monara/contracts";
import { type BraveSearchClient, BraveSearchError } from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "../src/gmail/backend.ts";
import {
  createLlmClient,
  type JsonCompletionRequest,
  type LlmClient,
  LlmError,
} from "../src/gmail/llm.ts";
import {
  chooseCategory,
  fallbackCategory,
  summarizeSearchResults,
} from "../src/merchant/categorize.ts";
import { createMerchantPipeline, MerchantBusyError } from "../src/merchant/pipeline.ts";

const transactionId = "00000000-0000-4000-8000-000000000030";
const categoryId = "00000000-0000-4000-8000-000000000040";
const internalId = "00000000-0000-4000-8000-000000000041";
const incomeId = "00000000-0000-4000-8000-000000000042";
const job = { kind: "merchant.categorize", transactionId } as const;
const categories: ResolvedImportedTransaction["categories"] = [
  { id: categoryId, name: "Food & Drinks", slug: "food-drinks", kind: "expense", isDefault: true },
  { id: internalId, name: "Internal", slug: "internal", kind: "exclusion", isDefault: true },
  { id: incomeId, name: "Salary", slug: "salary", kind: "income", isDefault: true },
];
interface Overrides {
  transaction?: Partial<ResolvedImportedTransaction>;
  transactions?: Record<string, Partial<ResolvedImportedTransaction>>;
  missing?: boolean;
  claim?: ClaimMerchantProfileResult;
  searchFails?: boolean;
  model?: unknown;
  modelForRequest?: (request: JsonCompletionRequest) => unknown;
  applied?: boolean;
  editedAfterRead?: boolean;
  inactiveAfterClaim?: { id: string; deleted: boolean };
}
function setup(overrides: Overrides = {}) {
  const calls = {
    searches: [] as string[],
    saved: [] as SaveMerchantProfileInput[],
    released: [] as string[],
    set: [] as SetImportedCategoryInput[],
    prompts: [] as JsonCompletionRequest[],
    resolves: 0,
    claims: 0,
  };
  const backend = {
    async resolveImportedTransaction(id: string) {
      calls.resolves += 1;
      const inactive = overrides.inactiveAfterClaim?.id === id && calls.claims > 0;
      if (overrides.missing || (inactive && overrides.inactiveAfterClaim?.deleted))
        throw new BackendOperationError("gmail.resolve-imported-transaction", 404, "NOT_FOUND");
      return resolvedImportedTransactionSchema.parse({
        merchantName: "Kopi Kenangan",
        location: "Jakarta",
        needsCategory: !inactive && !(overrides.editedAfterRead && calls.resolves > 1),
        categoryNames: ["Food & Drinks"],
        kind: "expense",
        flowDirection: "out",
        description: "Coffee purchase",
        counterpartyName: "Kopi Kenangan",
        counterpartyType: "business",
        holderName: "Adlyn Fakhreyz Pratama",
        categories,
        ...overrides.transaction,
        ...overrides.transactions?.[id],
      });
    },
    async claimMerchantProfile() {
      calls.claims += 1;
      return overrides.claim ?? { status: "claimed" };
    },
    async saveMerchantProfile(input: SaveMerchantProfileInput) {
      calls.saved.push(input);
    },
    async releaseMerchantProfile(name: string) {
      calls.released.push(name);
    },
    async setImportedCategory(input: SetImportedCategoryInput) {
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
      return (
        overrides.modelForRequest?.(request) ??
        overrides.model ?? { categoryId, kind: "expense", confidence: 0.9 }
      );
    },
  };
  return { pipeline: createMerchantPipeline({ backend, llm, search }), backend, calls };
}

describe("transaction categorization", () => {
  const miscId = "00000000-0000-4000-8000-000000000043";
  const miscIncomeId = "00000000-0000-4000-8000-000000000044";
  const miscExclusionId = "00000000-0000-4000-8000-000000000045";
  const personId = "00000000-0000-4000-8000-000000000046";
  const personIncomeId = "00000000-0000-4000-8000-000000000047";
  const defaults: ResolvedImportedTransaction["categories"] = [
    ...categories,
    { id: miscId, name: "Misc", slug: "misc", kind: "expense", isDefault: true },
    { id: miscIncomeId, name: "Misc", slug: "misc-income", kind: "income", isDefault: true },
    {
      id: miscExclusionId,
      name: "Misc",
      slug: "misc-exclusion",
      kind: "exclusion",
      isDefault: true,
    },
    { id: personId, name: "Person", slug: "person", kind: "expense", isDefault: true },
    { id: personIncomeId, name: "Person", slug: "person-income", kind: "income", isDefault: true },
  ];

  it("preserves low and unavailable category scores for the confidence-only backend rule", async () => {
    for (const confidence of [0, 0.49, 0.5, null]) {
      const { pipeline, calls } = setup({ model: { categoryId, kind: "expense", confidence } });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
      assert.deepEqual(calls.set, [{ transactionId, categoryId, kind: "expense", confidence }]);
    }
  });

  it("uses Income Misc only for clear incoming cash and otherwise Expense Misc, preserving real scores", async () => {
    for (const kind of ["expense", "income", "exclusion"] as const) {
      for (const flowDirection of ["in", "out", null] as const) {
        for (const confidence of [0.2, null]) {
          const { pipeline, calls } = setup({
            transaction: { categories: defaults, kind, flowDirection },
            model: { categoryId: null, kind: null, confidence },
          });
          assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
          assert.deepEqual(calls.set, [
            {
              transactionId,
              categoryId: flowDirection === "in" ? miscIncomeId : miscId,
              kind: flowDirection === "in" ? "income" : "expense",
              confidence,
            },
          ]);
        }
      }
    }
  });

  it("finalizes unknown extraction kinds through cash-flow Misc without another provider call", async () => {
    for (const flowDirection of ["in", "out", null] as const) {
      const expectedId = flowDirection === "in" ? miscIncomeId : miscId;
      const expectedKind = flowDirection === "in" ? "income" : "expense";
      const wrongKindId = flowDirection === "in" ? miscId : miscIncomeId;
      for (const availableCategories of [
        defaults,
        defaults.filter((entry) => entry.id === wrongKindId),
        [],
      ]) {
        const { pipeline, calls } = setup({
          transaction: {
            categories: availableCategories,
            kind: null,
            flowDirection,
            counterpartyType: "business",
            counterpartyName: "Kopi Kenangan",
          },
          model: { categoryId, kind: "expense", confidence: 0.99 },
        });
        await pipeline.runJob(job);
        const hasCorrectDefault = availableCategories.some((entry) => entry.id === expectedId);
        assert.deepEqual(calls.set, [
          {
            transactionId,
            categoryId: hasCorrectDefault ? expectedId : null,
            kind: hasCorrectDefault ? expectedKind : null,
            confidence: null,
          },
        ]);
        assert.deepEqual(calls.prompts, []);
        assert.deepEqual(calls.searches, []);
        assert.equal(calls.claims, 0);
      }
    }
  });

  it("never borrows another type's Misc when the correct owned default is absent", async () => {
    for (const flowDirection of ["in", "out", null] as const) {
      const wrongKindId = flowDirection === "in" ? miscId : miscIncomeId;
      for (const availableCategories of [
        defaults.filter((entry) => entry.id === wrongKindId),
        [],
      ]) {
        const { backend } = setup({
          transaction: { categories: availableCategories, kind: null, flowDirection },
        });
        const transaction = await backend.resolveImportedTransaction(transactionId);
        assert.equal(fallbackCategory(transaction, 0.2), null);
      }
    }
  });

  it("preserves low category confidence when the backend must create the correct Misc default", async () => {
    for (const flowDirection of ["in", "out", null] as const) {
      const wrongKindId = flowDirection === "in" ? miscId : miscIncomeId;
      const { pipeline, calls } = setup({
        transaction: {
          categories: defaults.filter((entry) => entry.id === wrongKindId),
          kind: flowDirection === "in" ? "income" : "expense",
          flowDirection,
        },
        model: { categoryId: null, kind: null, confidence: 0.2 },
      });
      await pipeline.runJob(job);
      assert.deepEqual(calls.set, [
        { transactionId, categoryId: null, kind: null, confidence: 0.2 },
      ]);
    }
  });

  it("keeps Person ahead of Misc for unknown extraction kinds, without asserting cash direction", async () => {
    for (const flowDirection of ["in", "out", null] as const) {
      const { pipeline, calls } = setup({
        transaction: {
          categories: defaults,
          kind: null,
          flowDirection,
          counterpartyType: "person",
          counterpartyName: "Rina Putri",
        },
      });
      await pipeline.runJob(job);
      assert.deepEqual(calls.set, [
        {
          transactionId,
          categoryId: flowDirection === "in" ? personIncomeId : personId,
          kind: flowDirection === "in" ? "income" : "expense",
          confidence: null,
        },
      ]);
      assert.deepEqual(calls.prompts, []);
      assert.deepEqual(calls.searches, []);
    }
  });

  it("keeps own-name Internal ahead of Person and Misc for unknown kinds in every direction", async () => {
    for (const flowDirection of ["in", "out", null] as const) {
      const { pipeline, calls } = setup({
        transaction: {
          categories: defaults,
          kind: null,
          flowDirection,
          counterpartyType: "person",
          counterpartyName: "Adlyn Fakhreyz Pratama",
        },
      });
      await pipeline.runJob(job);
      assert.deepEqual(calls.set, [
        { transactionId, categoryId: internalId, kind: "exclusion", confidence: 1 },
      ]);
      assert.deepEqual(calls.prompts, []);
      assert.deepEqual(calls.searches, []);
    }
  });

  it("routes an Exclusion Misc model fallback to the correct cash-flow Misc", async () => {
    const { pipeline, calls } = setup({
      transaction: { categories: defaults },
      model: { categoryId: miscExclusionId, kind: "exclusion", confidence: 0.2 },
    });
    await pipeline.runJob(job);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: miscId, kind: "expense", confidence: 0.2 },
    ]);
  });

  it("settles permanent LLM failures immediately through the backend fallback for every cash direction", async () => {
    for (const flowDirection of ["in", "out", null] as const) {
      const { pipeline, calls } = setup({
        transaction: {
          categories: defaults,
          flowDirection,
          kind: flowDirection === "in" ? "income" : "expense",
          counterpartyName: "Unlisted Synthetic Business",
          counterpartyType: "business",
        },
        modelForRequest() {
          throw new LlmError("The model output was not JSON.", 200, "failed");
        },
      });
      assert.deepEqual(await pipeline.runJob(job), ["uncategorized"]);
      assert.equal(calls.prompts.length, 1);
      assert.deepEqual(calls.set, [
        { transactionId, categoryId: null, kind: null, confidence: null },
      ]);
      assert.deepEqual(calls.searches, []);
    }
  });

  it("uses Person before salary or rent without a second LLM and keeps Internal first", async () => {
    for (const [kind, flowDirection, expectedId] of [
      ["expense", "out", personId],
      ["income", "in", personIncomeId],
    ] as const) {
      const { pipeline, calls } = setup({
        transaction: {
          categories: defaults,
          kind,
          flowDirection,
          description: kind === "expense" ? "Rent" : "Salary",
          counterpartyType: "person",
          counterpartyName: "Rina Putri",
        },
      });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
      assert.deepEqual(calls.set, [
        { transactionId, categoryId: expectedId, kind, confidence: null },
      ]);
      assert.deepEqual(calls.prompts, []);
      assert.deepEqual(calls.searches, []);
    }
    const internal = setup({
      transaction: {
        categories: defaults,
        counterpartyType: "person",
        counterpartyName: "Adlyn Fakhreyz Pratama",
      },
    });
    await internal.pipeline.runJob(job);
    assert.deepEqual(internal.calls.set, [
      { transactionId, categoryId: internalId, kind: "exclusion", confidence: 1 },
    ]);
  });

  it("keeps a recognized business out of Person even when the extractor mislabels it", async () => {
    const { pipeline, calls } = setup({
      transaction: {
        categories: defaults,
        counterpartyType: "person",
        counterpartyName: "Kopi Kenangan",
      },
    });
    await pipeline.runJob(job);
    assert.deepEqual(calls.set, [{ transactionId, categoryId, kind: "expense", confidence: 0.9 }]);
    assert.equal(calls.prompts.length, 1);
    assert.deepEqual(calls.searches, []);
  });

  it("allows the category model to identify a person when extraction left counterparty type unknown", async () => {
    const { pipeline, calls } = setup({
      transaction: {
        categories: defaults,
        counterpartyType: "unknown",
        counterpartyName: "Rina Putri",
      },
      model: { categoryId: personId, kind: "expense", confidence: 0.7 },
    });
    await pipeline.runJob(job);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: personId, kind: "expense", confidence: 0.7 },
    ]);
    assert.deepEqual(calls.searches, []);
    assert.equal(calls.prompts.length, 1);
  });

  it("rejects a model's Person category for a known business", async () => {
    const { pipeline, calls } = setup({
      transaction: {
        categories: defaults,
        counterpartyType: "person",
        counterpartyName: "Kopi Kenangan",
      },
      model: { categoryId: personId, kind: "expense", confidence: 0.9 },
    });
    await pipeline.runJob(job);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: miscId, kind: "expense", confidence: 0.9 },
    ]);
  });

  it("falls back safely from an unmatched Internal suggestion and retains its known score", async () => {
    const { pipeline, calls } = setup({
      transaction: { categories: defaults },
      model: { categoryId: internalId, kind: "exclusion", confidence: 0.4 },
    });
    await pipeline.runJob(job);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: miscId, kind: "expense", confidence: 0.4 },
    ]);
  });

  it("leaves room for observed reasoning before the category JSON answer", async () => {
    // A synthetic Azure probe used 363 reasoning tokens plus 45 answer tokens.
    // Replay that provider boundary without relying on a live, variable response.
    const observedCompletionTokens = 408;
    const modelChoice = { categoryId, kind: "expense", confidence: 0.97 };
    let attempts = 0;
    const llm = createLlmClient({
      baseUrl: "https://synthetic.openai.azure.com/openai/v1",
      apiKey: "synthetic",
      model: "synthetic-deployment",
      maxInlineRetries: 0,
      async fetcher(_input, init) {
        attempts += 1;
        const request = JSON.parse(String(init.body));
        const hasRoom = request.max_completion_tokens >= observedCompletionTokens;
        return Response.json({
          choices: [
            {
              finish_reason: hasRoom ? "stop" : "length",
              message: { content: hasRoom ? JSON.stringify(modelChoice) : "" },
            },
          ],
        });
      },
    });
    const { backend } = setup();
    const transaction = await backend.resolveImportedTransaction(transactionId);
    assert.deepEqual(await chooseCategory(llm, { transaction, summary: null }), modelChoice);
    assert.equal(attempts, 1);
  });
  it("stops sending more classifications from the same job after a model rate limit", async () => {
    const busy = new LlmError("The model request failed.", 429, "rate_limited", 60_000);
    const { pipeline, calls } = setup({
      transaction: { counterpartyName: "Synthetic Recipient", counterpartyType: "person" },
      modelForRequest() {
        throw busy;
      },
    });
    const ids = Array.from(
      { length: 10 },
      (_, index) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    );
    await assert.rejects(
      pipeline.runJob({ kind: "merchant.categorize", transactionIds: ids }),
      (error) => error === busy,
    );
    assert.equal(
      calls.prompts.length,
      1,
      "a rate-limited job must yield after its first rejection",
    );
    assert.deepEqual(calls.set, [], "retryable rows must remain unfinished until retry");
  });
  it("finishes all rows for review after the final model outage without repeating provider calls", async () => {
    const busy = new LlmError("The model could not be reached.", null, "unavailable");
    const { pipeline, calls } = setup({
      transaction: { counterpartyName: "Synthetic Recipient", counterpartyType: "person" },
      modelForRequest() {
        throw busy;
      },
    });
    const other = "00000000-0000-4000-8000-000000000031";
    assert.deepEqual(
      await pipeline.runJob(
        { kind: "merchant.categorize", transactionIds: [transactionId, other] },
        { isFinalAttempt: true },
      ),
      ["uncategorized", "uncategorized"],
    );
    assert.equal(calls.prompts.length, 1);
    assert.deepEqual(
      calls.set,
      [transactionId, other].map((id) => ({
        transactionId: id,
        categoryId: null,
        kind: null,
        confidence: null,
      })),
    );
  });
  it("settles permanent model output failures for review and continues deterministic decisions", async () => {
    const other = "00000000-0000-4000-8000-000000000031";
    const permanent = new LlmError("The model output was not JSON.", 200, "failed");
    const { pipeline, calls } = setup({
      transaction: { counterpartyName: "Synthetic Recipient", counterpartyType: "person" },
      transactions: {
        [other]: { counterpartyName: "Adlyn Fakhreyz Pratama", isTransfer: true },
      },
      modelForRequest() {
        throw permanent;
      },
    });
    assert.deepEqual(
      await pipeline.runJob({
        kind: "merchant.categorize",
        transactionIds: [transactionId, other],
      }),
      ["uncategorized", "categorized"],
    );
    assert.equal(calls.prompts.length, 1);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: null, kind: null, confidence: null },
      { transactionId: other, categoryId: internalId, kind: "exclusion", confidence: 1 },
    ]);
  });
  it("still categorizes a later deterministic Internal transfer after a model outage", async () => {
    const other = "00000000-0000-4000-8000-000000000031";
    const busy = new LlmError("The model request failed.", 429, "rate_limited", 60_000);
    const { pipeline, calls } = setup({
      transaction: { counterpartyName: "Synthetic Recipient", counterpartyType: "person" },
      transactions: {
        [other]: { counterpartyName: "Adlyn Fakhreyz Pratama", isTransfer: true },
      },
      modelForRequest() {
        throw busy;
      },
    });
    assert.deepEqual(
      await pipeline.runJob(
        { kind: "merchant.categorize", transactionIds: [transactionId, other] },
        { isFinalAttempt: true },
      ),
      ["uncategorized", "categorized"],
    );
    assert.equal(calls.prompts.length, 1);
    assert.deepEqual(calls.set[1], {
      transactionId: other,
      categoryId: internalId,
      kind: "exclusion",
      confidence: 1,
    });
  });
  it("preserves a provider Retry-After ahead of an earlier merchant-profile wait", async () => {
    const other = "00000000-0000-4000-8000-000000000031";
    const busy = new LlmError("The model request failed.", 429, "rate_limited", 125_000);
    const { pipeline, calls } = setup({
      claim: { status: "busy" },
      transactions: {
        [other]: { counterpartyName: "Synthetic Recipient", counterpartyType: "person" },
      },
      modelForRequest() {
        throw busy;
      },
    });
    await assert.rejects(
      pipeline.runJob({ kind: "merchant.categorize", transactionIds: [transactionId, other] }),
      (error) => error === busy,
    );
    assert.equal(calls.prompts.length, 1);
    assert.deepEqual(calls.set, []);
  });
  it("searches only an identifiable business and submits a typed owned Category ID", async () => {
    const { pipeline, calls } = setup();
    assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
    assert.deepEqual(calls.searches, ["Kopi Kenangan"]);
    assert.deepEqual(calls.saved, [
      { merchantName: "Kopi Kenangan", summary: "Kopi Kenangan: Coffee shop chain" },
    ]);
    assert.deepEqual(calls.set, [{ transactionId, categoryId, kind: "expense", confidence: 0.9 }]);
    const prompt = JSON.parse(calls.prompts[0]?.user ?? "{}");
    assert.equal(prompt.confirmedHolderName, "Adlyn Fakhreyz Pratama");
    assert.equal(prompt.transaction.flowDirection, "out");
    assert.equal(prompt.businessSearch, "Kopi Kenangan: Coffee shop chain");
  });
  it("uses cached business evidence without a search", async () => {
    const { pipeline, calls } = setup({ claim: { status: "ready", summary: "Coffee shop" } });
    await pipeline.runJob(job);
    assert.deepEqual(calls.searches, []);
  });
  it("loads classification context once and rechecks activity once immediately before the model", async () => {
    const { pipeline, calls } = setup({
      transaction: { counterpartyName: "Synthetic Recipient", counterpartyType: "person" },
    });
    await pipeline.runJob(job);
    assert.equal(calls.prompts.length, 1);
    assert.equal(calls.resolves, 2, "one context snapshot and one fresh provider-boundary guard");
    assert.equal(calls.set.length, 1);
  });
  it("waits for another job and releases failed searches for retry", async () => {
    const busy = setup({ claim: { status: "busy" } });
    await assert.rejects(busy.pipeline.runJob(job), MerchantBusyError);
    const failed = setup({ searchFails: true });
    await assert.rejects(failed.pipeline.runJob(job), BraveSearchError);
    assert.deepEqual(failed.calls.released, ["Kopi Kenangan"]);
    assert.deepEqual(failed.calls.set, []);
  });
  it("sends invalid category choices to backend fallback while preserving available model confidence", async () => {
    for (const model of [
      { categoryId: "foreign", kind: "expense", confidence: 0.99 },
      { categoryId, kind: "income", confidence: 0.99 },
      { categoryId: incomeId, kind: "income", confidence: 0.99 },
      { categoryId: null, kind: null, confidence: 0.9 },
      { categoryId, kind: "expense", confidence: 2 },
    ]) {
      const { pipeline, calls } = setup({ model });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
      assert.deepEqual(calls.set, [
        {
          transactionId,
          categoryId: null,
          kind: null,
          confidence: model.confidence <= 1 ? model.confidence : null,
        },
      ]);
    }
  });
  it("skips provider work for completed, deleted or user-edited transactions", async () => {
    for (const overrides of [
      { transaction: { needsCategory: false } },
      { missing: true },
      { editedAfterRead: true },
    ]) {
      const { pipeline, calls } = setup(overrides);
      assert.deepEqual(await pipeline.runJob(job), ["not_needed"]);
      assert.deepEqual(calls.prompts, []);
      assert.deepEqual(calls.searches, []);
      assert.deepEqual(calls.set, []);
    }
  });
  it("classifies a confirmed full-name transfer without search or the second LLM", async () => {
    const { pipeline, calls } = setup({
      transaction: {
        counterpartyName: "Bpk. ADLYN FAKHREYZ PRATAMA",
        counterpartyType: "person",
        isTransfer: true,
      },
    });
    assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: internalId, kind: "exclusion", confidence: 1 },
    ]);
    assert.deepEqual(calls.searches, []);
    assert.deepEqual(calls.prompts, []);
  });
  it("deterministically classifies a two-word profile subset without Brave or the second LLM", async () => {
    const { pipeline, calls } = setup({
      transaction: {
        holderName: "Satria Wibowo",
        counterpartyName: "SATRIA WIBOWO PRATAMA",
        counterpartyType: "person",
        isTransfer: true,
      },
      model: { categoryId: internalId, kind: "exclusion", confidence: 0.99 },
    });
    assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: internalId, kind: "exclusion", confidence: 1 },
    ]);
    assert.deepEqual(calls.searches, []);
    assert.equal(calls.prompts.length, 0);
  });
  it("deterministically accepts one-letter typos in two name words", async () => {
    const { pipeline, calls } = setup({
      transaction: {
        holderName: "Satria Wibowo Pratama",
        counterpartyName: "SATRIA WIBOWA PRATAMO",
        counterpartyType: "person",
        isTransfer: true,
      },
    });
    assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: internalId, kind: "exclusion", confidence: 1 },
    ]);
    assert.deepEqual(calls.searches, []);
    assert.deepEqual(calls.prompts, []);
  });
  it("classifies a matching counterparty name regardless of description or transfer labels", async () => {
    for (const evidence of [
      { isTransfer: false, description: "Synthetic purchase receipt" },
      { isTransfer: false, counterpartyType: "business" as const },
      { isTransfer: false, kind: null, flowDirection: null },
    ]) {
      const { pipeline, calls } = setup({
        transaction: {
          holderName: "Satria Wibowo",
          counterpartyName: "SATRIA WIBOWO PRATAMA",
          counterpartyType: "person",
          ...evidence,
        },
      });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
      assert.deepEqual(calls.set, [
        { transactionId, categoryId: internalId, kind: "exclusion", confidence: 1 },
      ]);
      assert.deepEqual(calls.searches, []);
      assert.deepEqual(calls.prompts, []);
    }
  });
  it("classifies a matching counterparty without inventing missing cash direction", async () => {
    const { pipeline, calls } = setup({
      transaction: {
        holderName: "Satria Wibowo Pratama",
        counterpartyName: "SATRIA WIBOWO PRATAMA",
        counterpartyType: "person",
        isTransfer: true,
        kind: null,
        flowDirection: null,
      },
      model: { categoryId: internalId, kind: "exclusion", confidence: 0.99 },
    });
    assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: internalId, kind: "exclusion", confidence: 1 },
    ]);
    assert.deepEqual(calls.searches, []);
    assert.deepEqual(calls.prompts, []);
  });
  it("rejects Internal for single-word names, wrong names or a missing holder", async () => {
    for (const transaction of [
      { counterpartyName: "Adlyn", isTransfer: true },
      { counterpartyName: "Adlyn Wijaya", isTransfer: true },
      { counterpartyName: "Adlyn Fakhreyz Pratama", holderName: null, isTransfer: true },
    ]) {
      const { pipeline, calls } = setup({
        transaction: { counterpartyType: "person", ...transaction },
        model: { categoryId: internalId, kind: "exclusion", confidence: 0.99 },
      });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
      assert.deepEqual(calls.searches, []);
      assert.deepEqual(calls.set, [
        { transactionId, categoryId: null, kind: null, confidence: 0.99 },
      ]);
    }
  });
  it("keeps personal, unknown and account-like counterparties out of Brave", async () => {
    for (const transaction of [
      { counterpartyType: "person" as const, counterpartyName: "Budi Santoso" },
      { counterpartyType: "unknown" as const },
      { counterpartyName: "Shop account 12345678" },
      { counterpartyName: "Shop Rp 500" },
      { counterpartyName: "shop@example.com" },
      { counterpartyName: "Bank account 1234" },
      { counterpartyName: "Shop 50.000" },
      { counterpartyName: "Adlyn Fakhreyz Pratama Cafe" },
      { counterpartyName: null },
    ]) {
      const { pipeline, calls } = setup({ transaction });
      await pipeline.runJob(job);
      assert.deepEqual(calls.searches, []);
      assert.equal(
        calls.prompts.length,
        transaction.counterpartyName === "Adlyn Fakhreyz Pratama Cafe" ? 0 : 1,
      );
    }
  });
  it("searches canonical public names only for exact bundled names and aliases", async () => {
    for (const [counterpartyName, expected] of [
      ["  kOPi   kENAngAN  ", "Kopi Kenangan"],
      ["Ｋｏｐｉ　Ｋｅｎａｎｇａｎ", "Kopi Kenangan"],
      ["  BANK   CENTRAL ASIA ", "BCA"],
      ["Spotify Premium", "Spotify"],
    ]) {
      const { pipeline, calls } = setup({ transaction: { counterpartyName } });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
      assert.deepEqual(calls.searches, [expected]);
      assert.equal(calls.claims, 1);
      assert.equal(calls.prompts.length, 1);
    }
  });
  it("skips search and profile claims for unverified businesses and private identifiers", async () => {
    for (const counterpartyName of [
      "Budi Santoso",
      "BCA1234",
      "BCA****1234",
      "BCA１２３４",
      "BCA 1 2 3 4",
      "BCA ****",
      "BCA xxxx",
      "BCA ••••",
      "<BCA>",
      "BCA@example.com",
      "https://bca.co.id",
      "BCA account",
      "Kopi Kenangan Budi Santoso",
      "Kopi Kenangan Pejaten Timur",
      "BAKED. Pejaten Timur",
      "Unknown Local Bakery",
    ]) {
      const { pipeline, calls } = setup({
        transaction: { counterpartyName, counterpartyType: "business" },
      });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"], counterpartyName);
      assert.deepEqual(calls.searches, [], counterpartyName);
      assert.equal(calls.claims, 0, counterpartyName);
      assert.deepEqual(calls.saved, [], counterpartyName);
      assert.equal(calls.prompts.length, 1, counterpartyName);
      assert.equal(JSON.parse(calls.prompts[0]?.user ?? "{}").businessSearch, null);
    }
  });
  it("keeps recognized brands private when transfer or holder evidence forbids lookup", async () => {
    for (const transaction of [
      { counterpartyName: "BCA", isTransfer: true },
      { counterpartyName: "Kopi Kenangan", holderName: "Kopi Kenangan" },
      { counterpartyName: "BCA", counterpartyType: "person" as const },
      { counterpartyName: "BCA", counterpartyType: "unknown" as const },
    ]) {
      const { pipeline, calls } = setup({ transaction });
      assert.deepEqual(await pipeline.runJob(job), ["categorized"]);
      assert.deepEqual(calls.searches, []);
      assert.equal(calls.claims, 0);
      assert.equal(calls.prompts.length, "holderName" in transaction ? 0 : 1);
    }
  });
  it("reuses only business evidence while each transaction is classified from its own facts", async () => {
    const other = "00000000-0000-4000-8000-000000000031";
    const { pipeline, calls } = setup({
      transactions: { [other]: { kind: "income", flowDirection: "in", description: "Salary" } },
      modelForRequest(request) {
        return JSON.parse(request.user).transaction.flowDirection === "in"
          ? { categoryId: incomeId, kind: "income", confidence: 0.99 }
          : { categoryId, kind: "expense", confidence: 0.99 };
      },
    });
    assert.deepEqual(
      await pipeline.runJob({
        kind: "merchant.categorize",
        transactionIds: [transactionId, other],
      }),
      ["categorized", "categorized"],
    );
    assert.equal(calls.searches.length, 1);
    assert.equal(calls.prompts.length, 2);
    assert.deepEqual(
      calls.set.map((value) => ("categoryId" in value ? value.categoryId : null)),
      [categoryId, incomeId],
    );
  });
  it("retries rejected business lookups after the originating transaction is edited or deleted", async () => {
    const other = "00000000-0000-4000-8000-000000000031";
    const third = "00000000-0000-4000-8000-000000000032";
    for (const deleted of [false, true]) {
      const { pipeline, calls } = setup({
        inactiveAfterClaim: { id: transactionId, deleted },
      });
      assert.deepEqual(
        await pipeline.runJob({
          kind: "merchant.categorize",
          transactionIds: [transactionId, other, third],
        }),
        ["not_needed", "categorized", "categorized"],
      );
      assert.equal(calls.claims, 2);
      assert.deepEqual(calls.released, ["Kopi Kenangan"]);
      assert.deepEqual(calls.searches, ["Kopi Kenangan"]);
      assert.equal(calls.prompts.length, 2);
      assert.deepEqual(
        calls.set.map((input) => input.transactionId),
        [other, third],
      );
    }
  });
  it("finishes exhausted provider failures as needs-review without another provider attempt", async () => {
    const { pipeline, calls } = setup({ searchFails: true });
    assert.deepEqual(await pipeline.runJob(job, { isFinalAttempt: true }), ["uncategorized"]);
    assert.equal(calls.searches.length, 1);
    assert.deepEqual(calls.set, [
      { transactionId, categoryId: null, kind: null, confidence: null },
    ]);
  });

  it("measures synthetic workload call counts without live providers or artificial timing claims", async () => {
    const ids = Array.from(
      { length: 20 },
      (_, index) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    );
    const publicNames = Object.values(brands)
      .filter((brand) => brand.kind === "merchant" && !/\p{N}/u.test(brand.name))
      .slice(0, ids.length)
      .map((brand) => brand.name);
    assert.equal(publicNames.length, ids.length);
    const scenarios = [
      {
        name: "unique businesses",
        transactions: Object.fromEntries(
          ids.map((id, index) => [id, { counterpartyName: publicNames[index] }]),
        ),
        expectedSearches: 20,
        expectedModels: 20,
      },
      { name: "repeated business", transactions: {}, expectedSearches: 1, expectedModels: 20 },
      {
        name: "persons",
        transactions: Object.fromEntries(
          ids.map((id) => [
            id,
            { counterpartyName: "Budi Santoso", counterpartyType: "person" as const },
          ]),
        ),
        expectedSearches: 0,
        expectedModels: 20,
      },
      {
        name: "internal",
        transactions: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              counterpartyName: "Adlyn Fakhreyz Pratama",
              counterpartyType: "person" as const,
              isTransfer: true,
            },
          ]),
        ),
        expectedSearches: 0,
        expectedModels: 0,
      },
      {
        name: "ambiguous",
        transactions: Object.fromEntries(
          ids.map((id) => [id, { counterpartyName: null, counterpartyType: "unknown" as const }]),
        ),
        expectedSearches: 0,
        expectedModels: 20,
      },
    ];
    for (const scenario of scenarios) {
      const { pipeline, calls } = setup({ transactions: scenario.transactions });
      await pipeline.runJob({ kind: "merchant.categorize", transactionIds: ids });
      assert.equal(calls.searches.length, scenario.expectedSearches, scenario.name);
      assert.equal(calls.prompts.length, scenario.expectedModels, scenario.name);
      assert.equal(calls.set.length, ids.length, scenario.name);
    }
  });

  it("keeps search summaries short and strips markup", () => {
    const summary = summarizeSearchResults([
      { title: "<script>Kopi</script>", description: "x".repeat(3000), url: "" },
    ]);
    assert.ok(summary !== null && summary.length <= 1500);
    assert.doesNotMatch(summary, /[<>]/);
    assert.equal(summarizeSearchResults([]), null);
  });
});
