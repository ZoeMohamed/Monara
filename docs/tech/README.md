# Technical documentation

This is the technical documentation for the FinTechathon 2026 submission, versioned beside its source. The public [PRD v2.1](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.pm2pb9a5y3zd), read on 20 October and dated 11 October in the document, defines F1 to F16. The repository calls spending forecast F17; it is an implemented extension, not a feature specification found in that PRD. Goals and permanent User deletion are also implemented extensions. Their inclusion here describes source behavior and does not rewrite product requirements. The [Action Tracker](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg) and [Brainstorm](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.0) are supporting context, not implementation evidence.

## Source baseline and branch reconciliation

The implementation baseline is the current `origin/main`, inspected on 20 October 2026 after fetching and pruning all refs. The documentation was consolidated from every repository branch that contained technical-documentation work. A branch was treated as a source of prose or evidence, never as proof that its implementation shipped; behavior is described as implemented only when it exists on main. The latest merged release refines the daily Budget guide and Home shortcuts; production evidence was refreshed after that release.

| Source branch or commit | Material retained | Reconciliation rule |
| --- | --- | --- |
| `origin/docs/technical-documentation-completion` (`0f49f21`) | Curated section drafts, evidence index and PDF tooling | Corrected against current main |
| `origin/docs/security-self-assessment-review` (`191eefa`) | Permission tiers and risk register | Updated for current controls and remaining gaps |
| `origin/docs/extraction-docs` (`3c094e0`) and merged Gmail work | Extraction rationale and validation boundaries | Current 0.5 confidence policy is authoritative |
| `origin/docs/agent-reviewed` (`60847c8`) | Agent terminology and owner-review notes | Only claims supported by current source remain |
| `origin/feat/spending-forecast` and merged forecast fixes | Forecast algorithm and synthetic backtest | Current daily schedule and current source win |
| Merged planning/recovery and Custom Banks work | UI recovery, goal images, source dates and owned bank definitions | Current main replaces older gap reports |
| `origin/docs/submission-pdfs` and the completion branch | Typst assets, Mermaid configuration and build script | Imported without generated PDFs |

The latest source includes the Gmail reliability policy, daily forecast refresh, save-only Chat history recovery, source-aware transaction dates, goal-image deletion cleanup, onboarding fixes and Custom Banks. Receipt photos are implemented and always enter review. Voice ingestion, recurring-bill detection and bill-due Reminders remain Planned. Budget-alert dispatch is implemented and the production Worker reports its cron; no successful real-template delivery is claimed. Owner review and provider acceptance remain outstanding, so every section stays Draft.

## What the competition asks for

The rules list three separate deliverables here, so they are built as three PDFs from the files below.

| PDF | Required part | Files |
| --- | --- | --- |
| Technical Documentation | System architecture | [architecture.md](architecture.md), [ui.md](ui.md) |
| | Core algorithm description | [extraction.md](extraction.md), [agent.md](agent.md), [reminders.md](reminders.md), [forecast.md](forecast.md) |
| | Security design | [data-and-security.md](data-and-security.md) |
| Security Self-Assessment | Permission tiers and known-risk list | [security-self-assessment.md](security-self-assessment.md) |
| Execution Evidence | Production mobile capture, Sandbox logs and measured results | [evaluation.md](evaluation.md) |

## Sections, owners, and status

| File | Owner | Status |
| --- | --- | --- |
| [architecture.md](architecture.md) | Abhip | Draft |
| [data-and-security.md](data-and-security.md) | Zoe | Draft |
| [extraction.md](extraction.md) | Adlyn | Draft |
| [agent.md](agent.md) | Argya | Draft |
| [ui.md](ui.md) | Erdafa | Draft |
| [reminders.md](reminders.md) | Abhip | Draft |
| [forecast.md](forecast.md) | Abhip | Draft |
| [evaluation.md](evaluation.md) | Abhip | Draft |
| [security-self-assessment.md](security-self-assessment.md) | Abhip | Draft |

Status values: Not started, Draft, Reviewed, Final.

Every technical section remains Draft pending its owner's review. Data/security previously claimed review of an older account; its revised content needs renewed Zoe review. Reminders, evaluation and the security assessment contain substantive drafts, so the old Not started prose is removed. Evaluation and its raw evidence were refreshed on 20 October; the separate security assessment retains its own workstream.

Forecast's deterministic fixture is not real-spending accuracy or measured model benefit. Browser, model and extraction evidence stays dated and scoped in the linked artifacts. Execution Evidence now includes an active production Gmail connection and completed import, a verified production WhatsApp Link, and a successful hosted-Agent turn. The audit did not send a new WhatsApp message or make a live financial mutation. Normal docs checks validate structure; final checks must still reject unreviewed content.

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

The build needs `pandoc` and `typst`; `mmdc` (Mermaid CLI) is needed only when a selected document contains a Mermaid diagram. It renders diagrams, resolves section anchors and cross-PDF pointers, and links source paths to GitHub. The [approved template](pdf/README.md) keeps blue covers, white interiors, Montserrat headings, Nunito Sans body, Geist Mono code and rounded tables. Technical composition includes forecast under Core algorithms. Generated PDFs stay ignored; do not treat a produced file as a successful final build if the command reports status errors.

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
