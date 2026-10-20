# Categorization migration deployment diagnosis

The production Supabase deployment for merge commit `00a05d0` failed while applying `20261019120000_typed_gmail_categorization.sql`. The failure was SQLSTATE `23514`, `This Monara identity is unavailable.`, in statement 26, the default-category backfill. [Failed deployment](https://github.com/ZoeMohamed/Monara/actions/runs/39204514860).

## Reproduction and cause

A local rollback harness executes the actual backfill block from the migration. A synthetic User accepts deletion through `begin_user_deletion`, leaving an Auth identity awaiting external cleanup with its product records erased. The backfill then fails with the same message and stack: `require_live_monara_user`, called by `seed_default_categories`.

The smallest reproduction needs an Auth row, a pending-deletion marker, and the actual backfill block. It fails repeatedly. Removing only the deletion marker passes under the same database role; clearing session claims still fails. This establishes an inactive-identity write, rather than missing privileges or inherited session claims, as the failure pattern. Production identity records were not queried.

The backfill currently visits every Auth identity. Auth identity retention during provider cleanup is expected. The product-write guard correctly prevents that identity's categories from being recreated. Clean replay missed the interaction because it applies migrations before the normal synthetic seed records exist.

## Correction

The [backfill correction](../supabase/migrations/20261019120000_typed_gmail_categorization.sql) takes the same per-User advisory lock as deletion acceptance, checks `monara_user_is_active`, and seeds only active identities. The lock protects the check and subsequent inserts from a concurrent deletion. The deletion guard remains unchanged.

The correction was first validated outside migration history, then applied after the User explicitly approved the recovery PR and a narrow history-policy exception. The upgrade fixtures now include real deletion acceptance and check that the Auth identity and cleanup metadata survive, product data stays erased, inactive writes remain blocked, active identities receive six income defaults, and existing financial facts and undo state remain intact.

## Local upgrade evidence

- Reset this checkout's disposable local database to `20261019100000` and ran the augmented before fixture, which accepts a synthetic deletion through the real authenticated operation and commits that state.
- The original `pnpm exec supabase migration up --local` failed with SQLSTATE `23514` at statement 26, matching the production deployment.
- Repeated from a fresh baseline using the corrected repository migration and the actual `pnpm exec supabase migration up --local` command. It applied the migration successfully and recorded its version normally. The after fixture passed: eight transaction records, one budget, and three undo snapshots retained their expected facts; the deleted identity, ban, and cleanup marker were unchanged; no profile, categories, or sessions were recreated; the inactive-identity write guard still rejected inserts; and all three active control identities received six income defaults.
- The initial diagnosis kept the published migration unchanged. The approved correction is limited to the backfill; its exact before/after SHA-256 hashes constrain the history-check exception.
- The corrected schema passed SQL lint, all 274 pgTAP assertions across 10 files, and exact generated-type validation. No production metadata was changed.
- The original lifecycle reproduction and the minimal rollback harness both pass with the correction. No debug instrumentation was added to the application.

## Publication and recovery boundary

The [migration policy](../supabase/migrations/README.md) says: "Once a migration is in the base branch, preserve its name and contents; make changes with a new migration whose timestamp follows all existing versions."

A later migration cannot repair the earlier backfill because deployment stops before reaching it. The User explicitly approved amending this failed migration and publishing a recovery PR. The history checker permits only the exact original-to-corrected byte transition documented in the migration policy. It retains all other append-only protections. Do not disable identity guards, delete retained identities, mark a failed production migration applied, or bypass migration validation to recover.

No production database write or workflow retry was performed during diagnosis or recovery PR preparation. Local verification and a published recovery PR do not establish production recovery or a complete live Gmail import.
