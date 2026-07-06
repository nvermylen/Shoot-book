import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpResult } from '@/lib/erp/types';
import { getValidAccessToken } from '@/lib/integrations/google/auth';

/**
 * Google Calendar read adapter — the ONLY file that talks to the Calendar API
 * (anti-pattern #4). External payloads are Zod-validated at the boundary and
 * mapped to a clean internal shape; nothing downstream sees raw Google JSON.
 */

const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// --- External boundary schema (only the fields we consume) ---------------

const googleEventSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  start: z
    .object({ dateTime: z.string().optional(), date: z.string().optional() })
    .optional(),
  end: z
    .object({ dateTime: z.string().optional(), date: z.string().optional() })
    .optional(),
  attendees: z.array(z.object({ email: z.string().optional() })).optional(),
});

const eventsResponseSchema = z.object({
  items: z.array(googleEventSchema).optional(),
});

// --- Internal shape --------------------------------------------------------

export interface CalendarEvent {
  /** Google event id — maps to booking.external_calendar_event_id. */
  id: string;
  title: string | null;
  /** ISO datetime, or YYYY-MM-DD for all-day events. */
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  attendeeEmails: string[];
  status: 'confirmed' | 'tentative';
}

function toCalendarEvent(raw: z.infer<typeof googleEventSchema>): CalendarEvent | null {
  // Cancelled events are excluded; events with no start are unusable.
  if (raw.status === 'cancelled') return null;
  const start = raw.start?.dateTime ?? raw.start?.date;
  if (!start) return null;

  return {
    id: raw.id,
    title: raw.summary ?? null,
    start,
    end: raw.end?.dateTime ?? raw.end?.date ?? null,
    allDay: !raw.start?.dateTime,
    location: raw.location ?? null,
    attendeeEmails: (raw.attendees ?? [])
      .map((a) => a.email?.toLowerCase().trim())
      .filter((e): e is string => !!e),
    status: raw.status === 'tentative' ? 'tentative' : 'confirmed',
  };
}

/**
 * List events from the photographer's primary calendar within a window.
 * Recurring events are expanded (`singleEvents=true`), ordered by start time.
 */
export async function listCalendarEvents(
  supabase: SupabaseClient,
  photographerId: string,
  window: { timeMin: string; timeMax: string; maxResults?: number },
): Promise<ErpResult<CalendarEvent[]>> {
  const token = await getValidAccessToken(supabase, photographerId, 'calendar');
  if (token.error) return { data: null, error: token.error };

  const params = new URLSearchParams({
    timeMin: window.timeMin,
    timeMax: window.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(window.maxResults ?? 250),
  });

  const res = await fetch(`${EVENTS_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token.data}` },
  });

  if (!res.ok) {
    return {
      data: null,
      error: { code: 'integration_error', detail: `calendar api http_${res.status}` },
    };
  }

  const json: unknown = await res.json();
  const parsed = eventsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      data: null,
      error: { code: 'validation_error', detail: 'malformed calendar api response' },
    };
  }

  const events = (parsed.data.items ?? [])
    .map(toCalendarEvent)
    .filter((e): e is CalendarEvent => e !== null);

  return { data: events, error: null };
}
