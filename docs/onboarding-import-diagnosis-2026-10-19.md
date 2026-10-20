# Onboarding import diagnosis, 2026-10-19

## Observed production behavior

Read-only Supabase diagnostics confirmed the reported import completed: 67 emails checked, 64 transactions created, 6 confirmed, and 58 awaiting review. It started at 08:18:05 UTC, finished extracting at 08:20:15, and settled the last classification at 08:37:41. Extraction therefore took about 2 minutes; categorization continued for another 17.5 minutes.

Cloudflare invocation analytics showed several individual processing invocations with exactly 50 subrequests. The deployed merchant consumer accepted five jobs per invocation; each job could carry ten transactions. Those jobs shared the invocation's request budget. The local worker harness reproduces the unsafe request fanout and verifies bounded replacements. This is evidence of a runtime-budget bottleneck, not proof of the model's latency or a particular HTTP 429. Persisted Worker logs were disabled during this import, so historical Brave/model timings and provider errors cannot be reconstructed.

The latest outcomes contained 31 category suggestions, including the six confirmed transactions, and 33 terminal outcomes without a category. Terminal review outcomes correctly allowed completion. No production data or provider credentials were written during diagnosis.

## Reproductions and fixes

- **Request budget:** merchant jobs now carry at most five transactions, with one job per invocation and at most five concurrent invocations. This preserves the previous five-job parallel ceiling. Old larger jobs and multi-message deliveries are requeued before provider work, preserving their retry budget. The real worker test uses 40 subrequests for five distinct cold businesses and 45 with final-write fallbacks, below 50.
- **Rate-limit amplification:** the initial reproduction sent ten model requests after the first temporary error. The job now stops further provider-dependent work and yields to durable retry, reducing that scenario to one model attempt. Deterministic Internal handling remains independent of provider availability.
- **Repeated reads:** removed a duplicate full-context activity check. Classification now performs two such reads instead of three while retaining the fresh check immediately before the model and atomic backend validation at application time.
- **Progress:** the real API/client/hook path now carries checked emails over claimed emails discovered so far. The denominator can grow while listing continues, so active counts explicitly say “found so far” and the bar stays indeterminate. A separate completed/total transaction counter advances as classification reaches a result, including needs review. Completion retains the final email counts and permits pending reviews.
- **Internal transfers:** the earlier exact-name rule rejected a two-word profile against a three-word bank counterparty. Matching is now deterministic and shared by extraction and classification. The backend independently enforces the same rule through a new append-only migration. No earlier migration is edited.

## Time until the first visible transaction

A subsequent real-onboarding report described a roughly five-second empty wait. A deterministic two-email reproduction isolated an avoidable batch barrier: the first email's extraction finished, but its transaction was not saved until a second, deliberately blocked email finished. The corrected pipeline records each finished extraction and enqueues its classification immediately. The test now observes one persisted row and one categorization job while the second model response is still blocked, compared with zero of each before the fix. This does not establish the exact cause or duration of the friend's live five-second report.

The live onboarding hook also refreshed every three seconds, which could hide an already-persisted first row until the next check. It now refreshes one second after each response while awaiting the first visible row, for at most fifteen seconds. It returns to three seconds after rows appear or that initial window expires. Reads do not overlap, and completion stops polling even when reviews remain.

Incremental publishing increases the five-email job's recording HTTP calls from one to at most five, without increasing extraction-model concurrency. The real worker budget test covers five emails with twenty extracted items each, including queue operations and the extra claim on retry, within the fifty-subrequest budget. Completed records remain idempotent; a retry after category enqueue fails recovers the saved transaction IDs without another extraction call.

These changes remove avoidable waiting. Gmail reads, the initial extraction model response, network latency and queue scheduling remain real work. No sub-five-second production target or deployed improvement is claimed before release and measurement.

## Confirmed-name matching policy

The User explicitly requested name subsets and small typos in two words. Exact normalized full names retain their previous behavior. Flexible matching requires at least two distinct substantive words (at least three characters and containing a letter) in the shorter name. Every distinct word in that name must match a distinct word in the longer name; order and additional words may differ. Up to two words may each contain one insertion, deletion, or substitution, with both fuzzy words at least four characters long. Single-word subsets, initials, repeated words used as extra evidence, and conflicting names do not qualify.

The User subsequently clarified that a matching counterparty name alone establishes Internal, regardless of description, transfer flag, counterparty type or cash direction. Known direction is preserved; missing direction is never invented. Authenticated sender, complete extraction facts, an active owned source account, confidence requirements, untouched-row protection, and atomic category application remain required for automatic confirmation. Flexible matching does not independently prove bank-account ownership and may match people with similar multiword names, a tradeoff accepted by the requested rule.

## Validation and release

The worker and web regressions were run red before their fixes. The real backend reproduction initially failed five of ten financial-boundary assertions; the migrated local database now passes all 323 assertions across eleven SQL files, including 27 direct matching cases, permission checks, and the existing ownership/RLS suites. Generated public database types match exactly and SQL lint reports no errors. Worker typecheck, tests and Wrangler dry-run build, plus web tests, typecheck, lint, mobile preview at 390 by 844, and production build passed. Final `pnpm check` passed, including React Doctor scores of 100 with no findings. Independent review reproduced two retry edge cases, both fixed and covered by regression tests.

Structured stage/error logs are enabled in source through Workers Logs, with invocation request logs disabled and query strings redacted. The next authorized import can distinguish provider waits, cache hits and retries. No new production latency target or measured speedup is claimed from synthetic tests. The relevant Cloudflare references are [subrequest limits](https://developers.cloudflare.com/workers/platform/limits/#subrequests) and [Workers Logs configuration](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

Release through the existing pull request and main CI/CD workflows. Supabase applies `20261019140000_flexible_gmail_holder_matching.sql`; CI deploys the Worker and its queue settings after checks pass. Verify both workflows after merge. Existing transactions are not reclassified by the migration, and no historical sweep or manual production import was run.

## Follow-up: review outcomes and the final categorization retry

After PR #87 deployed, a new production import reached 67 settled emails (65 processed and two skipped), producing 65 transactions. A read-only snapshot at 11:30:49 UTC showed six confirmed transactions, 58 terminal review outcomes and one transaction still categorizing. That last transaction had been created at 11:22:58. The deployed queue configuration was one job per invocation with five concurrent merchant consumers, matching the intended configuration.

Workers Logs contained 16 categorization failures with HTTP 200, `LlmError`, failure `failed`, and the safe diagnostic `The model output was not JSON.` There were no recorded HTTP 429 or Brave failures in that capture. The last retry sequence included attempts three, four and five at 11:24:45, 11:26:52 and 11:30:58 UTC. Exponential retry delays, rather than successful model-call duration, explain the long tail. Successful classifications had a median duration of about 3.1 seconds; the one observed public business search took 367 milliseconds.

The queue incorrectly retried permanent model errors even though the LLM client already distinguished them from temporary provider failures. A regression through the real Worker, HTTP client and merchant pipeline reproduced that retry after a response ended with `finish_reason: length`. Permanent model failures now reach a terminal review outcome on the first delivery. Rate limits, temporary outages and failed backend writes retain durable retry behavior. A test also verifies that a failed terminal review write is never acknowledged as successful.

The unchanged production run eventually completed at 11:39:04 UTC, with six confirmed transactions, 59 review outcomes and zero rows still categorizing. Total elapsed time was about 17 minutes 50 seconds. The final row spent about 16 minutes between creation and settlement; completion was observed through a later read-only status query.

A synthetic probe against the locally configured Azure deployment reproduced the same error without using production transaction content. In four paired calls using the real categorization prompt and bundled categories, two responses exhausted the 200-token cap entirely on reasoning and produced no valid JSON. All four calls with a 600-token cap produced complete JSON; the largest used 408 completion tokens, including reasoning. The initial local fix reserved 600 tokens, subsequently increased at the User's request below. A deterministic replay of that observed token budget fails at the previous cap and passes with the larger budget. This is provider evidence for the response-budget problem, not a claim that every production invalid response had that exact cause.

The review count is a separate policy result. Among the 59 pending transactions at that snapshot, assigning the first applicable blocking reason gave 23 below the categorization confidence threshold, 17 below the extraction threshold, 17 without a valid category, one blocked by another confirmation gate, and one still categorizing. These are mutually exclusive diagnostic buckets, not independent counts of every missing fact. All transactions had mapped Financial Accounts. Both confidence thresholds remain 0.95; a category suggestion alone does not establish confirmation, and Internal name matching does not bypass the other financial confirmation checks.

The onboarding summary now shows one count paragraph: transactions processed during categorization, emails processed during discovery, or transactions imported on completion. It removes the additional transaction-found suffix and duplicate classification paragraph. Growing email totals retain their provisional label. The JSX regression asserts the number of rendered count paragraphs and their exact visible text.

The focused reproduction commands are:

```sh
pnpm exec node --test --test-name-pattern='leaves room for observed reasoning|settles permanent model output|truncated model response' apps/agent/test/merchant-pipeline.test.ts apps/agent/test/gmail-worker.test.ts
pnpm --filter @monara/web exec node --test src/lib/onboarding/import-progress.test.mjs
```

Final validation passed `pnpm check` (239 agent tests, 253 web tests, React Doctor 100 with no findings) and `pnpm build`, including the Worker dry-run build. The mobile demo was checked at 390 by 844 while running and completed, with one count paragraph and no horizontal overflow. Provider timing is supported by the separate synthetic Azure probes, not by the demo.

Only source and local tests were changed for this follow-up. Production diagnostics remained read-only, confidence requirements were not relaxed, and existing transactions were not reclassified.

## Subsequent decision: confidence-only review and 10,000 tokens

The User requested that confidence alone determine review and explicitly chose the lower of extraction and categorization confidence. For a valid imported transaction with both scores recorded, the decision score is their minimum. A score of at least 0.95 qualifies for confirmation; lower or missing scores require review. A missing score is unknown, not an invented zero. This policy supersedes the earlier sender, transfer and exclusion policy gates described above; identity, ownership, category compatibility and structural record validation remain enforced.

A fresh read-only production query found that seven of 65 transactions met the score threshold, compared with six already confirmed. The additional high-score pending record was a non-Internal exclusion with extraction confidence 0.96 and categorization confidence 0.98. All its required facts and account mapping were present. Removing the earlier policy gates therefore would qualify one extra record at the same threshold; it would not qualify most of this existing import. Eighteen records had no usable categorization score. Twenty distinct merchant/recipient examples were presented privately in the conversation, not copied into repository fixtures or documentation.

The User also chose a 10,000-token completion ceiling for reliability. Extraction and categorization now request that budget explicitly, and the shared client no longer silently clamps them to 2,000. The total cap includes reasoning tokens. A synthetic request through the actual categorizer and locally configured provider returned HTTP 200, accepted a 10,000-token cap, and completed valid JSON using 65 tokens in about 2.5 seconds. The larger ceiling does not require the model to generate 10,000 tokens. Other callers retain their existing default budget.

No production transaction history was changed for this decision. Release remains through the normal migration and Worker deployment workflows.

## Accepted follow-up: 50% review, complete fallbacks and display names

The User superseded the intermediate 95% and 10,000-token proposal with the [accepted fallback and normalization design](gmail-import-fallbacks-design-2026-10-19.md). Review uses the lower available confidence score at a 50% threshold, ignoring absent scores while keeping both-absent and incomplete records in review. Person takes priority over a stated purpose for another personal name, Internal remains first, and typed Misc eliminates empty category outcomes for future classification. Original source names remain evidence while normalized display names are capped at 80 characters.

Both existing model stages request up to 32,000 combined completion tokens with medium reasoning. The email-body cap is 40,000 characters and the request timeout 120 seconds. Inline import retries are disabled in favor of durable queue backoff. Parse and merchant jobs each process at most three items; five merchant consumers remain concurrent. Permanent classification errors settle through the fallback rather than waiting through repeated queue backoff. These local changes do not reprocess existing imports or establish production speed.
