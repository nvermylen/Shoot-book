import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBooking,
  getBooking,
  assignLocations,
  cancelBooking,
  syncBookingFromCalendarEvent,
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

  describe('syncBookingFromCalendarEvent', () => {
    /** Chain for the sync path: select→eq→eq→maybeSingle, then update/insert→select→single. */
    function mockSyncSupabase(
      lookup: { data: unknown; error: unknown },
      write: { data: unknown; error: unknown } = { data: null, error: null },
    ) {
      const chain = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue(lookup),
        single: vi.fn().mockResolvedValue(write),
      };
      chain.select.mockReturnValue(chain);
      chain.insert.mockReturnValue(chain);
      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      return { from: vi.fn().mockReturnValue(chain), _chain: chain };
    }

    const INPUT = {
      photographer_id: 'photo-1',
      client_id: 'client-1',
      external_calendar_event_id: 'evt-1',
      session_date: '2026-07-08T17:30:00-05:00',
      duration_minutes: 90,
      status: 'confirmed' as const,
    };

    it('inserts when no booking exists and publishes booking.created', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const created = { ...BOOKING_ROW, package_id: null, external_calendar_event_id: 'evt-1' };
      const supabase = mockSyncSupabase({ data: null, error: null }, { data: created, error: null });

      const result = await syncBookingFromCalendarEvent(supabase as never, INPUT);

      expect(result.error).toBeNull();
      expect(result.data?.outcome).toBe('created');
      expect(supabase._chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          external_calendar_event_id: 'evt-1',
          client_id: 'client-1',
          status: 'confirmed',
        }),
      );
      // package_id is never written by sync — Lens-owned
      expect(supabase._chain.insert.mock.calls[0][0]).not.toHaveProperty('package_id');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'booking.created' }),
        expect.anything(),
      );
    });

    it('updates schedule fields when a live booking exists — no event published', async () => {
      const publishSpy = vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
      const existing = { ...BOOKING_ROW, deleted_at: null, external_calendar_event_id: 'evt-1' };
      const supabase = mockSyncSupabase(
        { data: existing, error: null },
        { data: existing, error: null },
      );

      const result = await syncBookingFromCalendarEvent(supabase as never, INPUT);

      expect(result.data?.outcome).toBe('updated');
      expect(supabase._chain.update).toHaveBeenCalledWith({
        session_date: INPUT.session_date,
        duration_minutes: 90,
        status: 'confirmed',
      });
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('skips a soft-deleted booking — user deletion wins over re-sync', async () => {
      const deleted = { ...BOOKING_ROW, deleted_at: '2026-07-01T00:00:00Z' };
      const supabase = mockSyncSupabase({ data: deleted, error: null });

      const result = await syncBookingFromCalendarEvent(supabase as never, INPUT);

      expect(result.data?.outcome).toBe('skipped_deleted');
      expect(supabase._chain.update).not.toHaveBeenCalled();
      expect(supabase._chain.insert).not.toHaveBeenCalled();
    });

    it('surfaces lookup errors', async () => {
      const supabase = mockSyncSupabase({ data: null, error: { code: '42P01', message: 'boom' } });
      const result = await syncBookingFromCalendarEvent(supabase as never, INPUT);
      expect(result.error?.code).toBe('db_error');
    });
  });
});
