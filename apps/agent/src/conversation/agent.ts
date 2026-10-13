import {
  type AgentChatTurn,
  type ReversibleActionReceipt,
  reversibleActionReceiptSchema,
} from "@monara/contracts";
import { z } from "zod";
import type { Caller, CallOperation } from "./backend.ts";
import type { ChatMessage, Complete } from "./llm.ts";
import { systemPrompt } from "./prompt.ts";
import { type AgentTool, executeToolCall, toToolDefinitions } from "./tools.ts";

const MAX_STEPS = 8;

const STEP_LIMIT_REPLY =
  "Sorry, that took more steps than I could finish. Could you ask again in a simpler way?";

const mutationResultSchema = z.object({ action: reversibleActionReceiptSchema });

/** Replays earlier turns. Receipts go in as context, so the model never has to repeat them. */
function toMessages(history: AgentChatTurn[]): ChatMessage[] {
  return history.flatMap((turn): ChatMessage[] => {
    if (turn.role === "user") return [{ role: "user", content: turn.text }];
    const reply: ChatMessage = { role: "assistant", content: turn.text };
    if (!turn.actions?.length) return [reply];
    return [
      reply,
      {
        role: "system",
        content: `Receipts for the changes made in the reply above, oldest first: ${JSON.stringify(turn.actions)}`,
      },
    ];
  });
}

/**
 * Runs the tool loop for one message from a User and returns the reply with a
 * receipt for each change made. Every Channel calls this, so the same request
 * behaves the same in the app and on WhatsApp.
 */
export async function runAgent(input: {
  complete: Complete;
  tools: AgentTool[];
  callOperation: CallOperation;
  caller: Caller;
  history: AgentChatTurn[];
  text: string;
  now: Date;
}): Promise<{ reply: string; actions: ReversibleActionReceipt[] }> {
  const { complete, tools, callOperation, caller } = input;
  const definitions = toToolDefinitions(tools);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt({ hasTools: tools.length > 0, now: input.now }) },
    ...toMessages(input.history),
    { role: "user", content: input.text },
  ];
  const actions: ReversibleActionReceipt[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const message = await complete(messages, definitions);
    messages.push(message);
    if (!message.tool_calls?.length) {
      const reply = message.content?.trim();
      if (!reply) throw new Error("The model returned an empty reply.");
      return { reply, actions };
    }
    for (const call of message.tool_calls) {
      const result = await executeToolCall(tools, call, { ...caller, callOperation });
      const mutation = mutationResultSchema.safeParse(result);
      if (mutation.success) actions.push(mutation.data.action);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  // Changes made before the limit still happened, so their receipts are returned.
  return { reply: STEP_LIMIT_REPLY, actions };
}
