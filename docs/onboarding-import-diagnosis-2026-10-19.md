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
