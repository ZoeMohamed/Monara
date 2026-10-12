# Migrations

Zoe owns initial schema and RLS, coordinating with Daptek and Abhip on the backend. Create migrations with `pnpm exec supabase migration new <name>`. Validate locally before any approved remote migration. No financial schema is assumed by the scaffold.

Use `YYYYMMDDHHMMSS_snake_case.sql` with a real UTC timestamp and no duplicate versions. Keep SQL files directly in this directory. Once a migration is in the base branch, preserve its name and contents; make changes with a new migration whose timestamp follows all existing versions. Run `pnpm db:validate --base-ref origin/main` for static history checks and `pnpm db:check --reset --base-ref origin/main` on a disposable local stack for replay, RLS tests, and generated-type validation. See [the Supabase workflow](../../docs/supabase-workflow.md).
