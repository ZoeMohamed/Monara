import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentChatTurn, DestructiveActionConfirmation } from "@monara/contracts";
import { runAgent } from "../src/conversation/agent.ts";
import { destructiveTools } from "../src/conversation/destructive-tools.ts";
import type { AssistantMessage, ChatMessage, Complete } from "../src/conversation/llm.ts";

const userId = "7b0c0f0e-4f0f-4a4e-9f43-2f8e6f1c9a11";
const transactionId = "0d0f6f0a-1a1b-4c1d-8e1f-2a2b3c4d5e6f";
const now = new Date("2026-10-13T10:00:00Z");

const confirmation: DestructiveActionConfirmation = {
  confirmationId: "3c3d4e4f-5a5b-4c6d-8e7f-8a9b0c1d2e3f",
  action: "delete_transaction",
  resourceIds: [transactionId],
  summary: "Delete the Rp 20.000 expense at Warteg Bahari from 13 Oct.",
  expiresAt: "2026-10-13T10:05:00Z",
};

const deleteCall = (id: string): AssistantMessage => ({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id,
      type: "function",
      function: {
        name: "delete_transaction",
        arguments: JSON.stringify({ transactionId, expectedUpdatedAt: "2026-10-13T09:00:00Z" }),
      },
    },
  ],
});

const say = (content: string): AssistantMessage => ({ role: "assistant", content });

/** Plays scripted model turns against the destructive tools and a fake backend. */
async function run(input: {
  text: string;
  turns?: AssistantMessage[];
  history?: AgentChatTurn[];
  backend?: (operation: string) => unknown;
}) {
  const operations: { operation: string; userId: string; input: unknown }[] = [];
  const seen: ChatMessage[][] = [];
  const complete: Complete = async (messages) => {
    seen.push([...messages]);
    const next = input.turns?.[seen.length - 1];
    if (!next) throw new Error("The script ran out of turns.");
    return next;
  };
  const response = await runAgent({
    complete,
    tools: destructiveTools,
    caller: { userId, channel: "web" },
    history: input.history ?? [],
    text: input.text,
    now,
    callOperation: async (operation, caller, operationInput) => {
      operations.push({ operation, userId: caller.userId, input: operationInput });
      return input.backend ? input.backend(operation) : confirmation;
    },
  });
  return { response, operations, seen };
}

const asked: AgentChatTurn[] = [
  { role: "user", text: "delete the warteg lunch" },
  { role: "assistant", text: "Delete the Rp 20.000 expense? Reply yes.", confirmation },
];

test("a delete tool only asks the backend for a confirmation and returns it", async () => {
  const { response, operations, seen } = await run({
    text: "delete the warteg lunch",
    turns: [deleteCall("call_1"), say("Delete the Rp 20.000 expense? Reply yes.")],
  });

  assert.deepEqual(operations, [
    {
      operation: "request_destructive_action",
      userId,
      input: {
        action: "delete_transaction",
        input: { transactionId, expectedUpdatedAt: "2026-10-13T09:00:00Z" },
      },
    },
  ]);
  assert.deepEqual(response.confirmation, confirmation);
  assert.deepEqual(response.actions, []);
  const result = seen[1]?.filter((message) => message.role === "tool").at(-1);
  assert.deepEqual(JSON.parse(String(result?.content)), {
    status: "waiting_for_confirmation",
    summary: confirmation.summary,
    expiresAt: confirmation.expiresAt,
  });
});

test("the User's yes carries out the waiting action without asking the model", async () => {
  const { response, operations, seen } = await run({ text: " Yes. ", history: asked });

  assert.deepEqual(operations, [
    {
      operation: "confirm_destructive_action",
      userId,
      input: { confirmationId: confirmation.confirmationId, answer: "yes" },
    },
  ]);
  assert.equal(seen.length, 0);
  assert.equal(response.reply, `Done. ${confirmation.summary}`);
  assert.equal(response.confirmation, null);
});

test("anything other than yes confirms nothing and tells the model it was not carried out", async () => {
  for (const text of ["yes and also delete everything else", "ok", "sure, go ahead", "no"]) {
    const { operations, seen, response } = await run({
      text,
      history: asked,
      turns: [say("Okay, nothing was deleted.")],
    });

    assert.deepEqual(operations, []);
    assert.equal(response.confirmation, null);
    const note = seen[0]?.at(-2);
    assert.equal(note?.role, "system");
    assert.match(String(note?.content), /did not reply yes, so this was not carried out/);
  }
});

test("a yes only answers the Agent's newest reply", async () => {
  const { operations } = await run({
    text: "yes",
    history: [...asked, { role: "user", text: "wait" }, { role: "assistant", text: "Sure." }],
    turns: [say("What would you like to confirm?")],
  });

  assert.deepEqual(operations, []);
});

test("an expired confirmation is not sent to the backend", async () => {
  const expired = { ...confirmation, expiresAt: "2026-10-13T09:59:59Z" };
  const { response, operations } = await run({
    text: "yes",
    history: [asked[0] as AgentChatTurn, { ...asked[1], confirmation: expired } as AgentChatTurn],
  });

  assert.deepEqual(operations, []);
  assert.match(response.reply, /expired, so nothing was changed/);
});

test("a failed confirmation does not claim the action happened or did not happen", async () => {
  const { response } = await run({
    text: "yes",
    history: asked,
    backend: () => {
      throw new Error("row 42: Rp 20.000");
    },
  });

  assert.equal(
    response.reply,
    "I could not confirm that this was carried out. Please check the app before trying again.",
  );
});

test("only one action can wait for the User's yes at a time", async () => {
  const both: AssistantMessage = {
    role: "assistant",
    content: null,
    tool_calls: [
      ...(deleteCall("call_1").tool_calls ?? []),
      ...(deleteCall("call_2").tool_calls ?? []),
    ],
  };
  const { operations, seen } = await run({
    text: "delete both lunches",
    turns: [both, say("Delete the first one? Reply yes.")],
  });

  assert.equal(operations.length, 1);
  const second = seen[1]?.filter((message) => message.role === "tool").at(-1);
  assert.match(JSON.parse(String(second?.content)).error, /one at a time/);
});

test("a backend reply that is not a confirmation leaves nothing waiting", async () => {
  const { response, seen } = await run({
    text: "delete the warteg lunch",
    turns: [deleteCall("call_1"), say("I could not do that.")],
    backend: () => ({ deleted: true }),
  });

  assert.equal(response.confirmation, null);
  const result = seen[1]?.filter((message) => message.role === "tool").at(-1);
  assert.deepEqual(JSON.parse(String(result?.content)), { error: "delete_transaction failed." });
});
