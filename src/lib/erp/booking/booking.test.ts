import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBooking,
  getBooking,
  assignLocations,
  cancelBooking,
} from './index';
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
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

function mockSupabaseSequence(
  results: Array<{ data: unknown; error: unknown }>,
) {
  const chain = createMockChain(results[0]!);
  let callCount = 0;
  chain.single = vi.fn().mockImplementation(() => {
    const result = results[callCount] ?? results[results.length - 1]!;
    callCount++;
    return Promise.resolve(result);
  });
  chain.insert.mockImplementation(() => {
    return chain;
  });
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

const BOOKING_ROW = {
  id: 'booking-1',
  photographer_id: 'photo-1',
  client_id: 'client-1',
  package_id: 'pkg-1',
  session_date: null,
  duration_minutes: null,
  status: 'tentative' as const,
  contract_id: null,
  deposit_invoice_id: null,
  final_invoice_id: null,
  external_calendar_event_id: null,
  notes: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  deleted_at: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('booking module', () => {
  describe('getBooking', () => {
    it('returns booking on success', async () => {
      const supabase = mockSupabase({ data: BOOKING_ROW, error: null });
      const result = await getBooking(supabase as never, 'booking-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(BOOKING_ROW);
    });
  });

  describe('createBooking', () => {
    it('returns created booking and publishes booking.created', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabase({ data: BOOKING_ROW, error: null });

      const result = await createBooking(supabase as never, {
        photographer_id: 'photo-1',
        client_id: 'client-1',
        package_id: 'pkg-1',
      });

      expect(result.error).toBeNull();
      expect(result.data).toEqual(BOOKING_ROW);
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking.created',
          booking_id: 'booking-1',
        }),
        expect.anything(),
      );
    });

    it('returns data with warning when event publish fails', async () => {
      vi.spyOn(bus, 'publish').mockRejectedValue(new Error('bus down'));
      const supabase = mockSupabase({ data: BOOKING_ROW, error: null });

      const result = await createBooking(supabase as never, {
        photographer_id: 'photo-1',
        client_id: 'client-1',
        package_id: 'pkg-1',
      });

      expect(result.data).toEqual(BOOKING_ROW);
      expect(result.error).toBeNull();
      expect(result.warning).toContain('event_publish_failed');
    });
  });

  describe('assignLocations', () => {
    it('inserts booking_location rows and publishes event', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const chain = createMockChain({ data: BOOKING_ROW, error: null });
      chain.insert.mockResolvedValue({ error: null });
      const supabase = { from: vi.fn().mockReturnValue(chain) };

      const result = await assignLocations(supabase as never, 'booking-1', [
        'loc-1',
        'loc-2',
      ]);

      expect(result.error).toBeNull();
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking.locations_assigned',
          location_ids: ['loc-1', 'loc-2'],
        }),
        expect.anything(),
      );
    });

    it('returns validation_error for empty location list', async () => {
      const supabase = mockSupabase({ data: null, error: null });
      const result = await assignLocations(supabase as never, 'booking-1', []);

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('validation_error');
    });
  });

  describe('cancelBooking', () => {
    it('sets status to cancelled and publishes booking.cancelled', async () => {
      const cancelledRow = { ...BOOKING_ROW, status: 'cancelled' as const };
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const supabase = mockSupabaseSequence([
        { data: BOOKING_ROW, error: null },
        { data: cancelledRow, error: null },
      ]);

      const result = await cancelBooking(supabase as never, 'booking-1');

      expect(result.error).toBeNull();
      expect(result.data?.status).toBe('cancelled');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking.cancelled',
          previous_status: 'tentative',
        }),
        expect.anything(),
      );
    });

    it('rejects already-cancelled booking', async () => {
      const cancelledRow = { ...BOOKING_ROW, status: 'cancelled' as const };
      const supabase = mockSupabase({ data: cancelledRow, error: null });

      const result = await cancelBooking(supabase as never, 'booking-1');

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('validation_error');
    });
  });
});
