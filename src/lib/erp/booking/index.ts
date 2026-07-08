import type { SupabaseClient } from '@supabase/supabase-js';
import type { Booking, BookingStatus } from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound, validationError } from '../types';
import { publish } from '@/lib/events/bus';

export async function getBooking(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Booking>> {
  const { data, error } = await supabase
    .from('booking')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('booking', id) };
  return { data, error: null };
}

export async function listBookings(
  supabase: SupabaseClient,
): Promise<ErpResult<Booking[]>> {
  const { data, error } = await supabase
    .from('booking')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: toErpError(error) };
  return { data: data ?? [], error: null };
}

export async function createBooking(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    client_id: string;
    package_id: string;
    session_date?: string;
    duration_minutes?: number;
    notes?: string;
  },
): Promise<ErpResult<Booking>> {
  const { data, error } = await supabase
    .from('booking')
    .insert(input)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('booking', 'new') };

  try {
    await publish(
      {
        type: 'booking.created',
        photographer_id: data.photographer_id,
        booking_id: data.id,
        occurred_at: data.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.booking.create.event_publish_failed', {
      booking_id: data.id,
      error: message,
    });
    return {
      data,
      error: null,
      warning: `event_publish_failed: ${message}`,
    };
  }

  return { data, error: null };
}

export async function assignLocations(
  supabase: SupabaseClient,
  bookingId: string,
  locationIds: string[],
): Promise<ErpResult<Booking>> {
  if (locationIds.length === 0) {
    return {
      data: null,
      error: validationError('At least one location ID is required'),
    };
  }

  const { data: booking, error: bookingError } = await supabase
    .from('booking')
    .select('*')
    .eq('id', bookingId)
    .is('deleted_at', null)
    .single();

  if (bookingError) return { data: null, error: toErpError(bookingError) };
  if (!booking) return { data: null, error: notFound('booking', bookingId) };

  const rows = locationIds.map((locationId, i) => ({
    booking_id: bookingId,
    location_id: locationId,
    sequence: i + 1,
  }));

  const { error: insertError } = await supabase
    .from('booking_location')
    .insert(rows);

  if (insertError) return { data: null, error: toErpError(insertError) };

  try {
    await publish(
      {
        type: 'booking.locations_assigned',
        photographer_id: booking.photographer_id,
        booking_id: bookingId,
        location_ids: locationIds,
        occurred_at: new Date().toISOString(),
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.booking.assign_locations.event_publish_failed', {
      booking_id: bookingId,
      error: message,
    });
    return {
      data: booking,
      error: null,
      warning: `event_publish_failed: ${message}`,
    };
  }

  return { data: booking, error: null };
}

export interface CalendarBookingInput {
  photographer_id: string;
  client_id: string;
  external_calendar_event_id: string;
  session_date: string;
  duration_minutes?: number | null;
  status: 'tentative' | 'confirmed';
}

export type CalendarSyncOutcome = 'created' | 'updated' | 'skipped_deleted';

/**
 * Idempotent Calendar → booking sync for one event (LENS-021c).
 *
 * Select-then-decide instead of blind upsert, so deletion semantics stay
 * honest: a booking the user soft-deleted in Lens is NOT resurrected by
 * re-sync (user deletion wins over the external source — ERP_DATA_MODEL.md).
 * Existing live bookings get session_date/duration/status refreshed from the
 * calendar; package_id and notes are Lens-owned and never touched here.
 * Publishes booking.created on insert only (no booking.updated event exists).
 */
export async function syncBookingFromCalendarEvent(
  supabase: SupabaseClient,
  input: CalendarBookingInput,
): Promise<ErpResult<{ booking: Booking | null; outcome: CalendarSyncOutcome }>> {
  const { data: existing, error: fetchError } = await supabase
    .from('booking')
    .select('*')
    .eq('photographer_id', input.photographer_id)
    .eq('external_calendar_event_id', input.external_calendar_event_id)
    .maybeSingle();

  if (fetchError) return { data: null, error: toErpError(fetchError) };

  if (existing && existing.deleted_at !== null) {
    return { data: { booking: null, outcome: 'skipped_deleted' }, error: null };
  }

  if (existing) {
    const { data, error } = await supabase
      .from('booking')
      .update({
        session_date: input.session_date,
        duration_minutes: input.duration_minutes ?? null,
        status: input.status,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return { data: null, error: toErpError(error) };
    if (!data) return { data: null, error: notFound('booking', existing.id) };
    return { data: { booking: data, outcome: 'updated' }, error: null };
  }

  const { data, error } = await supabase
    .from('booking')
    .insert({
      photographer_id: input.photographer_id,
      client_id: input.client_id,
      external_calendar_event_id: input.external_calendar_event_id,
      session_date: input.session_date,
      duration_minutes: input.duration_minutes ?? null,
      status: input.status,
    })
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('booking', 'new') };

  try {
    await publish(
      {
        type: 'booking.created',
        photographer_id: data.photographer_id,
        booking_id: data.id,
        occurred_at: data.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.booking.calendar_sync.event_publish_failed', {
      booking_id: data.id,
      error: message,
    });
    return {
      data: { booking: data, outcome: 'created' },
      error: null,
      warning: `event_publish_failed: ${message}`,
    };
  }

  return { data: { booking: data, outcome: 'created' }, error: null };
}

export async function cancelBooking(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Booking>> {
  const { data: existing, error: fetchError } = await supabase
    .from('booking')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (fetchError) return { data: null, error: toErpError(fetchError) };
  if (!existing) return { data: null, error: notFound('booking', id) };

  if (existing.status === 'cancelled') {
    return {
      data: null,
      error: validationError(`Booking ${id} is already cancelled`),
    };
  }

  const previousStatus: BookingStatus = existing.status;

  const { data, error } = await supabase
    .from('booking')
    .update({ status: 'cancelled' as BookingStatus })
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('booking', id) };

  try {
    await publish(
      {
        type: 'booking.cancelled',
        photographer_id: data.photographer_id,
        booking_id: data.id,
        previous_status: previousStatus,
        occurred_at: data.updated_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.booking.cancel.event_publish_failed', {
      booking_id: data.id,
      error: message,
    });
    return {
      data,
      error: null,
      warning: `event_publish_failed: ${message}`,
    };
  }

  return { data, error: null };
}
