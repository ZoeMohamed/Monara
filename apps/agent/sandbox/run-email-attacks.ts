// Runs the email attack cases through the production Gmail extractor and a real model.
// Usage: pnpm --filter @monara/agent sandbox:email-attacks [attack-id ...] [--json]
// Reads LLM_BASE_URL, LLM_API_KEY and LLM_MODEL from the environment or apps/agent/.dev.vars.
import { existsSync, readFileSync } from "node:fs";
import { createLlmClient, LlmError } from "../src/gmail/llm.ts";
import { extractTransactions } from "../src/gmail/parse/extract.ts";
import {
  ATTACK_HOLDER,
  ATTACK_RECEIVED_AT,
  type EmailAttack,
  emailAttacks,
} from "./email-attacks.ts";

function readSetting(name: string): string {
  const fromEnvironment = process.env[name];
  if (fromEnvironment) return fromEnvironment;
  if (existsSync(".dev.vars")) {
    const line = readFileSync(".dev.vars", "utf8")
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${name}=`));
    // .dev.vars is dotenv: a value may be wrapped in single or double quotes.
    const value = line
      ?.slice(name.length + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    if (value) return value;
  }
  throw new Error(`${name} is not set. Add it to apps/agent/.dev.vars.`);
}

const llm = createLlmClient({
  baseUrl: readSetting("LLM_BASE_URL"),
  apiKey: readSetting("LLM_API_KEY"),
  model: readSetting("LLM_MODEL"),
});

const print = (line: string) => process.stdout.write(`${line}\n`);

interface Result {
  id: string;
  title: string;
  passed: boolean;
  failures: string[];
  seconds: number;
}

async function play(attack: EmailAttack): Promise<Result> {
  const started = Date.now();
  let failures: string[];
  try {
    const result = await extractTransactions(
      llm,
      { ...attack.email, receivedAt: ATTACK_RECEIVED_AT },
      { holderName: ATTACK_HOLDER, institutionName: attack.institution },
    );
    failures = attack.check(result);
  } catch (error) {
    // Only the failure kind and HTTP status: provider bodies can echo the prompt.
    const detail =
      error instanceof LlmError
        ? `${error.failure}, status ${error.status ?? "none"}`
        : error instanceof Error
          ? error.name
          : "unknown error";
    failures = [`the run stopped: ${detail}`];
  }
  return {
    id: attack.id,
    title: attack.title,
    passed: failures.length === 0,
    failures,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const unknown = requested.filter((id) => !emailAttacks.some((attack) => attack.id === id));
if (unknown.length > 0) throw new Error(`No email attack matches: ${unknown.join(", ")}`);
const selected = emailAttacks.filter(
  (attack) => requested.length === 0 || requested.includes(attack.id),
);

const results: Result[] = [];
for (const attack of selected) {
  const result = await play(attack);
  results.push(result);
  if (!process.argv.includes("--json")) {
    print(
      `${result.passed ? "PASS" : "FAIL"}  ${result.id}  (${result.seconds}s)  ${result.title}`,
    );
    for (const failure of result.failures) print(`      - ${failure}`);
  }
}

const summary = {
  model: readSetting("LLM_MODEL"),
  blocked: results.filter((result) => result.passed).length,
  total: results.length,
};
if (process.argv.includes("--json")) {
  print(JSON.stringify({ summary, results }, null, 2));
} else {
  print(`\nEmail attacks blocked: ${summary.blocked}/${summary.total}`);
}
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
