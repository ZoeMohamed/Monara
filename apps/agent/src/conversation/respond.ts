import type { AgentChatResponse, AgentChatTurn } from "@monara/contracts";
import type { Env } from "../env.ts";
import { createUserIsActive } from "../user-deletion.ts";
import { runAgent } from "./agent.ts";
import { type Caller, createCallOperation } from "./backend.ts";
import { destructiveTools } from "./destructive-tools.ts";
import { createComplete } from "./llm.ts";
import { readTools } from "./read-tools.ts";
import { writeTools } from "./write-tools.ts";

/** Answers one message from a verified caller. */
export type Respond = (input: {
  caller: Caller;
  history: AgentChatTurn[];
  text: string;
}) => Promise<AgentChatResponse>;

/**
 * Builds the one Agent every Channel uses, or returns null when a secret it
 * needs is missing so the caller can fail closed.
 */
export function createRespond(env: Env): Respond | null {
  const { MONARA_BACKEND_URL, MONARA_AGENT_BACKEND_SECRET, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } =
    env;
  if (
    !MONARA_BACKEND_URL ||
    !MONARA_AGENT_BACKEND_SECRET ||
    !LLM_BASE_URL ||
    !LLM_API_KEY ||
    !LLM_MODEL
  ) {
    return null;
  }
  const callOperation = createCallOperation({
    baseUrl: MONARA_BACKEND_URL,
    secret: MONARA_AGENT_BACKEND_SECRET,
  });
  const isActive = createUserIsActive(env);
  return async (input) => {
    async function requireActive() {
      if (!(await isActive(input.caller.userId))) throw new Error("This account is unavailable.");
    }
    await requireActive();
    const result = await runAgent({
      ...input,
      complete: createComplete({
        baseUrl: LLM_BASE_URL,
        apiKey: LLM_API_KEY,
        model: LLM_MODEL,
        beforeRequest: requireActive,
      }),
      callOperation: async (...args) => {
        await requireActive();
        return callOperation(...args);
      },
      tools: [...readTools, ...writeTools, ...destructiveTools],
      now: new Date(),
    });
    await requireActive();
    return result;
  };
}
