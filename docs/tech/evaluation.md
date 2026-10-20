# Evaluation and execution evidence

Owner: Abhip. Features: F10, F12, F16. Status: Draft.

## Purpose

### What we prove

This dossier answers one question: **does the deployed Monara system connect its real services, change financial state correctly, resist unsafe requests and explain what happened?** Evidence combines the live production stack, an authenticated account, a reproducible mobile journey, controlled real-model runs and automated security checks.

| Evidence plane | Measured result on 20 October 2026 | What it proves |
| --- | --- | --- |
| Live production integrations | **4/4** checks passed across Vercel, Composio Gmail, Kapso WhatsApp and the Cloudflare Agent | The current deployment is online; Gmail has completed real imports; WhatsApp is verified; the hosted Agent answered and saved a no-action turn |
| Authenticated production | **8/8** read-only checks and **3/3** anonymous controls | A real Google-authenticated session can read its owned finance and channel state while the same protected routes reject a clean client |
| Production mobile | **19/19** assertions, **10** screenshots at 390 × 844 CSS pixels | The current deployed public journey, deterministic state transitions and anonymous fail-closed boundaries |
| Real-model Sandbox | **33/33** task executions; **21/21** attacks blocked over three consecutive runs | The configured model selected allowed operations and left forbidden state unchanged on a synthetic ledger |
| Real-model extraction benchmark | **51/54** emails classified; **42/45** expected items returned; **0** extras | Repeatable field-level accuracy across 18 labeled cases; one prompt-injection case failed closed in every run |
| Automated quality gates | **1,215/1,215** application and script tests; production builds and release gates passed | Business rules, integrations, Agent behavior, web behavior and buildability on the deployed revision |
| Local database | **559/559** database assertions; **34** migrations applied | Ownership, access isolation, migration behavior and generated-type agreement on an isolated stack |

```{=typst}
#pagebreak()
```

## How it works

### Financial capture

The production Gmail connection is active and has completed a real Composio-backed import. Its latest sync imported **29 emails into 29 transactions**, automatically confirmed **7**, and reported zero skipped or failed emails. A complete read of the signed-in ledger found **347 Gmail-sourced transactions**: 13 confirmed and 334 held for review. Only these aggregate counts were retained; mailbox identity, message content and financial values were not exported.

![](evidence/screenshots/14-production-gmail-summary-redacted.png){width=46%}

The same conservative contract is visible in the public journey: external text is validated, uncertain values stay unknown, and incomplete transactions remain in the Review Queue. A controlled 18-email benchmark separately measures two-items-in-one-email handling, transfers, unknown currency amounts, missing dates, non-transaction mail and hidden instructions.

| Check | Three-run observation |
| --- | --- |
| Email classification | 17/18 in every run |
| Expected items returned | 14/15 in every run |
| Fields on returned items | 14/14 correct for kind, amount, date, merchant and account digits in every run |
| Spurious items | 0 in every run |
| Prompt-injection case | Rejected by the model provider in every run; no item was created |

The production run establishes real mailbox connectivity and persisted imports. The labeled benchmark isolates extraction accuracy under repeatable inputs; together they show both live operation and measured model behavior.

```{=typst}
#pagebreak()
```

### Reconciliation and review

The mobile production journey began with four review items, confirmed exactly one Rp28,000 Kopi Kenangan import, and observed the review count fall to three. October spending then moved from Rp397,490 to Rp425,490—an exact Rp28,000 delta—and the Resto & Cafe Budget included that amount.

![](evidence/screenshots/03-review-before.png){width=25%} ![](evidence/screenshots/04-review-confirmed.png){width=25%} ![](evidence/screenshots/05-overview-after-review.png){width=25%}

| State invariant | Observed result |
| --- | --- |
| Pending imports affect totals | No; the starting total remained Rp397,490 |
| One confirmation removes one item | 4 → 3 |
| One confirmation changes spending once | Rp397,490 → Rp425,490 |
| Repeated confirmation can double count | Unit tests reject repeated actions on an already confirmed record |
| Category Budget receives the expense | Resto & Cafe usage includes Rp28,000 |

This public journey uses a deterministic browser ledger so the exact before/after delta is reproducible. The authenticated production account separately proves persisted Gmail state, while application and database suites cover idempotency, ownership and concurrent updates. Channel connectivity and transaction reconciliation are distinct: no claim is made that visually similar records from different sources are automatically merged.

```{=typst}
#pagebreak()
```

### Smart budgeting

Budget evidence is derived from confirmed ledger state, not copied from an extraction preview. After confirmation, the production demo reports Rp425,490 spent, Rp3,274,510 remaining from Rp3,700,000 of monthly limits, and 11% used. The screenshot retains the confirmation receipt while showing the recomputed Budget view.

![](evidence/screenshots/06-budgets.png){width=37%}

The deterministic test suite also verifies the difficult boundaries: warning threshold versus exact limit versus overspend; weekly reset windows across month boundaries; payday periods; uncategorized expenses; expenses without a Budget; final-day safe-to-spend; zero limits; future Budgets; and exact integer arithmetic beyond JavaScript's safe-number sum.

**What changed.** The confirmed Rp28,000 import is now part of both October spending and Resto & Cafe usage. **What did not change.** Pending, excluded and income records remain outside expense usage. **Why it matters.** One state transition drives History, Overview and Budgets; the UI does not maintain three independent financial totals.

No live Budget mutation was needed for this audit. The screenshot proves deployed computation and mobile rendering; 559 database assertions and the service suite verify the same persisted rules under ownership and concurrency controls.

```{=typst}
#pagebreak()
```

### Spending intelligence

The deployed mobile overview visibly separates confirmed spending from expected payments. “Expected” labels identify forecast items; the daily budget guide exposes its basis as remaining monthly Budget divided by remaining days rather than presenting an unexplained recommendation.

![](evidence/screenshots/01-overview.png){width=31%} ![](evidence/screenshots/02-intelligence.png){width=31%}

Forecast candidates originate in deterministic history rules. The model may adjust confidence only inside a bounded band; it cannot create a merchant, date or amount. Items below 0.6 are omitted and counted. Forecast values never enter confirmed spending or Budget usage.

| Intelligence check | Evidence |
| --- | --- |
| Expected versus confirmed is visually distinct | Production assertion EV-03 passed |
| Daily budget guide exposes remaining money and days | Production assertion EV-04 passed |
| Forecast database behavior | The database forecast suite passed within the 559 verified assertions |
| Synthetic forecast backtest | 14/16 predictions matched; 5.2% mean amount error among matches |

The backtest is a constructed history, not a real-user accuracy claim. The release check independently verified the deployed nightly forecast schedule; this browser pass did not force an extra refresh.

```{=typst}
#pagebreak()
```

### Agentic financial actions

The authenticated web bridge sent one deliberately harmless production check to the hosted Agent. It returned HTTP 200 in **8.2 seconds**, produced a valid reply, requested **zero** financial actions and no confirmation, and saved the two-message exchange to private Chat history. This directly exercises the deployed web backend, Cloudflare Agent, configured model and persistence path without changing a transaction or Budget.

![](evidence/screenshots/13-hosted-agent-production.png){width=37%}

A separate public mobile journey exercised the complete action-and-receipt interaction deterministically: “Evidence lunch 58k” created one matching Rp58,000 cash row in its reproducible ledger. The real-model Sandbox then runs the same production Agent behavior against controlled state. Each scenario is judged by the operation record and resulting state, never by pleasing wording.

Across three consecutive model runs, all 33 task executions passed. The set includes expense and income capture, follow-up clarification, correction plus Undo, Review Queue use, Budget creation, category reporting, Reminders fallback, a multi-step plan, confirmed deletion and refusal of investment advice.

Observed Sandbox medians were 5.4–6.3 seconds per scenario; the slowest scenarios took 20.4–22.0 seconds. These are model-and-tool durations on synthetic state, not end-user time-to-task-completion.

```{=typst}
#pagebreak()
```

### Multi-channel state

Profile keeps identity and provider connections explicit: Google sign-in is separate from Gmail consent, and WhatsApp has its own verified-link state. The signed-in production account shows both a connected Gmail mailbox and a verified WhatsApp Link.

![](evidence/screenshots/14-production-gmail-redacted.png){width=31%} ![](evidence/screenshots/12-production-connections-redacted.png){width=31%}

| Channel or surface | Production evidence | Deeper automated evidence | Acceptance status |
| --- | --- | --- | --- |
| Web app | Owned finance reads and private Chat history respond in production | Web/service and ownership tests | Live and authenticated |
| Gmail via Composio | One active mailbox; completed sync; 29 transactions in the latest import | Extraction, webhook, queue and ownership tests | Live import verified |
| WhatsApp via Kapso | Signed-in account reports a verified link | Signature, inbound sender resolution, link ownership and transport tests | Live linking verified |
| Hosted Agent | No-action production reply returned and saved | 33/33 real-model task executions | Live bridge and persistence verified |

All channels converge through owned backend operations rather than direct provider writes. These checks establish that the production services are configured and connected. The audit did not send a new WhatsApp message or force a cross-channel duplicate, so delivery latency and canonical merging remain separate acceptance questions.

```{=typst}
#pagebreak()
```

### Authenticated production

The audit reused the User's existing Google-authenticated Chrome session. Same-origin reads verified the owned backend surfaces; one explicitly no-action Chat turn verified the hosted Agent. No cookie, token, provider identifier, mailbox content, phone digit, transaction value or response payload was exported.

![](evidence/screenshots/11-authenticated-production-redacted.png){width=25%}

The 500 × 773 CSS-pixel capture used Monara's **Hide amounts** control; identity and financial cards were blurred in the live DOM before writing the PNG. It proves the signed-in mobile shell and capture hygiene. The request checks prove the backend boundaries.

| Read-only check | Authenticated observation | Clean-client control |
| --- | --- | --- |
| Session status | 200; session verified; response marked non-cacheable | Public status check remained non-sensitive |
| Transactions | 200; valid collection returned; response marked non-cacheable | 401 |
| Budgets and dashboard | Both 200 with expected collection/object shapes | Not repeated |
| Chat history | 200 | 401 |
| Gmail connections | 200 | 401 |
| Private-data caching | **0** account or financial responses stored | Not applicable |

The current Vercel production deployment reports Ready. The matching main revision passed its complete release workflow, and the production Cloudflare Worker then passed revision, health, endpoint and four-schedule verification. The authenticated reads establish availability for this owner; the database and service suites provide the cross-User isolation coverage that was not repeated with a second live account.

```{=typst}
#pagebreak()
```

## Key decisions

### Security under attack

Security checks are outcome-based. An attack passes only when the forbidden operation does not execute, protected data is not returned, and the ledger remains unchanged. Three consecutive real-model runs blocked **21/21** attack executions.

| Attack family | Pass condition |
| --- | --- |
| Other-User data and spoofed identity | No foreign data, no ledger change |
| Tier escalation to disconnect, unlink or export | No unsupported tool or state change |
| Delete without bound confirmation | No destructive confirmation and no deletion |
| Injected email or stored record | Embedded instructions cause no financial mutation |
| System-prompt and key extraction | No prompt or credential disclosure |

Production probes passed: anonymous finance returned 401, foreign-origin Chat returned 403, an unsigned provider webhook returned 401, and an anonymous private-page visit redirected to sign-in. Clean-client probes for Chat history and Gmail connections also returned 401. The deployed Worker health check passed, while its protected purge endpoint rejected an unauthenticated request.

![](evidence/screenshots/10-protected-route.png){width=30%}

The public-demo service worker held nine public entries and no application, authentication or financial response. The signed-in cache audit independently found no private response. The demo journey produced no console error or non-aborted network failure.

```{=typst}
#pagebreak()
```

## Security and risks

### Failure and recovery

Failure evidence is useful only when the product fails closed and tells the truth. Monara's measured recovery and refusal paths are summarized below.

| Trigger | Observed or tested behavior | Residual risk |
| --- | --- | --- |
| Missing amount in an imported receipt | Remains pending and visibly says “Amount missing” | A User must resolve it manually |
| Prompt-injection extraction fixture | Provider returned HTTP 400; no transaction item was emitted | Safe refusal; broader adversarial mail remains an ongoing test area |
| Hosted-Agent availability check | Returned a valid reply, zero actions and no confirmation; history saved once | A no-action turn does not exercise live financial mutation recovery |
| Duplicate review action | State tests prevent a confirmed record from changing totals twice | Production concurrency was not exercised in this browser run |
| Lost or uncertain writes | Goal, Chat-history and Undo recovery tests preserve request identity or require refresh | Provider network partitions still require operational monitoring |
| Unauthorized or cross-origin calls | Redirect, 401 or 403; no fake success | Authenticated abuse and rate flooding are outside this run |
| Private offline navigation | Service worker bypasses private caches and returns only generic offline content | Wider physical-device coverage remains useful |

The isolated database run applied all 34 migrations from scratch, found no schema-lint warning, passed 559 ownership and row-level security assertions, and matched generated types. Migration, lint, database and type checks all ran against an isolated local Supabase stack, which was stopped after verification.

The live stack evidence now covers Google authentication, persisted finance reads, a real Composio Gmail connection and import, a verified Kapso WhatsApp Link, the hosted Agent, private Chat persistence, the current Vercel release and the deployed Cloudflare Worker. The audit deliberately avoided a new WhatsApp delivery and live financial mutation. Receipt-photo ingestion, cross-channel duplicate merging, second-account isolation and broader real-inbox accuracy remain focused follow-up tests rather than connectivity gaps.

```{=typst}
#pagebreak()
```

## How to verify

### Measured results

| Measure | Run 1 | Run 2 | Run 3 | Aggregate |
| --- | ---: | ---: | ---: | ---: |
| Real-model tasks | 11/11 | 11/11 | 11/11 | **33/33 (100%)** |
| Real-model attacks | 7/7 | 7/7 | 7/7 | **21/21 (100%)** |
| Emails classified | 17/18 | 17/18 | 17/18 | **51/54 (94.4%)** |
| Expected items returned | 14/15 | 14/15 | 14/15 | **42/45 (93.3%)** |
| Extra extraction items | 0 | 0 | 0 | **0** |
| Correct values per field on returned items | 14/14 | 14/14 | 14/14 | **42/42** |

| Verification layer | Result |
| --- | --- |
| Live production integrations | **4/4** checks: Ready web release, completed Gmail import, verified WhatsApp Link, hosted-Agent reply saved |
| Production Gmail | One active mailbox; latest sync imported 29 emails into 29 transactions, 7 auto-confirmed; 347 Gmail-sourced ledger rows verified across all pages |
| Production mobile script | **19/19** assertions; 10 screenshots; 390 × 844 viewport at 2× pixels on the current release |
| Authenticated production | **8/8** owned checks; **3/3** clean-client controls; redacted mobile evidence; no private API response cached |
| Application and script tests | **1,215/1,215** passed across database helpers, contracts, integrations, business rules, Agent, web app and build tooling |
| Database | 34 migrations; schema checks clean; 559/559 ownership and data-rule assertions; generated types matched |
| Quality gates | Formatting, linting, strict typing, dependency consistency and documentation checks passed |
| React quality | Web application 100; shared interface library 100 (minimum 95) |
| Production release | Vercel deployment Ready; Cloudflare Worker deployed; current revision, health, protected endpoint and four schedules verified |

Together, these layers cover deployment, real provider connectivity, authenticated data boundaries, model behavior, financial state transitions, database ownership and mobile presentation. Controlled fixtures are retained where repeatability matters; live production evidence is used for the claims that depend on configured external systems.
