import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLead, getLead, qualifyLead, convertLeadToClient } from './index';
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
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function mockSupabaseSequence(results: Array<{ data: unknown; error: unknown }>) {
  const chain = createMockChain(results[0]!);
  let callCount = 0;
  chain.single = vi.fn().mockImplementation(() => {
    const result = results[callCount] ?? results[results.length - 1]!;
    callCount++;
    return Promise.resolve(result);
  });
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

const LEAD_ROW = {
  id: 'lead-1',
  photographer_id: 'photo-1',
  display_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  source: 'web_form',
  intent_summary: null,
  qualification_status: 'new',
  qualification_notes: null,
  converted_client_id: null,
  received_at: '2026-06-01T00:00:00Z',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  deleted_at: null,
};

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
  source: 'web_form',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  deleted_at: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('lead module', () => {
  describe('getLead', () => {
    it('returns lead on success', async () => {
      const supabase = mockSupabase({ data: LEAD_ROW, error: null });

      const result = await getLead(supabase as never, 'lead-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(LEAD_ROW);
    });

    it('returns error when lead does not exist', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      });

      const result = await getLead(supabase as never, 'missing');

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });

  describe('createLead', () => {
    it('returns created lead and publishes lead.created', async () => {
      const publishSpy = vi
        .spyOn(bus, 'publish')
        .mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: LEAD_ROW, error: null });

      const result = await createLead(supabase as never, {
        photographer_id: 'photo-1',
        display_name: 'Jane Doe',
        email: 'jane@example.com',
        source: 'web_form',
        received_at: '2026-06-01T00:00:00Z',
      });

      expect(result.error).toBeNull();
      expect(result.data).toEqual(LEAD_ROW);
      expect(result.warning).toBeUndefined();
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'lead.created', lead_id: 'lead-1' }),
        expect.anything(),
      );
    });

    it('returns db_error when insert fails', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });

      const result = await createLead(supabase as never, {
        photographer_id: 'photo-1',
        display_name: 'Jane Doe',
        email: 'jane@example.com',
        source: 'web_form',
        received_at: '2026-06-01T00:00:00Z',
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('db_error');
    });

    it('returns data with warning when event publish fails', async () => {
      vi.spyOn(bus, 'publish').mockRejectedValue(
        new Error('event bus down'),
      );
      const supabase = mockSupabase({ data: LEAD_ROW, error: null });

      const result = await createLead(supabase as never, {
        photographer_id: 'photo-1',
        display_name: 'Jane Doe',
        email: 'jane@example.com',
        source: 'web_form',
        received_at: '2026-06-01T00:00:00Z',
      });

      expect(result.data).toEqual(LEAD_ROW);
      expect(result.error).toBeNull();
      expect(result.warning).toContain('event_publish_failed');
      expect(result.warning).toContain('event bus down');
    });
  });

  describe('qualifyLead', () => {
    it('returns updated lead and publishes lead.qualified', async () => {
      const qualifiedRow = {
        ...LEAD_ROW,
        qualification_status: 'qualified',
        qualification_notes: 'Good fit',
      };
      const publishSpy = vi
        .spyOn(bus, 'publish')
        .mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: qualifiedRow, error: null });

      const result = await qualifyLead(supabase as never, 'lead-1', {
        qualification_status: 'qualified',
        qualification_notes: 'Good fit',
      });

      expect(result.error).toBeNull();
      expect(result.data?.qualification_status).toBe('qualified');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'lead.qualified',
          qualification_status: 'qualified',
        }),
        expect.anything(),
      );
    });

    it('rejects converted status with validation_error', async () => {
      const supabase = mockSupabase({ data: null, error: null });

      const result = await qualifyLead(supabase as never, 'lead-1', {
        qualification_status: 'converted',
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('validation_error');
      expect(result.error?.detail).toContain('convertLeadToClient');
    });

    it('returns data with warning when event publish fails', async () => {
      const qualifiedRow = {
        ...LEAD_ROW,
        qualification_status: 'qualified',
      };
      vi.spyOn(bus, 'publish').mockRejectedValue(
        new Error('event bus down'),
      );
      const supabase = mockSupabase({ data: qualifiedRow, error: null });

      const result = await qualifyLead(supabase as never, 'lead-1', {
        qualification_status: 'qualified',
      });

      expect(result.data).toEqual(qualifiedRow);
      expect(result.error).toBeNull();
      expect(result.warning).toContain('event_publish_failed');
    });
  });

  describe('convertLeadToClient', () => {
    it('creates client, updates lead, publishes both events', async () => {
      const convertedLead = {
        ...LEAD_ROW,
        qualification_status: 'converted',
        converted_client_id: 'client-1',
      };
      const publishSpy = vi
        .spyOn(bus, 'publish')
        .mockResolvedValue(undefined);
      const supabase = mockSupabaseSequence([
        { data: LEAD_ROW, error: null },
        { data: CLIENT_ROW, error: null },
        { data: convertedLead, error: null },
      ]);

      const result = await convertLeadToClient(supabase as never, 'lead-1');

      expect(result.error).toBeNull();
      expect(result.data?.lead.qualification_status).toBe('converted');
      expect(result.data?.client.id).toBe('client-1');
      expect(result.warning).toBeUndefined();

      const eventTypes = publishSpy.mock.calls.map(
        (c) => (c[0] as { type: string }).type,
      );
      expect(eventTypes).toContain('client.created');
      expect(eventTypes).toContain('lead.converted');
    });

    it('returns db_error with orphaned client ID when lead update fails', async () => {
      vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabaseSequence([
        { data: LEAD_ROW, error: null },
        { data: CLIENT_ROW, error: null },
        { data: null, error: { code: '23505', message: 'update conflict' } },
      ]);

      const result = await convertLeadToClient(supabase as never, 'lead-1');

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('db_error');
      expect(result.error?.detail).toContain('client-1');
      expect(result.error?.detail).toContain('update conflict');
    });

    it('rejects already-converted lead', async () => {
      const convertedLead = {
        ...LEAD_ROW,
        qualification_status: 'converted',
        converted_client_id: 'client-1',
      };
      const supabase = mockSupabase({ data: convertedLead, error: null });

      const result = await convertLeadToClient(supabase as never, 'lead-1');

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('validation_error');
      expect(result.error?.detail).toContain('already converted');
    });
  });
});
