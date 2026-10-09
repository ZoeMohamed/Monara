# Monara

Monara is a mobile-first personal-finance PWA built with Next.js. The UI currently uses sample data and browser state. The repository now includes scaffolding for a Next.js backend, Supabase, a Cloudflare agent, shared packages, and LLM experiments. Those integrations are not implemented or connected yet.

See [repository structure and team ownership](docs/repository-structure.md), [architecture decisions](docs/adr/0001-initial-runtime-boundaries.md), and [agent instructions](AGENTS.md).

## Requirements

- Node.js 20.9+
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

The web build includes a manifest, 192px/512px/maskable/Apple Touch icons, app-shell caching, offline fallback, standalone metadata, and security headers. The agent build is a local Wrangler dry run and does not deploy anything.

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

Transactions are demo data. Changes live only in browser state and reset on reload. The next implementation scope is Google sign-in, financial accounts, transaction tracking, dashboard, Gmail ingestion through Composio, and a WhatsApp agent through Kapso. Other features remain placeholders. See the architecture decision for the agreed runtime, review, and ownership boundaries.
