import {
  type DestructiveAction,
  type DestructiveActionConfirmation,
  destructiveActionConfirmationSchema,
} from "@monara/contracts";
import { z } from "zod";
import type { Caller, CallOperation } from "./backend.ts";
import type { ToolCall, ToolDefinition } from "./llm.ts";

/** The caller is resolved from the verified Channel, never from message text or tool arguments. */
export interface ToolContext extends Caller {
  callOperation: CallOperation;
}

interface ToolBase<Schema extends z.ZodType> {
  name: string;
  description: string;
  input: Schema;
}

/** T0 reads and T1 reversible writes run as soon as the model calls them. */
interface RunnableTool<Schema extends z.ZodType> extends ToolBase<Schema> {
  tier: "T0" | "T1";
  run(input: z.infer<Schema>, context: ToolContext): Promise<unknown>;
}

/**
 * A T2 tool has nothing to run: calling it only asks the backend for a
 * confirmation, and the action happens when the User answers yes.
 */
interface DestructiveTool<Schema extends z.ZodType> extends ToolBase<Schema> {
  name: DestructiveAction;
  tier: "T2";
}

/**
 * Permission Tiers from PRD section 6.2. T3 actions (connections, WhatsApp
 * linking, export, credentials) are never Agent Tools, so there is no T3 here.
 */
export type AgentTool<Schema extends z.ZodType = z.ZodType> =
  | RunnableTool<Schema>
  | DestructiveTool<Schema>;

export function toToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(tool.input);
    return {
      type: "function",
      function: { name: tool.name, description: tool.description, parameters },
    };
  });
}

export interface ToolOutcome {
  /** What the model is told. Problems come back as `{ error }` so it can recover. */
  result: unknown;
  /** Set when a T2 tool is now waiting for the User's yes. */
  confirmation?: DestructiveActionConfirmation;
}

/** Runs one tool call, or for a T2 tool asks the backend for a confirmation. */
export async function executeToolCall(
  tools: AgentTool[],
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const tool = tools.find((candidate) => candidate.name === call.function.name);
  if (!tool) return { result: { error: `Unknown tool: ${call.function.name}` } };
  let json: unknown;
  try {
    json = JSON.parse(call.function.arguments || "{}");
  } catch {
    return { result: { error: "Arguments were not valid JSON." } };
  }
  const parsed = tool.input.safeParse(json);
  if (!parsed.success) {
    return { result: { error: `Invalid arguments: ${z.prettifyError(parsed.error)}` } };
  }
  try {
    if (tool.tier !== "T2") return { result: await tool.run(parsed.data, context) };
    const confirmation = destructiveActionConfirmationSchema.parse(
      await context.callOperation("request_destructive_action", context, {
        action: tool.name,
        input: parsed.data,
      }),
    );
    return {
      confirmation,
      result: {
        status: "waiting_for_confirmation",
        summary: confirmation.summary,
        expiresAt: confirmation.expiresAt,
      },
    };
  } catch {
    // Errors can carry financial records, so the model only learns that the tool failed.
    return { result: { error: `${tool.name} failed.` } };
  }
}
