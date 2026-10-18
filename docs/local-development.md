# Local development

Start with the [README](../README.md) for the product tour. This guide covers local setup and the team's existing deployment workflow.

## Requirements

- Node.js 24 (`.nvmrc`) and pnpm 10+; the repository pins pnpm in `package.json`.
- Git.
- A running Docker-compatible runtime for the local Supabase backend. A demo-only preview does not need a database.

## Preview the demo

```bash
git clone https://github.com/ZoeMohamed/Monara.git
cd Monara
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Next.js, then `/demo`. All demo records are synthetic, edits live in browser memory, and reload resets them. Demo chat uses sample responses.

The main checkout defaults to web port `3000`. Linked worktrees receive isolated web, worker, inspector, and Supabase ports. Use the printed URL or `pnpm worktree:status` rather than assuming a port.

## Run the local backend

Start Docker or an equivalent runtime, then run:

```bash
pnpm worktree:bootstrap
pnpm dev
```

Bootstrap installs locked dependencies, prepares this checkout's ignored environment files and ports, starts its local Supabase stack, applies migrations, and verifies readiness. Run `pnpm dev:agent` separately when working on the agent. Existing local credentials survive repeat setup.

Google sign-in needs configured OAuth. Composio Gmail consent, Kapso WhatsApp, model access, and provider callbacks are separate integration requirements. Empty templates do not provide credentials. See [environment configuration](repository-structure.md#environment-configuration), the [Supabase workflow](supabase-workflow.md), and the [agent runtime](../apps/agent/README.md).

Without valid public Supabase configuration, sign-in is unavailable and financial requests are denied. Failed personal ledger loads show an explicit recovery state rather than sample data.

## Test Gmail locally

Composio must reach the Gmail callback, so local Gmail testing uses an ngrok tunnel. Set `NGROK_DOMAIN` in the ignored `apps/web/.env.local`, then run each command in its own terminal from the same checkout:

```bash
pnpm dev          # Web app; wait for Ready
pnpm dev:tunnel   # Tunnel to this checkout's web port
pnpm dev:agent    # Worker for Gmail jobs and extraction
```

Open the public ngrok URL. `pnpm dev:tunnel` starts only the tunnel, not the application. Port `4040` is ngrok's request inspector.

| Composio project | Use | Gmail callback |
| --- | --- | --- |
| `monara_finance_dev` | Local development | `https://<your NGROK_DOMAIN>/api/gmail/connections/callback` |
| `monara_finance` | Production | `https://monara-finance.vercel.app/api/gmail/connections/callback` |

Local `.env.local` and `.dev.vars` use the development project's API key and Gmail auth config ID. Keep production credentials separate. A successful local UI preview does not prove OAuth, webhook, queue, or delivery acceptance.

## Preview on another phone or laptop

Connect both devices to the same Wi-Fi. Find the computer's local IP:

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I
```

Open `http://YOUR_LOCAL_IP:WEB_PORT` on the other device, using this checkout's printed port. `pnpm dev` binds to the network interface. If the page does not load, check the firewall rule for that port.

LAN HTTP supports UI preview. PWA installation and service-worker behavior require `localhost` or HTTPS. For a real phone installation test, use an HTTPS deployment. On iOS, use Safari, then Share → Add to Home Screen.

The service worker caches only a standalone static offline fallback and explicitly allowlisted public assets. Navigation remains network-first; it does not cache personalized HTML, framework chunks, authentication, or financial responses.

## Verify changes

```bash
pnpm check
pnpm build
pnpm start
```

`pnpm check` runs the source quality gates and database prerequisites. It does not replay migrations. `pnpm db:check --reset` replays and tests a disposable local database; read the [database workflow](supabase-workflow.md) before using that reset flag. The agent build is a local Wrangler dry run and does not deploy.

## Team deployment workflow

The connected web deployment follows this sequence:

`Changes merged into main → Vercel builds the app → production is updated`

1. Work on a feature branch and open a pull request.
2. Review checks and merge the approved change into `main`.
3. Wait for the Vercel deployment status to report completion, then verify the live application.

Direct pushes to `main`, when permitted, also trigger the connected production deployment. Other branches create preview deployments. Team members do not need another person's account or token, dummy commits, or manual deployment solely to trigger the existing integration.

| Setting | Connected value |
| --- | --- |
| Vercel project | `monara` |
| Root directory | `apps/web` |
| Production branch | `main` |
| Framework / Node.js | Next.js / 24.x |
| Production URL | <https://monara-finance.vercel.app> |

If a deployment fails, open its GitHub Vercel status to inspect the build log. Worker deployment is separate from the web deployment. Never commit tokens, deployment hooks, or other secrets. These instructions describe the workflow; they do not authorize deployment or external provisioning.
