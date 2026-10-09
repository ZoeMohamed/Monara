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
pnpm check
pnpm lint:fix
pnpm format
pnpm build
```

Use Node 24 (`.nvmrc`). `pnpm install` also installs the Husky git hooks. macOS and Windows are both supported: `.gitattributes` keeps LF line endings, the repository scripts are Node, and the git hooks run in Git Bash (included with Git for Windows). CI runs lint, typecheck, tests, a worktree smoke test, and a git hook smoke test on Windows. Local Supabase needs a Docker-compatible runtime (OrbStack on macOS, Docker Desktop on Windows).

Run web and agent dev commands in separate terminals. The main checkout listens on web port 3000 and agent port 8787; linked worktrees use their own ports (see Worktrees below). `GET /health` on the agent reports `status: scaffold`; other routes return 501. `pnpm build` builds Next.js and performs a Wrangler dry-run bundle without cloud deployment.

Supabase local development is optional until database implementation begins. It requires OrbStack running on this Mac:

```bash
pnpm db:start
pnpm exec supabase migration new initial_schema
pnpm db:types
pnpm db:stop
```

`pnpm db:start` starts this checkout's own Supabase stack and writes its URL and keys into `apps/web/.env.local`. `pnpm db:types` generates `packages/db/src/types/database.types.ts` only after a successful local schema read. Never hand-author generated schema types. Local startup can display local credentials; do not paste them into committed docs or logs. The scaffold does not configure a hosted project or apply remote migrations.

## Worktrees

Every linked worktree gets an isolated local environment. `pnpm install` runs `scripts/worktree.mjs setup` through the `prepare` script, so any tool that creates a worktree and installs dependencies is covered. A Husky `post-checkout` hook cannot do this, because `.husky/_` does not exist in a fresh worktree until the first install.

| Resource | How it is isolated |
| --- | --- |
| Web, agent, and inspector ports | A numbered slot `n` from a locked registry in git's common directory: web `3000+n`, agent `8787+n`, inspector `9229+n`. The main checkout is slot 0. The slot is written to the ignored `.worktree.env`, and `pnpm dev` and `pnpm dev:agent` read it. |
| Env files | `apps/web/.env.local` and `apps/agent/.dev.vars` are copied from the main checkout (or from the `.example` templates), with `MONARA_AGENT_URL` and `MONARA_BACKEND_URL` pointed at the worktree's ports. The Supabase values are left blank so the worktree cannot reach another checkout's database. |
| Supabase | Stack mode (`supabase stack`) gives each worktree its own containers, data, and ports. `supabase/config.toml` sets no fixed ports. Stack mode is experimental, so the CLI version is pinned exactly. |

```bash
pnpm worktree:status     # slots in use
pnpm worktree:teardown   # destroy this worktree's stack and release its slot
pnpm worktree:prune      # clear claims and stacks of worktrees that no longer exist
```

Run `pnpm worktree:teardown` before removing a worktree. If a worktree was removed without it, `pnpm worktree:prune` cleans up. `.wt/config.toml` wires setup and teardown into the `wt` CLI. To run setup when T3 Code creates a worktree, add a project script with `runOnWorktreeCreate` enabled and the command `node scripts/worktree.mjs setup`. See [the worktree environment decision](adr/0003-worktree-environments.md).

## Quality gates

`pnpm check` runs lint (Biome, plus ESLint for apps/web), typecheck, Knip, Sherif, tests, and the react-doctor gate. The same checks run at three points:

| Stage | What runs |
| --- | --- |
| `pre-commit` | `biome check --write` on staged files, re-staged afterward. The react-doctor gate also runs when staged files touch apps/web. |
| `commit-msg` | commitlint enforces Conventional Commits. Scopes are free-form. |
| `pre-push` | `pnpm check` |
| CI (`.github/workflows/ci.yml`) | Format and lint, typecheck, Sherif and Knip, tests, build, react-doctor, PR title, and actionlint when workflows change. |

Pre-commit refuses to auto-fix a file that has both staged and unstaged edits; stage or stash the rest first. Hooks run in a non-interactive shell, so if `pnpm` is not found, put your version-manager activation in `~/.config/husky/init.sh`.

The react-doctor gate (`pnpm doctor`) fails below a score of 95 or on any error-level finding in apps/web. Scoring calls react-doctor's API with diagnostics only: source context is removed and file paths are redacted. Telemetry and the supply-chain check are off. Offline, local hooks warn and skip the score check, and CI fails closed. Add `packages/ui` to the gate target in `scripts/react-doctor-gate.mjs` once it holds components.

GitHub reads `.git-blame-ignore-revs` automatically; locally run `git config blame.ignoreRevsFile .git-blame-ignore-revs` to skip the Biome formatting commit in `git blame`.

Direct pushes to `main` stay allowed, so the strictness lives in the PR checks and the local hooks; branch protection and required checks are GitHub repository settings and are not configured by the repository. CI runner images are pinned (`ubuntu-24.04`, `windows-2025`) so a GitHub `-latest` migration cannot break the gates; bump them deliberately. Deployment stays outside CI. See [the development harness decision](adr/0002-development-harness.md).

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
