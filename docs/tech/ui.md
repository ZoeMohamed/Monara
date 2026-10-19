# UI and PWA

Owner: Erdafa. Features: F1, F2, F4, F5, F6, F7, F8, F9, F11, F12, F13, F15. Status: Draft.

## Purpose

Monara is an English, light-only personal-finance PWA using HeroUI. Protected screens show owned records; `/demo` uses labelled synthetic data and memory-only changes. Failed live loads show recovery without substituting sample data or partial totals.

Reconciled on 19 October against main `8778e3f`, the scoped PRD/Action Tracker and accepted meeting decisions. Main's typed Gmail classification, goal intelligence, deletion recovery, animated mascot and mobile navigation are retained. The [meeting handoff](../ui-meeting-handoff-2026-10-17.md) and [owner checklist](../ui-actions-2026-10-16.md) separate source delivery from acceptance. This section remains Draft pending owner review.

## How it works

**Entry and design (F1, F2).** The protected [layout](../../apps/web/src/app/(finance)/layout.tsx) verifies Supabase identity. Google sign-in and Gmail authorization are separate. Home's [onboarding](../../apps/web/src/components/onboarding.tsx) guides consent, confirmed name, detected banks and server-reported import progress. [Gmail settings](../../apps/web/src/components/gmail-connections-client.tsx) offers automatic status and reconnect/disconnect recovery without manual sync. The [theme](../../packages/ui/src/theme.css), local fonts, landscape and mascot preserve the app's visual language.

**Ledger (F4–F6).** [History](../../apps/web/src/components/transactions-screen.tsx) has one compact list with All, Expenses, Income, Exclusions and To review filters. Pending rows use a subtle highlight and quick action, without confidence or review tags. Unknown dates appear under Date needed; confirmation requires an actual date, including exclusions. The [source-date migration](../../supabase/migrations/20261019133000_source_transaction_dates.sql) removes database date fabrication. Historical dates already backfilled need a source audit to correct.

Exclusions stay visible and muted without entering income, spending or budget totals. Main's [catalog](../../packages/contracts/src/category-presets.ts) contains 19 expense, six income and six exclusion presets with drawn icons. [Typed categories](../adr/0005-typed-transaction-categories.md) use owned UUIDs and immutable types; existing mixed usage was structurally preserved. Internal is the only automatic exclusion: an authenticated sender, complete facts, explicit transfer evidence, cash direction and an exact normalized confirmed-name match must satisfy the [classification policy](../gmail-categorization-design-2026-10-19.md). Other reasons require review. Display logos never establish account mappings.

**Budgets and Reports (F7, F9).** Overview stays clean; [Budgets](../../apps/web/src/components/budgets-screen.tsx) shows Weekly and Monthly together on one page, each with its own gauge and category list, without period tabs. Limits stay separate, with exact reset windows and no invented weekly allowance. The [period model](../../packages/contracts/src/budgets.ts) retains seven-day and monthly/payday anchors. The [calendar helper](../../packages/contracts/src/calendar.ts) consistently uses the existing Jakarta default, including midnight boundaries; profile-specific timezone accounting remains separate work. Only confirmed expenses count. Suggestions fill a draft before explicit Save. [Reports](../../apps/web/src/components/reports-screen.tsx) retains monthly/yearly totals and drilldowns. The [adapter](../../apps/web/src/lib/finance/presentation.ts) reads every validated page and rejects values outside safe UI integers without rounding.

**Recovery (F4, F5, F7).** [Synchronization](../../apps/web/src/components/use-finance-sync.ts) serializes writes, ignores stale reads and blocks another write until uncertain results are reconciled. Copy distinguishes a verified save followed by reload failure from an unknown result. [Budget sessions](../../apps/web/src/components/budget-draft-session-context.tsx) retain drafts, submitted bodies and request UUIDs across navigation. Newer versions require review; removed records preserve draft recovery. [Atomic Undo](../../supabase/migrations/20261019131000_guarded_transaction_undo.sql) verifies owner, expiry and saved version, restores the exact snapshot and consumes the receipt together. Ordinary deletes require confirmation and have no Undo.

**Goals and deletion.** Main's [Planning switch](../../apps/web/src/components/budget-planning-screen.tsx) separates Budgets from goals with manually entered progress and private photos. [Pace estimates](../../apps/web/src/lib/goals/plan.ts) use confirmed history without moving money. A saving-pace summary leads Goals, detailed calculations open on request, and goal cards keep progress and correction actions clear. This visual refinement preserves main’s calculations. [Goal sessions](../../apps/web/src/components/goal-draft-session-context.tsx) retain edits and photos through interrupted saves. [Permanent deletion](../user-deletion-design.md) requires phrase/acknowledgement and blocks access on acceptance. Owned-image cleanup uses the Storage API; unresolved upload intents prevent premature Auth deletion. An unknown upload outcome can keep cleanup pending for reconciliation. Confirmed identity changes hide private views and suppress draft-unload prompts; ordinary navigation still protects drafts.

**Chat (F11).** Main's server conversations are the sole history store. The [bridge](../../apps/web/src/app/api/chat/route.ts) returns a verified answer with save status. A storage failure retains a signed owner-bound receipt for twenty-four-hour [save-only retry](../../apps/web/src/app/api/chat/conversations/retry/route.ts), without invoking the Agent again. The [keyed RPC](../../supabase/migrations/20261019132000_chat_history_recovery.sql) deduplicates and orders exchanges; its legacy signature remains compatible. Restored confirmations are closed. Drafts, photos and recovery receipts stay in app memory. A lost Agent reply requires checking records before resending. Summary works; web receipt import and generated visuals remain disconnected.

**Bills and channels (F8, F12, F13).** [Notifications](../../apps/web/src/components/reminders-center.tsx) supports owned read/archive actions; acknowledging a Reminder does not pay a bill. Live bill management and personal reminder editing remain Planned. Profile exposes [verified linking](../../apps/web/src/components/whatsapp-link-row.tsx). Main implements WhatsApp [receipt extraction](../../apps/agent/src/whatsapp/receipt.ts) and [budget dispatch](../../packages/core/src/budget-alerts.ts). Voice/transcription, bill detection and extraction-document updates are separate open PRs, not integrated acceptance.

**PWA (F15).** The [manifest](../../apps/web/src/app/manifest.ts), [installation guidance](../../apps/web/src/components/install-app-button.tsx) and [service worker](../../apps/web/public/sw.js) provide installation and a generic offline fallback. Only allowlisted public assets are cached; financial, chat and authentication responses require connectivity.

## Key decisions

- One History list retains transaction context; separate review tabs crowded the flow.
- Stored budget periods determine gauges; monthly prorating would invent a weekly limit.
- Retry retains request identity; a new ID could duplicate a committed write. Chat-save retry never repeats a financial action.
- Main's typed classification remains authoritative. Redundant preset metadata, fuzzy Internal matching and unpublished Gmail lease machinery were removed to preserve the accepted reduced scope.

## Security and risks

Server identity, owned repositories and RLS authorize records. Cookie-authenticated writes require same-origin checks and private/no-store responses. UI holds no provider credentials. Financial data, chat, drafts and photos never enter browser storage or service-worker caches; leaving despite the warning loses unsaved memory.

No durable Agent-turn status lookup exists. A financial action may finish after a lost reply, and saved confirmations never renew permission. Unknown Storage outcomes may delay permanent-deletion completion. Real consent, model/media/delivery, individual timezones and physical-phone behavior require separate acceptance. The [handoff](../ui-backend-handoff.md) records open PR overlap and provider limits.

## How to verify

The current database checkpoint passed 27 migrations, 397 SQL assertions across 15 files, lint and exact types. Ten real-Storage checks and seven actual Next goal-image checks passed. The combined source gate passed 974 tests with React Doctor 100/100, and refreshed production mobile recovery passed at 390 × 844, with additional 375px-width Goal checks. The final production build, matching Agent dry-run and repeated exact-type check passed; the [handoff evidence](../ui-backend-handoff.md#current-integration-verification) records scope and recovery cases. Earlier 848-test/277-SQL/25-migration results are historical. Local synthetic identity/data and a localhost Agent fixture do not establish Google consent, model execution or provider delivery.

1. Run `pnpm check`, `pnpm build` and disposable database/RLS checks, including exact generated types and append-only migration validation.
2. At 390 × 844, test History, actual-date recovery, both budget periods together without tabs, Goals detail disclosure, over-budget recovery and drafts across navigation. Break replies and record versions; verify exact totals, retained IDs, atomic Undo and save-only chat retry. Test goal photo failures and deletion/upload races separately.
3. Accept Google/Gmail, model/WhatsApp and phone installation/keyboard behavior with their owners. Run `pnpm docs:check`; final submission additionally requires owner review and `pnpm docs:check --final`.
