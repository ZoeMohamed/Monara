import { type MerchantCategorizeJob, merchantKey } from "@monara/contracts";
import type { BraveSearchClient } from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "../gmail/backend.ts";
import type { LlmClient } from "../gmail/llm.ts";
import {
  businessSearchName,
  chooseCategory,
  internalCategory,
  summarizeSearchResults,
} from "./categorize.ts";

export type MerchantJobOutcome = "categorized" | "uncategorized" | "not_needed";
export class MerchantBusyError extends Error {
  constructor() {
    super("Another job is searching this merchant.");
    this.name = "MerchantBusyError";
  }
}
interface MerchantStageMetric {
  stage: "search" | "classification" | "internal";
  durationMs: number;
  cacheHit?: boolean;
}
export interface MerchantPipelineDependencies {
  backend: GmailBackend;
  llm: LlmClient;
  search: BraveSearchClient;
  observe?: (metric: MerchantStageMetric) => void;
}

export function createMerchantPipeline(dependencies: MerchantPipelineDependencies) {
  const { backend, llm, search } = dependencies;
  async function merchantSummary(
    merchantName: string,
    checkActive: () => Promise<unknown>,
  ): Promise<string | null> {
    const started = performance.now();
    const claim = await backend.claimMerchantProfile(merchantName);
    if (claim.status === "ready") {
      dependencies.observe?.({
        stage: "search",
        durationMs: performance.now() - started,
        cacheHit: true,
      });
      return claim.summary;
    }
    if (claim.status === "busy") throw new MerchantBusyError();
    try {
      await checkActive();
      const summary = summarizeSearchResults(await search.search(merchantName));
      await backend.saveMerchantProfile({ merchantName, summary });
      dependencies.observe?.({
        stage: "search",
        durationMs: performance.now() - started,
        cacheHit: false,
      });
      return summary;
    } catch (error) {
      await backend.releaseMerchantProfile(merchantName).catch(() => undefined);
      throw error;
    }
  }

  async function runTransaction(
    transactionId: string,
    summaries: Map<string, Promise<string | null>> = new Map(),
  ): Promise<MerchantJobOutcome> {
    let transaction: Awaited<ReturnType<GmailBackend["resolveImportedTransaction"]>>;
    try {
      transaction = await backend.resolveImportedTransaction(transactionId);
    } catch (error) {
      if (error instanceof BackendOperationError && error.isNotFound) return "not_needed";
      throw error;
    }
    if (!transaction.needsCategory) return "not_needed";
    const checkActive = async () => {
      const current = await backend.resolveImportedTransaction(transactionId);
      if (!current.needsCategory)
        throw new BackendOperationError("gmail.resolve-imported-transaction", 404, "NOT_FOUND");
      return current;
    };
    const started = performance.now();
    let choice = internalCategory(transaction);
    if (choice)
      dependencies.observe?.({ stage: "internal", durationMs: performance.now() - started });
    else {
      const businessName = businessSearchName(transaction);
      let summary: string | null = null;
      if (businessName) {
        const key = merchantKey(businessName);
        let lookup = summaries.get(key);
        if (!lookup) {
          lookup = merchantSummary(businessName, checkActive);
          summaries.set(key, lookup);
        }
        summary = await lookup;
      }
      await checkActive();
      const classificationStarted = performance.now();
      choice = await chooseCategory(
        {
          completeJson: async (request) => {
            await checkActive();
            return llm.completeJson(request, checkActive);
          },
        },
        { transaction, summary },
      );
      dependencies.observe?.({
        stage: "classification",
        durationMs: performance.now() - classificationStarted,
      });
    }
    // A null decision is terminal too: otherwise an unclear import leaves progress running forever.
    const applied = await backend.setImportedCategory({
      transactionId,
      categoryId: choice?.categoryId ?? null,
      kind: choice?.kind ?? null,
      confidence: choice?.confidence ?? null,
    });
    return !applied ? "not_needed" : choice ? "categorized" : "uncategorized";
  }

  return {
    runTransaction,
    async runJob(
      job: MerchantCategorizeJob,
      options: { isFinalAttempt?: boolean } = {},
    ): Promise<MerchantJobOutcome[]> {
      const transactionIds = "transactionIds" in job ? job.transactionIds : [job.transactionId];
      const outcomes: MerchantJobOutcome[] = [];
      const failures: unknown[] = [];
      // Cache business evidence only. Each transaction receives its own fact-based classification.
      const summaries = new Map<string, Promise<string | null>>();
      for (const transactionId of transactionIds) {
        try {
          outcomes.push(await runTransaction(transactionId, summaries));
        } catch (error) {
          if (error instanceof BackendOperationError && error.isNotFound)
            outcomes.push("not_needed");
          else if (options.isFinalAttempt) {
            const applied = await backend.setImportedCategory({
              transactionId,
              categoryId: null,
              kind: null,
              confidence: null,
            });
            outcomes.push(applied ? "uncategorized" : "not_needed");
          } else failures.push(error);
        }
      }
      if (failures.length)
        throw failures.find((error) => error instanceof MerchantBusyError) ?? failures[0];
      return outcomes;
    },
  };
}
