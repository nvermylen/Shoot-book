import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  registerTool,
  getTool,
  callTool,
  clearTools,
  ToolPermissionError,
  ToolNotFoundError,
} from './registry';
import type { ToolContext } from '@/types/agent';
import type { SupabaseClient } from '@supabase/supabase-js';

const inputSchema = z.object({ value: z.string() });
const outputSchema = z.object({ result: z.string() });

function mockSupabase(insertResult: { error: null | { message: string } } = { error: null }) {
  const insertFn = vi.fn().mockResolvedValue(insertResult);
  const fromFn = vi.fn().mockReturnValue({ insert: insertFn });
  return {
    client: { from: fromFn } as unknown as SupabaseClient,
    fromFn,
    insertFn,
  };
}

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  const { client } = mockSupabase();
  return {
    agentId: 'lead',
    photographerId: 'phot-001',
    supabase: client,
    ...overrides,
  };
}

function makeCtxWithMock(overrides?: Partial<ToolContext>) {
  const mock = mockSupabase();
  return {
    ctx: {
      agentId: 'lead' as const,
      photographerId: 'phot-001',
      supabase: mock.client,
      ...overrides,
    } satisfies ToolContext,
    ...mock,
  };
}

function registerTestTool(overrides?: { allowedAgents?: ToolContext['agentId'][] }) {
  registerTool({
    name: 'test.echo',
    input: inputSchema,
    output: outputSchema,
    allowedAgents: overrides?.allowedAgents ?? ['lead'],
    handler: async (input) => ({ result: input.value }),
  });
}

describe('tool registry', () => {
  beforeEach(() => {
    clearTools();
  });

  describe('registerTool / getTool', () => {
    it('registers a tool and retrieves it by name', () => {
      registerTestTool();
      const tool = getTool('test.echo');
      expect(tool).toBeDefined();
      if (!tool) return;
      expect(tool.name).toBe('test.echo');
      expect(tool.allowedAgents).toEqual(['lead']);
    });

    it('returns undefined for unregistered tool', () => {
      expect(getTool('nonexistent')).toBeUndefined();
    });
  });

  describe('permission checks', () => {
    it('throws ToolPermissionError when agent is not in allowedAgents', async () => {
      registerTestTool({ allowedAgents: ['lead'] });
      const ctx = makeCtx({ agentId: 'booking' });

      await expect(
        callTool('test.echo', { value: 'hello' }, ctx),
      ).rejects.toThrow(ToolPermissionError);
    });

    it('ToolPermissionError includes tool name and agent id', async () => {
      registerTestTool({ allowedAgents: ['lead'] });
      const ctx = makeCtx({ agentId: 'booking' });

      await expect(
        callTool('test.echo', { value: 'hello' }, ctx),
      ).rejects.toThrow("Agent 'booking' is not allowed to call tool 'test.echo'");
    });

    it('does not write a log row on permission rejection', async () => {
      registerTestTool({ allowedAgents: ['lead'] });
      const { ctx, fromFn } = makeCtxWithMock({ agentId: 'booking' });

      await expect(
        callTool('test.echo', { value: 'hello' }, ctx),
      ).rejects.toThrow(ToolPermissionError);

      expect(fromFn).not.toHaveBeenCalled();
    });

    it('logs permission rejection to console.error', async () => {
      registerTestTool({ allowedAgents: ['lead'] });
      const ctx = makeCtx({ agentId: 'booking' });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        callTool('test.echo', { value: 'hello' }, ctx),
      ).rejects.toThrow(ToolPermissionError);

      expect(errorSpy).toHaveBeenCalledWith('tool_permission_rejected', {
        tool_name: 'test.echo',
        agent_id: 'booking',
      });

      errorSpy.mockRestore();
    });

    it('allows call when agent is in allowedAgents', async () => {
      registerTestTool({ allowedAgents: ['lead', 'comms'] });
      const { ctx } = makeCtxWithMock({ agentId: 'lead' });

      const result = await callTool('test.echo', { value: 'hello' }, ctx);
      expect(result).toEqual({ result: 'hello' });
    });
  });

  describe('tool not found', () => {
    it('throws ToolNotFoundError for unregistered tool', async () => {
      const ctx = makeCtx();
      await expect(
        callTool('nonexistent', { value: 'hello' }, ctx),
      ).rejects.toThrow(ToolNotFoundError);
    });
  });

  describe('input validation', () => {
    it('throws ZodError when input fails validation', async () => {
      registerTestTool();
      const ctx = makeCtx();

      await expect(
        callTool('test.echo', { value: 123 }, ctx),
      ).rejects.toThrow(z.ZodError);
    });

    it('throws ZodError when input is missing required fields', async () => {
      registerTestTool();
      const ctx = makeCtx();

      await expect(
        callTool('test.echo', {}, ctx),
      ).rejects.toThrow(z.ZodError);
    });
  });

  describe('output validation', () => {
    it('throws ZodError when handler returns invalid output', async () => {
      registerTool({
        name: 'test.bad_output',
        input: inputSchema,
        output: outputSchema,
        allowedAgents: ['lead'],
        handler: async () => ({ result: 999 }) as unknown,
      });

      const { ctx, insertFn } = makeCtxWithMock();

      await expect(
        callTool('test.bad_output', { value: 'hello' }, ctx),
      ).rejects.toThrow(z.ZodError);

      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', output_hash: null }),
      );
    });

    it('logs error status before throwing on invalid output', async () => {
      registerTool({
        name: 'test.bad_output',
        input: inputSchema,
        output: outputSchema,
        allowedAgents: ['lead'],
        handler: async () => 'not an object' as unknown,
      });

      const { ctx, insertFn } = makeCtxWithMock();

      await expect(
        callTool('test.bad_output', { value: 'hello' }, ctx),
      ).rejects.toThrow(z.ZodError);

      expect(insertFn).toHaveBeenCalledTimes(1);
      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      );
    });
  });

  describe('handler errors', () => {
    it('logs error status when handler throws', async () => {
      registerTool({
        name: 'test.throws',
        input: inputSchema,
        output: outputSchema,
        allowedAgents: ['lead'],
        handler: async () => { throw new Error('handler exploded'); },
      });

      const { ctx, insertFn } = makeCtxWithMock();

      await expect(
        callTool('test.throws', { value: 'hello' }, ctx),
      ).rejects.toThrow('handler exploded');

      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          output_hash: null,
        }),
      );
    });
  });

  describe('logging', () => {
    it('writes one agent_tool_call_log row on successful call', async () => {
      registerTestTool();
      const { ctx, fromFn, insertFn } = makeCtxWithMock();

      await callTool('test.echo', { value: 'hello' }, ctx);

      expect(fromFn).toHaveBeenCalledWith('agent_tool_call_log');
      expect(insertFn).toHaveBeenCalledTimes(1);
    });

    it('log row matches migration_002 column shape', async () => {
      registerTestTool();
      const { ctx, insertFn } = makeCtxWithMock();

      await callTool('test.echo', { value: 'hello' }, ctx);

      const row = insertFn.mock.calls[0][0];
      expect(row).toEqual({
        photographer_id: 'phot-001',
        agent_id: 'lead',
        tool_name: 'test.echo',
        input_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        output_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: 'ok',
        latency_ms: expect.any(Number),
      });
    });

    it('log row never contains input or output content', async () => {
      registerTestTool();
      const { ctx, insertFn } = makeCtxWithMock();

      await callTool('test.echo', { value: 'secret-data' }, ctx);

      const row = insertFn.mock.calls[0][0];
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('secret-data');
      expect(serialized).not.toContain('value');
      expect(serialized).not.toContain('result');
    });

    it('input_hash and output_hash are sha256 hex digests', async () => {
      registerTestTool();
      const { ctx, insertFn } = makeCtxWithMock();

      await callTool('test.echo', { value: 'test' }, ctx);

      const row = insertFn.mock.calls[0][0];
      expect(row.input_hash).toHaveLength(64);
      expect(row.output_hash).toHaveLength(64);
      expect(row.input_hash).not.toBe(row.output_hash);
    });

    it('console.errors when log insert fails but still returns result', async () => {
      registerTestTool();
      const mock = mockSupabase({ error: { message: 'RLS violation' } });
      const ctx: ToolContext = {
        agentId: 'lead',
        photographerId: 'phot-001',
        supabase: mock.client,
      };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await callTool('test.echo', { value: 'hello' }, ctx);

      expect(result).toEqual({ result: 'hello' });
      expect(errorSpy).toHaveBeenCalledWith('tool_call_log_write_failed', {
        tool_name: 'test.echo',
        agent_id: 'lead',
        log_error_message: 'RLS violation',
      });

      errorSpy.mockRestore();
    });

    it('does not log prompt_version or called_at (DB defaults)', async () => {
      registerTestTool();
      const { ctx, insertFn } = makeCtxWithMock();

      await callTool('test.echo', { value: 'hello' }, ctx);

      const row = insertFn.mock.calls[0][0];
      expect(row).not.toHaveProperty('prompt_version');
      expect(row).not.toHaveProperty('called_at');
    });
  });

  describe('clearTools', () => {
    it('removes all registered tools', () => {
      registerTestTool();
      expect(getTool('test.echo')).toBeDefined();

      clearTools();
      expect(getTool('test.echo')).toBeUndefined();
    });
  });
});
