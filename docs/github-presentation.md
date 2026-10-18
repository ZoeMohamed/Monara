# GitHub presentation

Prepared metadata for `ZoeMohamed/Monara`, alongside the refreshed [README](../README.md). Applying repository settings is separate from committing these assets.

On 18 October 2026, the authenticated account had push access but no admin or maintain access. GitHub's General settings page reported “You don't have access to repository options,” and the description update API request was rejected. Description, topics, and social-preview settings remain unapplied; a repository owner or administrator needs to apply them.

## About

Description:

> An AI personal-finance assistant for tracking spending, reviewing transactions, and managing budgets.

Website, already configured:

<https://monara-finance.vercel.app>

Topics:

```text
personal-finance, expense-tracker, budgeting, ai-agent, pwa, nextjs, typescript, supabase, cloudflare-workers, gmail, whatsapp, fintech
```

Topics describe repository capabilities and technologies; they do not establish live-provider acceptance. The README badges link to the actual CI workflow and source areas.

An administrator can apply the description and topics with:

```bash
gh repo edit ZoeMohamed/Monara \
  --description 'An AI personal-finance assistant for tracking spending, reviewing transactions, and managing budgets.' \
  --add-topic personal-finance,expense-tracker,budgeting,ai-agent,pwa,nextjs,typescript,supabase,cloudflare-workers,gmail,whatsapp,fintech
```

## Social preview

Use [`assets/readme/social-preview.png`](assets/readme/social-preview.png) in GitHub repository Settings → General → Social preview. Its editable source and rendering instructions are in the [asset guide](assets/readme/README.md).

## Deferred copy update

Revisit the slogan, hook, and supporting subtitle when the newer features are ready. Keep the current “No more scattered spending.” hook for this refresh.
