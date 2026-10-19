# Gmail categorization v1 verification

All verification evidence below is local. No live Gmail, Brave, or model requests, remote database migrations, provider configuration changes, or deployments were performed. The User subsequently authorized committing the changes and opening a pull request.

## Controlled workload evidence

The merchant-pipeline tests run fixed synthetic transactions through fake providers. These counts describe the categorization stage only; extraction LLM calls are separate.

| Workload | Transactions | Brave calls | Categorization LLM calls |
| --- | --- | --- | --- |
| Unique businesses | 20 | 20 | 20 |
| Repeated business | 20 | 1 | 20 |
| Personal counterparties | 20 | 0 | 20 |
| Clear Internal transfers | 20 | 0 | 0 |
| Unknown counterparties | 20 | 0 | 20 |

The tests verify that business evidence is reused while transaction decisions remain independent. For a five-email parse job, the pipeline test verifies one full connection-context snapshot and ten narrow activity checks, retaining revocation checks before provider boundaries. Merchant queue batching timeout is reduced from five seconds to one second; consumer concurrency is unchanged because provider quotas are not verified.

Reproduce the controlled checks with `pnpm --filter @monara/agent test` and `pnpm --filter @monara/integrations test`. Operational stage timings are emitted for future live measurement without logging transaction contents, names, amounts, or credentials. Fake-provider runtimes do not establish real import speed or an accuracy percentage.

## Database upgrade evidence

The migration was tested against the preceding local schema with synthetic mixed-type category usage, active and archived records, a budget, transaction undo state, and serialized budget undo state. The fixture asserts preservation of financial facts, types, labels, archival state, timestamps, budget grouping, and undo state. Historical rows do not acquire pending classification work.

Reproducible fixture files:

- `supabase/fixtures/typed-categories-before.sql`: apply after the preceding migration `20261019100000` in a disposable local database.
- `supabase/fixtures/typed-categories-after.sql`: apply after `20261019120000`; assertions fail if preservation is broken.

These fixtures are separate from normal postmigration pgTAP tests. The upgrade also exercised pending unknown-type category hints and actual undo restoration, without assigning a guessed type.

## Mobile browser evidence

At 390 by 844 CSS pixels, a synthetic local authenticated identity opened the signed-in Profile screen, selected an income category type, created a category through the real backend, and retained it after reload. It also changed an existing pending import to exclusion with the Internal category and confirmed it through the real backend. Reload retained the excluded record while confirmed spending and income stayed unchanged. The viewport had no horizontal overflow. This verifies local persistence and manual exclusion review, not real Google OAuth, automatic extraction accuracy, or Gmail-provider acceptance.

## Final workspace gates

- `pnpm check`: passed lint, workspace typechecks, Knip, Sherif, all 866 Node tests, React Doctor, technical-document structure, and migration-name validation.
- React Doctor: 100 for both `apps/web` and `packages/ui`, with no findings.
- `pnpm build`: passed the Next.js production build and Wrangler dry-run build. This command did not deploy.
- `pnpm db:check --reset`: passed clean migration replay, SQL lint, all 265 SQL assertions across 10 files, and exact generated-type checks. The disposable local database was restarted afterward.
- `pnpm db:validate --base-ref HEAD`: passed append-only migration history and ordering checks.
- `git diff --check`, task-document links/punctuation, and a scan for extracted configured credential values in task changes: passed.

The last SQL-only confirmation guard additionally keeps nonbusiness transfers pending unless Internal is independently established from the stored extraction evidence and confirmed full name. It retains a compatible category suggestion for review; high model confidence alone does not bypass this rule. Clean database replay results cover that guard separately from the unchanged application build.

## Limits

- Counterparty identity, sender/recipient roles, and explicit transfer meaning still depend on the extractor's semantic reading. Text-presence checks and deterministic full-name rules constrain model output; they do not independently prove bank-account ownership.
- Model confidence values are operational thresholds, not calibrated probabilities.
- Provider quotas and actual first-import/new-email latency remain unmeasured. A bounded live-provider comparison is a separate follow-up.
- Correction learning, historical reclassification, general fee reconstruction, and queue redesign remain deferred.
