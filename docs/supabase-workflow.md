# Supabase workflow for Monara

The [Action Tracker reviewed on 14 October](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg) assigns Supabase connection (ZO2), ERD (ZO3), and migrations/RLS (ZO4) to Zoe, and migration validation (AB3) to Abhip. Coordinate generated database types and backend contracts with those feature owners. Daptek owns shared UI under ER1–ER3; see [the UI design system](ui-design-system.md), [repository ownership](repository-structure.md), and the [runtime boundaries](adr/0001-initial-runtime-boundaries.md).

The repository now contains the financial schema migrations, RLS/ownership tests, synthetic seed, generated database types, Google sign-in/server sessions, financial services, and deterministic F9 insight calculations. The migration validation command and database CI job support AB3; an existing-schema checkout must replay and verify its migrations rather than treating the earlier empty-schema skip as current evidence. UI service adapters, live configuration and hosted migration deployment are separate integration/acceptance work.

## Start this checkout's database

Use Node 24 and the repository's pnpm version. Start OrbStack on macOS or Docker Desktop on Windows, then run from the repository root:

```bash
pnpm install
pnpm db:start
pnpm dev
```

`pnpm db:start` writes this checkout's local Supabase URL, publishable key, and server-only service-role key to the ignored `apps/web/.env.local`. Restart the web server after these values change. Client helpers in `packages/db` accept explicit configuration; they do not initialize auth or repositories for you.

The CLI is pinned to `2.120.0` in `package.json` and the lockfile. Its experimental stack mode supports independent databases per checkout and branch, with automatically assigned ports. Keep `[experimental] stack = true` and omit fixed ports in `supabase/config.toml`. The official guide requires CLI `2.119.0` or later; use the repository pin rather than a global installation. Database commands target the current branch's default stack. [Supabase: multiple local projects](https://supabase.com/docs/guides/local-development/running-multiple-local-projects).

Use `pnpm db:stop` when finished. Before removing a linked worktree, run `pnpm worktree:teardown` from that worktree; it deletes that worktree's local database and releases its ports. Preserve useful local data before teardown. See [worktree environments](adr/0003-worktree-environments.md).

## Make a schema change

Review the accepted [ERD](erd.md), existing migrations and shared contracts before extending the schema. Settle the User, Financial Account, transaction, Gmail Connection, and WhatsApp Link relationships needed by the feature.

Create a timestamped migration using the CLI:

```bash
pnpm exec supabase migration new describe_the_change
```

Put reviewed SQL in the generated `supabase/migrations/<timestamp>_<name>.sql` file. Include constraints, indexes, grants, RLS, and policies needed by the feature. Add only synthetic fixtures to `supabase/seed.sql`. Record local Studio changes in a migration before they become part of a feature.

Use a new migration to change a schema that has already been shared or applied remotely. Resolve duplicate timestamps and ordering conflicts before merge. Rebuild locally after receiving a teammate's migrations. [Supabase: database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

## Validate the change locally

Run this on a disposable local stack: reset discards local records and reapplies every migration plus the synthetic seed. The explicit `--local` flags keep these checks on the current checkout's database.

```bash
pnpm exec supabase db reset --local
pnpm exec supabase db lint --local --schema public --level warning --fail-on warning
```

Reset checks that the SQL chain and seed execute from an empty database. Lint checks database functions; `--fail-on warning` makes findings fail the command. Add any application schemas beyond `public` to the schema list. Neither check establishes resource ownership or application correctness. [Supabase CLI: reset and lint](https://supabase.com/docs/reference/cli/supabase-db-lint).

Keep pgTAP ownership/RLS coverage under `supabase/tests/database/` with each schema change, and run:

```bash
pnpm exec supabase test db --local
pnpm db:types
pnpm --filter @monara/db typecheck
pnpm --filter @monara/core typecheck
pnpm --filter @monara/contracts typecheck
```

Generate `packages/db/src/types/database.types.ts` only from a successful local schema read. Include the generated file with the migration and export its type when consumers need it. `pnpm db:types` writes through a temporary file so failed generation preserves the prior output. `pnpm db:types --check` compares freshly generated types with the working-tree file without changing it. [Supabase: generated TypeScript types](https://supabase.com/docs/guides/api/rest/generating-types).

Database tests should exercise allowed and rejected behavior using synthetic Users, including:

- User A can read the records that the feature permits A to own; User B cannot read or change them.
- Signed-out access is denied, and callers cannot assign records to another User.
- Changing an owner or choosing another User's Financial Account is rejected.
- Invalid values and broken relationships fail the agreed constraints.
- Duplicate source-message processing cannot insert duplicate transactions.

Enable RLS and choose grants deliberately on exposed tables. Test policies under `anon` and `authenticated`, including each supported operation; tests run solely as a privileged role cannot prove isolation. [Supabase: RLS policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [database testing](https://supabase.com/docs/guides/database/testing).

Test the backend service boundary as its implementation arrives: resolve identity from verified auth, check ownership, keep extracted transactions pending, and exclude pending records from confirmed totals. These are Monara requirements from `AGENTS.md`; their service tests complement database policy tests.

## Put each validator in its owning layer

| Layer | What it validates | Where it belongs |
| --- | --- | --- |
| External input | Request shape, required fields, identifiers, and agreed value formats | Zod schemas in `packages/contracts`, parsed at API and provider boundaries |
| Financial operation | Verified identity, resource ownership, review transitions, duplicate handling, and confirmed totals | Services and repository interfaces in `packages/core`; authenticated handlers in `apps/web` |
| Stored data | Required values, foreign keys, uniqueness, and agreed value constraints | SQL migrations in `supabase/migrations` |
| Database access | Which roles may perform which operations on whose rows | Grants and RLS policies, with local database tests |

The shared schemas now define UUID resources; pending/confirmed review states; expense/income/exclusion transaction types; exact decimal-string IDR money; budget/dashboard operations; and Gmail/channel inputs. Use these accepted shapes with the generated database types instead of restoring starter-only contracts. A parsed caller-supplied User ID does not prove identity, and a service-role key does not replace server authorization. UI in `packages/ui` stays presentation-only; financial writes go through the backend.

## Database validation command and CI

`pnpm db:validate` checks migration filenames and unique, real UTC timestamps without Docker. It runs as part of `pnpm check`, even before the first schema exists. To also check history and ordering against a locally available base commit or branch, run:

```bash
pnpm db:validate --base-ref origin/main
```

The base's SQL migrations must remain unchanged, including their names. Every new timestamp must be later than the latest migration in the base. Multiple new migrations may arrive in any directory-listing order; their timestamps determine replay order. This catches edits, deletions, renames, and backdated additions, including untracked new SQL files. Fetch the base first if needed; an unavailable or invalid base fails validation. Without `--base-ref`, the static command checks filenames and timestamps only.

The User explicitly approved one recovery amendment for the failed `20261019120000_typed_gmail_categorization.sql` backfill. Its exact before/after content hashes are pinned in the history checker and [migration policy](../supabase/migrations/README.md); a changed filename, different starting contents, or any further edit still fails. The [deployment diagnosis](gmail-categorization-deployment-diagnosis-2026-10-19.md) records why a later migration cannot unblock it and how the deletion lifecycle was reproduced locally.

`pnpm db:check` runs preflight checks and skips without starting services when no SQL migrations exist. Once a schema exists, preflight requires valid UTC filenames in `YYYYMMDDHHMMSS_snake_case.sql` form, unique timestamps, a SQL test filename containing `rls` or `ownership` under `supabase/tests/database/`, and a generated `packages/db/src/types/database.types.ts` file. Migrations must sit directly under `supabase/migrations/`. CI also requires the generated file to be tracked; local validation allows the first untracked baseline. Test naming establishes that a suite exists; reviewers must verify its actual policy coverage.

To replay migrations, explicitly opt into resetting a disposable local database:

```bash
pnpm db:check --reset
```

This replaces the current checkout's local records, including saved data from a stopped stack. The command requires Docker and refuses a running stack in this checkout. Stop a stack first only if its data is disposable, or use a separate worktree. Prepare the first schema and generated baseline with the manual commands above, then run the gate before submitting the change.

The gate starts the local database explicitly with `pnpm db:start --runtime docker`, preventing the experimental CLI from falling back to native processes. It replays migrations and seeds, lints `public` with warnings treated as failures, runs pgTAP tests, and runs `pnpm db:types --check` to reject type drift while preserving working-tree edits. It stops the database in `finally`, including when replay or checks fail. Stopping preserves the resulting local data; linked-worktree teardown deletes it.

The `Local database migrations` job in [CI](../.github/workflows/ci.yml) runs `pnpm db:check --reset --base-ref <base-sha>` on its disposable Ubuntu checkout for code changes. It fetches history and compares against the PR base commit, or the previous commit for a main-branch push. The first push of a new repository has no base, so it checks filenames and replays without comparing history. History is validated before the empty-schema skip, so deleting the last migration fails. The job uses the repository's pinned installation and no hosted credentials. `pnpm check` stays independent of Docker. Supabase describes migration and type verification in its [environment workflow](https://supabase.com/docs/guides/deployment/managing-environments).

## Hosted database handoff

Local configuration and a passing PR check do not authorize hosted provisioning or migration deployment. When deployment is requested, first agree the hosted environment, owner, secrets location, and recovery plan. Store deployment credentials server-side and in the approved CI environment; commit only empty templates.

Use a separate approved deployment path to apply reviewed migrations. Coordinate one deployment at a time, verify migration history afterward, and keep hosted changes reproducible through the migration files. Google OAuth configuration remains a separate setup step, and Composio Gmail authorization remains separate from signing in. No hosted deployment is configured by this document.
