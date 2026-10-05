# Unified Financial Intelligence Agent

FIN is a mobile-first personal-finance PWA built with Next.js. This phase is frontend-only: no backend, Python, Docker, or database.

## Requirements

- Node.js 20.9+
- pnpm 10+

## Run locally

```bash
git clone https://github.com/ZoeMohamed/Unified-Financial-Intelligence-Agent.git
cd Unified-Financial-Intelligence-Agent
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
pnpm build
pnpm start
```

The build includes a manifest, 192px/512px/maskable/Apple Touch icons, app-shell caching, offline fallback, standalone metadata, and security headers.

## Production deployment

This repository is connected to the Vercel project `unified-financial-intelligence-agent` using the native GitHub integration:

- Root Directory: `apps/web`
- Production Branch: `main`
- Framework: Next.js
- Node.js: 24.x

Every merge or push to `main` updates production automatically. Pull requests and other branches receive preview deployments. Because this is a public repository under a personal GitHub account, collaborators can trigger deployments without rewriting commit authors or creating dummy commits.

Never put Vercel tokens, Deploy Hook URLs, or other secrets in the repository.

## Product scope

Transactions are demo data. Changes live only in browser state and reset on reload. Gmail, OAuth, sync, and persistent storage are intentionally not included yet.
