// Runs every Agent scenario against the real model and an in-memory ledger.
// Usage: pnpm --filter @monara/agent sandbox [scenario-id ...] [--json]
// Reads LLM_BASE_URL, LLM_API_KEY and LLM_MODEL from the environment or apps/agent/.dev.vars.
import { existsSync, readFileSync } from "node:fs";
import type { AgentChatResponse, AgentChatTurn } from "@monara/contracts";
import { runAgent } from "../src/conversation/agent.ts";
import { destructiveTools } from "../src/conversation/destructive-tools.ts";
import { createComplete } from "../src/conversation/llm.ts";
import { readTools } from "../src/conversation/read-tools.ts";
import type { AgentTool } from "../src/conversation/tools.ts";
import { writeTools } from "../src/conversation/write-tools.ts";
import { createSandboxLedger, SANDBOX_USER_ID } from "./ledger.ts";
import { type Scenario, scenarios } from "./scenarios.ts";

function readSetting(name: string): string {
  const fromEnvironment = process.env[name];
  if (fromEnvironment) return fromEnvironment;
  if (existsSync(".dev.vars")) {
    const line = readFileSync(".dev.vars", "utf8")
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${name}=`));
    const value = line?.slice(name.length + 1).trim();
    if (value) return value;
  }
  throw new Error(`${name} is not set. Add it to apps/agent/.dev.vars.`);
}

const tools: AgentTool[] = [...readTools, ...writeTools, ...destructiveTools];
const complete = createComplete({
  baseUrl: readSetting("LLM_BASE_URL"),
  apiKey: readSetting("LLM_API_KEY"),
  model: readSetting("LLM_MODEL"),
});

const print = (line: string) =>
  process.stdout.write(`${line}
`);

interface Result {
  id: string;
  kind: Scenario["kind"];
  title: string;
  passed: boolean;
  failures: string[];
  /** Operation names only. Inputs and replies are left out of the report. */
  operations: string[];
  seconds: number;
}

/** Plays one scenario the way the web backend would: it carries the history between turns. */
async function play(scenario: Scenario): Promise<Result> {
  const started = Date.now();
  const now = new Date();
  const ledger = createSandboxLedger(now);
  const history: AgentChatTurn[] = [];
  const responses: AgentChatResponse[] = [];
  const toolCalls: string[] = [];
  // Record which tools the model reached for, without changing what they do.
  const recorded = tools.map((tool): AgentTool => {
    if (tool.tier === "T2") return tool;
    return {
      ...tool,
      run(input, context) {
        toolCalls.push(tool.name);
        return tool.run(input, context);
      },
    };
  });
  let failures: string[];
  try {
    for (const text of scenario.turns) {
      const response = await runAgent({
        complete,
        tools: recorded,
        callOperation: ledger.callOperation,
        caller: { userId: SANDBOX_USER_ID, channel: "web" },
        history,
        text,
        now,
      });
      responses.push(response);
      if (verbose)
        print(`      > ${text}
      < ${response.reply}`);
      history.push(
        { role: "user", text },
        {
          role: "assistant",
          text: response.reply,
          ...(response.actions.length > 0 ? { actions: response.actions } : {}),
          ...(response.confirmation ? { confirmation: response.confirmation } : {}),
        },
      );
    }
    failures = scenario.check({ ledger, responses, toolCalls });
  } catch (error) {
    failures = [`the run stopped: ${error instanceof Error ? error.message : "unknown error"}`];
  }
  return {
    id: scenario.id,
    kind: scenario.kind,
    title: scenario.title,
    passed: failures.length === 0,
    failures,
    operations: ledger.log.map((entry) => entry.operation),
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

const verbose = process.argv.includes("--verbose");
const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const selected = scenarios.filter(
  (scenario) => requested.length === 0 || requested.includes(scenario.id),
);
if (selected.length === 0) throw new Error(`No scenario matches: ${requested.join(", ")}`);

const results: Result[] = [];
for (const scenario of selected) {
  const result = await play(scenario);
  results.push(result);
  if (!process.argv.includes("--json")) {
    print(
      `${result.passed ? "PASS" : "FAIL"}  ${result.id}  (${result.seconds}s)  ${result.title}`,
    );
    for (const failure of result.failures) print(`      - ${failure}`);
  }
}

const rate = (kind: Scenario["kind"]) => {
  const ofKind = results.filter((result) => result.kind === kind);
  return { passed: ofKind.filter((result) => result.passed).length, total: ofKind.length };
};
const summary = { model: readSetting("LLM_MODEL"), tasks: rate("task"), attacks: rate("attack") };

if (process.argv.includes("--json")) {
  print(JSON.stringify({ summary, results }, null, 2));
} else {
  print(`\nScripted tasks completed: ${summary.tasks.passed}/${summary.tasks.total}`);
  print(`Attacks blocked: ${summary.attacks.passed}/${summary.attacks.total}`);
}
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
