import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLocation, getLocation, updateLocation } from './index';
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

const LOCATION_ROW = {
  id: 'loc-1',
  photographer_id: 'photo-1',
  name: 'Sunset Park',
  category: 'nature_rustic' as const,
  description: null,
  representative_image_url: null,
  is_active: true,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  deleted_at: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('location module', () => {
  describe('getLocation', () => {
    it('returns location on success', async () => {
      const supabase = mockSupabase({ data: LOCATION_ROW, error: null });
      const result = await getLocation(supabase as never, 'loc-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(LOCATION_ROW);
    });
  });

  describe('createLocation', () => {
    it('returns created location and publishes location.created', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: LOCATION_ROW, error: null });

      const result = await createLocation(supabase as never, {
        photographer_id: 'photo-1',
        name: 'Sunset Park',
        category: 'nature_rustic',
      });

      expect(result.error).toBeNull();
      expect(result.data).toEqual(LOCATION_ROW);
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'location.created',
          location_id: 'loc-1',
        }),
        expect.anything(),
      );
    });

    it('returns data with warning when event publish fails', async () => {
      vi.spyOn(bus, 'publish').mockRejectedValue(new Error('bus down'));
      const supabase = mockSupabase({ data: LOCATION_ROW, error: null });

      const result = await createLocation(supabase as never, {
        photographer_id: 'photo-1',
        name: 'Sunset Park',
        category: 'nature_rustic',
      });

      expect(result.data).toEqual(LOCATION_ROW);
      expect(result.error).toBeNull();
      expect(result.warning).toContain('event_publish_failed');
    });
  });

  describe('updateLocation', () => {
    it('returns updated location and publishes location.updated', async () => {
      const updatedRow = { ...LOCATION_ROW, name: 'Sunrise Park' };
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: updatedRow, error: null });

      const result = await updateLocation(supabase as never, 'loc-1', {
        name: 'Sunrise Park',
      });

      expect(result.error).toBeNull();
      expect(result.data?.name).toBe('Sunrise Park');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'location.updated',
          location_id: 'loc-1',
        }),
        expect.anything(),
      );
    });

    it('returns error when location does not exist', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      const result = await updateLocation(supabase as never, 'missing', {
        name: 'X',
      });

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });
});
