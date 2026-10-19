# Spending forecast

Owner: Abhip. Features: forecast extension (repository label F17; outside PRD v2.1 F1-F16). Status: Draft.

## Purpose

The forecast predicts remaining payments this month from confirmed expense history. It shows expected totals and confidence separately from spending, income and Budget usage. This extension is called F17 in repository code, but the authorized PRD v2.1 defines F1-F16 only. This account freezes parent #85 at `e74524752c538ca8866295c91bdc456e17842eb3`; owner review and deployed acceptance remain outstanding.

## How it works

**Rules.** [forecast.ts](../../packages/core/src/forecast.ts) groups confirmed, non-deleted expenses from the preceding 130 days by normalized merchant name. It proposes only dates from today through month end:

- Monthly patterns need payments in at least two distinct months, roughly one per month, at least 66% within two days of the median day, and a latest payment within 45 days. A merchant already paid this month is not predicted again.
- Weekly patterns need a weekday hit in at least four of the last eight weeks. Remaining occurrences of that weekday become candidates. When both patterns fit, six or more payments favor the weekly pattern.
- Amounts use the rounded median of up to six recent payments, with their minimum/maximum as a range. Confidence combines date regularity, amount stability and history depth. These scores are heuristics, not calibrated probabilities.

**Bounded model refinement.** The backend calls the credential-protected `/forecast/refine` in [the Worker](../../apps/agent/src/forecast.ts). The model receives candidate merchant names, dates and amounts without a User id. Validated judgments can change confidence by at most -0.25 or +0.15 and supply a short reason; they cannot add candidates, amounts or dates. Unknown/duplicate candidate keys are discarded. Missing configuration, provider failure or invalid output falls back to rules. The stored run/API exposes `usedModel`; the card does not identify the fallback.

Items below 0.6 are omitted and counted. Because the maximum reduction is 0.25, a rule score of at least 0.85 cannot be vetoed below this threshold. Kept amounts form expected totals through Sunday and through month end; projected month end adds confirmed spending so far. Predictions never enter ledger or Budget totals.

**Storage and realization.** [forecast-service.ts](../../packages/core/src/forecast-service.ts) saves one run and its items using atomic replacement in [the migration](../../supabase/migrations/20261019150000_spending_forecast.sql). On read it matches due items one-to-one against confirmed expenses from the forecast's creation date onward, for the same normalized merchant, within three days and 35% of the predicted amount. A match marks an item Paid and removes it from remaining totals. Matching is derived rather than stored, so ledger corrections can change the result.

**Refresh and presentation.** Signed-in `/api/forecast` reads the current result or refreshes it on demand. The Home card and History Forecast filter show predictions separately; public demo routes show synthetic samples. An older-month forecast triggers a Home refresh. Both Agent forecast tools use T0, but refresh still writes derived forecast state and can incur a provider call; it is not a side-effect-free read.

The frozen Worker cron is **Monday 02:00 UTC (09:00 Jakarta)**. [The weekly backend route](../../apps/web/src/app/api/agent/forecast/refresh/route.ts) considers Users with recent confirmed expenses, prioritizes missing/oldest results and refreshes at most 25 per invocation in groups of five. Forecasts over six days old or covering a past month are due. Open [#91](https://github.com/ZoeMohamed/Monara/pull/91) proposes nightly refresh, paginated batches and immediate projections; those behaviors are outside this source freeze.

## Key decisions

- Detect patterns in code instead of asking a model to invent payments. Every candidate amount comes from observed history; future dates are explicitly predictions.
- Limit model confidence changes instead of giving it a final veto. This bounds manipulation but can retain a confident rule mistake, such as a cancelled subscription.
- Replace one forecast atomically instead of retaining a history screen. Reads see a complete run, while older forecasts are unavailable for longitudinal evaluation.
- Derive realization on read instead of writing matches for each new transaction. Corrections are reflected automatically, at the cost of approximate merchant/amount matching.

## Security and risks

Forecast storage is backend-only with forced RLS and no browser grants; repository queries use an owned User id and composite ownership prevents cross-User run/item references. Web refresh checks session and origin, with an in-process limit of ten requests per minute. A twenty-second service cooldown reuses a recent result; it is not an atomic concurrent-refresh lock. Weekly/refinement endpoints require the Agent credential.

The model prompt treats merchant fields as untrusted data, and schema/key filtering bounds output. Merchant information still reaches the model provider; retention is not assessed here. The rules use JavaScript numbers for statistics, unlike exact ledger arithmetic. Name normalization can split one merchant or merge unrelated merchants, and new/irregular spending is missed. A new User may have too little history. The weekly route limits discovery and refresh batches, so large populations or repeated failures can remain stale. Configured cron/provider acceptance is separate from source tests.

## How to verify

Run `pnpm --filter @monara/core test`, `pnpm --filter @monara/agent test` and `pnpm --filter @monara/web test`. Inspect [rule tests](../../packages/core/src/forecast.test.mjs), [service tests](../../packages/core/src/forecast-service.test.mjs), Worker refinement tests and web forecast boundary tests. Database ownership/atomic-replacement checks are in [spending_forecast.test.sql](../../supabase/tests/database/spending_forecast.test.sql), requiring an agreed disposable local stack.

The deterministic synthetic backtest asserts **14 of 16 due predictions matched** and **5.2% mean absolute amount error among matches**. Its constructed October includes a cancellation, skipped meal, changed amount and new subscription. This checks fixture behavior, not real spending accuracy, model benefit or a deployed scheduler.

For integrated acceptance, refresh as one signed-in User, verify projected totals and derived Paid matches, then test another User's isolation, unavailable model fallback and prior-month replacement. Confirm expected items never change financial totals. No new paid-model run, real send or deployment is part of this documentation task.
