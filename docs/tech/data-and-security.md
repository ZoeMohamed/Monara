# Data model and security design

Owner: Zoe. Features: F1, F4, F5, F7, F9. Status: Not started.

## Purpose
TODO: what the data layer protects and why, in two to four sentences.

## How it works
TODO: the schema (entities and keys), row-level security, ownership rules between related records, the backend operations, and how transfers, income, and expenses are stored. Add a Mermaid ER diagram.

## Key decisions
TODO: uuid ids, composite ownership keys, nullable pending fields, the processed-message table, no stored balances. Give the alternative for each.

## Security and risks
TODO: RLS policies, service-role usage, what is never stored (raw emails, tokens), and open risks.

## How to verify
TODO: migration replay, ownership and RLS tests, and the commands to run them.
