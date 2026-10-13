import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { runAgent } from "../src/conversation/agent.ts";
import type {
  AssistantMessage,
  ChatMessage,
  Complete,
  ToolDefinition,
} from "../src/conversation/llm.ts";
import type { AgentTool } from "../src/conversation/tools.ts";

const userId = "7b0c0f0e-4f0f-4a4e-9f43-2f8e6f1c9a11";

const say = (content: string): AssistantMessage => ({ role: "assistant", content });
const call = (name: string, args: unknown): AssistantMessage => ({
  role: "assistant",
  content: null,
  tool_calls: [
    { id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } },
  ],
});

/** A model that plays back scripted turns and records what it was sent. */
function scripted(turns: AssistantMessage[]) {
  const seen: { messages: ChatMessage[]; tools: ToolDefinition[] }[] = [];
  const complete: Complete = async (messages, tools) => {
    seen.push({ messages: [...messages], tools });
    const next = turns[seen.length - 1];
    if (!next) throw new Error("The script ran out of turns.");
    return next;
  };
  return { complete, seen };
}

function recordingTool(tier: AgentTool["tier"]) {
  const runs: { input: unknown; userId: string }[] = [];
  const tool: AgentTool = {
    name: "lookup",
    description: "Looks something up.",
    tier,
    input: z.object({ limit: z.number().int().positive() }),
    async run(input, context) {
      runs.push({ input, userId: context.userId });
      return { ok: true };
    },
  };
  return { tool, runs };
}

const lastToolResult = (messages: ChatMessage[]) => {
  const message = messages.filter((item) => item.role === "tool").at(-1);
  return message?.role === "tool" ? JSON.parse(message.content) : undefined;
};

test("returns the model's reply and tells it when no tools are connected", async () => {
  const model = scripted([say("  Records are not connected yet.  ")]);
  const reply = await runAgent({ complete: model.complete, tools: [], userId, text: "hi" });

  assert.equal(reply, "Records are not connected yet.");
  assert.deepEqual(model.seen[0]?.tools, []);
  const system = model.seen[0]?.messages[0];
  assert.equal(system?.role, "system");
  assert.match(String(system?.content), /not connected to the User's records/);
});

test("runs a tool with validated input and the verified User, then replies", async () => {
  const { tool, runs } = recordingTool("T0");
  const model = scripted([call("lookup", { limit: 5 }), say("Done.")]);
  const reply = await runAgent({ complete: model.complete, tools: [tool], userId, text: "go" });

  assert.equal(reply, "Done.");
  assert.deepEqual(runs, [{ input: { limit: 5 }, userId }]);
  assert.deepEqual(lastToolResult(model.seen[1]?.messages ?? []), { ok: true });
  assert.equal(model.seen[0]?.tools[0]?.function.name, "lookup");
});

test("does not run a destructive tool without a confirmation", async () => {
  const { tool, runs } = recordingTool("T2");
  const model = scripted([call("lookup", { limit: 5 }), say("I can't do that yet.")]);
  await runAgent({ complete: model.complete, tools: [tool], userId, text: "delete it" });

  assert.deepEqual(runs, []);
  assert.match(lastToolResult(model.seen[1]?.messages ?? []).error, /confirmation/);
});

test("rejects invalid arguments and unknown tools without running anything", async () => {
  const { tool, runs } = recordingTool("T1");
  const model = scripted([
    call("lookup", { limit: "many" }),
    call("drop_everything", {}),
    say("Sorry."),
  ]);
  await runAgent({ complete: model.complete, tools: [tool], userId, text: "go" });

  assert.deepEqual(runs, []);
  assert.match(lastToolResult(model.seen[1]?.messages ?? []).error, /Invalid arguments/);
  assert.match(lastToolResult(model.seen[2]?.messages ?? []).error, /Unknown tool/);
});

test("hides a tool's failure details from the model", async () => {
  const tool: AgentTool = {
    name: "lookup",
    description: "Looks something up.",
    tier: "T0",
    input: z.object({}),
    async run() {
      throw new Error("row 42: Rp 9.000.000 salary");
    },
  };
  const model = scripted([call("lookup", {}), say("Something went wrong.")]);
  await runAgent({ complete: model.complete, tools: [tool], userId, text: "go" });

  assert.deepEqual(lastToolResult(model.seen[1]?.messages ?? []), {
    error: "lookup failed.",
  });
});

test("stops after the step limit instead of looping forever", async () => {
  const { tool, runs } = recordingTool("T0");
  const model = scripted(Array.from({ length: 20 }, () => call("lookup", { limit: 1 })));
  const reply = await runAgent({ complete: model.complete, tools: [tool], userId, text: "go" });

  assert.match(reply, /more steps than I could finish/);
  assert.equal(runs.length, 8);
});
