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
