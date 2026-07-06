import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncCalendarToBookings } from './sync';
import * as calendarClient from './client';
import * as bookingErp from '@/lib/erp/booking';
import type { CalendarEvent } from './client';

const WINDOW = { timeMin: '2026-07-06T00:00:00Z', timeMax: '2026-07-13T00:00:00Z' };

function makeEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Senior shoot',
    start: '2026-07-08T17:30:00-05:00',
    end: '2026-07-08T19:00:00-05:00',
    allDay: false,
    location: null,
    attendeeEmails: ['emma@example.com'],
    status: 'confirmed',
    ...over,
  };
}

function stubEvents(events: CalendarEvent[]) {
  vi.spyOn(calendarClient, 'listCalendarEvents').mockResolvedValue({
    data: events,
    error: null,
  });
}

/** Supabase mock for the clients lookup inside sync. */
function mockSupabase(clients: { id: string; email: string }[]) {
  const chain = {
    select: vi.fn(),
    is: vi.fn().mockResolvedValue({ data: clients, error: null }),
  };
  chain.select.mockReturnValue(chain);
  return { from: vi.fn().mockReturnValue(chain) } as never;
}

function stubSyncOutcome(outcome: 'created' | 'updated' | 'skipped_deleted') {
  return vi.spyOn(bookingErp, 'syncBookingFromCalendarEvent').mockResolvedValue({
    data: { booking: null, outcome },
    error: null,
  });
}

describe('syncCalendarToBookings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a booking when exactly one client attendee matches', async () => {
    stubEvents([makeEvent()]);
    const erpSpy = stubSyncOutcome('created');
    const supabase = mockSupabase([{ id: 'client-1', email: 'Emma@Example.com' }]);

    const res = await syncCalendarToBookings(supabase, 'photo-1', WINDOW);
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ eventsSeen: 1, created: 1, updated: 0, unmatched: [] });

    expect(erpSpy).toHaveBeenCalledWith(expect.anything(), {
      photographer_id: 'photo-1',
      client_id: 'client-1',
      external_calendar_event_id: 'evt-1',
      session_date: '2026-07-08T17:30:00-05:00',
      duration_minutes: 90,
      status: 'confirmed',
    });
  });

  it('surfaces events with no client attendee as unmatched — never guesses', async () => {
    stubEvents([makeEvent({ id: 'evt-2', attendeeEmails: ['stranger@example.com'] })]);
    const erpSpy = stubSyncOutcome('created');
    const supabase = mockSupabase([{ id: 'client-1', email: 'emma@example.com' }]);

    const res = await syncCalendarToBookings(supabase, 'photo-1', WINDOW);
    expect(res.data?.unmatched).toEqual([
      {
        eventId: 'evt-2',
        title: 'Senior shoot',
        start: '2026-07-08T17:30:00-05:00',
        reason: 'no_client_attendee',
      },
    ]);
    expect(erpSpy).not.toHaveBeenCalled();
  });

  it('treats two client attendees as ambiguous, not a match', async () => {
    stubEvents([
      makeEvent({ id: 'evt-3', attendeeEmails: ['emma@example.com', 'lila@example.com'] }),
    ]);
    const erpSpy = stubSyncOutcome('created');
    const supabase = mockSupabase([
      { id: 'client-1', email: 'emma@example.com' },
      { id: 'client-2', email: 'lila@example.com' },
    ]);

    const res = await syncCalendarToBookings(supabase, 'photo-1', WINDOW);
    expect(res.data?.unmatched[0]?.reason).toBe('ambiguous_attendees');
    expect(erpSpy).not.toHaveBeenCalled();
  });

  it('same client under multiple attendee entries is NOT ambiguous', async () => {
    stubEvents([
      makeEvent({ id: 'evt-4', attendeeEmails: ['emma@example.com', 'emma@example.com'] }),
    ]);
    stubSyncOutcome('updated');
    const supabase = mockSupabase([{ id: 'client-1', email: 'emma@example.com' }]);

    const res = await syncCalendarToBookings(supabase, 'photo-1', WINDOW);
    expect(res.data?.updated).toBe(1);
    expect(res.data?.unmatched).toEqual([]);
  });

  it('counts skipped_deleted and continues past per-event failures', async () => {
    stubEvents([
      makeEvent({ id: 'evt-5' }),
      makeEvent({ id: 'evt-6' }),
    ]);
    vi.spyOn(bookingErp, 'syncBookingFromCalendarEvent')
      .mockResolvedValueOnce({ data: { booking: null, outcome: 'skipped_deleted' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'db_error', detail: 'boom' } });
    const supabase = mockSupabase([{ id: 'client-1', email: 'emma@example.com' }]);

    const res = await syncCalendarToBookings(supabase, 'photo-1', WINDOW);
    expect(res.data?.skippedDeleted).toBe(1);
    expect(res.data?.failures).toEqual([{ eventId: 'evt-6', detail: 'boom' }]);
  });

  it('all-day events get null duration', async () => {
    stubEvents([makeEvent({ id: 'evt-7', allDay: true, start: '2026-07-09', end: '2026-07-10' })]);
    const erpSpy = stubSyncOutcome('created');
    const supabase = mockSupabase([{ id: 'client-1', email: 'emma@example.com' }]);

    await syncCalendarToBookings(supabase, 'photo-1', WINDOW);
    expect(erpSpy.mock.calls[0][1].duration_minutes).toBeNull();
  });

  it('propagates adapter errors (e.g. calendar not connected)', async () => {
    vi.spyOn(calendarClient, 'listCalendarEvents').mockResolvedValue({
      data: null,
      error: { code: 'not_found', detail: 'integration_credentials calendar not found' },
    });
    const res = await syncCalendarToBookings(mockSupabase([]), 'photo-1', WINDOW);
    expect(res.error?.code).toBe('not_found');
  });
});
