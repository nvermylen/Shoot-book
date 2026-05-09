import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { AgentId, ToolContext } from '@/types/agent';

export class ToolPermissionError extends Error {
  constructor(toolName: string, agentId: AgentId) {
    super(`Agent '${agentId}' is not allowed to call tool '${toolName}'`);
    this.name = 'ToolPermissionError';
  }
}

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool '${toolName}' is not registered`);
    this.name = 'ToolNotFoundError';
  }
}

export interface ToolSpec<I, O> {
  name: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  allowedAgents: AgentId[];
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

export interface RegisteredTool {
  name: string;
  input: z.ZodType<unknown>;
  output: z.ZodType<unknown>;
  allowedAgents: AgentId[];
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

const tools = new Map<string, RegisteredTool>();

export function registerTool<I, O>(spec: ToolSpec<I, O>): void {
  tools.set(spec.name, spec as unknown as RegisteredTool);
}

export function getTool(name: string): RegisteredTool | undefined {
  return tools.get(name);
}

// input_hash uses JSON.stringify which is not stable across key order.
// Acceptable for audit-log correlation in Phase 1; if hash stability
// becomes load-bearing (e.g., caching), swap to a sorted-keys serializer.
function hashContent(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content))
    .digest('hex');
}

export async function callTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) {
    throw new ToolNotFoundError(name);
  }

  if (!tool.allowedAgents.includes(ctx.agentId)) {
    console.error('tool_permission_rejected', {
      tool_name: name,
      agent_id: ctx.agentId,
    });
    throw new ToolPermissionError(name, ctx.agentId);
  }

  const inputResult = tool.input.safeParse(input);
  if (!inputResult.success) {
    throw inputResult.error;
  }

  const inputHash = hashContent(input);
  const start = performance.now();

  let output: unknown;

  try {
    output = await tool.handler(inputResult.data, ctx);
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);

    await ctx.supabase.from('agent_tool_call_log').insert({
      photographer_id: ctx.photographerId,
      agent_id: ctx.agentId,
      tool_name: name,
      input_hash: inputHash,
      output_hash: null,
      status: 'error',
      latency_ms: latencyMs,
    });

    throw err;
  }

  const outputResult = tool.output.safeParse(output);
  const latencyMs = Math.round(performance.now() - start);

  if (!outputResult.success) {
    await ctx.supabase.from('agent_tool_call_log').insert({
      photographer_id: ctx.photographerId,
      agent_id: ctx.agentId,
      tool_name: name,
      input_hash: inputHash,
      output_hash: null,
      status: 'error',
      latency_ms: latencyMs,
    });

    throw outputResult.error;
  }

  const outputHash = hashContent(output);

  await ctx.supabase.from('agent_tool_call_log').insert({
    photographer_id: ctx.photographerId,
    agent_id: ctx.agentId,
    tool_name: name,
    input_hash: inputHash,
    output_hash: outputHash,
    status: 'ok',
    latency_ms: latencyMs,
  });

  return output;
}

export function clearTools(): void {
  tools.clear();
}
