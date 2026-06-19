import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommLog, CommDirection, CommChannel, CommLogAgentId } from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound } from '../types';
import { publish } from '@/lib/events/bus';

export async function getCommLog(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<CommLog>> {
  const { data, error } = await supabase
    .from('comm_log')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('comm_log', id) };
  return { data, error: null };
}

export async function listCommLogs(
  supabase: SupabaseClient,
  filters?: { client_id?: string; lead_id?: string; booking_id?: string },
): Promise<ErpResult<CommLog[]>> {
  let query = supabase
    .from('comm_log')
    .select('*');

  if (filters?.client_id) query = query.eq('client_id', filters.client_id);
  if (filters?.lead_id) query = query.eq('lead_id', filters.lead_id);
  if (filters?.booking_id) query = query.eq('booking_id', filters.booking_id);

  const { data, error } = await query.order('sent_at', { ascending: false });

  if (error) return { data: null, error: toErpError(error) };
  return { data: data ?? [], error: null };
}

export async function appendCommLog(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    client_id?: string;
    lead_id?: string;
    booking_id?: string;
    direction: CommDirection;
    channel: CommChannel;
    agent_id?: CommLogAgentId;
    subject?: string;
    body?: string;
    external_message_id?: string;
    sequence_id?: string;
    sent_at: string;
  },
): Promise<ErpResult<CommLog>> {
  const { data, error } = await supabase
    .from('comm_log')
    .insert(input)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('comm_log', 'new') };

  try {
    await publish(
      {
        type: 'comm_log.created',
        photographer_id: data.photographer_id,
        comm_log_id: data.id,
        occurred_at: data.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.comm_log.append.event_publish_failed', {
      comm_log_id: data.id,
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
