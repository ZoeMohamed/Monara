# Cloudflare agent

One TypeScript worker hosts the shared agent runtime. Feature folders hold Adlyn's Gmail extraction (`src/gmail`), the Agent core and budgeting logic (`src/conversation`, `src/budgeting`), and Kapso message handling (`src/whatsapp`).

Run `pnpm dev:agent` from the root. `pnpm --filter @monara/agent build` creates a local dry-run bundle without deployment, and `pnpm --filter @monara/agent test` runs the Agent tests.

## Endpoints

| Route | State |
| --- | --- |
| `GET /health` | Returns `status: scaffold` until the runtime is ready for production. |
| `POST /chat` | In-app chat. The web backend sends `{ userId, text }` (see `agentChatRequestSchema`) with `Authorization: Bearer <MONARA_AGENT_BACKEND_SECRET>` and gets `{ reply }`. Runs the tool loop with the read tools, so the Agent can look records up but cannot add, change, or delete anything, and says so. Single turn: no conversation history is kept. |
| `POST /webhooks/kapso` | Kapso `whatsapp.message.received` webhook. Verifies the signature, then replies to every sender with the prompt to link their number, because WhatsApp Links do not exist yet. Nothing reaches the Agent from WhatsApp. |
| Anything else | 501. |

Each handler returns 503 when a secret it needs is missing.

## Agent core

`src/conversation/agent.ts` is the tool loop every Channel shares. Agent Tools are registered in `src/conversation/tools.ts` with a Permission Tier: T0 and T1 tools run, T2 tools are refused until confirmations exist, and T3 actions cannot be registered at all. A tool receives the User from the verified Channel, never from the model.

`src/conversation/read-tools.ts` holds the T0 tools: `list_transactions`, `list_financial_accounts`, `list_categories`, `list_budgets`, `list_recurring_bills`, and `list_reminders`. Each takes the matching list input from `@monara/contracts` and parses the result with the matching page schema.

## Backend operations

The Agent reads records only through the Next.js backend (`src/conversation/backend.ts`). For each tool it sends `POST {MONARA_BACKEND_URL}/api/agent/operations/{tool name}` with `Authorization: Bearer <MONARA_AGENT_BACKEND_SECRET>` and the body `{ userId, input }`, and expects the page as the JSON response. These routes do not exist in `apps/web` yet, so every tool call currently fails and the Agent tells the User it could not look the records up.

## Still to do

Implement automatic Gmail processing with durable background jobs and manual sync. Provision queues or other durable resources only with deployment authorization. Do not substitute fire-and-forget promises for durable processing. No queue bindings, schedules, or Gmail webhooks are configured yet.

Resolve verified User context, validate provider events, and request financial writes through the Next.js backend. Do not import packages/db or construct privileged Supabase clients here. A backend credential authenticates the runtime, but does not replace per-User authorization.
