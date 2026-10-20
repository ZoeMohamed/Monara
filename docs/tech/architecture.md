# System architecture

Owner: Abhip. Features: F1 to F16; forecast extension F17. Status: Draft.

## Purpose

Monara combines an owned financial ledger with Gmail capture and a conversational Agent. Confirmed expenses and income feed Budgets and insights; uncertain imports await review, and confirmed exclusions remain outside totals. This section describes `origin/main` at `c9e5ea04df43f536a2ab0a67cb8875da2e47b91f`, reconciled on 20 October 2026 after reviewing the repository's documentation branches. The [source baseline and review state](README.md) apply to every section.

## How it works

**Runtime boundaries.** [ADR 0001](../adr/0001-initial-runtime-boundaries.md) and [repository structure](../repository-structure.md) define two deployables. `apps/web` is the Next.js PWA and backend on Vercel; its services own financial writes. `apps/agent` is a Cloudflare Worker for conversations, Gmail jobs and scheduled orchestration. Supabase provides Google Auth, Postgres, private Storage and RLS. Composio holds Gmail authorization; Kapso transports WhatsApp messages. Model calls run server-side.

Shared `packages/contracts` validates transport data; `packages/core` implements services and repositories; `packages/db` supplies clients and generated types; `packages/integrations` adapts providers; `packages/ui` supplies HeroUI and the theme. Apps never import another app. Production code never imports `playground/llm` experiments.

```mermaid
flowchart TB
  UI[Browser PWA] -->|session cookie| API[Next.js authenticated backend]
  API -->|owned services| DB[(Supabase data and RLS)]
  API -->|verified identity and server secret| Agent[Cloudflare Agent and jobs]
  Agent -->|allowlisted backend operations| API
  Kapso[Kapso signed webhook] --> Agent
  Agent -->|resolve verified WhatsApp Link| API
  Composio[Composio Gmail] -->|signed webhook| API
  Agent -->|read permitted mail| Composio
  Agent --> Models[Model provider]
  Agent -->|catalog public brands only| Brave[Brave Search]
```

**Email to ledger (F2-F4).** Authenticated connection routes discover institutions, let the User associate built-in or private Custom Banks with Financial Accounts, and maintain a sender-limited new-mail trigger. The [Composio webhook](../../apps/web/src/app/api/webhooks/composio/route.ts) verifies the signed event and resolves the stored connection. [Gmail queues](../../apps/agent/src/gmail) read permitted mail, extract stated facts and request backend ingestion. Typed categorization follows as a separate job. Durable message and item identities prevent duplicate ledger inserts. Automatic confirmation requires complete original facts, an active mapped account, a compatible type and Category, and available extraction/classification confidence at or above the SQL helper's **0.5**. DKIM/SPF alignment is retained as evidence but is not a review gate. Internal is selected first by deterministic owner-name matching; compatible expense, income and exclusion fallbacks can also confirm. See [extraction](extraction.md) for exact guards, source-date handling and terminal review outcomes. Earlier merchant classifications are not reused as authority.

**Chat to action (F10-F12, photo part of F14).** The [web Chat bridge](../../apps/web/src/app/api/chat/route.ts) verifies the Google session and origin, injects identity, then calls the Worker with a server secret. The browser never directly supplies trusted identity to the Worker. Kapso messages resolve a verified WhatsApp Link through the backend. Both Channels use the [conversation runtime](../../apps/agent/src/conversation); its tools call authenticated backend operations. WhatsApp photos have a separate pending-receipt path; voice remains Planned. Web exchanges are stored after the verified response. When only history persistence fails, the app can retry a signed, owner-bound save receipt for 24 hours without invoking the Agent or repeating the financial action. [Agent documentation](agent.md) covers permissions, Undo and the remaining lost-reply risk.

**Derived data and background work (F7-F9, F13, forecast extension).** Confirmed spending drives Budget calculations and deduplicated in-app threshold Reminders. Forecasts persist derived estimates separately from ledger transactions; Goals record manual progress without moving money. The [Worker entry point](../../apps/agent/src/index.ts) and [Wrangler configuration](../../apps/agent/wrangler.jsonc) define Gmail and merchant queues, one WhatsApp Durable Object per User, and four schedules: deletion cleanup every minute, Reminder dispatch every 15 minutes, Gmail catch-up daily at 01:00 UTC, and forecast refresh daily at 17:00 UTC (midnight in Jakarta). The production Worker inspected for this reconciliation reported the same schedules and baseline commit. Budget-alert dispatch is implemented, but no successful real-template delivery was exercised; bill-due production remains Planned. See [Reminders](reminders.md) and [forecast](forecast.md).

**Permanent deletion (F1 extension).** [ADR 0004](../adr/0004-permanent-user-deletion.md) requires the exact phrase and acknowledgement in Profile, with no Undo or recovery period. Acceptance blocks access immediately. Durable cleanup covers provider connections, conversations, private goal images and Auth identity. Upload intents fence uncertain Storage outcomes so Auth deletion does not complete while an object may still need reconciliation. Live provider copies, delivery history and backups remain outside what local source inspection can prove. Acceptance and reported cleanup completion are separate states.

## Key decisions

- Backend-owned writes replace direct Agent database access, keeping validation and resource ownership in one place (ADR 0001).
- Two deployables replace a single request runtime because queues, schedules and per-User WhatsApp state need durable execution.
- Separate Gmail consent replaces reusing Google sign-in as mailbox authority. A verified WhatsApp Link similarly replaces trusting a phone number.
- Typed Categories and exclusions replace name-based financial treatment; [ADR 0005](../adr/0005-typed-transaction-categories.md) keeps Category identity compatible with Transaction Type.
- Public-only offline fallback replaces cached private app pages. Forecast estimates remain separate from confirmed money and never create transactions.

## Security and risks

Session identity, stored connection ownership, webhook signatures and backend authorization protect different boundaries; a shared secret or service-role key alone cannot authorize a User's resources. Provider credentials stay server-side. External text and model output remain untrusted and pass validation before writes. Brave lookup accepts only canonical public catalog brands, without personal names or financial/email content.

The source has instance-local request limits, not a global quota, and lacks a page-wide CSP. Provider configuration, model accuracy, queue recovery, deletion races and real cross-channel acceptance need separate evidence. A lost Agent response can still leave the User unsure whether a financial write completed; save-only Chat recovery covers history persistence, not turn execution. See the separate [Security Self-Assessment](security-self-assessment.md) for the risk inventory.

## How to verify

Run `pnpm docs:check`, `pnpm check` and `pnpm build` on Node 24. The build compiles Next.js and bundles Wrangler locally; it does not deploy. The [development harness](../adr/0002-development-harness.md) and [worktree decision](../adr/0003-worktree-environments.md) describe local isolation. The latest inspected GitHub CI run for this baseline passed all jobs, including React Doctor and database checks; the latest inspected Supabase workflow validated and deployed the migration history. Those checks prove automation consistency, not provider acceptance.

Use the section-specific service, route, Worker and SQL tests linked in [extraction](extraction.md), [Agent](agent.md), [Reminders](reminders.md), [forecast](forecast.md) and [data/security](data-and-security.md) for ownership and behavior. Schema replay requires a disposable local stack. Verify signed and invalid webhooks, duplicate imports, unknown identities, terminal review, queue retries and deletion cleanup before provider acceptance. Use [evaluation](evaluation.md) for dated synthetic model results and [deletion evidence](../evidence/user-deletion-2026-10-19.md) for its recorded local test layer. Neither is a current live-provider run.
