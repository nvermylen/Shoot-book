import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendCommLog, getCommLog, listCommLogs } from './index';
import * as bus from '@/lib/events/bus';

function createMockChain(singleResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn().mockResolvedValue(singleResult),
  };
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockResolvedValue({ data: [], error: null });
  return chain;
}

function mockSupabase(singleResult: { data: unknown; error: unknown }) {
  const chain = createMockChain(singleResult);
  return { from: vi.fn().mockReturnValue(chain) };
}

const COMM_LOG_ROW = {
  id: 'comm-1',
  photographer_id: 'photo-1',
  client_id: 'client-1',
  lead_id: null,
  booking_id: null,
  direction: 'outbound' as const,
  channel: 'email' as const,
  agent_id: 'comms' as const,
  subject: 'Hello',
  body: 'Hi there',
  external_message_id: null,
  sequence_id: null,
  sent_at: '2026-06-01T00:00:00Z',
  created_at: '2026-06-01T00:00:00Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('comm-log module', () => {
  describe('getCommLog', () => {
    it('returns comm log on success', async () => {
      const supabase = mockSupabase({ data: COMM_LOG_ROW, error: null });
      const result = await getCommLog(supabase as never, 'comm-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(COMM_LOG_ROW);
    });
  });

  describe('listCommLogs', () => {
    it('returns filtered list by client_id', async () => {
      const chain = createMockChain({ data: null, error: null });
      chain.order.mockResolvedValue({ data: [COMM_LOG_ROW], error: null });
      const supabase = { from: vi.fn().mockReturnValue(chain) };

      const result = await listCommLogs(supabase as never, {
        client_id: 'client-1',
      });

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(chain.eq).toHaveBeenCalledWith('client_id', 'client-1');
    });
  });

  describe('appendCommLog', () => {
    it('inserts and publishes comm_log.created', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: COMM_LOG_ROW, error: null });

      const result = await appendCommLog(supabase as never, {
        photographer_id: 'photo-1',
        client_id: 'client-1',
        direction: 'outbound',
        channel: 'email',
        agent_id: 'comms',
        subject: 'Hello',
        body: 'Hi there',
        sent_at: '2026-06-01T00:00:00Z',
      });

      expect(result.error).toBeNull();
      expect(result.data).toEqual(COMM_LOG_ROW);
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comm_log.created',
          comm_log_id: 'comm-1',
        }),
        expect.anything(),
      );
    });

    it('returns data with warning when event publish fails', async () => {
      vi.spyOn(bus, 'publish').mockRejectedValue(new Error('bus down'));
      const supabase = mockSupabase({ data: COMM_LOG_ROW, error: null });

      const result = await appendCommLog(supabase as never, {
        photographer_id: 'photo-1',
        direction: 'outbound',
        channel: 'email',
        sent_at: '2026-06-01T00:00:00Z',
      });

      expect(result.data).toEqual(COMM_LOG_ROW);
      expect(result.error).toBeNull();
      expect(result.warning).toContain('event_publish_failed');
    });

    it('returns db_error when insert fails', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: '23503', message: 'fk violation' },
      });
      const result = await appendCommLog(supabase as never, {
        photographer_id: 'photo-1',
        direction: 'outbound',
        channel: 'email',
        sent_at: '2026-06-01T00:00:00Z',
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('db_error');
    });
  });
});
