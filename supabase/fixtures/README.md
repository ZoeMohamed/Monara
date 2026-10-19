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
legacy Internal category used for expenses and budgets, pending review markers,
unknown pending kinds with preserved category hints, transaction undo objects,
and serialized budget undo snapshots. It also creates
synthetic Auth users and a session, accepts deletion through the authenticated
`begin_user_deletion` RPC, and leaves the banned Auth identity pending cleanup.
A separate active identity provides a control. The migration runs after that
transaction ends, without the deleting user's JWT claims. The after fixture
raises on changed financial fields, labels, archive state, or concurrency
timestamps, incompatible typed references, or historical reclassification. It
also requires that accepted deletion retains its Auth identity and exact cleanup
marker, revokes product access, leaves profile and categories erased, and keeps
the service write guard effective. Every active fixture identity must receive
all six income defaults. It removes its expected-value schema when every
assertion passes. The final clean replay removes the synthetic upgrade records.

Against the original unfiltered Auth-user seed loop, the deletion regression
fails at step 4 with: `This Monara identity is unavailable.`
(`23514`). See the [deployment diagnosis](../../docs/gmail-categorization-deployment-diagnosis-2026-10-19.md)
for the approved recovery patch and its narrow migration-history exception.
With that fix applied, step 4 and the after fixture must pass through the actual
CLI. During diagnosis, a candidate can also be evaluated outside the migration
history directory against the same baseline and before fixture: apply the
complete candidate SQL in one transaction, then run the after fixture. Preserve
all migration history outside the approved exception. For a successfully executed local candidate,
record its local version only after validation so subsequent local bootstrap
finds a coherent ledger. A failed migration must not be recorded as applied.
