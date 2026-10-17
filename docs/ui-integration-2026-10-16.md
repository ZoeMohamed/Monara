# UI integration · 16 October 2026

[Actions and owners](ui-actions-2026-10-16.md) · [Backend handoff](ui-backend-handoff.md) · [UI technical draft](tech/ui.md)

**UI integration prepared for review.** Branch `feat/finance-guidance-recovery` starts from `origin/main` at `cf4398fab1eedb1e4cb17d4fd99bfdad99a43557`, including the teammate account, inactive-account and worker-route changes. The UI continuation is reconciled with that source. Current implementation, local verification and remaining acceptance are recorded below.

## Delivered and reconciled

- **ER3/ER5:** HeroUI account fields retain [PR38](https://github.com/ZoeMohamed/Monara/pull/38)'s account editing and deactivate/reactivate flows. History remains linked. [PR39](https://github.com/ZoeMohamed/Monara/pull/39)'s inactive-account migration and SQL tests are preserved.
- **ER4:** Gmail queue acknowledgement, cumulative import history, bounded progress reads and explicit recovery.
- **ER6/ER8:** exact category daily guides and budget proposals accepted into a draft before Save.
- **ER7:** validated Agent dashboard reads and reconciliation after every verified live reply, including receipt-free Undo. Failed refresh preserves the reply and blocks further changes until recovery.
- **ER9:** [PR34](https://github.com/ZoeMohamed/Monara/pull/34)'s owned WhatsApp link operations use refined mobile controls, explicit number replacement/unlink and recovery. Codes stay in memory. The queue revocation blocker below remains open.
- **ER10/ER12:** mobile/offline verification, shorter copy and source-linked Draft documentation. [PR37](https://github.com/ZoeMohamed/Monara/pull/37)'s worker production route is preserved.

## Verification on the current branch

| Check | Result |
| --- | --- |
| Node 24.21.0 · `pnpm check` | **507 tests**; lint, typecheck, dependency/docs checks and five SQL files statically validated |
| React Doctor | Web **100**; shared UI **100**; no findings |
| `pnpm build` | Next.js production build and Wrangler dry-run passed |
| Mobile production | Seven screens at **390 × 844** and **320 × 844**; no horizontal overflow or uncaught runtime errors |
| Navigation / offline | Month selection, Profile → Notifications/Escape and Home → Chat passed; worker v7 cached nine public assets and showed generic offline recovery |
| Account regression | Add, rename, type/institution edit, duplicate-name draft recovery, deactivation cancellation/confirmation and reactivation passed at both widths; history/totals and focus preserved; zero API requests |

The earlier isolated integration passed ten synthetic WhatsApp UI/client cases covering expiry, stale responses, uncertain mutations, session recovery and confirmed unlink. Those cases establish client behavior, not queue revocation or configured-provider acceptance. The reproducible repository gates are `pnpm check` and `pnpm build`; the mobile checks above were run against the production build at the stated viewport sizes.

## Confirmed cross-owner blocker

The [offline F12 diagnostic](evidence/whatsapp-unlink-audit.mjs) reproduces three unsafe outcomes in current source: a queued turn still runs/sends after unlink; a failed outbox send is retried after unlink; a new linked number inherits two old-number history turns. It uses synthetic repositories/transports and zero external requests. Its successful execution means the defect was reproduced, not that unlink acceptance passed.

Argya owns binding queued work, history, backend operations and outbound attempts to a current verified link generation. The [handoff](ui-backend-handoff.md#whatsapp-acceptance-blocker) records the source and required boundary. This remains open for AR6/ER9.

## Shared Action Tracker

ER4, ER7 and ER12 were changed from **In progress → In review**, with saved values verified through fresh exports of the shared tracker tab. A 137-word dated integration/dependency note was added after the daily-update paragraph, with PRD and merged-PR links; Last updated is now 16 Oct. Independent comparison of the saved export proved that only those three statuses, the date and this note changed. Other owners' statuses are preserved. Technical documentation remains **Draft** pending owner review.

## Remaining acceptance and sources

Zoe: persisted totals/budget periods, stale writes and User isolation; the inactive-account migration and 52-assertion pgTAP suite were not replayed because Docker is unavailable. Adlyn: configured Gmail imports/deduplication, per-run reporting and persistent recurring bills. Argya: F12 blocker, provider verification and Agent/model scenarios. Abhip: Reminder preferences/opt-in, bill triggers, quiet hours, caps, delivery and Sandbox evidence. Real-phone installation/keyboard and owner review remain open.

Context was refreshed from the [PRD](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.pm2pb9a5y3zd), [Action Tracker](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg#heading=h.agrwhkwvp6ye) and [Brainstorm](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.0). The PRD governs scope; brainstorm asset/WeChat ideas do not add features.
