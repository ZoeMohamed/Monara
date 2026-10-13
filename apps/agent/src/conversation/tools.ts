import { z } from "zod";
import type { Caller, CallOperation } from "./backend.ts";
import type { ToolCall, ToolDefinition } from "./llm.ts";

/**
 * Permission Tiers from PRD section 6.2. T3 actions (connections, WhatsApp
 * linking, export, credentials) are never Agent Tools, so the type has no T3.
 */
type PermissionTier = "T0" | "T1" | "T2";

/** The caller is resolved from the verified Channel, never from message text or tool arguments. */
export interface ToolContext extends Caller {
  callOperation: CallOperation;
}

export interface AgentTool<Schema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  tier: PermissionTier;
  input: Schema;
  run(input: z.infer<Schema>, context: ToolContext): Promise<unknown>;
}

export function toToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(tool.input);
    return {
      type: "function",
      function: { name: tool.name, description: tool.description, parameters },
    };
  });
}

/** Runs one tool call. Problems come back as `{ error }` so the model can recover. */
export async function executeToolCall(
  tools: AgentTool[],
  call: ToolCall,
  context: ToolContext,
): Promise<unknown> {
  const tool = tools.find((candidate) => candidate.name === call.function.name);
  if (!tool) return { error: `Unknown tool: ${call.function.name}` };
  if (tool.tier === "T2") {
    // Confirmations bound to one action arrive with AR5. Until then nothing destructive runs.
    return { error: "This action needs the User's confirmation, which is not available yet." };
  }
  let json: unknown;
  try {
    json = JSON.parse(call.function.arguments || "{}");
  } catch {
    return { error: "Arguments were not valid JSON." };
  }
  const parsed = tool.input.safeParse(json);
  if (!parsed.success) return { error: `Invalid arguments: ${z.prettifyError(parsed.error)}` };
  try {
    return await tool.run(parsed.data, context);
  } catch {
    // Errors can carry financial records, so the model only learns that the tool failed.
    return { error: `${tool.name} failed.` };
  }
}
