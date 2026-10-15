# Monara

Monara is a mobile-first personal-finance PWA built with Next.js. Visitors can explore an interactive demo before signing in. Signed-in screens load owned financial records and use the financial APIs for transactions, review, budgets, and financial accounts. The repository also includes Gmail connection lifecycle screens, an authenticated in-app Chat bridge, database migrations/RLS tests, and a Cloudflare Agent runtime. Implemented source does not establish deployed configuration or live-provider acceptance.

See [repository structure and team ownership](docs/repository-structure.md), [architecture decisions](docs/adr/0001-initial-runtime-boundaries.md), [UI design system](docs/ui-design-system.md), [Supabase workflow](docs/supabase-workflow.md), and [agent instructions](AGENTS.md).

## Requirements

- Node.js 24 (`.nvmrc`)
- pnpm 10+

## Run locally

```bash
git clone https://github.com/ZoeMohamed/Monara.git
cd Monara
corepack enable
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Explore sample finances at `/demo` without signing in. Personal financial routes require Google sign-in and load the User's records. Without valid public Supabase configuration, Monara shows an unavailable sign-in state and denies financial requests; failed ledger loads show a recovery screen. See the [Supabase workflow](docs/supabase-workflow.md) for local database setup and [environment configuration](docs/repository-structure.md#environment-configuration) for the empty templates and required settings.

## Test Gmail locally

Composio must reach the Gmail callback, so local Gmail testing runs the web app behind an ngrok tunnel. `pnpm dev:tunnel` starts only the tunnel, not the app. Run each command in its own terminal, from the same checkout:

```bash
pnpm dev          # 1. web app; wait for "Ready"
pnpm dev:tunnel   # 2. public HTTPS URL forwarded to the web app
pnpm dev:agent    # 3. agent worker that reads and extracts Gmail
```

Set `NGROK_DOMAIN` in `apps/web/.env.local` first, then open the app on that public URL, not on `localhost`. Each worktree uses its own web port; the tunnel forwards to it automatically. Port `4040` is ngrok's request inspector, not the app.

Monara uses two Composio projects:

| Composio project | Use | Gmail callback |
| --- | --- | --- |
| `monara_finance_dev` | Local development | `https://<your NGROK_DOMAIN>/api/gmail/connections/callback` |
| `monara_finance` | Production | `https://monara-finance.vercel.app/api/gmail/connections/callback` |

Local `.env.local` and `.dev.vars` use the `monara_finance_dev` API key and Gmail auth config ID. Never use the production project's keys locally.

## Test on another phone or laptop

Connect both devices to the same Wi-Fi. Find the computer's local IP, then open it on the other device:

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I
```

Open `http://YOUR_LOCAL_IP:3000`, for example `http://192.168.1.20:3000`.

If it does not load, allow Node.js/port `3000` through the computer firewall. `pnpm dev` already binds Next.js to the network interface.

## PWA install and offline test

Normal LAN HTTP is enough to preview the UI. Browser PWA install and service-worker offline behavior require `localhost` or HTTPS. For a real phone install test, use an HTTPS deployment. On iOS, use Safari → Share → Add to Home Screen.

## Verify before sharing

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

The web build includes a manifest, 192px/512px/maskable/Apple Touch icons, a standalone static offline fallback, standalone metadata, and security headers. The service worker caches only that fallback and explicitly allowlisted public assets; navigation remains network-first, and it does not cache app HTML, Next.js chunks, authentication, or financial responses. The agent build is a local Wrangler dry run and does not deploy anything.

## Deployment otomatis untuk tim

Versi sederhananya:

`Perubahan kode → masuk ke main → Vercel membangun aplikasi → website production diperbarui`

Yang perlu dilakukan anggota tim:

1. Kerjakan perubahan di branch masing-masing.
2. Push branch tersebut ke GitHub dan buat Pull Request.
3. Setelah diperiksa, merge Pull Request ke `main`.
4. Tunggu status **Vercel** di commit berubah menjadi hijau dengan tulisan **Deployment has completed**.

Push langsung ke `main` juga memicu deployment jika anggota tersebut memang memiliki izin push. Push ke branch selain `main` hanya membuat Preview Deployment dan tidak mengubah website production.

Anggota tim tidak perlu:

- memakai akun atau token milik Zoe;
- membuat dummy commit atau `vercel-sign.md`;
- menjalankan deploy secara manual;
- menjadi anggota berbayar di Vercel untuk repository public ini.

Konfigurasi yang sudah terhubung:

- Vercel Project: `monara`
- Root Directory: `apps/web`
- Production Branch: `main`
- Framework: Next.js
- Node.js: 24.x
- Production URL: <https://monara-finance.vercel.app>

Jika deployment gagal, buka status **Vercel** pada commit GitHub untuk melihat build log. Jangan pernah menyimpan token, Deploy Hook URL, atau secret lain di repository.

## Product scope

The UI uses shared HeroUI components and a light theme from `packages/ui`. The public demo uses labelled synthetic records, keeps edits in memory, and resets on reload. Personal financial screens use persisted records through owned UUID resources and exact IDR contracts. The live UI supports transaction creation and editing, review, deletion, budget management, and adding financial accounts. Reads and writes fail explicitly when the backend is unavailable; sample records are never substituted for failed personal ledger loads.

Database migrations, ownership/RLS tests, and generated types are present. `pnpm check` validates their prerequisites without Docker; `pnpm db:check --reset` replays and tests this checkout's disposable local database. Gmail authorization is separate from Google sign-in, and its screens load mailbox status and support connection and disconnection. Live Chat uses the authenticated bridge when the Agent runtime is configured; demo Chat uses sample answers. Automatic Gmail ingestion, live recurring bills, verified WhatsApp linking, persistent Reminder delivery, and device/PWA acceptance still need integration or acceptance evidence. See the [UI backend handoff](docs/ui-backend-handoff.md) for the current boundaries and remaining acceptance checks.
