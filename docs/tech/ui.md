# UI and PWA

Owner: Erdafa. Features: F1, F2, F4, F6, F7, F8, F9, F11, F12, F13, F15. Status: Draft.

## Purpose
Monara's mobile finance interface lets the User review imports before they affect totals. This draft describes the local prototype against [PRD v2.1](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.7t8u9nqsrfc) and [ADR 0001](../adr/0001-initial-runtime-boundaries.md). English, shared HeroUI controls, and the selected royal blue/cyan logo define its appearance. Live authentication, ingestion, financial persistence, Agent operations, WhatsApp linking, and Reminder delivery remain **Planned**.

## How it works
[monara-app.tsx](../../apps/web/src/components/monara-app.tsx) provides Home, Transactions, Budgets, and Chat, with Profile and Reminders in the mobile header. [sample-data.ts](../../apps/web/src/data/sample-data.ts) supplies synthetic records. Changes reset when the User leaves or reloads the demo. The [shared theme](../../packages/ui/src/theme.css) uses compact spacing, flat surfaces, visible focus rings, 44px controls, and reduced motion. [Logo provenance](../../apps/web/public/icons/README.md) records the original asset and derived icons.

**Identity and Gmail (F1, F2).** [SignInScreen](../../apps/web/src/components/sign-in-screen.tsx) separates Google sign-in from mailbox authorization. [GmailConnectionsScreen](../../apps/web/src/components/gmail-connections-screen.tsx) supports loading/error/unavailable states, three-mailbox limits, reconnect, sync progress/results, and confirmed disconnect. Production routes currently disable unavailable actions. **Planned:** Supabase sessions, Composio connections, server ownership checks, profile/timezone settings, and enforced mailbox limits.

**Review (F4).** [ReviewQueue](../../apps/web/src/components/review-queue.tsx) includes every pending import, regardless of confidence. [TransactionEditor](../../apps/web/src/components/transaction-editor.tsx) saves edits while pending or confirms after validation. Unknown fields stay empty. [demo-ledger.ts](../../apps/web/src/data/demo-ledger.ts) requires type, positive safe whole IDR amount, currency, and a valid calendar date; transfers also require both sample Financial Accounts. Rejection requires confirmation and retains the rejected record outside totals. **Planned:** shared transport contracts, durable writes, rejection, and email deduplication.

**Home and Budgets (F6, F7, F9).** Home summarizes a selected month with spending, income, their difference, daily average, pending count, Reminders, and recent confirmed records. Empty months have an explicit empty state. Pending/rejected records are excluded; transfers affect neither income nor spending. Individual amounts use safe integers; sums use `bigint`.

[BudgetsScreen](../../apps/web/src/components/budgets-screen.tsx) shows limit, used, remaining, progress, and text states at 80%/100%. Overall safe spending subtracts all confirmed monthly expenses from total limits, including uncategorized expenses. Overspending reduces available money; the recommendation floors at zero and shows any shortfall. Overall and per-Category daily amounts show their inputs and count today among remaining days. **Planned:** persisted weekly/monthly budgets, editing, server aggregates and timezone handling, history-based forecasts, unusual-transaction flags, and budget proposals.

**Bills and Reminders (F8, F12, F13).** Sample bills remain suggestions until Track bill; dismissal does not track them. Active bills show amount, due date, and optional cancellation guidance. Monara does not cancel subscriptions. `demoReminders` projects currently eligible sample warnings and bills due today or in three days, using PRD template wording. Its identifiers resemble future dedupe keys, but it is not a crossing detector or an exactly-once delivery engine. [ProfileScreen](../../apps/web/src/components/profile-screen.tsx) shows connection status and reminder defaults; WhatsApp reminders remain disabled until linking exists. **Planned:** detection from confirmed history, verified expiring link codes, saved preferences, both threshold events, rearming, durable dedupe, quiet hours, daily limits, and approved-template delivery.

**Chat (F11).** [ChatScreen](../../apps/web/src/components/chat-screen.tsx) has suggested prompts, a message log, sending/error states, and an explicitly unavailable Agent. Failed sends preserve the draft for retry. It never invents a reply or financial action. **Planned:** the authenticated Agent endpoint, action receipts with undo, and explicit high-risk confirmations.

**PWA (F15).** The [manifest](../../apps/web/src/app/manifest.ts) and [install control](../../apps/web/src/components/install-app-button.tsx) provide icons and installation guidance. The production [worker](../../apps/web/public/sw.js) caches only a standalone static offline fallback, manifest, and allowlisted public icons. App HTML, Next.js chunks, auth/API responses, and React Server Component payloads use the network; the app itself is not available offline. Runtime storage failures do not invalidate successful network responses; unavailable offline storage returns a generic message.

## Key decisions
- Review all imports rather than auto-confirming by confidence; approval belongs to the User.
- Keep uncertainty empty rather than inventing dates, money, or account mappings.
- Use selected calendar months rather than rolling windows, matching F6.
- Show unavailable services rather than simulate successful operations.
- Keep writes in the backend rather than components; presentation types do not replace authorized contracts.
- Cache only the static offline fallback and explicitly allowlisted public branding assets. Keep application HTML, Next.js chunks, and personalized pages on the network to avoid offline retention of financial or identity data.

## Security and risks
**Planned:** server-verified identity, ownership, validated input, RLS, and idempotent provider processing. UI limits and disabled buttons are not authorization. Sample account labels must become verified resource IDs; [the backend handoff](../ui-backend-handoff.md) records outstanding decisions.

Dialogs contain focus, support Escape, and restore focus. Errors identify marked fields, invalid submissions focus a field, and status has text alongside color. Input borders remain distinct from decorative dividers. Safe-area padding and 16px touch input text preserve mobile accessibility without disabling zoom. Physical-device keyboard, notch, touch behavior, and installation remain unverified.

## How to verify
Run Node 24 with `pnpm check`, `pnpm build`, and `pnpm docs:check`. [Ledger tests](../../scripts/demo-ledger.test.mjs) cover review transitions, calendar/money validation, monthly boundaries, exact sums, budget thresholds, overspend/unbudgeted expenses, daily calculations, and Reminder projections. [Worker tests](../../scripts/sw.test.mjs) cover cache privacy, storage failure, fallback, and old-cache cleanup.

Browser checks cover review edit/confirm/reject, income/transfer totals, month changes, bill approval/dismissal, chat failure recovery, field errors, focus/Escape, and unavailable routes. Narrow-layout evidence uses script-free actual rendered markup at measured 320px/390px because native resizing times out. It does not establish mobile interaction or real-phone installation. This document stays Draft until owner review and live integration evidence exist.
