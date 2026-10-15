# Cloudflare agent

One TypeScript worker hosts the shared agent runtime. The Agent core lives in `src/conversation` and Kapso message handling in `src/whatsapp`. `src/gmail` and `src/budgeting` retain integration boundaries; automatic Gmail processing is not implemented.

Run `pnpm dev:agent` from the root. `pnpm --filter @monara/agent build` creates a local dry-run bundle without deployment, and `pnpm --filter @monara/agent test` runs the Agent tests.

## Endpoints

| Route | State |
| --- | --- |
| `GET /health` | Returns `status: scaffold` until the runtime is ready for production. |
| `POST /chat` | In-app chat. The web backend sends `{ userId, text, history }` (see `agentChatRequestSchema`) with `Authorization: Bearer <MONARA_AGENT_BACKEND_SECRET>` and gets `{ reply, actions, confirmation }`. |
| `POST /webhooks/kapso` | Kapso `whatsapp.message.received` webhook. Verifies the signature, asks the backend who each sender is, and queues a linked User's text for the Agent. Everyone else gets a fixed reply and no data. |
| Anything else | 501. |

Each handler returns 503 when a secret or binding it needs is missing.

## Agent core

`src/conversation/agent.ts` is the tool loop every Channel shares, built once in `src/conversation/respond.ts`. Agent Tools are registered with a Permission Tier (`src/conversation/tools.ts`). A tool receives the User and Channel from the verified caller, never from the model. The table describes the registered catalog; backend support is listed below.

| Tier | Tools | Behaviour |
| --- | --- | --- |
| T0 | `get_summary`, `suggest_budget`, `list_transactions`, `list_financial_accounts`, `list_categories`, `list_budgets`, `list_recurring_bills`, `list_reminders` | Run freely. |
| T1 | `add_transaction`, `edit_transaction`, `confirm_pending`, `reject_pending`, `create_budget`, `edit_budget`, `set_reminder_preferences`, `undo_action` | Run supported operations and return receipts; durable live Undo is unavailable. |
| T2 | `delete_transaction`, `delete_budget`, `delete_bill` | Never run. Calling one asks the backend for a confirmation. |
| T3 | none | Connections, WhatsApp linking, export, and credentials are not Agent Tools. |

Three rules are enforced in code, not by the prompt:

- **Totals.** `get_summary` adds amounts up in exact integer rupiah across every page. The model is told never to do arithmetic on amounts, because it gets sums wrong.
- **Writes.** `add_transaction` takes only what the User said, leaves the rest null, and checks the result against `createTransactionInputSchema` before anything is sent. The tools mint `clientRequestId` themselves.
- **Deletes.** A T2 tool has no code to run. The action is carried out only when the User's next message is `yes` (case-insensitive, with optional final `.` or `!`), by `runAgent` and without the model. Anything else leaves it undone. Only one action can wait at a time.

`confirm_recurring_bill` and `bulk_edit` are in the PRD but have no usable contract yet, so they are not offered.

## Conversation history

The Agent keeps no conversation for in-app chat. The caller sends the earlier turns in `history` on every request and stores the `actions` and `confirmation` returned with each reply on that Agent turn. The receipts are how a later "undo" or "no, 38k" finds the change it refers to, and the confirmation is what a following "yes" answers. History comes from the caller, so the backend must check every undo and confirmation itself.

## WhatsApp

A sender's number is only a claim. For each inbound message the webhook calls `POST {MONARA_BACKEND_URL}/api/agent/whatsapp/resolve-sender` with the number and, when the whole message is a six-digit code, that code (`resolveWhatsAppSenderInputSchema`). The expected contract answers `linked`, `verified`, `code_rejected`, or `unlinked`. That backend route and verified-link initiation are not implemented yet; current handler code does not establish an operational WhatsApp channel. The rules for codes live in `packages/core/src/whatsapp-link.ts`.

A linked User's text goes to their `WhatsAppConversation` Durable Object (`src/whatsapp/conversation.ts`, logic in `session.ts`), and the webhook answers Kapso straight away. The object answers messages one at a time, keeps recent turns so follow-up questions work, and deletes them after 30 minutes of silence. Within the Durable Object, a processed message does not replay the Agent turn; only sending the reply is retried. Live transport/idempotency acceptance remains outstanding.

Photos and voice notes get a fixed reply until extraction (F14) can take them. `WhatsAppTransport.fetchMedia` is ready for that handoff, and `sendTemplate` is ready for Reminders.

## Backend operations

The Agent reads and changes records only through the Next.js backend (`src/conversation/backend.ts`). For each tool it sends `POST {MONARA_BACKEND_URL}/api/agent/operations/{name}` with `Authorization: Bearer <MONARA_AGENT_BACKEND_SECRET>` and the body `{ userId, channel, input }`, where `channel` is `web` or `whatsapp`.

| Operation | Input | Result |
| --- | --- | --- |
| A tool name from T0 or T1 | The tool's contract input | The contract's page or mutation result. The result of `undo_action` is ignored. |
| `request_destructive_action` | `{ action, input }` (`requestDestructiveActionInputSchema`) | `destructiveActionConfirmationSchema`. Nothing is deleted. |
| `confirm_destructive_action` | `confirmDestructiveActionInputSchema` | Ignored. The backend checks the confirmation is this User's, unused, and not expired. |

`apps/web/src/app/api/agent/operations/[operation]/route.ts` implements the authenticated operation boundary, and `apps/web/src/app/api/chat/route.ts` implements the web-session bridge. `apps/web/src/lib/finance/service.ts` is the authoritative allowlist. Transaction/account/category/budget reads and supported transaction/review/budget writes exist; `get_summary` computes totals from transaction reads. Transaction/budget deletion requires a bound, expiring confirmation. Stored action receipts do not execute reversal.

The worker still advertises `suggest_budget`, `list_recurring_bills`, `list_reminders`, `set_reminder_preferences`, `undo_action` and `delete_bill`, which the Agent backend does not support. New list/read/dismiss notification operations are web-only. Unsupported operations fail explicitly. Reconcile this catalog before claiming every scenario works against the live backend.

## Still to do

Implement sender-resolution/verified linking, missing Agent operations, durable Undo and client-turn status/idempotency. Accept owned reads/writes and destructive confirmation against a disposable local Supabase stack before configured-provider testing.

Implement automatic Gmail processing with durable background jobs and manual sync. Provision queues or other durable resources only with deployment authorization. Do not substitute fire-and-forget promises for durable processing. No queue bindings, schedules, or Gmail webhooks are configured yet.

The `CONVERSATIONS` Durable Object binding in `wrangler.jsonc` is created on the first deployment. It has only run locally.

Do not import packages/db or construct privileged Supabase clients here. A backend credential authenticates the runtime, but does not replace per-User authorization.
