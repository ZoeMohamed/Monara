# UI and PWA

Owner: Erdafa. Features: F1, F2, F4, F5, F6, F7, F8, F9, F11, F12, F13, F15; forecast extension F17. Status: Draft.

## Purpose

Monara provides an English, light-only financial interface using HeroUI. `/demo` uses sample data and browser memory; protected routes load the signed-in User's owned ledger through the Next.js backend. Failed live requests show an explicit recovery state. This section describes parent PR #85 at `e74524752c538ca8866295c91bdc456e17842eb3`, reconciled on 19 October 2026, and awaits Erdafa's review. [Submission scope](README.md) distinguishes implemented extensions from the PRD and open PRs.

## How it works

**Entry and identity (F1, F2).** The [protected layout](../../apps/web/src/app/(finance)/layout.tsx) verifies the server session. [Google sign-in](../../apps/web/src/components/sign-in-screen.tsx) is separate from Gmail consent. First-run [onboarding](../../apps/web/src/components/onboarding.tsx) guides Gmail connection, detected institutions and account selection, confirmed full name, and import progress. The [Gmail screen](../../apps/web/src/components/gmail-connections-screen.tsx) supports up to three mailboxes, reconnect/disconnect, last import counts and account suggestions. It polls server progress while work is running; automatic imports replace a manual Sync Now control. Imported rows can remain pending after the job finishes. Eligible records can confirm automatically under [extraction's two confidence gates](extraction.md); the screen's blanket introductory review copy is broader than actual backend behavior.

**Ledger and review (F4, F5).** The [presentation adapter](../../apps/web/src/lib/finance/presentation.ts) validates complete paginated snapshots and preserves original DTOs. Decimal money strings pass through `bigint` and a safe-integer range check before display; unsupported wide values fail explicitly rather than rounding. Owned account and Category UUIDs, request IDs and expected versions accompany writes through the [finance client](../../apps/web/src/lib/finance/client.ts). Typed Categories match expense, income or exclusion; Budget selectors accept expense Categories.

[History](../../apps/web/src/components/transactions-screen.tsx) presents All, Expenses, Income, Exclusions and To review filters in one list. Pending records can be edited, confirmed or excluded. Pending records and confirmed exclusions do not affect totals. Details preserve available source evidence. Excluding an import retains its source identity for deduplication. Missing Gmail dates remain representable; receipt ingestion still substitutes dates in some cases, as described in [extraction](extraction.md). A displayed receipt date is not necessarily a stated source fact.

[Finance synchronization](../../apps/web/src/components/use-finance-sync.ts) ignores stale reads, serializes writes and blocks further mutation after uncertain outcomes until refresh. Drafts survive ordinary failed submissions while mounted. Demo Undo is scoped to its change; live controls also call `undo_action`. [Live Undo](../../packages/core/src/finance.ts) checks the produced record version, but reversal and receipt consumption are separate repository calls. #82's atomic recovery changes are absent. A save can finish even when its acknowledgement is lost; do not automatically repeat an uncertain action.

**Overview and Planning (F6-F9, extensions).** [Home](../../apps/web/src/components/mobile-overview.tsx) leads with spending, month context, recent confirmed records and attention items. Reports and deterministic insights expose their confirmed-data inputs. [Budgets](../../apps/web/src/components/budgets-screen.tsx) uses chosen weekly/monthly periods, a category list, details and explicit editing. The frozen tree does not yet contain #82's separate Weekly/Monthly groups or revised keyboard tab system.

[Goals](../../apps/web/src/components/goal-planner.tsx) already stores manual progress and optional private photos; its pace estimates do not reserve ledger money. Forecast appears on Home and in a separate [forecast list](../../apps/web/src/components/forecast-ledger.tsx). Stored estimates have a manual refresh and old-month replacement via [useForecast](../../apps/web/src/components/use-forecast.ts). The list currently exposes confidence. Nightly refresh and instant projection changes in #91 are absent. Goals and the repository's F17 forecast label extend the scoped PRD v2.1; see [forecast](forecast.md).

**Chat and Reminders (F11-F13).** [Chat](../../apps/web/src/components/chat-screen.tsx) provides prompts, separate conversations, action receipts and image selection. The [bridge](../../apps/web/src/app/api/chat/route.ts) validates the reply and saves exchanges after returning it. A history-save failure can therefore lose a successful exchange; #82's signed save-only recovery is absent. Web receipt uploads are unsupported in this parent; implemented photo extraction is on WhatsApp. Voice is Planned. Verified WhatsApp link adapters exist and verification sets stored opt-in, but a separate Reminder preference control is unavailable. Configured Kapso acceptance is separate. Owned notification read/archive state persists, while personal Reminder creation/completion is demo memory only. Bill detection and bill-due delivery remain Planned.

**Deletion and PWA (F1 extension, F15).** [Profile deletion](../../apps/web/src/components/delete-account-control.tsx) requires `DELETE MY ACCOUNT`, acknowledgement and Delete permanently. Unknown acknowledgements check the status receipt; accepted cleanup continues after leaving. The [status page](../../apps/web/src/components/account-deletion-status.tsx) distinguishes progress from completion. Demo has no real deletion. The [service worker](../../apps/web/public/sw.js) caches only the generic offline page and allowlisted public assets. Auth/API/RSC responses, private app documents and Next.js chunks use the network.

## Key decisions

- A separately labelled demo replaces mandatory consent before exploring the product. It never substitutes for failed live data.
- Pending review and typed exclusions replace counting uncertain imports. Guarded Gmail auto-confirmation is supported; blanket rejection of automatic confirmation was an obsolete draft claim.
- Shared components and [HeroUI/theme](../../packages/ui/src/index.ts) replace separate mobile and desktop implementations. Reduced motion, labels, focus and safe-area clearance remain required.
- Backend operations replace component database writes. Public-only offline caching protects private records across sign-out and identity changes.

## Security and risks

The [server identity boundary](../../apps/web/src/lib/supabase/server.ts), service ownership checks and RLS authorize access; UUID URLs and hidden controls do not. Cookie mutations check origin and use private/no-store responses. Financial drafts and Chat stay out of persistent browser storage; display preferences may persist.

Unknown writes, post-response Chat history loss, non-atomic Undo and incomplete receipt paths remain acceptance risks. Public logo matches only decorate records; they cannot establish account ownership. Full contract-range money editing, physical-phone installation and configured multi-session/provider acceptance remain open. Do not adopt #82 recovery claims or its test totals before integration.

## How to verify

Run web lint/typecheck/build through `pnpm check` and `pnpm build`. Focused tests cover [snapshot and transport boundaries](../../apps/web/src/lib/finance/finance.test.mjs), [synchronization](../../apps/web/src/lib/finance/sync.test.mjs), [Chat](../../apps/web/src/lib/chat/route.test.mjs), [Gmail progress](../../apps/web/src/lib/onboarding/import-progress.test.mjs), [deletion](../../apps/web/src/lib/auth/user-deletion.test.mjs), [navigation](../../scripts/app-navigation.test.mjs) and [offline caching](../../scripts/sw.test.mjs).

For new browser acceptance use portrait **390 x 844 CSS pixels**: inspect demo/live separation, review/edit/exclude and totals, typed selectors, stale writes, Undo, month switching, Gmail completion with pending items, forecast loading/error, Chat reload and deletion confirmation. Use synthetic identities and a separately agreed disposable backend for destructive cases. Verify offline Cache Storage contains no private responses.

Earlier browser runs remain dated in the [UI continuation](../next-steps-2026-10-11.md), [meeting handoff](../ui-meeting-handoff-2026-10-17.md) and [deletion evidence](../evidence/user-deletion-2026-10-19.md). Some describe other branches or simulated providers. This source reconciliation is not a fresh UI, live-provider or deployed acceptance run.
