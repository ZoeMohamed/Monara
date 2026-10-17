import type { MerchantCategorizeJob } from "@monara/contracts";
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

  return {
    async runJob(job: MerchantCategorizeJob): Promise<MerchantJobOutcome> {
      let transaction: Awaited<ReturnType<GmailBackend["resolveImportedTransaction"]>>;
      try {
        transaction = await backend.resolveImportedTransaction(job.transactionId);
      } catch (error) {
        if (error instanceof BackendOperationError && error.isNotFound) return "not_needed";
        throw error;
      }
      const { merchantName, needsCategory, categoryNames } = transaction;
      if (!needsCategory || merchantName === null || categoryNames.length === 0) {
        return "not_needed";
      }
      const summary = await merchantSummary(merchantName);
      const categoryName = await chooseCategory(llm, { merchantName, summary, categoryNames });
      if (categoryName === null) return "uncategorized";
      const applied = await backend.setImportedCategory({
        transactionId: job.transactionId,
        categoryName,
      });
      return applied ? "categorized" : "not_needed";
    },
  };
}
