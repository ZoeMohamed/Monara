# Cloudflare agent

One TypeScript worker hosts the shared agent runtime. Feature folders are reserved for Adlyn's Gmail extraction, Argya's conversation/budgeting logic, and Farrel's Kapso message handling.

Run `pnpm dev:agent` from the root. The only implemented endpoint is `GET /health`, which reports scaffold status. All other routes return 501. `pnpm --filter @monara/agent build` creates a local dry-run bundle without deployment.

Implement automatic Gmail processing with durable background jobs and manual sync. Provision queues or other durable resources only with deployment authorization. Do not substitute fire-and-forget promises for durable processing. No queue bindings, schedules, provider webhooks, or model calls are configured yet.

Resolve verified User context, validate provider events, and request financial writes through the Next.js backend. Do not import packages/db or construct privileged Supabase clients here. A backend credential authenticates the runtime, but does not replace per-User authorization.
