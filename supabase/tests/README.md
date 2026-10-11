# Database tests

Once migrations exist, add pgTAP SQL tests under `database/`; include `rls` or `ownership` in at least one test filename. `pnpm db:check --reset` requires these tests and generated database types before starting a local stack. The filename check verifies that a test suite exists; reviewers must check that its assertions cover the schema.

Use synthetic Users and records, wrap each test in `begin`/`rollback`, and run assertions with anonymous and authenticated roles. For financial tables, verify each permitted operation for the owner and rejected reads/writes for another User, including forged ownership. Cover relevant uniqueness constraints, pending/confirmed behavior, and verified link requirements alongside the feature implementation. Do not use a service-role client to test RLS.

The gate resets this checkout's local database, including saved stopped data, only with `--reset`. Use disposable local data or a separate worktree. It refuses to reset an already running stack. CI runs on a disposable Ubuntu runner and does not connect to a hosted project.

See [the Supabase workflow](../../docs/supabase-workflow.md), [Supabase database testing](https://supabase.com/docs/guides/database/testing), and [Supabase's RLS test guidance](https://supabase.com/docs/guides/local-development/testing/overview).
