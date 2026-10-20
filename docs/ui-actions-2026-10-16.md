# UI actions · 16 October 2026

[Technical draft](tech/ui.md) · [Backend handoff](ui-backend-handoff.md) · [Design system](ui-design-system.md)

The scoped public [PRD](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.pm2pb9a5y3zd) and [Action Tracker](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg) were reread on **19 October**: PRD version 2.1 still has F1–F16, and the tracker still says Last updated: 16 Oct. The earlier [Brainstorm](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.0) remains historical context. Rows below retain the owners' recorded statuses while describing main `8778e3f` plus the local recovery integration. The external tracker was not edited. Source delivery, local verification, provider acceptance and deployment are separate milestones; see the [current handoff](ui-backend-handoff.md).

## Erdafa's checklist

| Action | Tracker | Delivered in this checkout | Remaining acceptance / dependency |
| --- | --- | --- | --- |
| ER1 · HeroUI | Done | Shared light theme and primitives | Preserve theme/control conventions. |
| ER2 · English | Done | English product copy | Include new provider/error states in final QA. |
| ER3 · Controls | Done | HeroUI form/action controls with branded CSS/SVG composition | Final interaction/accessibility sweep. |
| ER4 · Sign-in / Gmail | In review | Separate Google/Gmail consent, first-run sheets, deterministic bank discovery, server import progress and automatic status; no manual sync button | ZO5 + AD1/AD2: configured consent, reconnect/disconnect, thirty-day import and duplicate-safe retries with real inboxes. |
| ER5 · Review | In review | One compact History list and To review filter; muted exclusions, hidden confidence/review tags, actual-date validation and receipt-authorized Undo | ZO6: refreshed local date/confirmation/Undo/totals checks passed; configured-provider and owner acceptance remain separate. Remote migrations remain unapplied here. |
| ER6 · Dashboard | In review | Clean confirmed-only Overview, attention and drilldowns; weekly/monthly gauges belong in Budgets | ZO7/ZO9: reconcile live figures; keep PR63 forecast details/confidence out of Overview until aligned with meeting decisions. |
| ER7 · Chat | In review | Main's private server conversations, explicit save status, signed save-only retry, closed historical confirmations and memory-only drafts/media | AR1/AR4/AR5: configured model/tool scenarios and lost-reply recovery; save retry must never replay a financial Agent action. Web receipt/generated visuals remain disconnected. |
| ER8 · Budgets / bills | In review | Responsive Weekly/Monthly groups keep gauges and categories together, with direct Add and no period tabs/Edit mode; Goals uses keyboard-accessible Planning tabs and progress-first cards; retained draft/request UUID, conflict review, uncertain-save recovery and explicit suggestion acceptance; demo bill proposals | ZO8/ZO9 + AD6: local one-page gauges/cadence and goal recovery passed; owner/provider acceptance remains; PR77 is only an uncalled recurring detector, and live bill list/confirm/delete remains Planned. |
| ER9 · Settings / Reminders | In progress | Owned Reminder reads/archive, verified-link UI and main's implemented WhatsApp budget-alert dispatcher | AR6 + AB4: accept current-link revocation, consent/preferences, quiet hours, daily cap, approved templates and provider delivery. The earlier unlink audit is historical; personal reminder editing remains demo-only. |
| ER10 · PWA / demo | In progress | Labelled demo, public-only offline fallback and mobile navigation; refreshed 390 × 844 core recovery passed | All UI: physical-phone install/keyboard/touch; tracker due 18 Oct. |
| ER11 · Branding | Done | Monara logo, blue palette, landscape and mascot | Preserve existing visual language. |
| ER12 · UI documentation | In review | Concise source-linked technical draft and this dependency map | Erdafa review; Abhip assembly (AB8). Status remains Draft; due 16 Oct. |

## Teammate handoffs

| Owner | Tracker snapshot | What UI needs next |
| --- | --- | --- |
| Zoe | ZO1–ZO8 Done; ZO9–ZO11 In review | Accept integrated schema/RLS, budgets, totals, dates, request-ID retries and atomic Undo. Complete data/security owner review. |
| Adlyn | AD1–AD5 Done; AD6/AD9 In progress; AD7/AD8 Not started | Accept main's typed Gmail/evidence, bounded queues and backoff with providers. PR74/78 cover voice/transcription, PR75 prompt hardening, PR77 uncalled bill detection and PR73 extraction docs. Preserve unknown source dates and ownership checks; live acceptance remains separate. |
| Argya | AR6 In review; other Agent rows mix delivered work with stale trailing “Not started” text | Accept server chat history/save-only recovery and verified-link revocation with current source. WhatsApp photos are implemented; configured media/model execution is still unverified here. |
| Abhip | AB4/AB5/AB6 Not started; AB7/AB8 In progress | Reconcile stale Reminder/Sandbox statuses with merged source and evidence. Own PR61 documentation/PDFs and PR63 forecasts; finish review and submission assembly without duplicating those implementations here. |

The current PRD/tracker assigns WhatsApp to **Argya**. Older Farrel ownership in the original architecture/repository notes is historical and should be reconciled by those document owners.

**Current integration basis, 19 October:** main `c8bdfb4` retains documentation/local setup (PR66), permanent deletion (PR67/PR71), Goals/intelligence (PR68/PR70), typed Gmail classification and its inactive-identity backfill correction (PR76/PR79), mascot/mobile navigation (PR80), and Worker deployment CI (PR81). This integration preserves the 31 typed defaults, unknown pending hints and main's structured classification evidence. Redundant preset metadata, fuzzy Internal matching and unpublished Gmail lease machinery were removed. Compact review, Budgets-only gauges shown together without period tabs, retained/refined Goals, source-backed dates, atomic Undo, save-only chat retry and goal/deletion recovery remain. The database checkpoint passed 27 migrations and 397 assertions across 15 files, with actual Storage/Next image-route checks. PR82 follow-up passed 984 tests, Doctor 100/100, a production web build, and mobile/desktop acceptance. Details are recorded in the [current handoff](ui-backend-handoff.md#current-integration-verification); older source counts are historical.

Open PR context was reread on 19 October:

| PR / owner work | Coordination and acceptance boundary |
| --- | --- |
| [PR61](https://github.com/ZoeMohamed/Monara/pull/61) · submission PDFs | Validate unfinished sections before writing Final-labelled outputs. Owner assembly/review is separate from normal docs checks. |
| [PR63](https://github.com/ZoeMohamed/Monara/pull/63) · forecast, `ef273427` | Conflicts with main and introduces confidence, a detailed Home chart/card and forecast rows/filter. Align with clean Overview, hidden confidence and readable compact History before adoption. Its cited F17 is absent from the scoped PRD. |
| [PR65](https://github.com/ZoeMohamed/Monara/pull/65) · Agent review, `60847c89` | Owner source review; actual receipt-media and budget-message delivery remain separate acceptance. Do not replace those limits with this integration's synthetic results. |
| [PR73](https://github.com/ZoeMohamed/Monara/pull/73) · extraction docs, `6cfe489e` | Describes voice and depends on PR74. Match final source-date rules and link measured extraction evidence before final submission. |
| [PR74](https://github.com/ZoeMohamed/Monara/pull/74) · voice, `82fdbbe9` | Adds pending-only voice input; preserve unknown source dates. Direct audio/model format acceptance is separate. |
| [PR75](https://github.com/ZoeMohamed/Monara/pull/75) · prompt hardening, `986f487d` | Overlaps extractor/receipt prompt files. Preserve structured evidence, deterministic guards and the current source-date behavior when integrating. Prompt-text tests are not an end-to-end hostile-email evaluation. |
| [PR77](https://github.com/ZoeMohamed/Monara/pull/77) · recurring proposals, `6bb81bec` | Pure uncalled detector; monthly-date drift/stale patterns, model check and live confirmation remain owner work. Do not present demo bills as persisted records. |
| [PR78](https://github.com/ZoeMohamed/Monara/pull/78) · transcription, `891fa1d4` | Stacked on PR74, not main. Uses Azure transcription and different voice parsing; real OGG/Opus, configured Worker and database acceptance remain separate. Its new secrets stay server-side. |

Keep teammate features and authoritative typed-category rules when resolving overlap. The scoped PRD still lists savings goals as later/cut despite merged source. The tracker calls 18 October feature freeze and 19 October code freeze; owners reconcile scope and status. No external document, PR comment, provider setting or cloud resource was changed here.

Local context was checked without printing values: the preserved web environment has 14 key names and five configured values, with only the public Supabase URL/publishable-key names exposed to the browser and no unexpected public secret names. OrbStack/Docker is running; the original database stack remains preserved and a separate disposable Auth/REST/Storage/database stack supports synthetic acceptance. The latest disk check showed about 3.8 GiB free after reclaiming only unused Docker image cache; original and active volumes remain preserved. These configuration/infrastructure observations do not establish live Gmail, model, WhatsApp or deployment acceptance.

**Historical 16 October evidence:** the then-merged base passed **507 tests**, React Doctor **100** for web/shared UI, production/dry-run builds and the seven-screen mobile/offline sweep at 390px/320px. Demo account add/edit/deactivate/reactivate, preserved history/totals and focus also passed at both widths. Earlier isolated integration passed **505 tests**, React Doctor **100**, ten synthetic WhatsApp cases and a seven-screen production sweep. The later offline revocation audit reproduced an F12 blocker on that source with zero external requests. See the [historical integration report](ui-integration-2026-10-16.md) and [handoff evidence](ui-backend-handoff.md#historical-verification-evidence); these results do not establish current acceptance.

## Scope and acceptance

Brainstorm themes retained: automatic email bookkeeping, category budgets, conversational entry and recurring bills. Meeting decisions supersede the older transfer/manual-sync UI. Imports await review except authenticated, complete and confident Gmail records that satisfy backend auto-confirmation rules. Recommendations expose confirmed-data inputs; WhatsApp is the second channel. WeChat, wealth tracking and account balances are cut. The brainstorming asset ideas do not add scope.

The PRD's cut order is F14 → WhatsApp delivery in F13 → budget suggestions in F9 → F8. Applying a cut still requires the team's checkpoint decision. Preserve existing working source while owners resolve integration gaps. Current verification and untested boundaries are recorded in the [handoff evidence](ui-backend-handoff.md#current-integration-verification); source completion alone does not establish deployed acceptance.
