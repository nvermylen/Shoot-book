import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpResult } from '@/lib/erp/types';
import { toErpError } from '@/lib/erp/types';
import { syncBookingFromCalendarEvent } from '@/lib/erp/booking';
import { listCalendarEvents, type CalendarEvent } from './client';

/**
 * One-way Calendar → booking sync (LENS-021c).
 *
 * Matching is deliberately conservative (HABIT_DESIGN Rule 4): an event maps to
 * a client only when EXACTLY ONE of the photographer's clients appears in the
 * attendee emails. Zero matches or ambiguous matches are surfaced in the result
 * — never guessed, never silently dropped.
 */

export interface UnmatchedEvent {
  eventId: string;
  title: string | null;
  start: string;
  reason: 'no_client_attendee' | 'ambiguous_attendees';
}

export interface CalendarSyncResult {
  /** Non-cancelled events seen in the window. */
  eventsSeen: number;
  created: number;
  updated: number;
  /** Events whose booking was soft-deleted in Lens — user deletion wins. */
  skippedDeleted: number;
  unmatched: UnmatchedEvent[];
  /** Per-event write failures (event id + error detail), sync continues past them. */
  failures: { eventId: string; detail: string }[];
}

function eventDuration(event: CalendarEvent): number | null {
  if (event.allDay || !event.end) return null;
  const ms = new Date(event.end).getTime() - new Date(event.start).getTime();
  return ms > 0 ? Math.round(ms / 60_000) : null;
}

export async function syncCalendarToBookings(
  supabase: SupabaseClient,
  photographerId: string,
  window: { timeMin: string; timeMax: string },
): Promise<ErpResult<CalendarSyncResult>> {
  const events = await listCalendarEvents(supabase, photographerId, window);
  if (events.error) return { data: null, error: events.error };

  // Client email → id map (RLS scopes to this photographer's clients).
  const { data: clients, error: clientsError } = await supabase
    .from('client')
    .select('id, email')
    .is('deleted_at', null);
  if (clientsError) return { data: null, error: toErpError(clientsError) };

  const clientIdByEmail = new Map<string, string>(
    (clients ?? []).map((c: { id: string; email: string }) => [
      c.email.toLowerCase().trim(),
      c.id,
    ]),
  );

  const result: CalendarSyncResult = {
    eventsSeen: events.data.length,
    created: 0,
    updated: 0,
    skippedDeleted: 0,
    unmatched: [],
    failures: [],
  };

  for (const event of events.data) {
    const matchedClientIds = [
      ...new Set(
        event.attendeeEmails
          .map((email) => clientIdByEmail.get(email))
          .filter((id): id is string => !!id),
      ),
    ];

    if (matchedClientIds.length !== 1) {
      result.unmatched.push({
        eventId: event.id,
        title: event.title,
        start: event.start,
        reason:
          matchedClientIds.length === 0 ? 'no_client_attendee' : 'ambiguous_attendees',
      });
      continue;
    }

    const synced = await syncBookingFromCalendarEvent(supabase, {
      photographer_id: photographerId,
      client_id: matchedClientIds[0],
      external_calendar_event_id: event.id,
      session_date: event.start,
      duration_minutes: eventDuration(event),
      status: event.status,
    });

    if (synced.error) {
      result.failures.push({ eventId: event.id, detail: synced.error.detail });
      continue;
    }

    if (synced.data.outcome === 'created') result.created += 1;
    else if (synced.data.outcome === 'updated') result.updated += 1;
    else result.skippedDeleted += 1;
  }

  return { data: result, error: null };
}
