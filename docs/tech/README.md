# Technical documentation

This is the technical documentation for the FinTechathon 2026 submission. It lives in the repository so it is versioned, reviewed in pull requests, and sits next to the code it describes. Product requirements stay in the PRD (Google Doc tab "PRD"); every section here cites the PRD feature ids (F1 to F16).

## What the competition asks for

The rules require technical documentation covering system architecture, core algorithm description, and security design. Together with the security self-assessment and execution evidence, the files below cover all of it.

| Required part | Files |
| --- | --- |
| System architecture | [architecture.md](architecture.md), [ui.md](ui.md) |
| Core algorithm description | [extraction.md](extraction.md), [agent.md](agent.md), [reminders.md](reminders.md) |
| Security design | [data-and-security.md](data-and-security.md), [agent.md](agent.md) |
| Security self-assessment | [security-self-assessment.md](security-self-assessment.md) |
| Execution evidence | [evaluation.md](evaluation.md) |

## Sections, owners, and status

| File | Owner | Due | Status |
| --- | --- | --- | --- |
| [architecture.md](architecture.md) | Abhip | 16 Oct | Draft |
| [data-and-security.md](data-and-security.md) | Zoe | 16 Oct | Not started |
| [extraction.md](extraction.md) | Adlyn | 16 Oct | Draft |
| [agent.md](agent.md) | Argya | 16 Oct | Draft |
| [ui.md](ui.md) | Erdafa | 16 Oct | Draft |
| [reminders.md](reminders.md) | Abhip | 16 Oct | Not started |
| [forecast.md](forecast.md) | Abhip | 18 Oct | Draft |
| [evaluation.md](evaluation.md) | Abhip | 18 Oct | Not started |
| [security-self-assessment.md](security-self-assessment.md) | Abhip | 17 Oct | Not started |

Status values: Not started, Draft, Reviewed, Final.

The UI section was reconciled on **19 October 2026** with main `c8bdfb4` (including the Worker deployment workflow), accepted meeting decisions and the scoped PRD/Action Tracker reread that day. The [UI checklist](../ui-actions-2026-10-16.md) maps delivered source to owner dependencies; the [backend handoff](../ui-backend-handoff.md) records typed classification, goal/deletion recovery, environment limits, open PRs and fresh combined verification. Budgets shows Weekly and Monthly together without period tabs, Overview stays clean, and Goals retains main’s calculations with progress-first cards, optional Monthly plan and keyboard-accessible Planning tabs. The current follow-up keeps each period summary, gauge, categories and Add action together, stacks them on mobile, and places them side by side on desktop. Goals and Chat also use shorter routine copy. The follow-up passed 984 source tests, Doctor 100/100, a production web build and mobile/desktop acceptance; 397 SQL assertions remain backend evidence from the unchanged integration checkpoint. Earlier 848-test/277-SQL/25-migration results remain historical. The tracker remains dated 16 October and no external status was edited. UI remains Draft pending Erdafa's review; other owner rows and sections retain their existing status. Normal structure validation does not establish final submission readiness.

Architecture, Agent, and Gmail extraction drafts were reconciled against current source without changing their owners or review status. Main implements WhatsApp receipt-photo extraction; voice/transcription and the matching extraction-document update remain separate open PRs. Configured provider acceptance is separate from source delivery. Data/security, Reminders, evaluation and the security self-assessment remain Not started with owner TODOs. The normal structure check can pass while these submission sections are unfinished; final acceptance requires completed content, measured evidence and owner review.

## How to write a section

1. Copy [_template.md](_template.md) or open your stub, and keep its five headings.
2. Describe what the code does today. Mark anything not built as "Planned". Never claim a number you did not measure.
3. Name real file paths and link tests, ADRs, and Sandbox scenarios.
4. Run `pnpm docs:check`. Run `pnpm docs:check --final` before the submission freeze: it also fails on any leftover TODO.
5. Open a pull request. Abhip assembles the final document from these files.

If you use an AI agent to draft a section, ask it to follow `.agents/skills/tech-doc/SKILL.md`.

## Rules

- English only.
- No secrets, keys, real emails, passports, or personal data.
- Diagrams are Mermaid code blocks, which GitHub renders.
