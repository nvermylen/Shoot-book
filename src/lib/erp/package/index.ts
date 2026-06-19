import type { SupabaseClient } from '@supabase/supabase-js';
import type { Package, PackageSessionType } from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound } from '../types';
import { publish } from '@/lib/events/bus';

export async function getPackage(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Package>> {
  const { data, error } = await supabase
    .from('package')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('package', id) };
  return { data, error: null };
}

export async function listPackages(
  supabase: SupabaseClient,
): Promise<ErpResult<Package[]>> {
  const { data, error } = await supabase
    .from('package')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: toErpError(error) };
  return { data: data ?? [], error: null };
}

export async function createPackage(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    name: string;
    description?: string;
    price_cents: number;
    deposit_cents: number;
    session_type: PackageSessionType;
    included_locations_count: number;
    included_outfits_count?: number;
    delivery_count: number;
  },
): Promise<ErpResult<Package>> {
  const { data, error } = await supabase
    .from('package')
    .insert(input)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('package', 'new') };

  try {
    await publish(
      {
        type: 'package.created',
        photographer_id: data.photographer_id,
        package_id: data.id,
        occurred_at: data.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.package.create.event_publish_failed', {
      package_id: data.id,
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

export async function updatePackage(
  supabase: SupabaseClient,
  id: string,
  input: {
    name?: string;
    description?: string;
    price_cents?: number;
    deposit_cents?: number;
    session_type?: PackageSessionType;
    included_locations_count?: number;
    included_outfits_count?: number;
    delivery_count?: number;
    is_active?: boolean;
  },
): Promise<ErpResult<Package>> {
  const { data, error } = await supabase
    .from('package')
    .update(input)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('package', id) };

  try {
    await publish(
      {
        type: 'package.updated',
        photographer_id: data.photographer_id,
        package_id: data.id,
        occurred_at: data.updated_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.package.update.event_publish_failed', {
      package_id: data.id,
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
