import { type MerchantCategorizeJob, merchantKey } from "@monara/contracts";
import type { BraveSearchClient } from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "../gmail/backend.ts";
import type { LlmClient } from "../gmail/llm.ts";
import { chooseCategory, summarizeSearchResults } from "./categorize.ts";

export type MerchantJobOutcome = "categorized" | "uncategorized" | "not_needed";

/** Another job is searching this merchant right now; retry shortly and use its result. */
export class MerchantBusyError extends Error {
  constructor() {
    super("Another job is searching this merchant.");
    this.name = "MerchantBusyError";
  }
}

export interface MerchantPipelineDependencies {
  backend: GmailBackend;
  llm: LlmClient;
  search: BraveSearchClient;
}

/**
 * Categorizes one imported transaction. The User's own history was already tried when
 * the transaction was recorded; this looks the merchant up in the shared cache, then
 * on the web, and lets the model choose among the User's Categories. Only the merchant
 * name leaves Monara.
 */
export function createMerchantPipeline(dependencies: MerchantPipelineDependencies) {
  const { backend, llm, search } = dependencies;

  async function merchantSummary(merchantName: string): Promise<string | null> {
    const claim = await backend.claimMerchantProfile(merchantName);
    if (claim.status === "ready") return claim.summary;
    if (claim.status === "busy") throw new MerchantBusyError();
    try {
      const summary = summarizeSearchResults(await search.search(merchantName));
      await backend.saveMerchantProfile({ merchantName, summary });
      return summary;
    } catch (error) {
      await backend.releaseMerchantProfile(merchantName).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Categorizes one transaction. Lookups made earlier in the same job are reused, so
   * a job's transactions at one merchant cost one search and one model call.
   */
  async function runTransaction(
    transactionId: string,
    lookups: Map<string, Promise<string | null>> = new Map(),
  ): Promise<MerchantJobOutcome> {
    let transaction: Awaited<ReturnType<GmailBackend["resolveImportedTransaction"]>>;
    try {
      transaction = await backend.resolveImportedTransaction(transactionId);
    } catch (error) {
      if (error instanceof BackendOperationError && error.isNotFound) return "not_needed";
      throw error;
    }
    const { merchantName, needsCategory, categoryNames } = transaction;
    if (!needsCategory || merchantName === null || categoryNames.length === 0) {
      return "not_needed";
    }
    // One job's transactions come from one User, so their Category names are the same.
    const key = `${merchantKey(merchantName)}\u0000${categoryNames.join("\u0000")}`;
    let lookup = lookups.get(key);
    if (!lookup) {
      lookup = merchantSummary(merchantName).then(async (summary) => {
        await backend.resolveImportedTransaction(transactionId);
        return chooseCategory(
          {
            completeJson: async (request) => {
              await backend.resolveImportedTransaction(transactionId);
              return llm.completeJson(request, () =>
                backend.resolveImportedTransaction(transactionId),
              );
            },
          },
          { merchantName, summary, categoryNames },
        );
      });
      lookups.set(key, lookup);
    }
    const categoryName = await lookup;
    if (categoryName === null) return "uncategorized";
    const applied = await backend.setImportedCategory({ transactionId, categoryName });
    return applied ? "categorized" : "not_needed";
  }

  return {
    runTransaction,

    /**
     * Categorizes each transaction of a job in turn. A failure does not stop the rest;
     * the job then throws so the queue retries it, and transactions already categorized
     * come back as not_needed. A busy merchant wins, so the retry comes soon.
     */
    async runJob(job: MerchantCategorizeJob): Promise<MerchantJobOutcome[]> {
      const transactionIds = "transactionIds" in job ? job.transactionIds : [job.transactionId];
      const outcomes: MerchantJobOutcome[] = [];
      const failures: unknown[] = [];
      const lookups = new Map<string, Promise<string | null>>();
      for (const transactionId of transactionIds) {
        try {
          outcomes.push(await runTransaction(transactionId, lookups));
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw failures.find((error) => error instanceof MerchantBusyError) ?? failures[0];
      }
      return outcomes;
    },
  };
}
