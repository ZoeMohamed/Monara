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
| [evaluation.md](evaluation.md) | Abhip | 18 Oct | Not started |
| [security-self-assessment.md](security-self-assessment.md) | Abhip | 17 Oct | Not started |

Status values: Not started, Draft, Reviewed, Final.

The UI section was reconciled with current source and the PRD, Action Tracker and Brainstorm on **16 October 2026**. The [UI action checklist](../ui-actions-2026-10-16.md) maps ER1–ER12 to delivered source, remaining acceptance and teammate dependencies; the [backend handoff](../ui-backend-handoff.md) records integration boundaries and current verification. The shared tracker now lists ER4, ER7 and ER12 In review, with dated owner dependencies and evidence references. Other owners' rows and technical sections retain their existing statuses. The UI section remains Draft pending owner review. Normal documentation checks do not establish review or final submission acceptance.

Architecture, Agent, and Gmail extraction drafts were reconciled against current source without changing their owners or review status. Receipt and voice extraction remain planned. Data/security, Reminders, evaluation and the security self-assessment remain Not started with owner TODOs. The normal structure check can pass while these submission sections are unfinished; final acceptance requires completed content, measured evidence and owner review.

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
