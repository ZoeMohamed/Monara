# UI actions · 16 October 2026

[Technical draft](tech/ui.md) · [Backend handoff](ui-backend-handoff.md) · [Design system](ui-design-system.md)

Sources read on 16 October: [PRD](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.pm2pb9a5y3zd), [Action Tracker](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg#heading=h.agrwhkwvp6ye), [Brainstorm](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.0). Tracker statuses below include the saved ER4/ER7/ER12 updates; all other owner rows remain unchanged. Shared tracker updates and current verification are recorded in the [integration report](ui-integration-2026-10-16.md); source delivery does not establish acceptance. The shared tracker now includes the dated integration/dependency note and a 16-Oct update date.

## Erdafa's checklist

| Action | Tracker | Delivered in this checkout | Remaining acceptance / dependency |
| --- | --- | --- | --- |
| ER1 · HeroUI | Done | Shared light theme and primitives | Preserve theme/control conventions. |
| ER2 · English | Done | English product copy | Include new provider/error states in final QA. |
| ER3 · Controls | Done | HeroUI form/action controls with branded CSS/SVG composition | Final interaction/accessibility sweep. |
| ER4 · Sign-in / Gmail | In review | Google entry, owned connections, sync queueing, bounded count refresh and cumulative history | ZO5 + AD1/AD2: live consent, disconnect and complete import acceptance; per-run completion/result contract is absent. |
| ER5 · Review | In review | Missing-field flags, pending edit/confirm/reject and refresh; account editing and deactivate/reactivate preserve history | ZO6: persisted imports, exact totals, isolation and inactive-account refusal; PR39 migration/52-assertion pgTAP suite remain unrun. |
| ER6 · Dashboard | In review | Confirmed-only month summary, attention, recent activity and drilldowns | ZO7/ZO9: reconcile live figures, dates and recommendations. |
| ER7 · Chat | In review | Agent bridge, dashboard insight read tool, action receipts, expiring confirmations and refresh after every verified live turn | AR1/AR4/AR5: accept integrated tool compatibility and receipt-based transaction/budget Undo with live records; complete model/provider scenarios. |
| ER8 · Budgets / bills | In review | Weekly/monthly budget CRUD, explicit suggestion acceptance and category daily guides; demo bill proposals | ZO8/ZO9 + AD6: live budget acceptance; bill list/confirm/delete operations remain Planned here. |
| ER9 · Settings / Reminders | In progress | Profile opens Notifications; owned Reminder reads/archive and verified-link UI with status polling, explicit number replacement, confirmed unlink and manual recovery | **AR6 blocker:** queued Agent work/outbox retries still run after unlink; relinking retains old-number history. Argya must fix revocation/session binding before provider acceptance. AB4: preferences/opt-in and scheduled delivery; personal editing remains demo-only. |
| ER10 · PWA / demo | In progress | Labelled demo, production public-cache/offline check, mobile navigation and layout verification | All UI: physical-phone install/keyboard/touch; due 18 Oct. |
| ER11 · Branding | Done | Monara logo, blue palette, landscape and mascot | Preserve existing visual language. |
| ER12 · UI documentation | In review | Concise source-linked technical draft and this dependency map | Erdafa review; Abhip assembly (AB8). Status remains Draft; due 16 Oct. |

## Teammate handoffs

| Owner | Tracker snapshot | What UI needs next |
| --- | --- | --- |
| Zoe | ZO1–ZO8 Done; ZO9–ZO11 In review | Accept owned budgets/accounts, totals, stale writes, RLS and dates; replay PR39 migration and the 52-assertion pgTAP suite when Docker is available. Complete data/security owner review. |
| Adlyn | AD1–AD4 Done; AD5 In review; AD6 In progress; AD7–AD9 Not started | Verify the Gmail queue/cron path with providers and rejected-source dedupe; agree per-run reporting; expose confirmed recurring-bill operations. Supply extraction evidence/documentation. |
| Argya | AR6 In review; other Agent rows report delivered work, with stale trailing “Not started” text | Fix WhatsApp unlink/relink revocation across queued turns, outbox retries and retained history; bind sessions to the current verified link and revalidate operations/sends. Then accept link operations and receipt-based Undo with live providers. Reminder reads exist; media depends on AD7. |
| Abhip | AB4/AB5/AB6 Not started; AB7/AB8 In progress | Supply Reminder engine/preferences, Sandbox evidence and submission assembly; resolve the 16-Oct cut-list checkpoint with owners. |

The current PRD/tracker assigns WhatsApp to **Argya**. Older Farrel ownership in the original architecture/repository notes is historical and should be reconciled by those document owners.

**Integration basis:** the UI targets `origin/main` at `cf4398f` on `feat/finance-guidance-recovery`. Account management, inactive-account SQL and worker routing are preserved alongside the link/Undo backend. Reminder preferences and recurring-bill operations remain unfinished.

Current merged-base gates passed **507 tests**, React Doctor **100** for web/shared UI, production/dry-run builds and the seven-screen mobile/offline sweep at 390px/320px. Demo account add/edit/deactivate/reactivate, preserved history/totals and focus also passed at both widths. Earlier isolated integration passed **505 tests**, React Doctor **100**, ten synthetic WhatsApp cases and a seven-screen production sweep at 390px/320px. The later offline revocation audit reproduced the F12 blocker with zero external requests. See the [integration report](ui-integration-2026-10-16.md) and [handoff evidence](ui-backend-handoff.md#verification-evidence).

## Scope and acceptance

Brainstorm themes retained: automatic email bookkeeping, category budgets, conversational entry and recurring bills. PRD decisions govern implementation: imported items await review; recommendations expose confirmed-data inputs; WhatsApp is the second channel. WeChat, wealth tracking and account balances are cut. The brainstorming asset ideas do not add scope.

The PRD's cut order is F14 → WhatsApp delivery in F13 → budget suggestions in F9 → F8. Applying a cut still requires the team's checkpoint decision. Preserve existing working source while owners resolve integration gaps. Current verification and untested boundaries are recorded in the [handoff evidence](ui-backend-handoff.md#verification-evidence); source completion alone does not establish deployed acceptance.
