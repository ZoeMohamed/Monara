# Typed-category upgrade fixture

These fixtures exercise a real upgrade from `20261019100000` to
`20261019120000`. Use this checkout's disposable local Supabase database.
The reset replaces its synthetic state.

1. Start the local stack with `pnpm db:start --runtime docker`.
2. Run `pnpm exec supabase db reset --local --version 20261019100000`.
3. Execute `typed-categories-before.sql` with `psql -X -v ON_ERROR_STOP=1 -f`
   against that local database.
4. Run `pnpm exec supabase migration up --local`.
5. Execute `typed-categories-after.sql` through the same local `psql` connection.
6. Finish with `pnpm db:stop`, then `pnpm db:check --reset` for a clean replay.

Use the checkout's `supabase status --env --output-format json` `DB_URL` in the
local process to configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and
`PGPASSWORD`. Keep values out of terminal output and source files.

The before fixture stores synthetic expected rows in `category_upgrade_fixture`.
It covers mixed expense/income/exclusion references, an archived category, a
legacy Internal category used for expenses and budgets, pending review markers, unknown pending kinds with preserved category hints,
transaction undo objects, and serialized budget undo snapshots. The after fixture
raises on changed financial fields, labels, archive state, or concurrency
timestamps, incompatible typed references, or historical reclassification. It
removes its expected-value schema when every assertion passes. The final clean
replay removes the synthetic upgrade records.
