# Transaction currencies

Status: implemented and verified locally. This document defines the agreed behavior and records the pre-implementation source findings; it does not establish deployed support.

## Stated requirements

- Keep IDR as the Primary Currency.
- Show imported USD transactions in the transaction list and during onboarding without requiring the User to enable a currency in their profile.
- Support only IDR and USD in this release. A bare dollar sign means USD by explicit product convention.
- Use IDR as the fallback when a transaction amount has no currency information, and keep these defaulted transactions pending review.
- When a bank notification gives both an original foreign price and an actual IDR debit, record the stated IDR debit and retain the original price as evidence. Do not count the purchase twice.
- Handle new imports and fresh onboarding only; do not recover previously processed or skipped foreign transactions.
- Keep the release scope small while preserving financial correctness.

Primary Currency and Transaction Currency are distinct terms in [the domain glossary](../CONTEXT.md). The settled currency conventions are recorded in [ADR 0007](adr/0007-idr-usd-transaction-currencies.md).

## Currency interpretation

- `Rp` and `IDR` identify IDR.
- `USD`, `US$`, and a bare `$` identify USD under this release's product convention. This deliberately prioritizes the User's IDR/USD scope over general symbol disambiguation.
- An explicit unsupported currency, such as `SGD`, `S$`, or `EUR`, must not be mistaken for an absent currency or a bare dollar sign. It is outside the supported set and must not be silently relabelled as IDR or USD.
- Missing currency uses the IDR fallback. Amount parsing must still establish the amount itself; a currency fallback does not resolve an ambiguous decimal or thousands separator.

## Pre-implementation source findings

- The [Gmail extraction prompt](../apps/agent/src/gmail/parse/extract.ts) already permits ISO currency codes including USD, but deterministic guards clear foreign and unmarked amounts. The [existing tests](../apps/agent/test/gmail-extract.test.ts) require that behavior.
- The [money contracts](../packages/contracts/src/common.ts), database transaction constraints, and Gmail confirmation functions enforce IDR. See the [initial schema](../supabase/migrations/20261012080806_initial_monara_schema.sql), [confirmed transaction constraint](../supabase/migrations/20261016193000_remove_transfer_categories.sql), and [Gmail confirmation migration](../supabase/migrations/20261019160000_gmail_confidence_only_review.sql).
- Amounts currently use integral whole-rupiah values. USD requires explicit handling of cents at extraction, storage, display, editing, and tool boundaries.
- The [onboarding feed](../apps/web/src/lib/gmail/import-feed.ts) omits currency and hides rows with missing money; [onboarding amounts](../apps/web/src/components/onboarding-import.tsx) always use rupiah formatting.
- The [transaction save mapping](../apps/web/src/components/transaction-actions.ts) hardcodes IDR. Existing [transaction rows](../apps/web/src/components/transaction-row.tsx) also use rupiah formatting.
- [Core financial totals](../packages/core/src/finance.ts) and [chat summaries](../apps/agent/src/conversation/read-tools.ts) sum amounts without distinguishing currencies. The [forecast repository](../packages/core/src/supabase-forecast-repository.ts) does not select currency. These paths need an explicit policy before accepting USD.
- Profile currency is currently static display text in [the profile screen](../apps/web/src/components/profile-screen.tsx), rather than an enabled-currencies preference. No existing FX conversion machinery was found.
- Gmail imports remain restricted to exact senders associated with active owned Financial Accounts. A merchant receipt is not automatically eligible. Completed source messages are skipped on later syncs, so supporting future imports does not recover earlier unsupported amounts automatically. See [the Gmail pipeline](../apps/agent/src/gmail/pipeline.ts).

## Accepted FX valuation policy

Preserve the original USD amount and persist a separate IDR Equivalent, with the exact rate, rate date, rate source, and rounding policy used. A stated actual IDR debit takes precedence over a reference-rate conversion. The LLM extracts financial facts; application code selects the rate and calculates the conversion.

Use the persisted IDR amount for financial totals, Budgets, reports, forecasts, and chat. Display the original USD amount with its approximate IDR equivalent when reference FX was necessary. Do not claim the reference conversion is the bank's actual debit or invent fees. Do not revalue saved history when market rates change or an import is retried.

Use [Frankfurter v2](https://frankfurter.dev/), pinned to its ECB provider. Its documented API supports dated rates, provider selection, and local caching. The default feed blends sources, so pinning the provider makes the rate-source policy explicit. The public `USD/IDR` endpoint with `date=2024-05-15` and `providers=ecb` returned a dated rate successfully during this design session. Weekend samples also returned the preceding Friday's rate. These establish read-only sample requests, not a measured availability guarantee or production integration acceptance.

Accepted date policy: use the transaction's recorded day, which already falls back to the email's arrival day in Asia/Jakarta when needed, and select the latest published reference rate on or before that day. Persist the requested transaction day and actual rate day separately. Share cached rate snapshots by provider, pair, and requested day; do not silently refresh a snapshot already used by a transaction.

Accepted numeric policy: represent USD to cent precision, use exact decimal or scaled-integer arithmetic for conversion, and round once to the nearest whole rupiah with halves rounded up. The exact rate and numeric policy belong to the saved conversion evidence.

## Bounded FX lookup and provider availability

Keep an unconverted USD transaction visible as pending, with no IDR Equivalent and exclusion from IDR totals. The pending record preserves its original USD amount while its IDR Equivalent remains absent. The currency migration adds this representation to the existing transaction table.

Use a two-second hard deadline for FX lookup. Do not use a fixed fallback rate, including Rp18,000/USD. An unavailable reference conversion leaves the transaction pending without blocking import completion.

Use an existing cached reference rate for the required provider, currency pair, and requested day. On a cache miss, fetch from Frankfurter within the same two-second FX lookup deadline, with no inline retry loop. The deadline covers the lookup stage, including response reading and validation, rather than only the initial request. Timeout, non-success HTTP status, absent rate, or invalid data leaves conversion unavailable. Cancel outstanding lookup work; a late response must not overwrite the saved conversion.

When conversion is unavailable, preserve the original USD amount on the same transaction and leave the separate IDR Equivalent absent. Keep the transaction pending and visible in the transaction list and onboarding feed, exclude it from IDR totals, and let import progress reach its terminal needs-review outcome. Retry conversion in the background with bounded attempts and backoff. A retry must use the transaction's current version and current amount/date so it cannot overwrite a newer edit or restore a deleted transaction. Applying the first valid conversion is distinct from repricing a transaction that already has a saved conversion. After conversion succeeds, apply the normal confirmation requirements; conversion alone does not establish confidence, direction, account ownership, or category compatibility. Missing conversion must never be represented as zero.

Original amount, IDR Equivalent, and FX provenance belong to one transaction. These fields do not require another financial transaction or a new visible table column. The currency migration stores both amounts and permits an absent IDR Equivalent while conversion is unavailable.

During this design session, [Frankfurter's official status page](https://frankfurter.instatus.com/) reported the monitored `/v2/rates` endpoint operational and displayed 100.0% uptime. This is provider-reported monitoring, not a response-time guarantee for every request or a measurement from Monara's production runtime. The reviewed public API documentation does not establish a response-time SLA. Rate caching, a bounded lookup, and the pending-USD path remain necessary even with a healthy provider.

These policies make the FX stage bounded and tolerant of provider failure. They do not promise that unrelated database, authentication, or extraction failures cannot occur.

## Editing, confirmation, and undo

- Changing the USD amount or transaction date calculates a new IDR Equivalent using the same date, lookup, timeout, and rounding rules. A failed recalculation must not preserve a stale IDR value for the new amount/date; the USD transaction remains pending until a valid conversion exists.
- Changing only non-financial details preserves the saved amount and FX Snapshot. Confirming an unchanged transaction also preserves its saved conversion rather than requesting today's rate.
- Undo restores the prior transaction values together with the prior IDR Equivalent and FX Snapshot. Use the existing version checks and ownership protections; restore the original conversion without a network lookup.
- Saving, confirming, or editing USD must never silently relabel its amount as IDR. An explicit currency change must update the amount's currency and conversion state consistently.
- Background conversion recovery must not rewrite the evidence of the source email, create a duplicate transaction, or restart completed onboarding progress.

## Implementation acceptance boundaries

- Parse supported currency markers deterministically. Preserve existing whole-rupiah precision and support USD to cent precision. Unresolved amount or separator ambiguity stays in review rather than manufacturing a value.
- Explicit unsupported currency evidence stays in review and is never treated as missing currency, IDR, or USD.
- Preserve the original and reporting amounts in storage, contracts, onboarding, transaction display/actions, and undo. Use the persisted IDR reporting amount consistently for dashboard totals, daily subtotals, reports, Budgets, forecasts, and chat. Pending rows do not contribute to confirmed totals.
- An imported USD purchase can remain associated with its existing owned Financial Account. It must not require a separate USD account or profile currency activation merely because the purchase was denominated in USD. Existing ownership and account-resolution requirements still apply.
- Keep server-side conversion authoritative, use the existing backend write boundary, and keep FX cache entries limited to public rate data. Never send merchant names, transaction amounts, email content, or User identifiers to the rate provider.
- Verify cents and rounding boundaries, bank-stated IDR precedence, missing-currency review, unsupported markers, cache reuse, the full lookup deadline, invalid provider responses, unavailable-rate persistence, bounded recovery, duplicate imports, edit/retry races, and undo. Verify the visible onboarding/list/detail/edit flows at the required mobile viewport.
- Local migrations and the relevant contracts, core, agent, and web checks are implementation gates. Cloud migration, deployment, commits, pushes, and PR creation require the User's separate instruction.

No product decisions remain open in this design. Internal storage shape and retry scheduling belong to the implementation, within these boundaries.

## Implementation

- `Transaction.money` preserves the source currency, with USD expressed in cents. `idrMoney` and `fxSnapshot` are backend-owned read fields. Bank-stated original purchase evidence is exposed separately as `originalMoney`.
- The currency migration adds IDR reporting values, immutable public reference-rate caching, and version-guarded recovery to the existing owned transaction table. Existing IDR history is not rewritten.
- Finance writes and Gmail recording prepare reference rates before persistence. Database triggers derive reporting values from the trusted cache and preserve saved snapshots on unrelated edits. Receipt-authorized Undo restores the prior original and reporting amounts together.
- The existing minute Worker schedule drains up to ten durable conversion jobs per wake-up. Each current amount/date receives at most five attempts, with exponential backoff. User edits and deleted or inactive identities cannot be overwritten by stale completion.
- Onboarding, transaction rows, details, and editing preserve USD cents. Creation, review, and editing share the amount-first sheet, with currency-aware input and account, category, and date chips. Reporting consumers use persisted IDR values. UI verification uses synthetic data; it does not establish a real inbox import or production acceptance.

## Local verification

- `pnpm check` passes, including package tests, typechecking, lint, dependency checks, documentation checks, and migration validation. React Doctor reports 100 for both the web app and shared UI, with no findings.
- `pnpm build` passes the production web build and the agent's Wrangler dry-run build.
- The local database replays all migrations, passes SQL lint for `public` and `private`, and passes 600 pgTAP assertions across 20 files. Generated database types match the local schema.
- `pnpm db:check --reset` refuses to proceed because the machine's stack registry contains an unrelated stale worktree path. After verifying that the selected Docker stack belongs to this worktree, the equivalent local reset, lint, test, and generated-type checks pass. The unrelated registry entry was left untouched.
- A public Frankfurter request for 2024-05-15 returned the ECB reference rate within the two-second deadline; a second read reused the stored snapshot. This sample is not an availability guarantee.
- A synthetic transaction through the real local backend and database preserved USD cents, calculated IDR reporting values, recalculated on an amount edit, and restored the exact prior amount and FX Snapshot through Undo.
- Synthetic onboarding, transaction, detail, and editor components were checked at 390 by 844 CSS pixels. The USD editor also passed a 320-pixel-wide check, including decimal entry and horizontal overflow inspection.

No real Gmail inbox import, cloud migration, deployment, or production provider configuration has been verified. Mobile screenshots are recorded in [the currency UI evidence](evidence/transaction-currencies/README.md).
