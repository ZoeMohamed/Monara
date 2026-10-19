# Monara agent instructions

## Scope and current state

Monara is a personal-finance PWA. Demo routes use sample data and browser state; the signed-in ledger uses backend persistence. Source implementation does not establish deployed provider configuration or live integration acceptance.

Read this file and the nearest AGENTS.md and CLAUDE.md before editing. The accepted architecture is in docs/adr/0001-initial-runtime-boundaries.md; ownership and local commands are in docs/repository-structure.md. CONTEXT.md is the domain glossary.

## Repository boundaries

- apps/web: Next.js UI and API routes, deployed on Vercel.
- apps/agent: TypeScript agent runtime, deployed on Cloudflare.
- packages/core: backend business rules and service interfaces.
- packages/contracts: shared validation schemas and transport types.
- packages/db: Supabase client helpers and generated database types.
- packages/integrations: Composio Gmail and Kapso WhatsApp adapters.
- packages/ui: HeroUI components and theme, owned by Daptek.
- supabase: local configuration, migrations, and synthetic seed data.
- playground/llm: isolated experiments, never imported by production code.

Never import from another apps/* package. Share code through packages/*. Keep browser-safe contracts separate from backend code. UI components must not own business writes or provider credentials. Do not add a package, worker, framework, or abstraction without an accepted requirement.

## Financial data and identity

- The Next.js backend owns financial writes. The agent uses defined backend operations, not direct Supabase financial writes.
- Verify identity and resource ownership on the server. Never trust a user ID, phone number, or connection ID supplied by a caller as proof of authorization.
- Supabase Auth uses Google sign-in. Composio Gmail authorization is a separate connection.
- A WhatsApp number must be explicitly linked and verified by the signed-in User.
- Each Category belongs to expense, income, or exclusion and must match the transaction's type. Budgets use expense Categories. Category type is immutable after creation; use stable identity rather than display names for Internal semantics.
- Extracted transactions start pending review. A Gmail import may auto-confirm only with an authenticated sender (DKIM or SPF), complete stated facts, a mapped active Financial Account, extraction confidence at `public.gmail_auto_confirm_confidence()`, and compatible classification confidence of at least 0.95. Internal is the only automatic exclusion: require explicit transfer evidence, cash direction, and an exact normalized match to the confirmed profile full name. Other exclusions require review. Confirmed exclusions stay out of totals.
- Gmail sync reads only the senders listed for the User's own accounts in `packages/contracts/src/institutions/institution-senders.json`. Duplicate email processing must not create duplicate transactions. Search only canonical public business names matched exactly against the bundled brand catalog; a model business label alone is insufficient. Never send personal names, account identifiers, or financial/email content to Brave. Reuse public business-search evidence, not past AI classifications. User corrections apply to the edited transaction only.
- Import completion includes classification or a terminal needs-review outcome. Review-pending transactions must not keep import progress running forever. No historical reclassification sweep or generalized transfer-fee reconstruction is part of v1.
- Keep database access behind repositories, with ownership checks and RLS. Never treat a service-role key as a replacement for authorization.
- Real data operations require connectivity initially. Do not cache financial data or auth responses in the service worker.
- Never invent financial amounts, dates, currencies, or account mappings when extraction is uncertain.

## Implementation practices

- Use pnpm. Keep workspace dependencies explicit with workspace:*.
- Use strict TypeScript; never introduce any. Validate external input before using it.
- Read current local framework documentation when changing framework-specific code. Honor the generated Next.js rules under apps/web.
- Keep Cloudflare runtime code free of unsupported Node APIs. Share only runtime-compatible code with the worker.
- Keep errors simple and explicit. Incomplete handlers must fail clearly rather than returning fake success.
- Preserve existing product language and UI conventions unless the task changes them. Do not introduce an i18n framework solely because Aiccountant has one.
- Always use a mobile viewport when developing, previewing, verifying, or taking screenshots of the UI. Default to portrait 390 × 844 CSS pixels (iPhone 12 Pro); use another mobile size only when the task requires it.
- Keep diffs task-scoped. You are sharing the repository with teammates; preserve their changes.
- Do not auto-invoke skills. Only use explicitly requested skills or skills chained by an already invoked skill.

## Credentials and external systems

- Commit only empty environment templates. Never print, log, commit, or put credentials in docs.
- NEXT_PUBLIC_* values are shipped to the browser. Only public Supabase URLs and publishable keys belong there.
- Service-role keys, provider keys, model keys, and agent/backend credentials stay server-side.
- Never log raw emails, conversations, financial records, auth headers, or tokens.
- Fail closed when required secrets or identity checks are missing.
- Local configuration does not authorize cloud provisioning, migrations against a remote database, deployment, messaging, or other external writes.
- Keep credentials supplied for a task local to that task. Do not rotate them merely because they were supplied in plaintext.

## Quality gates

- Husky hooks run the gates on commit, commit message, and push; `.github/workflows/ci.yml` runs them again on every PR. `pnpm check` runs everything the pre-push hook and CI run.
- Biome owns formatting and linting; run `pnpm lint:fix` to apply fixes. ESLint adds the Next.js rules for apps/web only. Knip and Sherif own dead code and workspace dependency consistency.
- Commit messages and PR titles follow Conventional Commits.
- apps/web keeps a react-doctor score of at least 95 with no findings, warnings included. Fix findings at their cause; waived rules or a lower threshold need the user's approval.
- Let hooks run on every commit and push, and fix the failure they report. The workspace targets Node 24 (`.nvmrc`).

## Local environments

- Each linked worktree has its own ports, env files, and Supabase stack. T3 and `wt` run full bootstrap (locked dependency installation, env/port setup, Docker-backed database startup and readiness verification). For manual setup, run `pnpm worktree:bootstrap`, then `pnpm dev` and optionally `pnpm dev:agent`. `pnpm install` alone prepares env/ports without starting the database. Env defaults to the main checkout; `MONARA_ENV_SOURCE` can select another checkout root. Existing local credentials and database settings survive repeat setup.
- Run `pnpm worktree:teardown` before removing a worktree; `pnpm worktree:prune` clears leftovers.
- `pnpm dev:tunnel` starts only the ngrok tunnel to this worktree's web port; it never starts the app. For Gmail testing, run `pnpm dev`, `pnpm dev:tunnel`, and `pnpm dev:agent` in separate terminals. ngrok's `4040` is its inspector, not the app.
- Composio has two projects: `monara_finance_dev` for local development, with its callback on the developer's ngrok domain, and `monara_finance` for production, with its callback on `https://monara-finance.vercel.app`. Local env files use only the dev project's credentials.

## Technical documentation

- The hackathon technical documentation lives in docs/tech, one file per area, written by its owner. When asked to write or update it, follow .agents/skills/tech-doc/SKILL.md and run `pnpm docs:check`.

## Verification and Git

Match checks to the change:
- Docs: inspect links and the focused diff.
- Shared contracts/services: affected package typecheck and meaningful boundary tests.
- Database work: local migrations, ownership/RLS checks, and regenerated types.
- Web: lint, typecheck, and build; browser verification when behavior changes.
- Agent: typecheck and local Wrangler dry-run build; integration evidence when a real provider is involved.
- Workspace changes: pnpm check and pnpm build.

Do not confuse a passing local build with deployed functionality. Report what was actually tested and what remains scaffolded.

Do not commit, push, create a PR, merge, or deploy unless the user requests it. On the first push of a non-main branch, use git push -u origin <branch>. Do not add production secrets or deployment identifiers to fixtures.
