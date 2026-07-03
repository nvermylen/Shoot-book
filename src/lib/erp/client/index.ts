import type { SupabaseClient } from '@supabase/supabase-js';
import type { Client, ClientSource } from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound, validationError } from '../types';
import { publish } from '@/lib/events/bus';

export async function getClient(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Client>> {
  const { data, error } = await supabase
    .from('client')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('client', id) };
  return { data, error: null };
}

export async function countClients(
  supabase: SupabaseClient,
): Promise<ErpResult<number>> {
  const { count, error } = await supabase
    .from('client')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (error) return { data: null, error: toErpError(error) };
  return { data: count ?? 0, error: null };
}

export async function listClients(
  supabase: SupabaseClient,
): Promise<ErpResult<Client[]>> {
  const { data, error } = await supabase
    .from('client')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: toErpError(error) };
  return { data: data ?? [], error: null };
}

export async function createClient(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    display_name: string;
    email: string;
    phone?: string;
    parent_email?: string;
    parent_name?: string;
    parent_phone?: string;
    notes?: string;
    source: ClientSource;
  },
): Promise<ErpResult<Client>> {
  const { data, error } = await supabase
    .from('client')
    .insert(input)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('client', 'new') };

  try {
    await publish(
      {
        type: 'client.created',
        photographer_id: data.photographer_id,
        client_id: data.id,
        occurred_at: data.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.client.create.event_publish_failed', {
      client_id: data.id,
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

export interface ClientContactPatch {
  phone?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
  notes?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Update a client's contact fields (phone, parent contact, notes). RLS-scoped:
 * the existing "Photographers can update their own clients" policy ensures a
 * photographer can only touch their own rows. Empty strings are normalized to
 * null so a cleared field is stored as null, not "".
 */
export async function updateClientContact(
  supabase: SupabaseClient,
  id: string,
  patch: ClientContactPatch,
): Promise<ErpResult<Client>> {
  const normalize = (v: string | null | undefined): string | null | undefined => {
    if (v === undefined) return undefined;
    const trimmed = v?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  };

  const update: ClientContactPatch = {
    phone: normalize(patch.phone),
    parent_name: normalize(patch.parent_name),
    parent_email: normalize(patch.parent_email),
    parent_phone: normalize(patch.parent_phone),
    notes: normalize(patch.notes),
  };

  // Drop keys that weren't provided (undefined) so we only write intended fields.
  for (const key of Object.keys(update) as (keyof ClientContactPatch)[]) {
    if (update[key] === undefined) delete update[key];
  }

  if (Object.keys(update).length === 0) {
    return { data: null, error: validationError('no fields to update') };
  }

  if (update.parent_email && !EMAIL_RE.test(update.parent_email)) {
    return { data: null, error: validationError('parent_email is not a valid email') };
  }

  const { data, error } = await supabase
    .from('client')
    .update(update)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('client', id) };
  return { data, error: null };
}

export async function softDeleteClient(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Client>> {
  const { data, error } = await supabase
    .from('client')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('client', id) };

  try {
    await publish(
      {
        type: 'client.deleted',
        photographer_id: data.photographer_id,
        client_id: data.id,
        occurred_at: data.deleted_at!,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.client.soft_delete.event_publish_failed', {
      client_id: data.id,
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
