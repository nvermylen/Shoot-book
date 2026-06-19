import type { SupabaseClient } from '@supabase/supabase-js';
import type { Location, LocationCategory } from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound } from '../types';
import { publish } from '@/lib/events/bus';

export async function getLocation(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Location>> {
  const { data, error } = await supabase
    .from('location')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('location', id) };
  return { data, error: null };
}

export async function listLocations(
  supabase: SupabaseClient,
): Promise<ErpResult<Location[]>> {
  const { data, error } = await supabase
    .from('location')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: toErpError(error) };
  return { data: data ?? [], error: null };
}

export async function createLocation(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    name: string;
    category: LocationCategory;
    description?: string;
    representative_image_url?: string;
  },
): Promise<ErpResult<Location>> {
  const { data, error } = await supabase
    .from('location')
    .insert(input)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('location', 'new') };

  try {
    await publish(
      {
        type: 'location.created',
        photographer_id: data.photographer_id,
        location_id: data.id,
        occurred_at: data.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.location.create.event_publish_failed', {
      location_id: data.id,
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

export async function updateLocation(
  supabase: SupabaseClient,
  id: string,
  input: {
    name?: string;
    category?: LocationCategory;
    description?: string;
    representative_image_url?: string;
    is_active?: boolean;
  },
): Promise<ErpResult<Location>> {
  const { data, error } = await supabase
    .from('location')
    .update(input)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('location', id) };

  try {
    await publish(
      {
        type: 'location.updated',
        photographer_id: data.photographer_id,
        location_id: data.id,
        occurred_at: data.updated_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.location.update.event_publish_failed', {
      location_id: data.id,
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
