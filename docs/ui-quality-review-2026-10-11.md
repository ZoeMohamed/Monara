# Erdafa UI review — 11 October 2026

Owner: Erdafa / Daptek. Scope: ER1–ER12 presentation and supporting local gates. The UI uses synthetic data; backend integration remains pending. This review follows the explicitly requested Emil mobile/design/motion skills and Jakub's `better-interface` workflow.

| Area | Before | After |
| --- | --- | --- |
| Safe to spend | Clamping individual categories hid overspending and excluded unbudgeted expenses | Total monthly limits minus all confirmed expenses, one overall clamp, explicit shortfall and category formulas |
| Money summaries | Potential rounding while summing limits; long amounts could be clipped | Exact integer sums and wrapping summary values |
| Chat recovery | Unavailable service explained after sending; failed draft cleared | Preview limitation appears before composing; failed text remains available for retry |
| Navigation | New screen could retain old scroll and keyboard focus | Tab changes scroll to the top and focus the selected main landmark |
| Fields | Pale field boundary and a 40px chat input | At least 3:1 field-boundary contrast and 44px text input height |
| Demo lifetime | Session wording could imply persistence after navigating away | Explicit leave/reload reset disclaimer |
| Date validation | Manual/editor path imposed a future-date rule absent from shared validation | Both paths use the same accepted calendar-date validation |
| Reminder documentation | Snapshot could be confused with delivery or crossing history | Current eligibility only; both threshold crossings, rearming, dedupe and delivery remain backend work |

## Verified locally

- `pnpm check`: 64 passing tests, zero failures or skipped tests; React Doctor 100/100 with no findings for both `apps/web` and `packages/ui`; lint, typecheck, workspace/dead-code checks and documentation gate pass.
- `pnpm build`: Next.js production build and Cloudflare dry-run build pass. No deployment performed.
- Browser interactions: confirmed coffee adds Rp28,000 to spending; salary adds Rp8,000,000 income; transfer leaves spending unchanged; month switching reaches the empty state; bill tracking changes the session; Chat failure retains the draft; keyboard tab activation resets focus/scroll; transaction form Escape restores opener focus.
- Rendered-layout checks at 320px and 390px: Home, Transactions/Review Queue, Budgets, Chat, Profile, sign-in and Gmail fit without horizontal page overflow. Forms retain labelled 44px inputs. Header stays sticky; Chat composer remains above bottom navigation.
- Independent review found no blocking CI, service-worker cache-boundary, or documentation defects. The service worker excludes application HTML, API, auth and RSC requests from its cache.

The native browser resize command timed out. Narrow-width evidence comes from script-free copies of the actual DOM/CSS, while interactions were checked in the regular browser viewport. This does not establish mobile keyboard, notch, physical touch, installed-PWA or screen-reader behavior. Modal scrolling with the mobile visual viewport needs the same device check.

Known non-blocking tool warnings: the existing service-worker registration error log triggers Biome's console warning; Node's direct TypeScript test import reports unspecified package module type. React Doctor has no findings. Database replay/RLS verification is explicitly skipped until Zoe's schema exists; gate orchestration has boundary tests.

## Tracker and handoff

ER1–ER3 and ER11 are implemented locally and awaiting review. ER4–ER9 have presentation/sample-data behavior ready; live auth, Gmail, financial persistence, agent, bills and reminder delivery are pending. ER10 has its cache boundary verified locally and awaits phone installation/offline verification. ER12 remains **Draft**.

[UI backend handoff](ui-backend-handoff.md) defines the integration points for Zoe, Argya and Abhip. PRD already requires `rejected`; its addition is not an open product decision. Reconcile the ERD's resource IDs and missing entities in ZO3 rather than introducing UI-owned backend contracts.

Foundation checkpoint: **14 October, 20:00 WIB**. Technical draft: **16 October**. Phone/PWA verification: **18 October**. Competition deadline: **20 October, 22:59 WIB**.
