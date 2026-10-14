import type { AgentChatResponse, AgentChatTurn } from "@monara/contracts";
import type { Env } from "../env.ts";
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
  const complete = createComplete({ baseUrl: LLM_BASE_URL, apiKey: LLM_API_KEY, model: LLM_MODEL });
  const callOperation = createCallOperation({
    baseUrl: MONARA_BACKEND_URL,
    secret: MONARA_AGENT_BACKEND_SECRET,
  });
  return (input) =>
    runAgent({
      ...input,
      complete,
      callOperation,
      tools: [...readTools, ...writeTools, ...destructiveTools],
      now: new Date(),
    });
}
