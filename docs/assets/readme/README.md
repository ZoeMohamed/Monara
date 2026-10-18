# README presentation assets

Public presentation assets for the root [README](../../../README.md). The direction follows the Azure sample READMEs: existing branding, useful badges, a product preview, and a concise architecture before developer setup.

## Branding and sources

- Brand blue: `#3171FD`; product font: Nunito Sans. Both come from the existing [UI design system](../../ui-design-system.md).
- The header uses one animated lockup, with the onboarding cat replacing the static cat beside the original Monara lettering. The lettering path is extracted unchanged from `apps/web/public/logos/monara-lockup-light.svg`.
- `monara-lockup-{light,dark}.gif` combine the real `import` scene in `apps/web/src/components/onboarding-avatar.tsx`, its CSS module, and `apps/web/src/data/avatar-geometry.ts` with that lettering. Each is 720 × 200 at 15 frames per second for 5.2 seconds. The light version has blue lettering; the dark version has white lettering. The cat retains its brand blue.
- Reduced-motion readers receive the existing full static lockup in the matching theme. The social-preview image also retains the full static lockup.
- The architecture is an HTML/SVG diagram rendered to PNG using the `canva-decking` approach. Its editable source lives in `src/architecture.html`; no Canva design is modified.
- `social-preview.png` is a 1280 × 640 GitHub sharing image using the current hook, existing wordmark, and the real Overview capture.

## Screenshot provenance

Captured on 18 October 2026 from the public deployment in T3's collaborative browser. The viewport was 390 × 844 CSS pixels, with 2× screenshot resolution. These are browser captures, not physical-device acceptance evidence.

| File | Route | State |
| --- | --- | --- |
| `screenshots/overview.png` | `/demo` | Onboarding dismissed with Escape; synthetic default finances |
| `screenshots/review.png` | `/demo/transactions?view=review` | Default pending entries; no transactions changed |
| `screenshots/budgets.png` | `/demo/budgets` | Default synthetic category budgets |
| `screenshots/chat.png` | `/demo/chat` | Clicked “Summarize my spending this week”; deterministic demo reply |

Base URL: `https://monara-finance.vercel.app`. Demo records use a fixed 11 October 2026 date. No personal account, Gmail mailbox, phone number, or live model call was used. Source screenshots are unchanged; `showcase.png` scales them into frames.

## Architecture evidence

The image summarizes source boundaries, not deployment acceptance or every HTTP exchange:

- `apps/web/src/lib/finance/service.ts`, `packages/core/src/finance.ts`, and `packages/core/src/supabase-finance-repository.ts`: owned backend operations and database repositories.
- `apps/web/src/app/api/agent/operations/[operation]/route.ts`: agent calls authenticate with the shared runtime bearer secret and carry a runtime-supplied User ID, rather than a Supabase session principal. Backend ownership filters protect these service-role operations; RLS does not apply to service-role database calls.
- `apps/web/src/app/auth/sign-in/route.ts` and `auth/callback/route.ts`: Supabase Google sign-in. Auth token exchange is summarized in the Supabase card.
- `apps/agent/src/conversation/agent.ts` and `backend.ts`: shared agent and authenticated backend calls.
- `apps/agent/src/gmail`, `apps/agent/src/merchant`, and `apps/agent/wrangler.jsonc`: durable email processing, merchant enrichment, and scheduled jobs.
- `apps/agent/src/whatsapp` and `packages/core/src/whatsapp-link.ts`: Kapso transport, verified linking, and per-User conversations.
- `apps/web/src/app/api/webhooks/composio/route.ts`: signed Composio events enter through Next.js before Gmail jobs are queued. The mail-read arrow is worker access to authorized mail, not a direct Gmail webhook into the worker.
- `apps/web/src/lib/whatsapp/budget-alerts.ts`: budget-alert sending is backend-owned. The worker's reminder cron requests deferred dispatch through the backend.

## Re-render

With Node.js 24, repository dependencies, Google Chrome, and FFmpeg installed:

```bash
node docs/assets/readme/render.mjs
```

The script renders the HTML assets with the existing `playwright-core` dependency and system Chrome, checks image loading and text clipping, and exports the actual onboarding component. Temporary animation frames are removed after GIF encoding. No app server, credentials, Canva connection, database, or external provider call is needed.

Re-capture screenshots through the product UI when it changes, then re-render. Preserve the real product appearance; do not fabricate transaction states or edit screenshot contents.

## Follow-up

Revisit the slogan, hook, and supporting subtitle after the newer feature set is ready. The current presentation intentionally keeps “No more scattered spending.” until that later wording pass.
