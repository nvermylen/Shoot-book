// This is the ONLY file in the codebase allowed to import @anthropic-ai/sdk.
// See ANTI_PATTERNS.md rule #21.
import Anthropic from '@anthropic-ai/sdk';
import { toJSONSchema } from 'zod';
import type { AgentId } from '@/types/agent';
import { getTool } from '@/lib/ai/tools/registry';
import { AGENT_MODELS } from './models';
import { getActiveVersion } from './versions';
import { getFixture } from './fixtures';

export class GatewayEvalNotConfiguredError extends Error {
  constructor() {
    super(
      'Eval mode requires a fixture provider, which is not yet implemented. ' +
        'Set LENS_GATEWAY_MODE=live or unset it. Eval harness ships in a future sprint.',
    );
    this.name = 'GatewayEvalNotConfiguredError';
  }
}

export class GatewayRetryExhaustedError extends Error {
  constructor(attempts: number, lastError: Error) {
    super(
      `Gateway retry exhausted after ${attempts} attempts: ${lastError.message}`,
    );
    this.name = 'GatewayRetryExhaustedError';
  }
}

export class GatewayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayValidationError';
  }
}

export interface GatewayRequest {
  agentId: AgentId;
  messages: Anthropic.MessageParam[];
  systemPrompt?: string;
  tools?: string[];
  metadata: {
    requestId: string;
    workspaceId: string;
    userId: string;
    fixtureKey?: string;
  };
}

export interface GatewayResponse {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.Message['stop_reason'];
  usage: { inputTokens: number; outputTokens: number };
  promptVersion: string;
  modelUsed: string;
  latencyMs: number;
  retryCount: number;
}

const VALID_AGENT_IDS: Set<string> = new Set([
  'lead', 'booking', 'comms', 'billing', 'expense', 'delivery',
]);

const MAX_ATTEMPTS = 3;
const BASE_DELAYS = [250, 1000, 4000];

function getRetryDelay(retryIndex: number): number {
  const base =
    BASE_DELAYS[retryIndex] ?? BASE_DELAYS[BASE_DELAYS.length - 1]!;
  const jitter = base * 0.2;
  return base + (Math.random() * 2 - 1) * jitter;
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  if (
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    const status = (error as { status: number }).status;
    if (status === 429 || (status >= 500 && status < 600)) return true;
  }

  if (
    error.name === 'APIConnectionError' ||
    error.name === 'APIConnectionTimeoutError'
  ) {
    return true;
  }

  if ('code' in error) {
    const code = (error as { code: unknown }).code;
    if (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED'
    ) {
      return true;
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// getActiveVersion is now in ./versions.ts

function resolveTools(toolNames: string[]): Anthropic.Tool[] {
  return toolNames.map((name) => {
    const tool = getTool(name);
    if (!tool) {
      throw new GatewayValidationError(`Unknown tool: '${name}'`);
    }
    const jsonSchema = toJSONSchema(tool.input);
    if (
      typeof jsonSchema !== 'object' ||
      (jsonSchema as { type?: unknown }).type !== 'object'
    ) {
      throw new GatewayValidationError(
        `Tool '${name}' input schema must be an object — got ${(jsonSchema as { type?: string }).type ?? 'unknown'}`,
      );
    }
    return {
      name: tool.name,
      // TODO: add description field to ToolSpec when first agent registers tools (Sprint 3)
      description: '',
      input_schema: jsonSchema as Anthropic.Tool.InputSchema,
    };
  });
}

const LOG_ALLOWLIST = new Set([
  'requestId',
  'agentId',
  'promptVersion',
  'modelUsed',
  'inputTokens',
  'outputTokens',
  'latencyMs',
  'stopReason',
  'retryCount',
  'mode',
  'status',
  'errorType',
]);

function logGatewayCall(entry: Record<string, unknown>): void {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(entry)) {
    if (LOG_ALLOWLIST.has(key)) {
      filtered[key] = entry[key];
    }
  }
  console.log(JSON.stringify(filtered));
}

function logFailure(
  req: GatewayRequest,
  errorType: string,
  latencyMs: number,
  retryCount: number,
): void {
  logGatewayCall({
    requestId: req.metadata.requestId,
    agentId: req.agentId,
    promptVersion: VALID_AGENT_IDS.has(req.agentId)
      ? getActiveVersion(req.agentId as AgentId)
      : 'unknown',
    modelUsed:
      AGENT_MODELS[req.agentId as AgentId] ?? 'unknown',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs,
    stopReason: null,
    retryCount,
    mode: (process.env.LENS_GATEWAY_MODE ?? 'live') as 'live' | 'eval',
    status: 'error',
    errorType,
  });
}

/**
 * Whether the gateway can serve calls in this environment. Callers that would
 * otherwise create durable records around a model call (e.g. intake's
 * create-then-qualify) should fail closed on false rather than produce
 * records the model never judged. Eval mode replays fixtures — no key needed.
 */
export function isGatewayConfigured(): boolean {
  return process.env.LENS_GATEWAY_MODE === 'eval' || !!process.env.ANTHROPIC_API_KEY;
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export function clearClient(): void {
  _client = null;
}

// NOTE: retryCount is returned on success and surfaced in logs on failure.
// It is NOT attached to thrown errors — the original SDK error or
// GatewayRetryExhaustedError preserves the underlying failure context.
// Agents can correlate via requestId in logs.
export async function callAgent(
  req: GatewayRequest,
): Promise<GatewayResponse> {
  if (!VALID_AGENT_IDS.has(req.agentId)) {
    logFailure(req, 'GatewayValidationError', 0, 0);
    throw new GatewayValidationError(`Unknown agentId: '${req.agentId}'`);
  }
  if (!req.messages.length) {
    logFailure(req, 'GatewayValidationError', 0, 0);
    throw new GatewayValidationError('Messages array must not be empty');
  }

  const mode = (process.env.LENS_GATEWAY_MODE ?? 'live') as 'live' | 'eval';
  const promptVersion = getActiveVersion(req.agentId);
  const model = AGENT_MODELS[req.agentId];

  if (mode === 'eval') {
    const fixtureKey = req.metadata.fixtureKey;
    if (!fixtureKey) {
      logFailure(req, 'GatewayValidationError', 0, 0);
      throw new GatewayValidationError('Eval mode requires metadata.fixtureKey');
    }
    const fixture = getFixture(req.agentId, fixtureKey);
    if (!fixture) {
      logFailure(req, 'GatewayEvalNotConfiguredError', 0, 0);
      throw new GatewayEvalNotConfiguredError();
    }
    logGatewayCall({
      requestId: req.metadata.requestId,
      agentId: req.agentId,
      promptVersion,
      modelUsed: `fixture:${fixtureKey}`,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      stopReason: fixture.stopReason,
      retryCount: 0,
      mode,
      status: 'ok',
    });
    return {
      content: fixture.content,
      stopReason: fixture.stopReason,
      usage: { inputTokens: 0, outputTokens: 0 },
      promptVersion,
      modelUsed: `fixture:${fixtureKey}`,
      latencyMs: 0,
      retryCount: 0,
    };
  }

  let tools: Anthropic.Tool[] | undefined;
  try {
    tools = req.tools?.length ? resolveTools(req.tools) : undefined;
  } catch (err) {
    if (err instanceof GatewayValidationError) {
      logFailure(req, 'GatewayValidationError', 0, 0);
    }
    throw err;
  }

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 4096,
    messages: req.messages,
    ...(req.systemPrompt && { system: req.systemPrompt }),
    ...(tools && { tools }),
  };

  const start = performance.now();
  let retryCount = 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await getClient().messages.create(params);
      const latencyMs = Math.round(performance.now() - start);

      logGatewayCall({
        requestId: req.metadata.requestId,
        agentId: req.agentId,
        promptVersion,
        modelUsed: model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs,
        stopReason: response.stop_reason,
        retryCount,
        mode,
        status: 'ok',
      });

      return {
        content: response.content,
        stopReason: response.stop_reason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        promptVersion,
        modelUsed: model,
        latencyMs,
        retryCount,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryable(err) || attempt === MAX_ATTEMPTS - 1) {
        const latencyMs = Math.round(performance.now() - start);
        logFailure(req, lastError.name, latencyMs, retryCount);

        if (isRetryable(err)) {
          throw new GatewayRetryExhaustedError(MAX_ATTEMPTS, lastError);
        }
        throw err;
      }

      retryCount++;
      await sleep(getRetryDelay(attempt));
    }
  }

  throw new GatewayRetryExhaustedError(MAX_ATTEMPTS, lastError!); // safe: loop always sets lastError before reaching here
}
