import type { UserId } from "@monara/contracts";
import type { ChatMessage, Complete } from "./llm.ts";
import { systemPrompt } from "./prompt.ts";
import { type AgentTool, executeToolCall, toToolDefinitions } from "./tools.ts";

const MAX_STEPS = 8;

const STEP_LIMIT_REPLY =
  "Sorry, that took more steps than I could finish. Could you ask again in a simpler way?";

/**
 * Runs the tool loop for one message from a User and returns the reply. Every
 * Channel calls this, so the same request behaves the same in the app and on WhatsApp.
 */
export async function runAgent(input: {
  complete: Complete;
  tools: AgentTool[];
  userId: UserId;
  text: string;
}): Promise<string> {
  const { complete, tools, userId } = input;
  const definitions = toToolDefinitions(tools);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt({ hasTools: tools.length > 0 }) },
    { role: "user", content: input.text },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const message = await complete(messages, definitions);
    messages.push(message);
    if (!message.tool_calls?.length) {
      const reply = message.content?.trim();
      if (!reply) throw new Error("The model returned an empty reply.");
      return reply;
    }
    for (const call of message.tool_calls) {
      const result = await executeToolCall(tools, call, { userId });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return STEP_LIMIT_REPLY;
}
