import type { SupabaseClient } from '@supabase/supabase-js';
import type { Photographer } from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound } from '../types';

/**
 * The signed-in photographer's own profile row. RLS scopes the table to
 * auth.uid(), so no explicit filter is needed — .single() enforces that
 * exactly one row is visible.
 */
export async function getPhotographer(
  supabase: SupabaseClient,
): Promise<ErpResult<Photographer>> {
  const { data, error } = await supabase
    .from('photographer')
    .select('*')
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('photographer', 'self') };
  return { data, error: null };
}
