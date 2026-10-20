# Data model and security design

Owner: Zoe. Features: F1, F4, F5, F7, F9. Status: Draft.

## Purpose

Monara persists each User's ledger in Supabase and keeps financial writes behind the Next.js backend. This section covers identity, reviewed imports, typed Categories, Custom Banks, Budgets, reproducible insights, forecast data and deletion storage on `origin/main` at `c9e5ea0`. It was reconciled on 20 October 2026 and remains Draft pending renewed owner review. Detailed permission tiers and the wider risk inventory stay in the separate [security self-assessment](security-self-assessment.md).

## How it works

Supabase Google Auth establishes identity and initializes the Profile, Reminder Preferences, and owned default Categories. Gmail authorization is separate through Composio. `apps/web/src/lib/finance/service.ts` supplies verified server identity to `packages/core/src/finance.ts`; shared contracts validate operations, and `packages/core/src/supabase-finance-repository.ts` scopes queries and mutations by `user_id`. Agent callers must first resolve identity through the authenticated web bridge or verified WhatsApp link. A caller-supplied identifier alone does not establish ownership.

The model groups data into owned resources: Financial Accounts, private bank definitions and Categories; transactions and Budgets; Recurring Bills and Reminders; provider connections and processed Gmail identifiers; conversation/action state; financial goals and private image-upload intents; and derived forecasts. Composite `(id, user_id)` foreign keys protect relationships such as transaction-to-account and transaction-to-category. UUIDs identify records; names are editable display values.

Transactions use `expense`, `income`, or `exclusion`, with `pending` or `confirmed` review status. Confirmed expenses and income affect their corresponding totals; pending, deleted, and excluded records do not. Exclusions retain known cash direction and support audit/deduplication without implying an account balance or linked transfer pair. Rejecting an import is represented by confirming an exclusion, rather than a stored `rejected` state. Application confirmation contracts require a type and date; expenses and income also require a positive IDR amount. SQL permits confirmed exclusions with unknown amount or date, so application requirements must not be mistaken for universal database constraints.

Categories have an immutable `kind`, matching the transaction type when known; an unknown pending transaction can retain a category hint. Budgets accept expense Categories only. [Typed-category migration](../../supabase/migrations/20261019120000_typed_gmail_categorization.sql) relinks existing records and Undo snapshots without changing their financial treatment. Stable default identity and slug define Internal semantics, so renaming its display label does not remove the safeguard.

Weekly/monthly Budget usage reads confirmed category expenses. Transaction confirmation and edits reevaluate thresholds; the default warning is 80%, followed by 100%. Stored trigger keys deduplicate threshold Reminders by Budget and period. In-app records do not establish live WhatsApp delivery; the [reminders section](reminders.md) covers that boundary.

Gmail records store provider identifiers, processing state, normalized extracted fields, and extraction evidence, not raw message bodies, subjects, or OAuth tokens. Unique connection/message and processed-message/item-index pairs prevent duplicate imports. Items are first persisted pending, then may auto-confirm after complete facts, account mapping and compatible classification pass. Review Confidence is the lower available extraction/classification score; one available score decides, while both absent or a result below 0.5 stays pending. [Extraction](extraction.md) gives the complete policy and deterministic Internal rule.

Ledger contracts carry whole IDR as decimal strings; `finance.ts` uses BigInt arithmetic and Postgres constrains amounts to positive integers. F9 returns its basis numbers through `packages/contracts/src/insights.ts`: savings rate uses confirmed income and spending; safe-to-spend divides remaining Budget allowance by inclusive remaining days; overspend forecast extrapolates confirmed spending pace. Unusual flags compare against the previous three complete months, requiring at least three same-category expenses and twice their median. Budget suggestions use that same three-month window and remain proposals until accepted.

`forecast_runs` and `forecast_items` hold derived predictions separately from transactions. The [forecast migration](../../supabase/migrations/20261019150000_spending_forecast.sql) replaces only the owner's latest run atomically, constrains item ownership and amount ranges, and clears a removed Category reference without deleting its owner. Predictions never enter confirmed totals. Web chat conversations and messages are deliberately persisted in backend-only tables; audit logs should not be confused with that authorized conversation history.

## Key decisions

- Enforce composite ownership in Postgres instead of relying solely on application filters. Related resources cannot cross User boundaries even when a global UUID is known.
- Keep writes in the Next.js backend instead of granting browser financial writes, following [ADR 0001](../adr/0001-initial-runtime-boundaries.md). Shared services give web and Agent operations consistent validation and optimistic concurrency checks.
- Represent exclusions in the transaction table instead of dropping unusable imports or counting all transfers as income/expense. Their source and review history survive without changing financial totals.
- Keep typed Categories instead of interpreting editable names. Expense-only Budgets and compatible classifications remain enforceable after renaming.
- Calculate insights from confirmed records instead of persisting them as financial facts. Forecasts are separately stored predictions with explicit confidence and basis; neither design claims a bank-verified balance.
- Use staged permanent identity deletion instead of an undo period. Acceptance erases product rows, revokes sessions, and fences the identity while retryable external cleanup finishes; completion requires successful provider cleanup and Auth hard deletion.

## Security and risks

Product tables enable and force RLS. `anon` has no financial access. Authenticated users receive owner-filtered `SELECT` on selected user-facing tables, including goals; backend-only Gmail state, WhatsApp links, delivery state, action state, chat history, deletion jobs, and forecasts have no authenticated table grant. The service-role key stays server-side. Repository filters, owned references, validated operations, and active-user checks remain necessary because that key bypasses RLS. Gmail and forecast mutation functions are restricted to service callers; the signed-in deletion function derives `auth.uid()` itself.

[Deletion migration](../../supabase/migrations/20261019090000_user_deletion.sql) requires the exact confirmation and a live session, captures provider cleanup identifiers, bans the identity, removes sessions, and deletes owned product rows. Later migrations extend the fences to Goals, forecasts, private images and upload intents. `packages/core/src/user-deletion.ts` leases repeatable cleanup steps: purge conversation state, remove triggers, revoke connections, reconcile and delete private Storage objects, inventory remaining provider resources, then hard-delete Auth. Failures retain the remaining target for retry. No local or automated database check establishes erasure from live providers or backups.

Coverage has limits. Forecast calculations convert money through JavaScript Number; ledger string/BigInt precision must not be claimed for extreme forecast amounts. Calendar calculations use Jakarta or server boundaries; generalized User-timezone acceptance remains Planned. Gmail items without a usable stated date use the source email's arrival day in Jakarta. Receipt and manual transactions keep an unknown date null until the User supplies one. Production provider authorization, outbound delivery, secret configuration and real deletion recovery remain environment-specific acceptance dependencies.

## How to verify

Run `pnpm --filter @monara/core test` for confirmed-only calculations, category compatibility, ownership failures, optimistic locking, Undo, deletion retries, private Storage cleanup and forecast isolation. Tests include `finance.test.mjs`, `typed-budget-categories.test.mjs`, `user-deletion.test.mjs`, and `forecast-service.test.mjs` under `packages/core/src`.

In a disposable Docker worktree, `pnpm db:check --reset --base-ref origin/main` replays migrations, lints SQL, runs pgTAP, and checks generated types. Inspect `supabase/tests/database/initial_schema_rls.test.sql`, `gmail_typed_categorization.test.sql`, `user_deletion.test.sql`, `web_chat_history.test.sql`, and `spending_forecast.test.sql`. Expected boundaries are cross-User denial, no browser writes or backend-state reads, owned relationships, deduplication, compatible categories, terminal import review, and local deletion cleanup. The latest baseline CI ran 19 SQL test files with 559 assertions and the Supabase workflow reported the remote migration history current. Those automated results do not prove a real User deletion or provider revocation.
