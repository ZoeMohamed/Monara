# Submission documentation

Monara's submission documentation is maintained as three complementary sources. Each document has one job, so architecture, security reasoning, and execution proof remain consistent without repeating one another.

## Canonical documents

| Deliverable | Canonical source | Responsibility |
| --- | --- | --- |
| Technical Documentation | [technical-documentation.md](technical-documentation.md) | System boundaries, data model, workflows, algorithms, operations, and recovery |
| Security Self-Assessment | [security-self-assessment.md](security-self-assessment.md) | Threat model, permission tiers, mandatory controls, failure behavior, and risk decisions |
| Execution Evidence | [execution-evidence.md](execution-evidence.md) | Release acceptance cases, evidence requirements, observed outcomes, and sign-off |

All three canonical sources use the same domain terms, transaction model, trust boundaries, and acceptance IDs. Topic files in this directory are working notes; they are not composed into the final submission package.

## Working notes

These supporting files remain indexed for maintainers but are not canonical submission sources: [architecture.md](architecture.md), [data-and-security.md](data-and-security.md), [extraction.md](extraction.md), [agent.md](agent.md), [ui.md](ui.md), [reminders.md](reminders.md), [forecast.md](forecast.md), and [evaluation.md](evaluation.md).

## Separation of concerns

- Technical Documentation explains how the system is designed to work.
- Security Self-Assessment explains why the boundaries are safe and how failures close.
- Execution Evidence explains what must be observed before a release can be accepted.
- An ideal expected result is not a deployment claim. The evidence document records a release observation only when the corresponding production artifact exists.
- Screenshots may demonstrate visible application state, but authorization, ownership, replay protection, and deletion require deterministic boundary evidence.

## Validate and build

```sh
pnpm docs:check
pnpm docs:check --final

pnpm docs:pdf
pnpm docs:pdf technical
pnpm docs:pdf security
pnpm docs:pdf evidence
pnpm docs:pdf --final
```

The PDF build requires `pandoc` and `typst`. Mermaid CLI (`mmdc`) is required only when a selected source contains a Mermaid diagram. Generated PDFs are written to `docs/tech/build/` and remain ignored by Git.

| Output | Source |
| --- | --- |
| `Team808-Technical-Documentation.pdf` | `technical-documentation.md` |
| `Team808-Security-Self-Assessment.pdf` | `security-self-assessment.md` |
| `Team808-Execution-Evidence.pdf` | `execution-evidence.md` |

## Publication rules

- Keep the three canonical sources at `Status: Final` before packaging.
- Use English in the deliverables.
- Never include credentials, tokens, raw provider payloads, private financial records, or personal identifiers.
- Use synthetic or redacted screenshots only.
- Keep control IDs and end-to-end case IDs stable across all three documents.
- Rebuild all PDFs after any canonical-source or template change.
