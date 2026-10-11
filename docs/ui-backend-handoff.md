# UI backend handoff

Erdafa owns the UI. Zoe owns financial services/schema; Argya owns conversational tools; Abhip coordinates contracts and Reminders. This note accompanies the mobile-screen PR. It describes presentation needs, not an accepted database or transport contract.

## Current boundaries

The types in [demo-ledger.ts](../apps/web/src/data/demo-ledger.ts) are synthetic, browser-only models. Shared, validated request/response schemas belong in `packages/contracts`; business writes and verified ownership belong in the Next.js backend. The Agent calls those backend operations. No UI component writes directly to Supabase or holds provider credentials.

| UI model | Integration requirement |
| --- | --- |
| Transaction | UUID, expense/income/transfer, review status, nullable uncertain fields, source identity and confidence. Financial Accounts must be owned resource IDs, including transfer source/destination, rather than sample labels. |
| Money and dates | Demo uses positive safe whole IDR integers and exact `bigint` aggregates. Agree on a lossless JSON money representation before adapting SQL values; `bigint` is not JSON. Dates are canonical calendar values; the server must apply the User's timezone. |
| Review operations | List pending; edit without confirming; validate confirm once; retain rejection and permanently deduplicate its source. Confirmed-only totals exclude transfers. The existing shared review enum needs agreement about `rejected`. |
| Budget and summary | Selected-month totals, category usage, weekly/monthly periods, thresholds, and persisted limits. Safe spending uses total limits minus all confirmed expenses, clamps once at zero, and exposes shortfall. Return reproducible inputs for overall/per-category recommendations. |
| Recurring Bill | Proposal versus active status, merchant, expected amount, cadence, due date, and optional cancellation URL. Track/dismiss only through explicit User action; cancellation is guidance. |
| Reminder | Persist both budget threshold events and bill offsets, including rearming and once-per-trigger semantics. Current UI warnings are snapshots, not scheduler or dedupe evidence. Delivery, verified WhatsApp opt-in, quiet hours, limits and templates remain backend work. |
| Gmail Connection | Server-owned connection IDs, status, sync progress/results, reconnect/disconnect, and server-enforced three-mailbox limit. Google sign-in remains separate. |
| Chat | Authenticated messages/tool operations, safe action receipts, undo and explicit confirmations. An ambiguous network failure must not claim that a financial write did not happen. The current adapter always rejects without doing a write. |

## Decisions before connecting live data

1. Confirm money transport and the rejected state with Zoe/Abhip; reconcile the embedded ERD's IDs and entities with PRD v2.1 before generating database types.
2. Implement and test session/resource ownership before enabling sign-in/Gmail or financial controls.
3. Replace demo state through an adapter into validated shared contracts, preserving missing values and clear error states.
4. Confirm calculations, reminder delivery and tool permissions with their owners; do not use demo helpers as production authorization or scheduling.

Foundation checkpoint: 14 October. UI documentation: 16 October. Device/PWA verification: 18 October. The competition deadline is 20 October at 22:59 WIB; other owners' integrations and final submission evidence remain separate work.
