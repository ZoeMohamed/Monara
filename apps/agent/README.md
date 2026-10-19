# Cloudflare agent

One TypeScript worker hosts the shared agent runtime. The Agent core lives in `src/conversation`, Kapso message handling in `src/whatsapp`, and automatic Gmail processing in `src/gmail`. `src/budgeting` retains its integration boundary.

Run `pnpm dev:agent` from the root. `pnpm --filter @monara/agent build` creates a local dry-run bundle without deployment, and `pnpm --filter @monara/agent test` runs the Agent and Gmail tests with synthetic data.

## Endpoints

| Route | State |
| --- | --- |
| `GET /health` | Returns a minimal live-service response. |
| `POST /chat` | In-app chat. The web backend sends `{ userId, text, history }` (see `agentChatRequestSchema`) with `Authorization: Bearer <MONARA_AGENT_BACKEND_SECRET>` and gets `{ reply, actions, confirmation }`. |
| `POST /forecast/refine` | Spending forecast (F17). Only the web backend may call it, with the shared secret. It receives rule-found candidates and returns a confidence and reason for each; it cannot add an item or an amount. |
| `POST /webhooks/kapso` | Kapso `whatsapp.message.received` webhook. Verifies the signature, asks the backend who each sender is, and queues a linked User's text for the Agent. Everyone else gets a fixed reply and no data. |
| `POST /gmail/sync` | Manual Gmail sync. The web backend sends `{ connectionId, since }` with the same Bearer secret, only after checking that the signed-in User owns the connection. Queues a sync job and returns 202. |
| `POST /gmail/discover` | Account discovery after a Gmail connection. The web backend sends `{ connectionId }` with the same Bearer secret after checking ownership. Queues a discovery job and returns 202. |
| Anything else | 404. |

Each handler returns 503 when a secret or binding it needs is missing.

## Agent core

`src/conversation/agent.ts` is the tool loop every Channel shares, built once in `src/conversation/respond.ts`. Agent Tools are registered with a Permission Tier (`src/conversation/tools.ts`). A tool receives the User and Channel from the verified caller, never from the model. The table describes the registered catalog; backend support is listed below.

| Tier | Tools | Behaviour |
| --- | --- | --- |
| T0 | `get_summary`, `suggest_budget`, `list_transactions`, `list_financial_accounts`, `list_categories`, `list_budgets`, `list_reminders` | Run freely. |
| T1 | `add_transaction`, `edit_transaction`, `confirm_pending`, `exclude_pending`, `create_budget`, `edit_budget`, `undo_action` | Run and return receipts. `undo_action` reverses a transaction or Budget change within ten minutes. |
| T2 | `delete_transaction`, `delete_budget` | Never run. Calling one asks the backend for a confirmation. |
| T3 | none | Connections, WhatsApp linking, export, and credentials are not Agent Tools. |

Three rules are enforced in code, not by the prompt:

- **Totals.** `get_summary` adds amounts up in exact integer rupiah across every page. The model is told never to do arithmetic on amounts, because it gets sums wrong.
- **Writes.** `add_transaction` takes only what the User said, leaves the rest null, and checks the result against `createTransactionInputSchema` before anything is sent. The tools mint `clientRequestId` themselves.
- **Deletes.** A T2 tool has no code to run. The action is carried out only when the User's next message is `yes` (case-insensitive, with optional final `.` or `!`), by `runAgent` and without the model. Anything else leaves it undone. Only one action can wait at a time.

`confirm_recurring_bill` and `bulk_edit` are in the PRD but have no usable contract yet, so they are not offered.

## Conversation history

The Agent keeps no conversation for in-app chat. The caller sends the earlier turns in `history` on every request and stores the `actions` and `confirmation` returned with each reply on that Agent turn. The receipts are how a later "undo" or "no, 38k" finds the change it refers to, and the confirmation is what a following "yes" answers. History comes from the caller, so the backend must check every undo and confirmation itself.

## WhatsApp

A sender's number is only a claim. For each inbound message the webhook calls `POST {MONARA_BACKEND_URL}/api/agent/whatsapp/resolve-sender` with the number and, when the whole message is a six-digit code, that code (`resolveWhatsAppSenderInputSchema`). It answers `linked`, `verified`, `code_rejected`, or `unlinked`. A User starts linking in Settings, which shows the code to send. The route is in `apps/web/src/app/api/agent/whatsapp/resolve-sender`, the service in `packages/core/src/whatsapp-links.ts`, and the rules for codes in `packages/core/src/whatsapp-link.ts`.

A linked User's text goes to their `WhatsAppConversation` Durable Object (`src/whatsapp/conversation.ts`, logic in `session.ts`), and the webhook answers Kapso straight away. The object answers messages one at a time, keeps recent turns so follow-up questions work, and deletes them after 30 minutes of silence. Within the Durable Object, a processed message does not replay the Agent turn; only sending the reply is retried. Live transport/idempotency acceptance remains outstanding.

A receipt photo from a linked User is read in its conversation (`src/whatsapp/receipt.ts`) and saved as a pending transaction through `add_receipt_transaction`; see `docs/tech/agent.md`. Voice notes get a fixed reply. Budget alerts are sent by the backend with `sendTemplate`; the reminder cron only asks it to send alerts held back by quiet hours.

## Backend operations

The Agent reads and changes records only through the Next.js backend (`src/conversation/backend.ts`). For each tool it sends `POST {MONARA_BACKEND_URL}/api/agent/operations/{name}` with `Authorization: Bearer <MONARA_AGENT_BACKEND_SECRET>` and the body `{ userId, channel, input }`, where `channel` is `web` or `whatsapp`.

| Operation | Input | Result |
| --- | --- | --- |
| A tool name from T0 or T1 | The tool's contract input | The contract's page or mutation result. The result of `undo_action` is ignored. |
| `request_destructive_action` | `{ action, input }` (`requestDestructiveActionInputSchema`) | `destructiveActionConfirmationSchema`. Nothing is deleted. |
| `confirm_destructive_action` | `confirmDestructiveActionInputSchema` | Ignored. The backend checks the confirmation is this User's, unused, and not expired. |

`apps/web/src/app/api/agent/operations/[operation]/route.ts` implements the authenticated operation boundary, and `apps/web/src/app/api/chat/route.ts` implements the web-session bridge. `apps/web/src/lib/finance/service.ts` is the authoritative allowlist. Transaction/account/category/budget reads, read-only three-month Budget suggestions and supported transaction/review/budget writes exist; `get_summary` computes totals from transaction reads. Transaction/budget deletion requires a bound, expiring confirmation. `undo_action` reverses a transaction or Budget change from its receipt within ten minutes.

Recurring bills and Reminder preferences have no backend operations yet, so the worker does not offer them. Mark-read and dismiss for notifications stay web-only.

## Gmail ingestion

Gmail sync reads only mail from the banks, cards, and wallets the User has as Financial Accounts. The sender list is `packages/contracts/src/institutions/institution-senders.json`; an account names its entry in `institutionKey`.

After a User connects Gmail, the web backend calls `POST /gmail/discover`. A discovery job lists 90 days of metadata (sender, subject, date) from every registry sender, without reading bodies or calling the model, and records which entries emailed the mailbox and which card endings their subjects show. The Gmail page suggests adding or linking accounts from these findings.

A forecast cron runs Mondays at 02:00 UTC (09:00 Jakarta) and calls `/api/agent/forecast/refresh` so the backend refreshes spending forecasts that are due. A reminder cron runs every 15 minutes and calls `/api/agent/reminders/dispatch` so the backend sends WhatsApp budget alerts held back by quiet hours. A separate Gmail cron runs daily at 01:00 UTC. For each active Gmail Connection it queues a `gmail.discover` job, which asks the web backend to look for new banks and wallets, and, when accounts read from that mailbox, a catch-up sync job on the `monara-gmail-jobs` queue. A sync job lists one page of mail from the exact senders of the mailbox's accounts (`from:(…)`) and queues parse jobs of up to five messages. Smaller batches leave room for live-User checks before provider calls; larger jobs from an older release are split before processing. Busy models yield to durable queue retries. If there are more pages, it queues a follow-up sync job. A first import covers the last 30 days; a catch-up starts a day before the last finished import, so an import that failed or never finished runs again. Mail recorded as failed is not retried. A mailbox with no accounts has nothing to sync.

An extraction job (`src/gmail/pipeline.ts`):

1. Resolves the connection through the backend.
2. Claims the message so it is processed only once.
3. Reads the message through Composio and skips it unless its From address is a sender of one of the User's accounts.
4. Checks Gmail's own `Authentication-Results` header for DKIM or SPF passing for the sender's domain (`src/gmail/sender.ts`).
5. Extracts transactions with one LLM call (`src/gmail/parse/extract.ts`).
6. Records them through the backend with the sender's institution and verification. The backend maps the account from the institution (by card ending when the User has several), takes the Category from the User's history for that merchant, and auto-confirms only verified, confident, complete items.
7. Queues a categorization job for each transaction still without a Category.

Categorization (`src/merchant/pipeline.ts`) runs on its own `monara-merchant-jobs` queue, throttled for web search. It checks the shared `merchant_profiles` cache, searches Brave (`BRAVE_SEARCH_API_KEY`) with the merchant name only when the cache has nothing, and lets the model choose one of the User's Categories from the result. The backend writes it only while the transaction has no Category and the User has not edited it, and checks budgets for confirmed transactions.

The extractor treats email content, and categorization treats search results, as untrusted. Amounts must appear in the email exactly as written, non-Rupiah amounts are never converted, and anything the email does not state stays empty.

The worker never writes to Supabase. It calls `POST {MONARA_BACKEND_URL}/api/agent/gmail/{name}` with the Bearer secret, kept apart from the per-User `/api/agent/operations/` above because these run with no User or Channel. The operations and their schemas are in `packages/core/src/gmail-ingestion.ts` and `packages/contracts/src/gmail-extraction.ts`.

When a Composio read fails with a client error other than 429, the worker asks Composio for the connected account's status. Only when Composio says the account is expired, failed, inactive, or gone does it call `report-connection-error`, which sets the connection to `error`. A bad Composio API key fails that check too, so it never marks Users' connections.

A 404 with the JSON `NOT_FOUND` error means the connection is no longer active and ends the job without a retry. Any other failure retries up to three times, and the last attempt records the message as failed. The authenticated operations live in `apps/web/src/app/api/agent/gmail/[operation]/route.ts`; the signed-in User's sync and discovery routes live under `apps/web/src/app/api/gmail/connections/[connectionId]/`.

## Still to do

Add the missing Agent operations (recurring bills, Reminder preferences) and client-turn status/idempotency. Accept owned reads/writes and destructive confirmation against a disposable local Supabase stack before configured-provider testing.

The Gmail and merchant queues and cron schedules are declared in `wrangler.jsonc`. `wrangler dev` simulates the queues; scheduled events need a manual trigger during local development. Creating queues or applying cloud schedules requires an authorized deploy. Do not substitute fire-and-forget promises for durable processing.

## User deletion

Every minute, the Worker calls the authenticated backend `/api/agent/account-deletions/process` endpoint to recover durable cleanup jobs. The backend owns deletion acceptance, financial erasure, Gmail cleanup and Auth hard deletion. Worker `POST /users/purge` requires the backend credential and a verified inactive User before deleting that User's WhatsApp Durable Object storage and alarms. Purge waits for in-flight conversation work, and provider/model boundaries reject deleting or deleted Users. See the [deletion design](../../docs/user-deletion-design.md) for the operational drain window, queue retention limits and rollout order.

The `CONVERSATIONS` Durable Object binding in `wrangler.jsonc` is created on the first deployment. It has only run locally.

Do not import packages/db or construct privileged Supabase clients here. A backend credential authenticates the runtime, but does not replace per-User authorization.
