# Repository structure

This is the agreed workspace scaffold. The existing web UI remains a sample-data prototype. No live auth, database schema, financial backend, provider connection, durable job, or LLM workflow is implemented by the scaffold.

## Layout and ownership

| Path | Responsibility | Owner |
| --- | --- | --- |
| `apps/web` | Next.js PWA and thin API route handlers on Vercel | Zoe, Daptek, Abhip |
| `apps/agent/src/gmail` | Gmail extraction and ingestion orchestration | Adlyn |
| `apps/agent/src/conversation` | Conversational finance and backend tool calls | Argya |
| `apps/agent/src/budgeting` | Budgeting logic after evaluation | Argya |
| `apps/agent/src/whatsapp` | Kapso message handling | Farrel |
| `packages/core` | Backend financial services and repository interfaces | Zoe, Daptek, Abhip |
| `packages/contracts` | Shared validation schemas and transport types | Feature owners coordinate with Abhip |
| `packages/db` | Supabase clients and generated database types | Zoe |
| `packages/integrations` | Composio Gmail and Kapso transport adapters | Adlyn, Farrel |
| `packages/ui` | HeroUI components, provider, and light theme | Daptek |
| `supabase` | Local config, schema migrations, RLS, and synthetic seeds | Zoe |
| `playground/llm` | Isolated extraction, conversation, and budgeting experiments | Adlyn, Argya |

Ownership describes who leads implementation, not access restrictions. Coordinate shared contracts and migrations before changing their shape. Do not use teammate names as production folder names.

## Dependency direction

```text
apps/web -> core, db, contracts, integrations, ui
apps/agent -> contracts, integrations
core -> contracts (db-backed repositories may use db)
integrations -> contracts
playground/llm -> contracts, integrations
```

Apps never import another app. Backend services own financial writes; the agent requests those operations through an authenticated backend API. Contracts must remain browser/worker safe. UI must remain presentation-only. Production code never imports the playground.

The UI package is a reserved entry point, not a HeroUI migration. Supabase helpers re-export explicit-config SDK constructors without automatically creating a client. Generated database types will be added after migrations exist. Starter contracts cover identifiers, review state, Gmail jobs, and verified WhatsApp message input; they do not finalize the financial schema.

## Agreed flows

- Google sign-in uses Supabase Auth. A Gmail Connection through Composio is separate from login.
- Gmail imports run automatically through durable background jobs in the Cloudflare runtime. Provide manual sync for testing and recovery. The worker scaffold does not yet provision queues or implement jobs.
- Deduplicate email imports using the User, Gmail Connection, and source message identity. Enforce uniqueness durably when implementing persistence.
- Extracted transactions remain pending review until confirmed. Pending transactions do not contribute to confirmed totals.
- The signed-in User explicitly links and verifies their WhatsApp number. Kapso provides transport into the shared agent runtime.
- Keep PWA installation and offline app-shell support. Real data operations require connectivity initially.

## Local commands

Run commands from the repository root:

```bash
pnpm install
pnpm dev
pnpm dev:agent
pnpm typecheck
pnpm lint
pnpm build
```

Run web and agent dev commands in separate terminals. The web app listens on port 3000; the local agent listens on port 8787. `GET /health` on the agent reports `status: scaffold`; other routes return 501. `pnpm build` builds Next.js and performs a Wrangler dry-run bundle without cloud deployment.

Supabase local development is optional until database implementation begins. It requires OrbStack running on this Mac:

```bash
pnpm db:start
pnpm exec supabase migration new initial_schema
pnpm db:types
pnpm db:stop
```

`pnpm db:types` generates `packages/db/src/types/database.types.ts` only after a successful local schema read. Never hand-author generated schema types. Local startup can display local credentials; do not paste them into committed docs or logs. The scaffold does not start containers, configure a hosted project, or apply remote migrations.

## Environment configuration

Copy the empty templates locally:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/agent/.dev.vars.example apps/agent/.dev.vars
cp playground/llm/.env.example playground/llm/.env
```

Set only values needed for your feature. Every teammate keeps real credentials in ignored local files. The web and agent must use the same server-side agent/backend credential when that authentication flow is implemented; callers still need verified User context. Provider webhook signature verification remains separate.

Configure production values through the deployment providers only when deployment is authorized. Do not copy keys from Aiccountant or Google Docs into source control. Do not populate provider account IDs, queue resources, or OAuth credentials merely to make a scaffold look complete.

## Aiccountant reference

Borrowed patterns: deployable apps versus shared packages, domain-oriented services, repository boundaries, generated database types, and isolated UI ownership. Monara keeps Next.js, uses HeroUI, Composio, and Kapso, and initially omits Aiccountant's PowerSync, extra workers, admin/billing systems, and project-specific tooling. See [the accepted architecture decision](adr/0001-initial-runtime-boundaries.md).
