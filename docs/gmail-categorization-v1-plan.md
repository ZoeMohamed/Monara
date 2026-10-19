# Gmail categorization v1 implementation plan

The User accepted the [reduced design](gmail-categorization-design-2026-10-19.md). Implementation and local verification are complete, and the User authorized opening a pull request. Deployment, remote migrations, provider configuration changes, and live-mail benchmarks remain outside this scope.

## Data and backend

1. Add immutable Category `kind`, seed six income defaults, and expose typed Category creation/listing contracts.
2. Migrate existing references without changing financial treatment. Preserve budgets on expense categories, create typed copies for mixed usage, preserve untouched timestamps, and keep stored undo references compatible. Keep stable default Internal identity independent of display name.
3. Enforce owned active Category/type compatibility on financial writes and expense-only budget categories.
4. Preserve extracted counterparty identity/type and explicit transfer evidence. Use the confirmed profile full name for automated Internal evidence, without Google-name fallback.
5. Track classification as pending, completed, or needs review for new Gmail imports. Disable personal merchant-category history reuse. Queue every new classification candidate, including missing merchants and exclusions.
6. Apply classification by owned Category ID under a transaction lock. Preserve stated cash direction even when the pending type is unknown, reject incompatible categories, and protect financial facts and User edits. Auto-confirm only eligible complete authenticated imports with strong extraction and classification evidence; other exclusion reasons require review.
7. Include pending classification in sync progress. Terminal needs-review outcomes permit import completion and contribute a separate review count.

## Worker and integrations

1. Extend extraction with structured business/person/unknown counterparty type and explicit transfer evidence. Use deterministic counterparty-name matching against the confirmed profile name, independently of transfer evidence, description, counterparty type or cash direction. The onboarding follow-up accepts complete subsets with at least two distinct substantive words and one character edit in each of at most two words.
2. Extend the existing second LLM with transaction context and typed Category IDs. Do not add another model stage or reuse classification solely by merchant name.
3. Search only identifiable businesses, retaining the existing public search-summary cache. Personal and uncertain counterparties classify without external search. Clear Internal transfers bypass both Brave and the second LLM.
4. Record terminal uncertain classification rather than leaving work pending forever. Preserve bounded durable retries for temporary provider failures and safe compatibility with existing jobs.
5. Replace repeated full-context guard reads with a narrow active-connection check where possible. Add safe operational stage timings, provider backoff handling, and focused categorization enqueue recovery. Keep existing queues and conservative concurrency.

## Web

1. Select Category type on creation and filter pickers by transaction type. Category type is immutable after creation. Budgets select expense categories only.
2. Connect existing live exclusion edit/confirm controls to backend operations. Preserve existing mobile UI conventions and User-edit protections.
3. Continue polling while classification runs, update existing feed rows when their category/review changes, and distinguish completed imports from transactions awaiting review.

## Verification

- Contracts/core: affected typechecks and meaningful ownership, category compatibility, User-edit race, auto-confirmation, and uncertain-outcome tests.
- Database: replay local migrations, pgTAP ownership/classification/migration invariants, generated types, append-only migration validation.
- Worker: extraction/Internal/person/business boundaries, typed categorization, retries/enqueue recovery, synthetic timing/call-count evidence, typecheck, tests, Wrangler dry-run.
- Web: lint, typecheck, build, react-doctor at least 95 with no findings, and 390 by 844 mobile browser verification.
- Workspace: `pnpm check`, `pnpm build`, focused diff review, and credential-free output/diffs.

Synthetic measurements establish call counts and behavior under controlled delays. They do not establish real Gmail, model, Brave, queue, or deployed latency. Report that distinction explicitly.
