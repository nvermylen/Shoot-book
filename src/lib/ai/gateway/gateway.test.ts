import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { registerTool, clearTools } from '@/lib/ai/tools/registry';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import {
  callAgent,
  clearClient,
  GatewayEvalNotConfiguredError,
  GatewayRetryExhaustedError,
  GatewayValidationError,
} from './gateway';
import type { GatewayRequest } from './gateway';

function makeRequest(overrides?: Partial<GatewayRequest>): GatewayRequest {
  return {
    agentId: 'lead',
    messages: [{ role: 'user', content: 'Hello' }],
    metadata: {
      requestId: 'req-001',
      workspaceId: 'ws-001',
      userId: 'user-001',
    },
    ...overrides,
  };
}

function makeResponse(overrides?: Record<string, unknown>) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello' }],
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'end_turn',
    container: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
    },
    ...overrides,
  };
}

function makeApiError(status: number, message = `API error ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

describe('gateway', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    clearClient();
    clearTools();
    vi.restoreAllMocks();
    delete process.env.LENS_GATEWAY_MODE;
  });

  describe('happy path', () => {
    it('returns response with all metadata fields on success', async () => {
      mockCreate.mockResolvedValueOnce(makeResponse());

      const result = await callAgent(makeRequest());

      expect(result.content).toEqual([{ type: 'text', text: 'Hello' }]);
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
      expect(result.promptVersion).toBe('lead.v1');
      expect(result.modelUsed).toBe('claude-haiku-4-5-20251001');
      expect(result.latencyMs).toEqual(expect.any(Number));
      expect(result.retryCount).toBe(0);
    });
  });

  describe('retry', () => {
    it('retries on 429 and succeeds on attempt 2 with retryCount 1', async () => {
      vi.useFakeTimers();

      mockCreate
        .mockRejectedValueOnce(makeApiError(429, 'rate limited'))
        .mockResolvedValueOnce(makeResponse());

      const promise = callAgent(makeRequest());
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.retryCount).toBe(1);
      expect(mockCreate).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('throws GatewayRetryExhaustedError after three consecutive 5xx', async () => {
      vi.useFakeTimers();

      mockCreate
        .mockRejectedValueOnce(makeApiError(500))
        .mockRejectedValueOnce(makeApiError(502))
        .mockRejectedValueOnce(makeApiError(503));

      const promise = callAgent(makeRequest()).catch((e: unknown) => e);
      await vi.runAllTimersAsync();

      const error = await promise;
      expect(error).toBeInstanceOf(GatewayRetryExhaustedError);
      expect(mockCreate).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('retries on network error (no status field)', async () => {
      vi.useFakeTimers();

      const networkErr = Object.assign(new Error('socket hang up'), {
        name: 'APIConnectionError',
      });
      mockCreate
        .mockRejectedValueOnce(networkErr)
        .mockResolvedValueOnce(makeResponse());

      const promise = callAgent(makeRequest());
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.retryCount).toBe(1);
      expect(mockCreate).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('retries on ECONNRESET', async () => {
      vi.useFakeTimers();

      const connErr = Object.assign(new Error('connection reset'), {
        code: 'ECONNRESET',
      });
      mockCreate
        .mockRejectedValueOnce(connErr)
        .mockResolvedValueOnce(makeResponse());

      const promise = callAgent(makeRequest());
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.retryCount).toBe(1);
      vi.useRealTimers();
    });

    it('does not retry on status 600', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockCreate.mockRejectedValueOnce(makeApiError(600));

      await expect(callAgent(makeRequest())).rejects.toThrow('API error 600');
      expect(mockCreate).toHaveBeenCalledTimes(1);

      logSpy.mockRestore();
    });

    it('does not retry on 400 — throws immediately with retryCount 0', async () => {
      mockCreate.mockRejectedValueOnce(makeApiError(400, 'bad request'));

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(callAgent(makeRequest())).rejects.toThrow('bad request');
      expect(mockCreate).toHaveBeenCalledTimes(1);

      const logLine = JSON.parse(logSpy.mock.calls[0]![0] as string);
      expect(logLine.retryCount).toBe(0);

      logSpy.mockRestore();
    });
  });

  describe('eval mode', () => {
    it('throws GatewayValidationError when fixtureKey is missing', async () => {
      process.env.LENS_GATEWAY_MODE = 'eval';

      await expect(callAgent(makeRequest())).rejects.toThrow(
        GatewayValidationError,
      );
      await expect(callAgent(makeRequest())).rejects.toThrow(
        /fixtureKey/,
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('throws GatewayEvalNotConfiguredError when fixture not found', async () => {
      process.env.LENS_GATEWAY_MODE = 'eval';

      await expect(
        callAgent(makeRequest({
          metadata: { requestId: 'req-001', workspaceId: 'ws-001', userId: 'user-001', fixtureKey: 'nonexistent' },
        })),
      ).rejects.toThrow(GatewayEvalNotConfiguredError);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns fixture response when fixture exists', async () => {
      const { registerFixture, clearFixtures } = await import('./fixtures');
      clearFixtures();
      registerFixture('lead', 'test-fixture', {
        content: [{ type: 'text', citations: null, text: 'fixture output' }],
        stopReason: 'end_turn',
      });

      process.env.LENS_GATEWAY_MODE = 'eval';

      const result = await callAgent(makeRequest({
        metadata: { requestId: 'req-001', workspaceId: 'ws-001', userId: 'user-001', fixtureKey: 'test-fixture' },
      }));

      expect(result.content).toEqual([{ type: 'text', citations: null, text: 'fixture output' }]);
      expect(result.modelUsed).toBe('fixture:test-fixture');
      expect(result.promptVersion).toBe('lead.v1');
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
      expect(mockCreate).not.toHaveBeenCalled();

      clearFixtures();
    });
  });

  describe('model selection', () => {
    it('resolves different models for different agents', async () => {
      mockCreate.mockResolvedValue(makeResponse());

      await callAgent(makeRequest({ agentId: 'lead' }));
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
      );

      mockCreate.mockClear();

      await callAgent(makeRequest({ agentId: 'booking' }));
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' }),
      );
    });
  });

  describe('logging', () => {
    it('log line contains all required fields on success', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockCreate.mockResolvedValueOnce(makeResponse());

      await callAgent(makeRequest());

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logLine = JSON.parse(logSpy.mock.calls[0]![0] as string);

      expect(logLine).toEqual(
        expect.objectContaining({
          requestId: 'req-001',
          agentId: 'lead',
          promptVersion: 'lead.v1',
          modelUsed: 'claude-haiku-4-5-20251001',
          inputTokens: 100,
          outputTokens: 50,
          stopReason: 'end_turn',
          retryCount: 0,
          mode: 'live',
          status: 'ok',
        }),
      );
      expect(logLine.latencyMs).toEqual(expect.any(Number));

      logSpy.mockRestore();
    });

    it('log payload keys match explicit allowlist — no content leaks', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockCreate.mockResolvedValueOnce(makeResponse());

      await callAgent(
        makeRequest({
          systemPrompt: 'You are a photography assistant',
          messages: [
            { role: 'user', content: 'client email: secret@example.com' },
          ],
        }),
      );

      const logLine = JSON.parse(logSpy.mock.calls[0]![0] as string);

      const allowedKeys = new Set([
        'requestId', 'agentId', 'promptVersion', 'modelUsed',
        'inputTokens', 'outputTokens', 'latencyMs', 'stopReason',
        'retryCount', 'mode', 'status', 'errorType',
      ]);

      for (const key of Object.keys(logLine)) {
        expect(allowedKeys.has(key), `unexpected key in log: '${key}'`).toBe(
          true,
        );
      }

      const serialized = JSON.stringify(logLine);
      expect(serialized).not.toContain('secret@example.com');
      expect(serialized).not.toContain('photography assistant');
      expect(serialized).not.toContain('messages');
      expect(serialized).not.toContain('systemPrompt');
      expect(serialized).not.toContain('content');

      logSpy.mockRestore();
    });
  });

  describe('tool resolution', () => {
    it('resolves registered tools via registry lookup', async () => {
      registerTool({
        name: 'test.echo',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        allowedAgents: ['lead'],
        handler: async (input) => ({ result: input.value }),
      });

      mockCreate.mockResolvedValueOnce(makeResponse());

      await callAgent(makeRequest({ tools: ['test.echo'] }));

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'test.echo' }),
          ]),
        }),
      );
    });

    it('throws GatewayValidationError for unknown tool name before SDK call', async () => {
      await expect(
        callAgent(makeRequest({ tools: ['nonexistent.tool'] })),
      ).rejects.toThrow(GatewayValidationError);
      await expect(
        callAgent(makeRequest({ tools: ['nonexistent.tool'] })),
      ).rejects.toThrow("Unknown tool: 'nonexistent.tool'");

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('throws GatewayValidationError for empty messages array', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(
        callAgent(makeRequest({ messages: [] })),
      ).rejects.toThrow(GatewayValidationError);

      expect(mockCreate).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('logs validation failures with error status', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(
        callAgent(makeRequest({ messages: [] })),
      ).rejects.toThrow(GatewayValidationError);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logLine = JSON.parse(logSpy.mock.calls[0]![0] as string);
      expect(logLine).toEqual(
        expect.objectContaining({
          status: 'error',
          errorType: 'GatewayValidationError',
          agentId: 'lead',
          retryCount: 0,
        }),
      );

      logSpy.mockRestore();
    });
  });

  describe('tool schema validation', () => {
    it('rejects non-object input schema', async () => {
      registerTool({
        name: 'test.bad_schema',
        input: z.string(),
        output: z.object({ result: z.string() }),
        allowedAgents: ['lead'],
        handler: async (input) => ({ result: input }),
      });

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(
        callAgent(makeRequest({ tools: ['test.bad_schema'] })),
      ).rejects.toThrow(GatewayValidationError);
      await expect(
        callAgent(makeRequest({ tools: ['test.bad_schema'] })),
      ).rejects.toThrow("input schema must be an object");

      expect(mockCreate).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
