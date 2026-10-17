import {
  type AgentChatResponse,
  type AgentChatTurn,
  type DestructiveActionConfirmation,
  type ReversibleActionReceipt,
  reversibleActionReceiptSchema,
} from "@monara/contracts";
import { z } from "zod";
import type { Caller, CallOperation } from "./backend.ts";
import type { ChatMessage, Complete } from "./llm.ts";
import { systemPrompt } from "./prompt.ts";
import { type AgentTool, executeToolCall, type ToolOutcome, toToolDefinitions } from "./tools.ts";

const MAX_STEPS = 8;

const STEP_LIMIT_REPLY =
  "Sorry, that took more steps than I could finish. Could you ask again in a simpler way?";
const EXPIRED_REPLY = "That confirmation has expired, so nothing was changed. Ask me again.";
const UNCONFIRMED_REPLY =
  "I could not confirm that this was carried out. Please check the app before trying again.";

const ONE_AT_A_TIME =
  "Another action is already waiting for the User's yes. Ask the User to confirm one at a time.";

const mutationResultSchema = z.object({ action: reversibleActionReceiptSchema });

/** PRD 6.2: a destructive action needs an explicit "yes", so nothing looser counts. */
const isYes = (text: string) => /^yes[.!]?$/i.test(text.trim());

/**
 * The model sometimes writes em or en dashes despite the prompt, so they are
 * taken out here: a dash between numbers becomes a hyphen, any other a comma.
 */
export function tidyReply(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]+\s*/g, ", ")
    .replace(/,\s*([.,!?])/g, "$1")
    .replace(/^,\s*|,\s*$/gm, "")
    .trim();
}

/** Replays earlier turns. Receipts go in as context, so the model never has to repeat them. */
function toMessages(history: AgentChatTurn[]): ChatMessage[] {
  return history.flatMap((turn, index): ChatMessage[] => {
    if (turn.role === "user") return [{ role: "user", content: turn.text }];
    const messages: ChatMessage[] = [{ role: "assistant", content: turn.text }];
    if (turn.actions?.length) {
      messages.push({
        role: "system",
        content: `Receipts for the changes made in the reply above, oldest first: ${JSON.stringify(turn.actions)}`,
      });
    }
    // Only the newest reply can still be answered, and that case never reaches the model.
    if (turn.confirmation) {
      const answered = index === history.length - 1 ? "did not reply yes" : "did not confirm";
      messages.push({
        role: "system",
        content: `The User ${answered}, so this was not carried out: ${turn.confirmation.summary}`,
      });
    }
    return messages;
  });
}

/**
 * Carries out the action the User just said yes to. The model takes no part:
 * the yes is the User's own message on the verified Channel, and the backend
 * checks that the confirmation is theirs, unused, and not expired.
 */
async function confirm(
  confirmation: DestructiveActionConfirmation,
  input: { callOperation: CallOperation; caller: Caller; now: Date },
): Promise<string> {
  if (Date.parse(confirmation.expiresAt) <= input.now.getTime()) return EXPIRED_REPLY;
  try {
    await input.callOperation("confirm_destructive_action", input.caller, {
      confirmationId: confirmation.confirmationId,
      answer: "yes",
    });
  } catch {
    return UNCONFIRMED_REPLY;
  }
  return `Done. ${confirmation.summary}`;
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
}): Promise<AgentChatResponse> {
  const { complete, tools, callOperation, caller } = input;
  const waiting = input.history.at(-1)?.confirmation;
  if (waiting && isYes(input.text)) {
    return { reply: await confirm(waiting, input), actions: [], confirmation: null };
  }

  const definitions = toToolDefinitions(tools);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt({ hasTools: tools.length > 0, now: input.now }) },
    ...toMessages(input.history),
    { role: "user", content: input.text },
  ];
  const actions: ReversibleActionReceipt[] = [];
  let confirmation: DestructiveActionConfirmation | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const message = await complete(messages, definitions);
    messages.push(message);
    if (!message.tool_calls?.length) {
      const reply = tidyReply(message.content ?? "");
      if (!reply) throw new Error("The model returned an empty reply.");
      return { reply, actions, confirmation };
    }
    for (const call of message.tool_calls) {
      const isDestructive = tools.some(
        (tool) => tool.name === call.function.name && tool.tier === "T2",
      );
      // The User's yes can answer only one action, so a second request is turned away.
      const outcome: ToolOutcome =
        isDestructive && confirmation
          ? { result: { error: ONE_AT_A_TIME } }
          : await executeToolCall(tools, call, { ...caller, callOperation });
      const mutation = mutationResultSchema.safeParse(outcome.result);
      if (mutation.success) actions.push(mutation.data.action);
      if (outcome.confirmation) confirmation = outcome.confirmation;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(outcome.result),
      });
    }
  }
  // Changes made before the limit still happened, so their receipts are returned.
  return { reply: STEP_LIMIT_REPLY, actions, confirmation: null };
}
