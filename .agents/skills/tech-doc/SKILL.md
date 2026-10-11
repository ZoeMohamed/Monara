---
name: tech-doc
description: Write or update a section of the hackathon technical documentation in docs/tech. Use when asked to document an area (architecture, data and security, extraction, agent, UI, reminders, evaluation) or the security self-assessment.
---

# Write a technical documentation section

The submission needs technical documentation covering system architecture, core algorithms, and security design. It lives in `docs/tech`, one file per area, each written by its owner and judged as one document.

## Steps

1. Open `docs/tech/README.md` and find the file, its owner, and its PRD features. If the file does not exist, copy `docs/tech/_template.md`.
2. Read the PRD feature specs for those F-ids, the related ADRs in `docs/adr`, and the code paths you will describe.
3. Fill the five headings in order: Purpose, How it works, Key decisions, Security and risks, How to verify.
4. Check every claim against code, a test, or a PRD decision. Mark anything not built as "Planned".
5. Update the Status in the file header and in the README table.
6. Run `pnpm docs:check`.

## Writing rules

- Name real file paths, such as `apps/agent/src/...`, so a reader can find the code.
- Use measured numbers only. Metrics come from Sandbox runs, never from estimates.
- Show each key decision with the alternative that was rejected and the reason.
- Draw at most one Mermaid diagram per section, and only when it clarifies the flow.
- Keep a section to about two pages, in plain English, with no secrets, keys, real emails, or personal data.
- Describe behavior the way a reviewer would test it, so Security and risks and How to verify are concrete.

## Done when

- `pnpm docs:check` passes. Before the submission freeze, `pnpm docs:check --final` passes, which also requires no TODO and a Status of Reviewed or Final.
- Every PRD feature the file lists is covered, and each claim points to code, a test, or a decision.
- The README status table matches the file.
