import { type MerchantCategorizeJob, merchantKey } from "@monara/contracts";
import { type BraveSearchClient, BraveSearchError } from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "../gmail/backend.ts";
import { isTemporaryLlmError, type LlmClient, LlmError } from "../gmail/llm.ts";
import {
  businessSearchName,
  chooseCategory,
  fallbackCategory,
  internalCategory,
  personCategory,
  summarizeSearchResults,
} from "./categorize.ts";

/** Three sequential 120-second classifications leave ample room within the 15-minute wall limit. */
export const MERCHANT_PROCESSING_BATCH_SIZE = 3;

export type MerchantJobOutcome = "categorized" | "uncategorized" | "not_needed";
export class MerchantBusyError extends Error {
  constructor() {
    super("Another job is searching this merchant.");
    this.name = "MerchantBusyError";
  }
}
interface MerchantStageMetric {
  stage: "search" | "classification" | "internal" | "person" | "fallback";
  durationMs: number;
  cacheHit?: boolean;
  /** The search failed and the model classified without it. Carries the HTTP status only. */
  searchFailed?: { status: number | null };
}
export interface MerchantPipelineDependencies {
  backend: GmailBackend;
  llm: LlmClient;
  /** Null when no search key is configured: every transaction is classified without a search. */
  search: BraveSearchClient | null;
  observe?: (metric: MerchantStageMetric) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Another job's search usually ends within a second; wait for it here instead of a 15-second queue retry. */
const BUSY_POLLS = 2;
const BUSY_POLL_MS = 500;
/** Business evidence shared by one job's transactions, and whether search has failed for it. */
interface JobSearch {
  summaries: Map<string, Promise<string | null>>;
  failed: boolean;
}

export function createMerchantPipeline(dependencies: MerchantPipelineDependencies) {
  const { backend, llm, search } = dependencies;
  const sleep =
    dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  async function merchantSummary(
    client: BraveSearchClient,
    merchantName: string,
    checkActive: () => Promise<unknown>,
    job: JobSearch,
  ): Promise<string | null> {
    const started = performance.now();
    let claim = await backend.claimMerchantProfile(merchantName);
    for (let poll = 0; claim.status === "busy" && poll < BUSY_POLLS; poll += 1) {
      await sleep(BUSY_POLL_MS);
      claim = await backend.claimMerchantProfile(merchantName);
    }
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
      const summary = summarizeSearchResults(await client.search(merchantName));
      await backend.saveMerchantProfile({ merchantName, summary });
      dependencies.observe?.({
        stage: "search",
        durationMs: performance.now() - started,
        cacheHit: false,
      });
      return summary;
    } catch (error) {
      await backend.releaseMerchantProfile(merchantName).catch(() => undefined);
      if (!(error instanceof BraveSearchError)) throw error;
      // Search only adds to what the model already knows. Any failed search (rate
      // limit, 4xx, outage, timeout) is skipped: it is not cached as "nothing found"
      // and this job does not try again for its other merchants.
      job.failed = true;
      dependencies.observe?.({
        stage: "search",
        durationMs: performance.now() - started,
        cacheHit: false,
        searchFailed: { status: error.status },
      });
      return null;
    }
  }

  async function runTransaction(
    transactionId: string,
    job: JobSearch = { summaries: new Map(), failed: false },
    modelUnavailable: LlmError | null = null,
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
    const internal = internalCategory(transaction);
    const person = internal ? null : personCategory(transaction);
    const unknownType = transaction.kind === null ? fallbackCategory(transaction, null) : null;
    let choice = internal ?? person ?? unknownType;
    if (choice || transaction.kind === null)
      dependencies.observe?.({
        stage: internal ? "internal" : person ? "person" : "fallback",
        durationMs: performance.now() - started,
      });
    else {
      // Deterministic name decisions remain available during an outage.
      // Only rows that need provider work must wait for the same model to recover.
      if (modelUnavailable) throw modelUnavailable;
      const businessName = search && !job.failed ? businessSearchName(transaction) : null;
      let summary: string | null = null;
      if (search && businessName) {
        const key = merchantKey(businessName);
        let lookup = job.summaries.get(key);
        if (!lookup) {
          lookup = merchantSummary(search, businessName, checkActive, job);
          job.summaries.set(key, lookup);
        }
        try {
          summary = await lookup;
        } catch (error) {
          // Transaction inactivity must not poison other imports, while provider
          // failures stay shared so this job does not repeat a rate-limited search.
          if (
            error instanceof BackendOperationError &&
            error.isNotFound &&
            job.summaries.get(key) === lookup
          )
            job.summaries.delete(key);
          throw error;
        }
      }
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
      let modelUnavailable: LlmError | null = null;
      // Cache business evidence only. Each transaction receives its own fact-based classification.
      const jobSearch: JobSearch = { summaries: new Map(), failed: false };
      for (const transactionId of transactionIds) {
        try {
          outcomes.push(await runTransaction(transactionId, jobSearch, modelUnavailable));
        } catch (error) {
          if (isTemporaryLlmError(error)) modelUnavailable = error;
          if (error instanceof BackendOperationError && error.isNotFound)
            outcomes.push("not_needed");
          else if (
            options.isFinalAttempt ||
            (error instanceof LlmError && error.failure === "failed")
          ) {
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
        // A provider's Retry-After takes precedence over a shorter profile-lock wait.
        throw (
          modelUnavailable ??
          failures.find((error) => error instanceof MerchantBusyError) ??
          failures[0]
        );
      return outcomes;
    },
  };
}
