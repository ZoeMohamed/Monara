# Monara UI design system

Daptek owns `packages/ui`. The [11 October action tracker](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg) assigns ER1 to HeroUI installation, shared setup, and a white and blue light theme; ER2 to English UI; and ER3 to migrating UI components to HeroUI. [PRD v2.1](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.7t8u9nqsrfc) requires English-only product copy. Use English directly without introducing an i18n framework.

The prototype retains responsive navigation and session-only sample data. Supabase connection (ZO2), ERD (ZO3), and migrations/RLS (ZO4) belong to Zoe; migration validation (AB3) belongs to Abhip. See [the database workflow](supabase-workflow.md). Shared UI setup does not implement authentication or financial persistence.

The 11 October source review covered all six main-document tabs: PRD, Action Tracker, ERD, environment configuration, Brainstorm, and Reference Last Year, plus the linked registration workbook and competition rules. The PRD and refreshed tracker define the current scope. The ERD is an embedded diagram and requires visual inspection; its bigint resource IDs and stored account balances still need reconciliation with the PRD's UUID IDs and ledger scope. It also needs the processed Gmail message and WhatsApp Link entities required by ZO3. Those schema changes belong to the database work.

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

Change shared colors in [the theme](../packages/ui/src/theme.css), then use semantic tokens in new UI. Use white surfaces, blue actions, and pale cyan highlighted panels throughout the light-only interface. On 12 October the User approved `#3171FD` as the exact brand blue, the supplied SVG lockup for interface branding, and the supplied Apple artwork for installation and favicons. Use `#2865E5` for small blue text and buttons with white labels: the exact brand blue has only 4.28:1 contrast against white, while the darker action blue reaches 5.14:1. Graphical highlights and focus rings use the exact brand blue. See [asset provenance and icon sizing](../apps/web/public/icons/README.md). Reserve status colors for their meaning, and retain text labels alongside them.

| Purpose | Token | Monara color |
| --- | --- | --- |
| Canvas and text | `--background`, `--foreground` | `#f5fbff`, `#192d52` |
| Cards and fields | `--surface`, `--field-background` | White |
| Brand graphics and focus | `--brand`, `--focus` | `#3171FD` |
| Primary action and small blue text | `--accent`, `--link` | `#2865E5` |
| Soft accent and brand panels | `--accent-soft` | `#e2f4ff` |
| Secondary text and borders | `--muted`, `--border` | `#566b83`, `#dae8f3` |
| Input boundary and hover | `--field-border`, `--field-border-hover` | `#7b8da3`, `#6e829c` |

Use a visible label for each input; give icon-only actions an accessible name. Associate modal titles with their dialog, place initial focus intentionally, and verify Escape, focus containment, and focus restoration. Label progress bars and communicate pending/confirmed status with text as well as color. Preserve keyboard focus indicators, reduced-motion handling, and usable touch controls. Keep cards, navigation, and actions flat, with no decorative shadow/glow. HeroUI shadow tokens use `0 0 #0000` to preserve composed focus and invalid rings; select popovers use a border for separation.

Keep native document landmarks, headings, and SVG charts where they express the correct semantics. HeroUI primitives provide the component foundation; review the full composed interaction for accessibility.

## Typography and branding

Nunito Sans is the approved typeface for all interface text, headings, controls, and the standalone offline screen. It is distinct from Nunito. Local variable WOFF2 files provide normal and italic styles at weights 200 to 900; Next.js loads them through `next/font/local`, and the offline screen references the same public files directly. Browsers make no Google Fonts requests. The font license and source links live in [the font directory](../apps/web/public/fonts/README.md). Service worker v6 allowlists only those two public font paths in addition to the existing public assets; application HTML, auth responses, and financial data stay outside its caches.

The header, sidebar, and sign-in use the supplied blue `monara-lockup-light.svg` on the current light surfaces. The white `monara-lockup-dark.svg` is retained for dark surfaces, but no dark theme is introduced. Each lockup includes both the cat symbol and the Monara wordmark, so it replaces the separate symbol and text. Preserve the wordmark paths and proportions; Nunito Sans applies to interface text, while the supplied lockup artwork remains unchanged. Installed icons and favicons use the supplied Apple artwork rather than the interface lockup.

## Verification

Run `pnpm check` and `pnpm build` for shared dependency changes. React Doctor must report no findings and a score of at least 95 for the web app and shared UI. Browser checks should cover mobile and desktop navigation, transaction search/review/add, install guidance, keyboard modal behavior, English visible text and accessible labels, and the light theme under a dark system preference. Report these as prototype checks until live features are implemented.


## Sign-in and Gmail presentation

`/sign-in` and `/connections/gmail` use shared HeroUI controls and the light blue theme. Profile links to both routes and identifies its current identity as a demo profile. Google sign-in and Gmail authorization remain separate. Their route-level actions are disabled with an explanation until backend services exist. No fake session, mailbox, or successful operation is created.

`SignInScreen` accepts an explicit action, progress, and error state. `GmailConnectionsScreen` accepts loading, unavailable, sign-in-required, error, or ready presentation data, plus action callbacks. Ready data supports three-mailbox limits, reconnect status, sync progress/results, and disconnect confirmation. These local props are not transport contracts: validate and authorize provider/backend data before adapting it into them. The backend must enforce limits and ownership independently.

The v6 service worker caches only the standalone static offline fallback, manifest, named icons, and two public font files. Application navigation and Next.js chunks stay on the network; navigation failures show the generic fallback. It never caches app HTML or provides an offline financial ledger. Tests in `scripts/sw.test.mjs` cover the cache boundary and old-cache cleanup.

Verification on 11 October: full checks and builds passed; browser inspection covered the two unavailable routes and actual public cache contents. Synthetic connected, disconnect, mailbox-limit, sync-result and progress/error interactions have now been browser-verified. Live integration remains pending.


## Compact mobile layout and Review Queue

Mobile is the primary layout. Use 16px page gutters and card padding, compact section gaps and headings, and paired summary cards where text remains readable. Preserve a 44px minimum for buttons, text inputs and select controls. Input boundaries have at least 3:1 contrast against white; retain the blue keyboard focus ring. The user requested density similar to [Aiccountant](https://aiccountant.id/en), keeping Monara’s English light blue theme. Do not use desktop whitespace as the mobile baseline.

The Review Queue supports pending-only records, editing without confirmation, validated confirmation, explicit rejection, and incomplete-field flags. Demo summaries use confirmed expense/income records only and omit transfers. These are synthetic session interactions; backend ownership, persistence and rejected-email dedup remain required. See [the UI technical draft](tech/ui.md).

The 11 October review used script-free copies of rendered screens after native browser resizing timed out. On 12 October the collaborative browser successfully resized the interactive app to 390px and 320px. Home, Transactions, Budgets, and Chat had no horizontal overflow at either width; controls used the loaded Nunito Sans font, and the Chat composer cleared the taller bottom navigation. Physical device touch, keyboard-over-input, and installation behavior still need verification on a phone.

The 12 October branding pass passed `pnpm check` (72 tests, React Doctor 100 for both UI targets) and `pnpm build`. The existing service-worker registration console warning remains. A local production build registered service worker v6 and cached exactly the fallback, manifest, four public icons, and two public fonts. With that temporary server stopped, an uncached navigation rendered the generic offline fallback with Nunito Sans loaded from cache. Apple touch-icon metadata, favicon links, and manifest icon sizes/purposes were inspected; actual installation and installed-icon refresh remain unverified on physical devices.

## Mobile platform and motion

The explicitly requested [mobile-native](https://github.com/emilkowalski/skills/blob/main/skills/mobile-native/SKILL.md), [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md), and [find-animation-opportunities](https://github.com/emilkowalski/skills/blob/main/skills/find-animation-opportunities/SKILL.md) informed this pass. Frequent tab navigation is immediate, with no page-rise animation. HeroUI press feedback uses a 120ms transform transition; reduced motion removes movement transitions. Financial charts and numbers do not animate for decoration.

Controls use `touch-action: manipulation`; only controls suppress text selection. Coarse-pointer inputs remain at least 16px without disabling zoom. The viewport allows edge-to-edge safe areas and keyboard content resizing. Header, bottom navigation, page clearance, and modal padding account for safe-area insets. Bottom navigation reserves 16px plus the bottom safe-area inset, with main content clearance of 104px plus the inset and the Chat composer offset of 84px plus the inset. This adds space above iPhone and Android gesture handles even when the browser reports no inset. Browser chrome uses the light header color, matching the manifest. Device-specific input zoom, keyboard, hover/tap feel, notch, and installed-PWA behavior still require a real phone.

## Navigation and screen patterns

Mobile navigation follows Oyen and Aiccountant: Home, Transactions, a central Add button, Budgets, and Chat in the bottom bar. Profile and Reminders sit in the header. Desktop uses the sidebar with the same destinations. Keep a single headline number per screen, list rows inside one bordered card with separators, and secondary text in `--muted`.

Budget states use the semantic tokens with a text label: accent for on track, `warning` with "Near limit" from the Budget's warning percent, and `danger` with "Over budget" at 100%. Long amounts and names wrap rather than truncate unless the full value is one tap away (transaction rows open a detail sheet). Check 320px after layout changes. Unavailable services say what is missing and what still works; they never simulate a reply or a saved change.

Safe to spend uses total monthly budget minus all confirmed monthly expenses, including spending in categories without a budget. Clamp the overall remainder once at zero, show any shortfall, and divide by days remaining including today. Show each category's remainder and daily basis separately. Use exact whole-rupiah arithmetic. See [the backend handoff](ui-backend-handoff.md) for integration requirements.

Chat identifies its unavailable agent before sending and retains a failed draft for retry. Tab changes reset document scroll and move focus to the selected main landmark. The demo disclaimer explains that changes reset when leaving the app or reloading. Reminder cards are a snapshot of currently eligible warnings; delivery history, once-per-threshold deduplication, quiet hours, and WhatsApp delivery still belong to the backend.
