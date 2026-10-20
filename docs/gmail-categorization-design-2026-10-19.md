# Gmail categorization design discussion

Status: reduced v1 accepted, implemented, and locally verified. See the [verification evidence](gmail-categorization-v1-verification.md) for results and limitations.

## Settled scope

- Discuss and agree on the workflow before implementation.
- Include categorization and evidence-backed Gmail sync/import optimizations in the same development session.
- Measure the first 30-day import and a single new email before setting speed targets.
- Use `CONTEXT.md` as the existing domain glossary. Record settled terminology there without creating a parallel glossary.
- Credentials remain local and out of documentation, logs, and diffs. Reading a reference or finding credentials does not establish deployed behavior.

## Accepted product decisions

The User accepted the reduced decision table after the complexity review, then updated the review rule on 2026-10-19. The current confidence-only rule below supersedes earlier sender, completeness, transfer, and exclusion-reason confirmation gates. These describe the agreed design, not behavior already implemented.

- Every Category belongs to exactly one type: expense, income, or exclusion. The UI, backend, and LLM must enforce compatibility with Transaction Type.
- Internal includes transfers between the User's own accounts even when the destination is not tracked in Monara. The User's onboarding follow-up makes a deterministic counterparty-name match sufficient, regardless of description, transfer flag, counterparty type or cash direction. The onboarding follow-up accepts complete name subsets with at least two distinct substantive words and one character edit in each of at most two words. Single-word subsets, initials and conflicting names remain ineligible. Preserve known cash direction and never invent it.
- Any compatible exclusion Category may be applied automatically when the confidence rule below passes. Internal retains its deterministic name-evidence check as a classification safety rule; other exclusion reasons do not add a review gate.
- Brave queries contain canonical public names from the bundled brand catalog only, after an exact normalized name or alias match. A model's business label alone is insufficient. Reject numeric or masked identifiers before matching. Personal recipients, the User's name, account numbers, amounts, and raw email content must not enter search queries. Classify personal, uncertain, and unrecognized businesses from transaction evidence without web search.
- Apply the upgrade to new imports, with safe handling of already queued jobs. Do not run a historical reclassification sweep. Preserve confirmed transactions and all User decisions. Structural category migration must preserve existing financial treatment, budget associations, labels, review states, timestamps, and applicable undo records.
- Income defaults retain Salary, Freelance, Business, Interest, Gifts, and Other Income. Add separate income and expense Person categories, selected for another personal name even when purpose is known, while Internal takes priority. Misc retains separate expense, income and exclusion identities. The generic automatic fallback is Income Misc for clearly incoming money and Expense Misc otherwise, including previously unresolved types. Missing direction remains unstated and requires review. Missing category scores remain unknown rather than being fabricated. See the [accepted follow-up design](gmail-import-fallbacks-design-2026-10-19.md) for normalization and budgets.
- Extraction provides facts and a provisional Transaction Type. The categorizer chooses the final compatible type and Category without changing amounts, dates, currency, accounts, or cash direction. Clear Internal transfers may use deterministic rules and skip search and the second LLM.
- For a complete import with an active owned Financial Account and compatible Category, Review Confidence is the lower available extraction and categorization score and must reach `public.gmail_auto_confirm_confidence()` (0.5) to confirm. Use the sole known score when one is absent; both absent or incomplete facts stay pending. Sender authentication and transfer or exclusion labels add no review gates. Scores are operational cutoffs, not calibrated accuracy guarantees.
- An explicitly separated transfer principal is Internal and its explicitly stated fee is an expense only when already represented as distinct extracted items. No general fee-splitting or arithmetic feature. Ambiguous combined totals remain pending.
- Use one confirmed full name initially, without per-bank holder names or aliases. Possible Internal transfers with missing names, a shared single word, initials, or conflicting names require review. Complete multiword subsets and bounded typos use deterministic matching; ordinary receipts may still import.
- Personal and unknown transfers follow the same confidence rule when a compatible Category is supplied. Internal classification still requires the deterministic match against the confirmed profile name. Never infer or change amount, date, currency, account mapping, or cash direction to make a transaction eligible; database validity and active owned account checks still apply.
- A User correction changes that transaction only. Defer correction learning and disable the existing personal merchant-history shortcut for new imports. Keep cached public business-search summaries.
- Import completion waits until listing, extraction, and classification work are terminal. A transaction needing review is a completed processing outcome, not a reason to keep importing forever. Keep review counts in the To review tab and show only one progress count row; keep retries and actual failures distinct.
- Keep the two existing queues and conservative bounded concurrency. Measure queue/stage latency and provider calls, reduce repeated context reads while retaining authorization checks, honor provider backoff, and fix focused enqueue recovery. No distributed scheduler, workflow engine, extraction lease system, durable outbox, or broad replay system in v1.

See [the category decision](adr/0005-typed-transaction-categories.md) and [implementation plan](gmail-categorization-v1-plan.md). The User has confirmed the shared workflow and reduced scope. Provider quotas and live performance remain unverified; do not increase configured concurrency based on assumptions.

## Accepted complexity boundaries

The User accepted this table. Relative complexity describes implementation scope and edge cases, not a time estimate.

| Area | Complexity driver | Accepted initial-version boundary |
| --- | --- | --- |
| Typed categories | Existing categories may be used by expense, income, exclusion, budgets, and undo snapshots. Migration must preserve existing financial treatment and User decisions. | Keep, because type compatibility is central to correct categorization. Use a focused structural migration and stable Category IDs/semantics. |
| Learning from corrections | Existing lookup takes the latest confirmed merchant match, including AI-confirmed imports, with no explicit preference provenance or kind match. True learning needs conflict, replacement, deletion, and context policies. | Defer. A correction updates that transaction only. Stop implicit history reuse for new imports rather than describing current history lookup as explicit User learning. Keep business-search caching. |
| Historical reclassification | Needs eligibility, retry tracking, provenance, and protection against concurrent User edits. Structural migration can also disturb timestamp-based untouched checks. | Defer a separate backlog sweep. Process new imports first; preserve old financial decisions and retain safe handling of already queued jobs. Structural schema compatibility still applies to existing records. |
| Fee splitting | Combined totals and multi-item emails complicate source-item identity and avoiding double counting. | Handle fees only when already explicit as distinct extracted items. No new splitting, arithmetic, or reconstruction feature; ambiguous cases remain pending. |
| Queue redesign | Distributed rate coordination, extraction leases, durable outboxes, and replay each add independent state and recovery contracts. | Keep the existing two queues. Start with stage timings, fewer repeated context reads, bounded existing concurrency, provider backoff, and focused category enqueue recovery. Evaluate larger machinery only against measured problems. |
| Classifier and review | Needs structured evidence, compatible owned Category IDs, and atomic application without overwriting User edits. | Keep the existing second LLM path, extend its inputs/output validation, and keep uncertain outcomes pending. Do not add another model stage. |
| Progress | Existing completion ignores category work. | Include category completion or a terminal needs-review outcome in import progress, without a new workflow engine or status dashboard. |

If learning is revisited later, keep at most one active explicit preference per User, counterparty identity, and Transaction Type. A newer explicit preference replaces the older active value; historical corrections need not accumulate in LLM prompts. A one-off correction must not silently become a universal merchant rule. This is a future option, not accepted implementation scope.

## Initial source audit

Before this development session, the reference image's main flow already existed: extraction, a separate merchant queue, cached Brave search, then a second LLM category choice. The following records the initial source audit, not the upgraded implementation or deployed-runtime verification.

| Stage | Current behavior | Evidence |
| --- | --- | --- |
| Start | Account linking, profile-name saving, signed webhooks, and daily catch-up can initiate imports. | `apps/web/src/lib/gmail/import.ts`, `apps/web/src/app/api/webhooks/composio/route.ts`, `apps/agent/src/gmail/pipeline.ts` |
| Read and extract | Linked accounts constrain institution senders. Parse jobs use an extraction LLM with holder-name context and deterministic name rules. | `apps/agent/src/gmail/pipeline.ts`, `apps/agent/src/gmail/parse/extract.ts`, `apps/agent/src/gmail/parse/holder.ts` |
| Import | Backend operations own financial writes and durable message deduplication. Eligible imports wait for a category before auto-confirmation. | `packages/core/src/gmail-ingestion.ts`, `supabase/migrations/20261018120000_complete_data_foundation.sql` |
| Categorize | Personal merchant history comes first. Other eligible imports use a shared merchant-search cache, Brave on cache misses, and a second LLM. | `apps/agent/src/merchant/pipeline.ts`, `apps/agent/src/merchant/categorize.ts` |

## Gaps identified before implementation

1. `expense`, `income`, and `exclusion` are Transaction kinds. Category has no corresponding type. Defaults include expense and exclusion names, but no income-specific catalog. See `packages/contracts/src/transactions.ts`, `ledger.ts`, and `category-presets.ts`.
2. The second LLM is spending-oriented and receives merchant name, a search summary, and untyped category names. It lacks transaction kind, cash direction, description, holder name, and counterparty evidence. See `apps/agent/src/merchant/categorize.ts`.
3. An expense can receive an exclusion label without changing its kind. Totals use kind, so a transaction labelled Internal could still count as spending. See `supabase/migrations/20261017100000_gmail_category_before_auto_confirm.sql` and `packages/core/src/finance.ts`.
4. A confirmed profile full name already exists, with a Google-name fallback. It reaches extraction and holder matching. Financial Accounts have no distinct holder-name or alias fields. This does not guarantee every existing User has a confirmed name. See `packages/core/src/supabase-gmail-ingestion-repository.ts` and `packages/contracts/src/ledger.ts`.
5. Holder matching can produce exclusion, but extraction discards `counterpartyName` before persistence and does not retain an Internal reason. Exclusions bypass the merchant category pipeline. See `apps/agent/src/gmail/parse/extract.ts` and the latest import SQL.
6. The merchant field can contain a personal payer or recipient. Those names currently qualify for Brave searches. Merchant-only history and per-job reuse also collapse distinct payment/refund/income contexts. See `apps/agent/src/merchant/pipeline.ts` and `supabase/migrations/20261016193000_remove_transfer_categories.sql`.
7. Live exclusion confirmation/editing is inconsistently blocked in the UI despite backend support and a working separate exclude-pending action. See `apps/web/src/components/transaction-actions.ts` and `transaction-editor.tsx`.

## Initial performance and reliability candidates

These discovery candidates are not measured speedups. The accepted complexity table above determines which are in v1; extraction leases, durable outboxes, broad replay, and queue redesign remain deferred.

- Existing source config permits up to six extraction LLM calls concurrently. Merchant batches can run five jobs concurrently despite one consumer invocation. Both use the same model configuration. Increasing consumers alone can increase throttling. See `apps/agent/wrangler.jsonc` and `apps/agent/src/gmail/worker.ts`.
- Repeated activity checks reload categories, Financial Accounts, and holder profiles. A narrower current-authorization check could avoid repeated context reads while preserving revocation safety. See `apps/agent/src/gmail/pipeline.ts` and `packages/core/src/supabase-gmail-ingestion-repository.ts`.
- Batch recording uses one worker HTTP call but serial per-message repository work. Measure a true batch operation against this baseline. See `packages/core/src/gmail-ingestion.ts`.
- Message persistence is idempotent, but overlapping imports can still enqueue and extract the same unfinished message. Exclusive, expiring processing ownership is worth evaluating before raising concurrency.
- Brave requests lack explicit pacing and Retry-After handling. Confirm actual provider limits before selecting concurrency. The shared merchant-search cache already exists; transaction classification must not be shared across Users or incompatible contexts.
- Sync completion ignores category work. Onboarding can stop polling before category-dependent confirmation settles. Model backoff can also exceed the existing stall threshold. Track stage completion, durable retries, and terminal review outcomes explicitly.
- Recovery does not reliably requeue every stranded categorization task after extraction commits. Evaluate durable category work tracking or reconciliation.
- Add operational timing and aggregate counters for queue delay, provider/backend calls, cache hits, duplicate work, and retry waits. Do not log identities, emails, financial amounts, merchant strings, or credentials.

## Decision tree

The product frontier is settled and the User confirmed the reduced v1. Technical implementation choices follow the accepted boundaries rather than reopening deferred features.

- Typed Category catalogs: accepted.
  - Income defaults and custom income categories: accepted.
  - Implementation: preserve legacy financial treatment with typed category copies where necessary and validate ownership/type on writes.
- Internal transfers may include untracked destinations: accepted; the onboarding follow-up uses the confirmed counterparty-name match alone, without a transfer-evidence prerequisite.
  - Automatic confirmation, one confirmed name without aliases, and already-distinct fee items: accepted.
- Exclusion reason does not add a review gate: accepted in the 2026-10-19 confidence-rule update.
  - Internal retains deterministic name validation; other compatible exclusions use the same lower-of-two-scores threshold.
- Business-only external search: accepted.
  - Unknown/personal counterparties use transaction evidence without search; uncertain classification remains pending.
- New imports only, with safe existing queue handling: accepted. Historical reclassification is deferred.
- Classifier responsibilities and initial automatic-confirmation thresholds: accepted. Correction reuse is deferred.
- Completion includes terminal needs-review outcomes: accepted. Provider quotas remain an operational unknown, so preserve conservative execution settings until measured.

## Measurement and verification

Start with a fixed synthetic corpus containing unique/repeated merchants, internal transfers, missing fields, ambiguous names, concurrent sync requests, provider throttling, and User edits during processing. Measure queue and stage latency, time to first imported and confirmed rows, full classification completion, provider calls per email, cache effectiveness, and duplicate work.

Live provider tests and any deployment or remote database changes need separately established scope. This exploration made no provider test calls. Tests were inspected, not executed. The Google reference was read through `gog`; no credential values were written into this repository.
