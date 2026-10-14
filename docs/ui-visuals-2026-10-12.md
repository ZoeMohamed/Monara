# Monara visual UI progress — 12 October 2026

> Current checkpoint — 14 October 2026: earlier sections are a dated implementation journal, including superseded visual iterations, validation counts and branch state. The current [UI design system](ui-design-system.md), [UI technical draft](tech/ui.md) and [backend handoff](ui-backend-handoff.md) describe the reconciled implementation. Google Auth, schema/contracts, Gmail connection APIs, financial backend operations and the Agent runtime now exist; rich financial screens still use labelled sample state, and Gmail/Chat screen adapters remain incomplete. The supplied SVG lockup/Nunito Sans, static landscape/simple mascot and all financial visualizations remain. The live tracker keeps ER1–ER3/ER11 Done and ER4–ER10/ER12 In progress; no external statuses or deadlines were changed. These historical checks do not prove acceptance of the newly combined implementation.


## Integration review — 14 October 2026

The PR candidate incorporates main's Google Auth, Gmail and ledger backend changes without replacing their implementations. Every finance entry route verifies server identity; Profile uses the verified presentation profile and real sign-out form. Financial interactions remain explicitly synthetic, and the Chat adapter stays disconnected until it shares the persistent ledger.

- Node 24: `pnpm check` passed, with 268 tests across the workspace and root scripts, no failures, React Doctor 100 for both web and shared UI, documentation checks and static migration validation. `pnpm build` passed for Next.js and the Agent's Wrangler dry-run bundle. Database replay/RLS execution is left to the PR's local-database CI job; no remote migration or deployment was run.
- With the native preview explicitly unavailable, a local headless browser used 390 × 844 and an isolated synthetic Auth/JWKS provider, with no production auth bypass. All six routes redirected anonymous requests to sign-in, rendered for the fixture identity, loaded the supplied logo and fit without horizontal overflow or browser errors. All six also fit at 320px.
- Mobile browser interactions passed for confirmed correction/Undo; delete cancellation, deletion/Undo; invalid creates; dirty-close confirmation and draft recovery through Back/Forward; focus restoration; manual creation; pending confirmation/rejection; disconnected Chat with retained draft; verified profile/sign-out; and fail-closed Google sign-in against an unavailable fixture provider. Live Google/Gmail/WhatsApp operation and physical-device/PWA acceptance remain separate work.
- Regression fixes cover report history at the supported calendar boundaries and unused zero-budget warnings. The daily guide now explains total limits minus all confirmed expenses and displays that overall remainder separately from category remainders.

The live tracker/PRD were retrieved on 14 October and still carry 12 October/11 October revision dates respectively. ER4–ER10 and ER12 remain In progress. This review does not mark the whole product complete or change external documents.

This local continuation follows the [11 October tracker audit](next-steps-2026-10-11.md). It combines the clear summaries and grouped ledger in the supplied Aiccountant references with Oyenza's category breakdowns, reporting calendars, and budget progress. Monara keeps its English, blue and white HeroUI design and single-user IDR scope.

## Implemented locally

| Tracker area | Presentation and interaction | Remaining dependency |
| --- | --- | --- |
| ER6 dashboard | Overview and Reports share a selected month; confirmed spending, income and difference; daily/cumulative spending line and area; real previous-month comparison; six-month income/expense bars; category donut with payment details; daily spending heatmap with day agenda | ZO6 financial operations and ZO7 authenticated server aggregates |
| ER5 review and ledger | Review decisions update every visual in the session; confirmed ledger groups by date and supports merchant/category/account search and expense/income/transfer filters | Durable review operations and rejected-email deduplication |
| ER8 budgets and bills | Category limits and warning labels, elapsed-month markers, remaining budget and daily guide; navigable bill calendar; suggestions enter the calendar only after confirmation | Budget/bill storage and management operations |

Desktop uses adjacent analysis panels; mobile keeps bottom navigation for Overview, Transactions, Add, Reports and Budgets. Chat and Profile remain reachable from the mobile header. No stored wallet balances, investments, shared spaces or multiple currencies were introduced.

All visual totals derive from the same valid confirmed sample records. Pending, rejected and invalid records stay out of totals. Transfers stay out of spending and income. Uncertain category values appear as Uncategorized. Exact money sums remain bigint; only bounded proportions become chart coordinates. Empty months and future days show their actual recorded state. Bill calendars use only active bills' explicit next due dates; they do not generate future occurrences.

## Verification

- Node 24: `pnpm check` passed, including 64 tests, workspace typechecks, Knip/Sherif and documentation checks. React Doctor scored 100 for both web and UI with no findings. Biome still reports the existing console warning in the unchanged PWA registration component.
- `pnpm --filter @monara/web build` passed. This builds the web app locally; it does not deploy or prove live provider operations.
- Browser interactions: day/category detail, empty September and return to October; confirming the Rp28,000 coffee expense changed spending from Rp397,490 to Rp425,490; confirming salary added Rp8,000,000 income; confirming the Rp500,000 transfer changed neither expense nor income. Bill navigation showed October's Telkomsel and November's Netflix; tracking Spotify added its November 10 date and changed November's scheduled total from Rp186,000 to Rp240,990.
- Desktop interaction checks used the T3 preview. Its viewport resize control timed out, so 390px and 320px visual layout checks used static copies of the rendered app DOM in browser frames. These checks validate responsive CSS and calendar sizing, not mobile touch or input behavior. Physical-device interaction and PWA installation remain outstanding.

The ledger, review decisions and bill suggestions remain synthetic and session-only. Reloading resets changes. Authentication, Gmail, Agent operations and durable financial writes still require their existing tracker handoffs. The external tracker was not edited, and nothing was committed, pushed or deployed.

Implementation: [app navigation](../apps/web/src/components/monara-app.tsx), [Overview](../apps/web/src/components/dashboard-screen.tsx), [Reports](../apps/web/src/components/reports-screen.tsx), [visuals](../apps/web/src/components/financial-visuals.tsx), [analytics](../apps/web/src/data/finance-analytics.ts), [ledger](../apps/web/src/components/transactions-screen.tsx), [budgets](../apps/web/src/components/budgets-screen.tsx), [bill calendar](../apps/web/src/components/bill-calendar.tsx), and [analytics boundary tests](../scripts/finance-analytics.test.mjs).

## Oyenza continuation — 13 October 2026

This pass continues the partially implemented Oyenza-inspired work against the current [PRD v2.1](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.pm2pb9a5y3zd) and [Action Tracker, updated 12 October](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg). F6 requires a clear spending number first, confirmed monthly summaries, budgets, pace, categories, recent records, and reminders. ER1 still explicitly requires light colour only, white/blue, with no global dark mode.

The ERD diagram, Brainstorm, and Reference Last Year were reviewed for context. Older Brainstorm ideas for imports without human review, automatically accepted budgets, WeChat, wealth/risk profiling, and crypto do not override the current PRD. The ERD's stored-balance/resource-ID differences still belong to the backend reconciliation. Only availability metadata was checked for the environment tab; configuration values were not read or reproduced, and no deployment configuration was verified.

| Tracker scope | Local continuation | Boundary |
| --- | --- | --- |
| ER6 — Dashboard | Landscape overview with morning/afternoon/evening/night atmosphere; exact spending first; relevant budget, review, bill, and comparison actions; current-versus-previous month lines; interactive donut; spending → category → merchant flow; Top places and Biggest expenses | Synthetic confirmed records only; ZO7 authenticated aggregates and User-timezone integration remain pending |
| ER10 — Demo polish and access | Direct graph hover/tap/keyboard cursor replaces separate scrubber bars; slice pop-out and press feedback; Pause/Play and reduced-motion support; category/place/day payments open canonical details | Physical phone, keyboard/touch, installation and live service recovery remain unverified |
| ER11 — Brand | Existing rounded lowercase wordmark and native Monara character paired with local scenery; consistent category colours across visuals | No added runtime animation library or unrelated product features |
| ER12 — Technical documentation | [UI/PWA draft](tech/ui.md) updated with source authority, implementation, tests, and Planned dependencies using the tech-doc skill | Draft pending owner review; external tracker was not edited |

[overview-hero.tsx](../apps/web/src/components/overview-hero.tsx) changes decorative scenery with the device clock while labelling the fixed sample financial date. The amount appears exactly and immediately; it does not count through temporary values. Character tips sit below the chat control and use the same recorded totals, budget state, pending count, or due bill. They are deterministic presentation, not an Agent response. “Open Monara chat” leads to a screen that states the Agent is unavailable before sending. A failed message stays in its field for retry.

[finance-analytics.ts](../apps/web/src/data/finance-analytics.ts) compares equal elapsed days for the current month and clamps February/shorter previous months. Completed months compare recorded totals. Missing prior expenses and future months have explicit comparison states. Added August/September history demonstrates the comparison using labelled synthetic data; it is not newly imported User data. Pending/rejected/invalid records and transfers remain excluded from expense/income aggregates.

[CategoryBreakdown](../apps/web/src/components/financial-visuals.tsx) uses the same selection for slices and category rows, with keyboard focus, a selected slice pop-out, and payment detail links. Graphs support direct pointer selection and Arrow/Home/End input without a separate progress slider. [spending-flow.tsx](../apps/web/src/components/spending-flow.tsx) traces actual recorded expenses instead of inventing income allocation or balances; desktop ribbons measure their HTML nodes, and mobile uses stacked controls. [spending-flow.ts](../apps/web/src/data/spending-flow.ts) merges same-name merchants across categories for Top places, retains canonical transaction identities, and sums with `bigint`. Full amounts remain in lists and accessible labels.

Verification for this continuation:

- `pnpm check` passed with **108 tests** and React Doctor **100/100** without findings. The Next.js web production build passed and generated all routes statically. These are local checks, not deployment or live-provider evidence.
- Development browser checks verified Top places → Netflix's canonical detail URL and Escape focus return. Adding a synthetic Rp10,000 Shopping/Cash expense for Netflix merged it with the Rp186,000 Digital/Jago expense into one Rp196,000/two-payment place; expansion disclosed both records, and the new payment opened its own detail URL.
- Chat disclosed the disconnected Agent before sending. A request returned an explicit error, produced no invented reply, changed no records, and retained the exact prompt for retry.
- Production browser verification of the final visual pass is in progress; the earlier 12 October checks above remain historical. Responsive layout copies do not establish actual phone touch, keyboard, or installation behavior.

The UI remains a session-only sample. No auth, Gmail, WhatsApp, durable financial operations, or Agent backend was implemented or claimed. No remote document edits, commits, pushes, or deployment were performed in this continuation.

## Visual pass across every tab — 13 October 2026

Re-checked against the exported PRD v2.1 and Action Tracker (12 Oct). F6 asks for income, spending, difference, remaining budget, pace, categories, recent records and Reminders; F9 asks for safe-to-spend and savings rate on the dashboard with the numbers they use; ER1 keeps the app light-only. Nothing below touches a Cut feature.

- **Overview:** three tiles replace the plain summary cards — Money in & out (striped in/out bars, savings rate or an explicit "No confirmed income yet"), Safe to spend today (remaining category budgets ÷ days left, with a two-ring pace gauge of budget used against month elapsed), and per-category budget rings. Eyebrow labels became a date chip with a Sample tag, "spent in October · N days to go", and an "Ask Monara" bar with a "Soon" status. The donut's faint outer ring is now a dotted guide circle; the selected slice gets a coloured outline arc instead of a halo, and dimmed slices no longer desaturate.
- **Transactions:** textured summary with a category share strip, pill type filters, calendar-chip date groups, and category-tinted row icons (shared by every list).
- **Reports:** summary with income, difference and the same-day comparison; icon section titles; Top places with medals and proportional fills.
- **Budgets:** half-circle gauge (arc = budget used, needle = month elapsed), category-coloured striped progress bars (F7 still requires a bar), and a clearer suggested-bill card that still needs the User's tap.
- **Chat and Profile:** the Monara character (extracted to [monara-mascot.tsx](../apps/web/src/components/monara-mascot.tsx)) greets the User; Chat keeps the explicit "Agent not connected" state and prompt tiles only fill the field. Profile rows gained icon badges; the sample-data notice moved to the sidebar and mobile header.

Verification: `pnpm check` passed (113 tests, React Doctor without findings) and `pnpm --filter @monara/web build` prerendered every route. Browser checks at 1440px and 390px showed no console errors or horizontal overflow; a hydration mismatch from unrounded gauge coordinates was found and fixed. Donut slice selection still opens the same payments as the list row. Nothing was committed, pushed, deployed or written to external documents.

**Follow-up (same day):** the User found the result too decorated. Section-title icon badges, decorative emoji (date, sample, chat prompts, settings rows, reminders), Top-place medals, dot textures, tinted gradients and striped fills were removed. What remains is information: charts, the budget gauge and rings, the category share strip, proportional Top-place fills, and merchant/category icons in record lists. `pnpm check` still passes (113 tests, React Doctor without findings) and the tabs load without console errors.


## Restrained visual refinement — 13 October 2026

The User clarified that the picture, mascot, and financial visualizations should remain; only the decoration should be toned down. The current pass keeps the landscape, income/expense bars, pace and category rings, smaller budget gauge, progress bars, category strip, trend/donut/calendar/cash-flow charts, spending flow, Top places and biggest-expense lists. Reports keeps its visualizations visible rather than hiding them behind a disclosure.

The shared mascot now matches the selected icon's simple white/cyan head, notched ear and two blue arch eyes. Overview, Chat and Profile use that same character, without extra facial features or looping animation. Exact amounts, plain section headings, quieter status labels and restrained selection motion keep the data readable. Chart controls wrap beneath their titles when space is limited. The narrow mobile header uses a smaller wordmark to retain all its actions at 320px.

These remain sample-data presentation changes. Authentication, providers and durable financial operations retain their existing handoffs. Nothing was committed, pushed or deployed.


Verification for the restrained refinement: `pnpm check` passed with 113 tests and React Doctor 100 for web and UI; the local Next.js production build passed. Desktop browser checks covered trend mode and arrow-key selection, donut category selection, canonical transaction details, Escape focus return, visible budget gauge, and Chat's unavailable error with its draft retained. Fresh preview diagnostics had no console errors. At 320px and 390px, rendered DOM copies of all six screens had no horizontal overflow and readable chart headings. The preview resize control timed out, so these narrow checks establish responsive layout only, not mobile touch, input, keyboard or installation behavior. The landscape was visually verified after correcting its layer order; all visualizations remain visible.
