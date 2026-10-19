# Agent design

Owner: Argya. Features: F10, F11, F12, F14. Status: Draft.

## Purpose

One Agent interprets requests, calls finance tools and returns receipts through in-app chat (F11) and a verified WhatsApp Link (F12). It supports transaction review, Budgets, summaries and receipt photos (F14), with permission controls for F10. This section describes parent #85 at `e74524752c538ca8866295c91bdc456e17842eb3`; owner review and integrated provider acceptance remain outstanding.

## How it works

**Identity and the shared loop.** The [web Chat bridge](../../apps/web/src/app/api/chat/route.ts) checks origin and the Supabase session, then adds the verified User id and a server-only credential. WhatsApp verifies Kapso's HMAC and resolves the sender through the backend before queuing linked messages. Both call `runAgent` in [conversation/agent.ts](../../apps/agent/src/conversation/agent.ts). It validates tool arguments, sends results back to the model and stops after eight model steps. A step can contain several tool calls; this is not an eight-operation limit.

The [registry](../../apps/agent/src/conversation/tools.ts) and [backend allowlist](../../apps/web/src/lib/finance/service.ts) enforce different boundaries:

| Tier | Registered tools and behavior |
| --- | --- |
| T0 | Summaries, dashboard insights, Budget suggestions, five list tools and two forecast tools run immediately. Forecast refresh persists derived predictions and may call a model; it does not mutate the ledger. |
| T1 | Add/edit transactions, confirm/exclude pending records, create/edit Budgets and Undo run immediately and return supported action receipts. |
| T2 | Transaction/Budget delete tools request a confirmation; they cannot execute deletion directly. |
| T3 | Connection management, export, credentials and permanent User deletion have no chat tool. |

**Writes and user control.** The backend validates inputs, owned references and record versions. Clearly stated chat transactions are confirmed immediately; uncertain required inputs must be clarified. Supported transaction/Budget writes return durable action receipts. [finance.ts](../../packages/core/src/finance.ts) permits one Undo within ten minutes, using the version produced by the original change so a later edit causes a conflict. Totals in `get_summary` use integer `BigInt` arithmetic, exclude pending/exclusion records, and fail rather than truncate after twenty pages of 100 records per month.

A destructive request stores the exact action, owned resource/version and a five-minute expiry. Only the next message matching `yes`, optionally followed by `.` or `!`, confirms. `runAgent` handles it outside the model; the backend rechecks ownership, expiry, prior consumption and resource version. Direct Agent delete endpoints are denied. Permanent User deletion follows the separate [web-only ADR](../adr/0004-permanent-user-deletion.md), with no chat confirmation or Undo.

**Conversation state.** Web history comes from the client and is saved after a verified reply; the save can fail independently of a completed action. The [WhatsApp session](../../apps/agent/src/whatsapp/session.ts) serializes turns per User, retains up to forty turns and expires after thirty minutes idle. Seen-message keys suppress redelivery during that session. A crashed Agent turn is not replayed; reply sending alone is retried. This limits duplicate writes but can lose a turn or repeat a reply after an uncertain provider acknowledgement. It is not durable text-turn idempotency after session expiry.

**Photos and remaining capabilities.** [receipt.ts](../../apps/agent/src/whatsapp/receipt.ts) reads JPG/PNG/WebP through the vision model and sends `add_receipt_transaction` to the backend. It saves one pending record keyed by the WhatsApp message id; unreadable totals and non-receipts save nothing. Account selection requires one active match, and Categories must match the extracted type. Photo bytes are not persisted by Monara, although queued metadata contains a Kapso media link. Missing or rejected receipt dates currently fall back to today's Jakarta date: this conflicts with the no-invented-dates rule and needs product correction before acceptance.

Voice ingestion is Planned in open [#74](https://github.com/ZoeMohamed/Monara/pull/74) and [#78](https://github.com/ZoeMohamed/Monara/pull/78); this tree replies that voice is unavailable. Bill tools, bulk edits and Reminder preference changes are absent. Budget-alert delivery is described in [Reminders](reminders.md); live sending is deferred. The [forecast extension](forecast.md) adds owned read/refresh operations, without establishing complete PRD scenario coverage.

## Key decisions

- One shared loop avoids separate Channel policies; [ADR 0001](../adr/0001-initial-runtime-boundaries.md) keeps database writes in the Next.js backend instead of granting the Worker database access.
- Schema validation and a backend allowlist constrain actions instead of relying on prompt instructions. T2 execution requires a specific User reply outside the model.
- Receipts identify exact changes instead of replaying a whole conversation. Uncertain turns ask the User to check records before retrying.

## Security and risks

Tool inputs cannot choose identity. The backend credential authenticates the Worker, while owned-resource checks authorize each operation. Activity checks before model/tool calls and sends stop accepted User deletions. They do not prove queued WhatsApp turns/history are revoked across unlink and relink; that acceptance remains open.

Quoted content is untrusted, but prompt rules alone cannot prevent misuse of available T1 tools. Tool errors hide provider bodies; successful contract results still disclose the needed records to the model provider. Full per-tool/failure auditing remains Planned. Writes, receipt logging and confirmation consumption use separate repository calls, so crash recovery is not atomic. Durable web turn status/idempotency is absent; history persistence does not prove a financial action completed.

## How to verify

Run `pnpm --filter @monara/agent test`, `pnpm --filter @monara/core test` and `pnpm --filter @monara/integrations test`. Inspect the scripted loop/confirmation tests, WhatsApp session/receipt tests and owned finance tests for expired/reused receipts, stale versions, duplicate messages, unsupported tools and cross-User rejection.

[Evaluation](evaluation.md) holds historical model runs against synthetic in-memory ledgers; they are not current-tree backend or linked-Channel acceptance. Open [#65](https://github.com/ZoeMohamed/Monara/pull/65) was compared for overlap; its owner review applies to its own snapshot and was not transferred here. Before live acceptance, exercise signed-in Chat and a verified link against owned disposable records, including uncertain writes, reloads, deletion fences and unlink/relink. No live send or paid-model rerun is part of this documentation task.
