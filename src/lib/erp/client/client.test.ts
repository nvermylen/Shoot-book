import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, getClient, softDeleteClient, updateClientContact } from './index';
import * as bus from '@/lib/events/bus';

function createMockChain(singleResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    single: vi.fn().mockResolvedValue(singleResult),
  };
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.order.mockResolvedValue({ data: [], error: null });
  return chain;
}

function mockSupabase(singleResult: { data: unknown; error: unknown }) {
  const chain = createMockChain(singleResult);
  return { from: vi.fn().mockReturnValue(chain) };
}

const CLIENT_ROW = {
  id: 'client-1',
  photographer_id: 'photo-1',
  display_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  parent_email: null,
  parent_name: null,
  parent_phone: null,
  notes: null,
  source: 'web_form' as const,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  deleted_at: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('client module', () => {
  describe('getClient', () => {
    it('returns client on success', async () => {
      const supabase = mockSupabase({ data: CLIENT_ROW, error: null });
      const result = await getClient(supabase as never, 'client-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(CLIENT_ROW);
    });

    it('returns error when client does not exist', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      const result = await getClient(supabase as never, 'missing');

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });

  describe('createClient', () => {
    it('returns created client and publishes client.created', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: CLIENT_ROW, error: null });

      const result = await createClient(supabase as never, {
        photographer_id: 'photo-1',
        display_name: 'Jane Doe',
        email: 'jane@example.com',
        source: 'web_form',
      });

      expect(result.error).toBeNull();
      expect(result.data).toEqual(CLIENT_ROW);
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'client.created', client_id: 'client-1' }),
        expect.anything(),
      );
    });

    it('returns data with warning when event publish fails', async () => {
      vi.spyOn(bus, 'publish').mockRejectedValue(new Error('bus down'));
      const supabase = mockSupabase({ data: CLIENT_ROW, error: null });

      const result = await createClient(supabase as never, {
        photographer_id: 'photo-1',
        display_name: 'Jane Doe',
        email: 'jane@example.com',
        source: 'web_form',
      });

      expect(result.data).toEqual(CLIENT_ROW);
      expect(result.error).toBeNull();
      expect(result.warning).toContain('event_publish_failed');
    });

    it('returns db_error when insert fails', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: '23505', message: 'duplicate' },
      });
      const result = await createClient(supabase as never, {
        photographer_id: 'photo-1',
        display_name: 'Jane Doe',
        email: 'jane@example.com',
        source: 'web_form',
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('db_error');
    });
  });

  describe('updateClientContact', () => {
    it('updates parent contact and returns the row', async () => {
      const updated = { ...CLIENT_ROW, parent_name: 'Susan Doe', parent_email: 'susan@example.com' };
      const supabase = mockSupabase({ data: updated, error: null });

      const result = await updateClientContact(supabase as never, 'client-1', {
        parent_name: 'Susan Doe',
        parent_email: 'susan@example.com',
      });

      expect(result.error).toBeNull();
      expect(result.data?.parent_name).toBe('Susan Doe');
    });

    it('normalizes empty strings to null', async () => {
      const chain = createMockChain({ data: CLIENT_ROW, error: null });
      const supabase = { from: vi.fn().mockReturnValue(chain) };

      await updateClientContact(supabase as never, 'client-1', { phone: '   ' });

      expect(chain.update).toHaveBeenCalledWith({ phone: null });
    });

    it('rejects an invalid parent email without a db write', async () => {
      const chain = createMockChain({ data: CLIENT_ROW, error: null });
      const supabase = { from: vi.fn().mockReturnValue(chain) };

      const result = await updateClientContact(supabase as never, 'client-1', {
        parent_email: 'not-an-email',
      });

      expect(result.error?.code).toBe('validation_error');
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('returns validation_error when no fields are provided', async () => {
      const supabase = mockSupabase({ data: CLIENT_ROW, error: null });
      const result = await updateClientContact(supabase as never, 'client-1', {});

      expect(result.error?.code).toBe('validation_error');
    });
  });

  describe('softDeleteClient', () => {
    it('sets deleted_at and publishes client.deleted', async () => {
      const deletedRow = { ...CLIENT_ROW, deleted_at: '2026-06-15T00:00:00Z' };
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: deletedRow, error: null });

      const result = await softDeleteClient(supabase as never, 'client-1');

      expect(result.error).toBeNull();
      expect(result.data?.deleted_at).not.toBeNull();
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'client.deleted', client_id: 'client-1' }),
        expect.anything(),
      );
    });

    it('returns not_found when client does not exist', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      const result = await softDeleteClient(supabase as never, 'missing');

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });
});
