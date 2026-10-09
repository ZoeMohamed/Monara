# LLM playground

Adlyn and Argya can add isolated extraction, conversation, and budgeting experiments under src. Run `pnpm --filter @monara/llm-playground typecheck` to check TypeScript. Add a script for an experiment when it exists; there is no model call yet.

Keep samples synthetic. Add experiment input and expected output fixtures alongside the experiment. Never commit real email, WhatsApp messages, financial records, or keys. Production code must not import this workspace. Python experiments may live here later with their own environment, separate from the TypeScript worker.
