# Monara UI design system

Daptek owns `packages/ui`. The [Action Tracker reviewed on 14 October](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg) assigns ER1 to HeroUI installation, shared setup, and a white and blue light theme; ER2 to English UI; and ER3 to migrating UI components to HeroUI. [PRD v2.1](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.7t8u9nqsrfc) requires English-only product copy. Use English directly without introducing an i18n framework.

The public `/demo` routes use synthetic browser state and require no sign-in. Protected financial routes load owned records through the implemented backend and display a recovery screen if loading fails; they never substitute demo records. Google sign-in and server identity checks remain separate from Gmail consent. Supabase connection (ZO2), ERD (ZO3), and migrations/RLS (ZO4) belong to Zoe; migration validation (AB3) belongs to Abhip. The [database workflow](supabase-workflow.md) and [backend handoff](ui-backend-handoff.md) distinguish source integration from live-provider acceptance.

Earlier source reviews covered the main-document tabs, registration workbook, and competition rules. PRD v2.1 and the Action Tracker remain authoritative for scope. The repository now has the accepted [ERD](erd.md), UUID-owned schema, processed Gmail messages, WhatsApp Links, migrations/RLS tests, and generated database types. Older notes about missing schema or bigint resource IDs are historical; live integration must use the current shared contracts. Environment values are never copied into documentation.

## Current implementation checkpoint — 14 October 2026

The live tracker was refreshed again on 14 October; its header remains dated 12 October. In the external tracker ER1–ER3 and ER11 are Done, ZO1–ZO8 are Done and ZO9 is Not started; ER4–ER10 and ER12 are still listed In progress. The pull request for `feat/unified-finance-experience` puts the UI rows below **In review** in the repository. ER9 stays In progress because verified WhatsApp linking, saved preferences and Reminder delivery are not built. The external tracker was not edited; its owners update it after review, and no deadline changed.

| Tracker row | Repository status | Implemented presentation | Remaining acceptance / deadline |
| --- | --- | --- | --- |
| ER1–ER3, ER11 | Done | HeroUI 3.2.6 setup and light theme, English product copy, migrated controls, user-selected cat logo | Submission packaging for the logo. |
| ER4 | In review | Google sign-in, public demo, profile/sign-out, authenticated Gmail lifecycle adapter | Live OAuth/reconnect evidence and ingestion/Sync Now results. 14 Oct. |
| ER5 | In review | Owned ledger loading, transaction operations, Financial Account setup and category renaming; demo review/Undo remains isolated | Live-session ownership/concurrency acceptance and durable ingestion/deduplication evidence. 15 Oct. |
| ER6 | In review | Complete owned ledger feeds confirmed-only summaries, Reports and UUID-based category drilldowns/current names; dashboard contract is validated | Live aggregate comparison and User-timezone acceptance. 15 Oct. |
| ER7 | In review | Authenticated `/api/chat` bridge, shared mutation/recovery gate, structured receipts/confirmation, demo assistant and failed-draft retention | Agent/backend operation compatibility, durable turn idempotency/status and live scenario acceptance. 15 Oct. |
| ER8 | In review | Live budget create/edit/pause/delete, explicit weekly/monthly usage periods, budget bars/gauge and demo bill-confirmation/calendar | Persistent budget/ownership acceptance; live bill management and detection are not built. 16 Oct. |
| ER9 | In progress | Backend dashboard reminders and explicit unavailable WhatsApp/preference controls | Verified link UI, saved settings and actual Reminder delivery. 16 Oct. |
| ER10 | In review | Public-only PWA caching, OYenza-inspired mobile layout, glass navigation and toast, the same Home composition on desktop, demo and guided tour | Real-phone installation, touch/keyboard and service recovery evidence. 18 Oct. |
| ER12 | In review | Updated UI technical draft and backend handoff | Owner review/final documentation acceptance; the technical section stays Draft until then. 16 Oct. |

## Shared setup

`packages/ui` owns the pinned `@heroui/react` and `@heroui/styles` dependencies, both `3.2.6`. Import shared primitives through `@monara/ui`; add any additional HeroUI exports there when a feature needs them. Business writes, identity checks, and provider credentials belong to the backend.

HeroUI v3 uses CSS theme variables and needs no `HeroUIProvider`. Monara applies `className="light"` and `data-theme="light"` to the HTML root, with `color-scheme: light` and the existing light viewport setting. This satisfies the tracker's shared setup requirement using the current library API. [HeroUI: CSS theme setup](https://heroui.com/en/docs/react/getting-started/dark-mode).

The existing React Aria `I18nProvider`, exported through HeroUI and `@monara/ui`, fixes accessibility labels and number announcements to `en-US` regardless of browser language. It supplies a locale for the components; product copy stays direct English.

The web stylesheet imports Tailwind first, then the shared theme:

```css
@import "tailwindcss";
@import "@monara/ui/theme.css";
```

The shared theme imports HeroUI styles and overrides its tokens in `@layer base`. Keep this order when extending the setup. [HeroUI: quick start](https://heroui.com/en/docs/react/getting-started/quick-start), [theming](https://heroui.com/en/docs/react/getting-started/theming).

```tsx
import { Button, Card } from "@monara/ui";

<Card>
  <Card.Content>
    <Button onPress={openForm}>Add transaction</Button>
  </Card.Content>
</Card>
```

Use compound components such as `Card.Content`, `Modal.Dialog`, and `ProgressBar.Track` following the installed v3 API. Use `onPress` for HeroUI Button actions. Keep page layout and feature state in `apps/web`; shared primitives stay reusable.

## Color and interaction conventions

Change shared colors in [the theme](../packages/ui/src/theme.css), then use semantic tokens in new UI. Use white surfaces, blue actions, and pale cyan highlighted panels throughout the light-only interface. On 12 October the User approved `#3171FD` as the exact brand blue, the supplied SVG lockup for interface branding, and the supplied Apple artwork for installation. Website favicons use the separate blue cat symbol. Use `#2865E5` for small blue text and buttons with white labels: the exact brand blue has only 4.28:1 contrast against white, while the darker action blue reaches 5.14:1. Graphical highlights and focus rings use the exact brand blue. See [asset provenance and icon sizing](../apps/web/public/icons/README.md). Reserve status colors for their meaning, and retain text labels alongside them.

| Purpose | Token | Monara color |
| --- | --- | --- |
| Canvas and text | `--background`, `--foreground` | `#f5fbff`, `#192d52` |
| Cards and fields | `--surface`, `--field-background` | White |
| Brand graphics and focus | `--brand`, `--focus` | `#3171FD` |
| Primary action and small blue text | `--accent`, `--link` | `#2865E5` |
| Soft accent and brand panels | `--accent-soft` | `#e2f4ff` |
| Secondary text and borders | `--muted`, `--border` | `#566b83`, `#dae8f3` |
| Input boundary and hover | `--field-border`, `--field-border-hover` | `#7b8da3`, `#6e829c` |

Use a visible label for each input; give icon-only actions an accessible name. Associate modal titles with their dialog, place initial focus intentionally, and verify Escape, focus containment, and focus restoration. Label progress bars and communicate pending/confirmed status with text as well as color. Preserve keyboard focus indicators, reduced-motion handling, and usable touch controls. Standard cards and desktop controls remain flat. The User's 14 October mobile direction permits restrained shadows and backdrop blur on floating glass controls; the landscape moves with scrolling only when supported and reduced motion is disabled. HeroUI shadow tokens use `0 0 #0000` to preserve composed focus and invalid rings; select popovers use a border for separation.

Keep native document landmarks, headings, and SVG charts where they express the correct semantics. HeroUI primitives provide the component foundation; review the full composed interaction for accessibility.

## Typography and branding

Nunito Sans is the approved typeface for all interface text, headings, controls, and the standalone offline screen. It is distinct from Nunito. Local variable WOFF2 files provide normal and italic styles at weights 200 to 900; Next.js loads them through `next/font/local`, and the offline screen references the same public files directly. Browsers make no Google Fonts requests. The font license and source links live in [the font directory](../apps/web/public/fonts/README.md). Service worker v7 allowlists only those two public font paths and the blue SVG favicon in addition to the existing public assets; application HTML, auth responses, and financial data stay outside its caches.

The desktop sidebar and sign-in use the supplied blue `monara-lockup-light.svg` on light surfaces. The mobile Home header uses a compact profile/space control, date and Reminder button, with no Monara wordmark; other mobile screens use their own concise page title. The white `monara-lockup-dark.svg` remains available for dark surfaces, but no dark theme is introduced. Preserve the wordmark paths and proportions; Nunito Sans applies to interface text, while the supplied lockup artwork remains unchanged. Installed PWA icons use the supplied Apple artwork. Website favicons use the blue `logo-light.svg` cat mark, with PNG and ICO fallbacks derived from that same SVG. Browser icon links do not point to the installed-app artwork; Apple touch-icon metadata and manifest icons remain separate.

## Verification

Run `pnpm check` and `pnpm build` for shared dependency changes. React Doctor must report no findings and a score of at least 95 for the web app and shared UI. Use a mobile viewport for browser checks, including navigation, transaction search/review/add, install guidance, keyboard modal behavior, English visible text and accessible labels, and the light theme under a dark system preference. Distinguish demo interactions, mocked adapter checks, authenticated backend acceptance and real-provider evidence in the report.

## Sign-in and Gmail presentation

`/sign-in` uses the approved landscape/card composition, October preview and the tagline “A little clarity. More room to live.” It presents Google sign-in and a public demo entry. The finance layout supplies sanitized identity to Profile and loads owned financial records; failed loading opens `FinanceUnavailable`, with retry and sign-out options. `/demo` uses the same screens with session-only synthetic records. The shared `DemoIndicator` labels the experience once in the mobile space control, mobile Chat header or desktop sidebar; reset behavior is available to assistive technology and in its tooltip. The quick tour waits for streamed Home targets before opening its native modal and explains confirmed totals, review, asking Monara and adding a payment. Next/Back/Skip and Profile replay are available; completion and hidden-amount settings store presentation flags only.

`SignInScreen` submits the validated return path through `/auth/sign-in` and displays callback errors. `GmailConnectionsClient` connects `/connections/gmail` to validated list/connect/reconnect/disconnect APIs, preserves the server's mailbox limits, and reloads state after returning from external consent. `GmailConnectionsScreen` renders loading, unavailable, sign-in-required, error and ready states. Sync progress/count props remain presentation support: the current client has no ingestion/sync API and keeps Sync Now unavailable rather than inventing results. Provider configuration and live OAuth/reconnect acceptance remain separate.

The v7 service worker caches only the standalone static offline fallback, manifest, named PWA icons, the blue SVG favicon, and two public font files. Application navigation and Next.js chunks stay on the network; navigation failures show the generic fallback. It never caches app HTML, auth responses, or financial records, and it does not provide an offline financial ledger. Tests in `scripts/sw.test.mjs` cover the cache boundary and old-cache cleanup.

Verification on 11 October: full checks and builds passed; browser inspection covered the two unavailable routes and actual public cache contents. Synthetic connected, disconnect, mailbox-limit, sync-result and progress/error interactions have now been browser-verified. Live integration remains pending.

## Compact mobile layout and Review Queue

Mobile is the primary layout. OYenza informs the full-width hero composition, compact spacing, overlapping content sheet and concise feature cards. Monara uses its own landscape, blue palette and simple white/cyan mascot head with no paws or legs. Home leads with greeting, exact spending and Ask Monara rather than a redundant Overview heading. The mascot sits just above the composer edge. Floating glass navigation has equal Home, History, Reports, Budgets and Add controls; Chat opens from the composer and Profile from the compact space control. Keep 20px mobile gutters in the new shell, concise section labels, and 44px controls. Input boundaries and keyboard focus remain visible. Supported scroll timelines create subtle parallax; reduced motion removes it.

The Review Queue supports pending-only records, editing without confirmation, validated confirmation, explicit rejection, and incomplete-field flags. Confirmed expense/income records feed summaries; transfers are excluded. Protected routes use validated financial operations, owned account/category IDs, expected versions and create-request IDs. Demo routes retain session-only Undo and resets. Persistent Undo and duplicate-safe Gmail ingestion remain separate backend acceptance items. See [the UI technical draft](tech/ui.md).

Use a portrait 390 × 844 CSS pixel viewport for UI development, previews, verification, and screenshots; include 320px when checking narrow layouts. Current browser checks used the actual hydrated app in a same-origin mobile iframe after native T3 viewport resizing repeatedly timed out. Synthetic fixtures verified account and budget operations/recovery, plus category validation, duplicate-click suppression, current labels and refresh without replay after a dropped rename. Structured Chat View links, exact `no`/`yes` and duplicate-confirmation blocking were verified. A fresh visit verified the tour's native `:modal`, Next focus, Next/Back/Skip, saved completion and main-focus return. Earlier script-free frames remain layout evidence only. Physical-device touch/keyboard/installation, native keyboard containment/Escape through the iframe host, live authentication and configured providers remain unverified; `pnpm check` and `pnpm build` passed on Node 24.21.0: 325 tests, no React Doctor findings, and scores of 100 for web and shared UI. Documentation and local migration validation passed; no database stack was started. The temporary verification route was removed before the final build.

Recorded upstream verification: the 11 October review used script-free copies of rendered screens after native browser resizing timed out. On 12 October the collaborative browser successfully resized the interactive app to 390px and 320px. Home, Transactions, Budgets, and Chat had no horizontal overflow at either width; controls used the loaded Nunito Sans font, and the Chat composer cleared the taller bottom navigation. Physical device touch, keyboard-over-input, and installation behavior still need verification on a phone.

The upstream 12 October branding pass passed `pnpm check` (72 tests, React Doctor 100 for both UI targets) and `pnpm build`. The existing service-worker registration console warning remains. A local production build registered service worker v6 and cached exactly the fallback, manifest, four public icons, and two public fonts. With that temporary server stopped, an uncached navigation rendered the generic offline fallback with Nunito Sans loaded from cache. Apple touch-icon metadata, favicon links, and manifest icon sizes/purposes were inspected; actual installation and installed-icon refresh remain unverified on physical devices.

## Mobile platform and motion

Earlier passes used the explicitly requested mobile-native, emil-design-eng, and find-animation-opportunities references. The latest User direction keeps the landscape, mascot, and financial visualizations while reducing decorative detail. Overview is one composition at every width: the landscape hero with greeting, exact spending and Ask Monara, a quiet-chip row, prompts, “Where it went” category rows with budget bars, a Today card and feature cards. Income/expense bars, the two-ring pace view and category rings live in Reports and Budgets. Budgets retains its smaller semicircle gauge and progress bars; Reports keeps every financial chart visible. Use plain section headings, quiet summary labels, and flat surfaces. Keep exact amounts immediate and explain chart marks in visible text or accessible labels.

The [Overview landscape](../apps/web/public/scenes/overview-landscape.webp) is an existing static asset with progressive scroll parallax in the mobile presentation. The device clock changes the greeting only; the demo financial date remains fixed. The shared [Monara mascot](../apps/web/src/components/monara-mascot.tsx) preserves its simple white/cyan head, notched left ear and two blue arch eyes, with no paws or legs and a finite entrance on the mobile composer. Reduced motion removes parallax and transitions. Chart selection keeps visible keyboard focus, and exact amounts do not count through temporary values. HeroUI press feedback remains short. Section titles from [visual.tsx](../apps/web/src/components/visual.tsx) have no decorative emoji or icon badges. Colour identifies categories, budget states and chart marks.

Controls use `touch-action: manipulation`; only controls suppress text selection. Coarse-pointer inputs remain at least 16px without disabling zoom. The viewport allows edge-to-edge safe areas and keyboard content resizing. Header, floating bottom navigation, page clearance and modal padding account for safe-area insets. Main content reserves 112px plus the bottom inset; mobile Chat fills its own sheet with a bottom composer. Browser chrome uses the light header color, matching the manifest. Device-specific input zoom, keyboard, hover/tap feel, notch and installed-PWA behavior still require a real phone.

## Navigation and screen patterns

Mobile navigation has five equal-size items: Home, History, Reports, Budgets and Add. The glass capsule uses a moving selected background; Add opens the transaction form and never becomes the selected page. Home's Ask Monara control and prompts open Chat, which has its own close/new-conversation actions. Home's space control opens Profile, and the bell opens Reminders. Reports remains in the desktop sidebar and is reachable from financial summary links. Destinations use real route links, browser history and direct URLs. Shared layout state retains demo changes during navigation. Keep one headline amount per screen, quiet summary labels and secondary text in `--muted`.

Desktop (1024px and wider) reuses the mobile Home components rather than a second design. The hero becomes a rounded landscape card with its content held to the left; prompts and chips wrap instead of scrolling; “Where it went” and the Today and feature cards sit in two columns on the page canvas. The sidebar is a floating panel using the same glass recipe as the mobile navigation, with the soft selected background, an ink Add button and the Demo or Private ledger status above it. The month is chosen from the category block, as on mobile. Page titles share one size and weight (32px extra bold) at every width. Cards and lists keep at least 20px of inner padding so text never crowds a rounded corner, and headline remainders such as “Remaining in category budgets” are extra bold.

Transient confirmations use one toast. It is a dark glass capsule with a green check, the message, Undo when the action can be reversed, and Dismiss. On desktop it rises from the bottom-right corner; on mobile it floats centered just above the glass navigation, within thumb reach and clear of the Home header. It leaves after 5 seconds, or 9 when it offers Undo, and holds while hovered or focused. The live region stays mounted so each message is announced, and reduced motion removes the entrance and exit. Persistent problems such as offline or a failed refresh stay as inline alerts, not toasts.

Budget states use semantic tokens with text labels: accent for on track, `warning` with “Near limit” from the Budget's warning percent and “At limit” at 100%, and `danger` with “Over budget” above the limit. Long amounts and names wrap rather than truncate unless the full value is one tap away (transaction rows open a detail sheet). Check 320px after layout changes. Unavailable services say what is missing and what still works; they never simulate a reply or a saved change.

Live `BudgetManager` uses validated operations for create, edit, pause and delete. Its category picker uses owned UUIDs, the period control offers weekly/monthly, and warning defaults to 80%. Each progress row uses the exact backend period and decimal-string money, preserving at-limit and excess labels. Home's feature card says “Monthly budgets” because its summary uses monthly limits. `FinancialAccountSetup` creates bank, wallet and cash entries and lists owned accounts. Both keep submitted values and create-request IDs during uncertain recovery; successful refresh precedes another write. The shared financial mutation mutex also blocks writes during selected-month loading.

Profile's `CategoryManager` renames owned categories with reviewed versions and validates the returned UUID/name. Empty names are rejected before a request. Uncertain results lock fields until refreshed; an observed matching rename closes recovery without replay. Live grouping and category drilldowns use UUIDs rather than names, so equally named categories remain separate and current names follow snapshot refresh. Demo categories continue to use their synthetic names.

Safe to spend uses total monthly budget minus all confirmed monthly expenses, including spending in categories without a budget. Clamp the overall remainder once at zero, show any shortfall, and divide by days remaining including today. Show each category's remainder and daily basis separately. Use exact whole-rupiah arithmetic. See [the backend handoff](ui-backend-handoff.md) for integration requirements.

Live Chat calls the authenticated `/api/chat` bridge through the shared financial mutation/recovery gate and preserves failed drafts. A lost or unverifiable response triggers one reconciliation read without replaying the Agent request; pending or failed refresh blocks further Agent requests. Verified replies/receipts remain visible when their subsequent refresh fails. The latest user message or error closes older Yes/Cancel controls. Credentials and identity come from the backend, and shared schemas validate requests/replies. Durable client-turn idempotency/status is not implemented, so a timed-out server action may still finish later. The demo assistant writes only demo browser state. Screen changes move focus to the main landmark. Live Reminder cards use the dashboard; demo cards derive sample snapshots. Full delivery history, quiet hours and WhatsApp delivery remain backend integration work.
