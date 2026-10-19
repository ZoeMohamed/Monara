# Technical documentation

This is the technical documentation for the FinTechathon 2026 submission, versioned beside its source. The authorized [PRD v2.1](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.pm2pb9a5y3zd), refreshed on 19 October, defines F1 to F16. The repository calls spending forecast F17; it is an implemented extension, not a feature specification found in that PRD. Goals and permanent User deletion are also implemented extensions. Their inclusion here describes source behavior and does not rewrite product requirements. The [Action Tracker](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg) still says 16 October; [Brainstorm](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.0) is historical context.

## Source freeze and remaining review

All seven technical sections describe parent [#85](https://github.com/ZoeMohamed/Monara/pull/85), branch `praya/submission-handoff-context`, at **`e74524752c538ca8866295c91bdc456e17842eb3`**. This 19 October reconciliation checks source, ordered migrations and test assertions. It does not establish deployed provider configuration or fresh browser/live acceptance. Source links in the generated PDF target GitHub main for the eventual integrated submission; the SHA here identifies the actual reviewed implementation.

At inspection, main `cce75b944416585a8b073bbdcdb164e37d119f03` contains [#89](https://github.com/ZoeMohamed/Monara/pull/89), which is absent from the frozen parent. The parent requires extraction confidence **0.95** through `public.gmail_auto_confirm_confidence()` plus classification confidence **0.95**. #89 lowers the extraction gate to **0.5** and changes confidence fallback/import recovery. Owner integration and another policy check are required before final submission; this docs branch does not merge it. The separate security assessment already distinguishes its newer-main observations.

Overlaps inspected, all still open: owner drafts [#65 Agent](https://github.com/ZoeMohamed/Monara/pull/65) and [#73 extraction](https://github.com/ZoeMohamed/Monara/pull/73); product work [#74 receipt/voice](https://github.com/ZoeMohamed/Monara/pull/74), [#78 transcription](https://github.com/ZoeMohamed/Monara/pull/78), [#75 extraction hardening](https://github.com/ZoeMohamed/Monara/pull/75), [#77 recurring bills](https://github.com/ZoeMohamed/Monara/pull/77), [#82 planning/recovery](https://github.com/ZoeMohamed/Monara/pull/82), and [#91 forecast refresh](https://github.com/ZoeMohamed/Monara/pull/91). Their changes and review statuses were not adopted as frozen-tree behavior. Section owners must reconcile concurrent drafts through review of this child PR. No owner sign-off is claimed or external tracker changed.

## What the competition asks for

The rules list three separate deliverables here, so they are built as three PDFs from the files below.

| PDF | Required part | Files |
| --- | --- | --- |
| Technical Documentation | System architecture | [architecture.md](architecture.md), [ui.md](ui.md) |
| | Core algorithm description | [extraction.md](extraction.md), [agent.md](agent.md), [reminders.md](reminders.md), [forecast.md](forecast.md) |
| | Security design | [data-and-security.md](data-and-security.md) |
| Security Self-Assessment | Permission tiers and known-risk list | [security-self-assessment.md](security-self-assessment.md) |
| Execution Evidence | Sandbox logs and measured results | [evaluation.md](evaluation.md) |

## Sections, owners, and status

| File | Owner | Due | Status |
| --- | --- | --- | --- |
| [architecture.md](architecture.md) | Abhip | 16 Oct | Draft |
| [data-and-security.md](data-and-security.md) | Zoe | 16 Oct | Draft |
| [extraction.md](extraction.md) | Adlyn | 16 Oct | Draft |
| [agent.md](agent.md) | Argya | 16 Oct | Draft |
| [ui.md](ui.md) | Erdafa | 16 Oct | Draft |
| [reminders.md](reminders.md) | Abhip | 16 Oct | Draft |
| [forecast.md](forecast.md) | Abhip | 18 Oct | Draft |
| [evaluation.md](evaluation.md) | Abhip | 18 Oct | Draft |
| [security-self-assessment.md](security-self-assessment.md) | Abhip | 17 Oct | Draft |

Status values: Not started, Draft, Reviewed, Final.

Every technical section remains Draft pending its owner's review. Data/security previously claimed review of an older account; its revised content needs renewed Zoe review. Reminders, evaluation and the security assessment contain substantive drafts, so the old Not started prose is removed. Evaluation, raw evidence and the separate security assessment retain their own workstreams and were not rewritten here.

WhatsApp receipt photos exist; voice and bill detection remain Planned. In-app Budget-threshold Reminders exist, while real WhatsApp budget-alert delivery is deferred for the submission. Forecast's deterministic synthetic fixture is not real-spending accuracy or measured model benefit. Historical browser and model evidence stays dated and scoped in the linked artifacts. Normal docs checks validate structure; final checks must still reject unreviewed content.

## How to write a section

1. Copy [_template.md](_template.md) or open your stub, and keep its five headings.
2. Describe what the code does today. Mark anything not built as "Planned". Never claim a number you did not measure.
3. Name real file paths and link tests, ADRs, and Sandbox scenarios.
4. Run `pnpm docs:check`. Run `pnpm docs:check --final` before the submission freeze: it also fails on any leftover TODO.
5. Open a pull request. Abhip builds the PDFs from these files.

## Build the submission PDFs

```sh
pnpm docs:pdf            # all three PDFs into docs/tech/build (ignored by git)
pnpm docs:pdf security   # one of: technical, security, evidence
pnpm docs:pdf --final    # also fails on any TODO or a Status below Reviewed
```

The build needs `pandoc`, `typst` and `mmdc` (Mermaid CLI) on the PATH. It renders Mermaid images, resolves section anchors and cross-PDF pointers, and links source paths to GitHub. The [approved template](pdf/README.md) keeps blue covers, white interiors, Montserrat headings, Nunito Sans body, Geist Mono code and rounded tables. Technical composition includes forecast under Core algorithms. Generated PDFs stay ignored; do not treat a produced file as a successful final build if the command reports status errors.

## Submission package

The rules ask for six items, sent by email to `fintechathon@ican-x.com` with clear labels on each attachment (the organizers confirmed this on 14 October).

| Item | Where it is |
| --- | --- |
| Technical documentation | `Team808-Technical-Documentation.pdf`, built by `pnpm docs:pdf` |
| Presentation deck | Canva deck exported to PDF |
| Demo video (optional, up to 5 minutes) | Link, to be added |
| Source code | This repository, which will be public: https://github.com/ZoeMohamed/Monara |
| Security self-assessment | `Team808-Security-Self-Assessment.pdf` |
| Execution evidence | `Team808-Execution-Evidence.pdf`, with raw logs in [evidence/](evidence/) |

Hosted app for the judges: https://monara-finance.vercel.app. Test accounts are to be added.

If you use an AI agent to draft a section, ask it to follow `.agents/skills/tech-doc/SKILL.md`.

## Rules

- English only.
- No secrets, keys, real emails, passports, or personal data.
- Diagrams are Mermaid code blocks, which GitHub renders.
