# Monara agent instructions

## Scope and current state

Monara is a personal-finance PWA. The existing UI uses sample data and browser state. Workspace scaffolding does not mean auth, financial persistence, Gmail, WhatsApp, or agent workflows are implemented.

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
- Extracted transactions start pending review; confirmed transactions affect totals. Duplicate email processing must not create duplicate transactions.
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
- apps/web keeps a react-doctor score of at least 95. Fix the findings at their cause; waived rules or a lower threshold need the user's approval.
- Let hooks run on every commit and push, and fix the failure they report. The workspace targets Node 24 (`.nvmrc`).

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
