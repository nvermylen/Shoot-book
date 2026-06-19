import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPackage, getPackage, updatePackage } from './index';
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

const PACKAGE_ROW = {
  id: 'pkg-1',
  photographer_id: 'photo-1',
  name: 'Senior Session',
  description: null,
  price_cents: 30000,
  deposit_cents: 10000,
  session_type: 'senior' as const,
  included_locations_count: 2,
  included_outfits_count: 3,
  delivery_count: 50,
  is_active: true,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  deleted_at: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('package module', () => {
  describe('getPackage', () => {
    it('returns package on success', async () => {
      const supabase = mockSupabase({ data: PACKAGE_ROW, error: null });
      const result = await getPackage(supabase as never, 'pkg-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(PACKAGE_ROW);
    });
  });

  describe('createPackage', () => {
    it('returns created package and publishes package.created', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: PACKAGE_ROW, error: null });

      const result = await createPackage(supabase as never, {
        photographer_id: 'photo-1',
        name: 'Senior Session',
        price_cents: 30000,
        deposit_cents: 10000,
        session_type: 'senior',
        included_locations_count: 2,
        delivery_count: 50,
      });

      expect(result.error).toBeNull();
      expect(result.data).toEqual(PACKAGE_ROW);
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'package.created',
          package_id: 'pkg-1',
        }),
        expect.anything(),
      );
    });

    it('returns data with warning when event publish fails', async () => {
      vi.spyOn(bus, 'publish').mockRejectedValue(new Error('bus down'));
      const supabase = mockSupabase({ data: PACKAGE_ROW, error: null });

      const result = await createPackage(supabase as never, {
        photographer_id: 'photo-1',
        name: 'Senior Session',
        price_cents: 30000,
        deposit_cents: 10000,
        session_type: 'senior',
        included_locations_count: 2,
        delivery_count: 50,
      });

      expect(result.data).toEqual(PACKAGE_ROW);
      expect(result.error).toBeNull();
      expect(result.warning).toContain('event_publish_failed');
    });
  });

  describe('updatePackage', () => {
    it('returns updated package and publishes package.updated', async () => {
      const updatedRow = { ...PACKAGE_ROW, name: 'Premium Senior' };
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: updatedRow, error: null });

      const result = await updatePackage(supabase as never, 'pkg-1', {
        name: 'Premium Senior',
      });

      expect(result.error).toBeNull();
      expect(result.data?.name).toBe('Premium Senior');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'package.updated',
          package_id: 'pkg-1',
        }),
        expect.anything(),
      );
    });

    it('returns not_found when package does not exist', async () => {
      const supabase = mockSupabase({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      const result = await updatePackage(supabase as never, 'missing', {
        name: 'X',
      });

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });
});
