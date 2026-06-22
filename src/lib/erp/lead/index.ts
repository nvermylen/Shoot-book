import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead, LeadSource, LeadQualificationStatus, Client } from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound, validationError } from '../types';
import { publish } from '@/lib/events/bus';

export async function findLeadBySourceMessage(
  supabase: SupabaseClient,
  photographerId: string,
  sourceMessageId: string,
): Promise<ErpResult<Lead | null>> {
  const { data, error } = await supabase
    .from('lead')
    .select('*')
    .eq('photographer_id', photographerId)
    .like('intent_summary', `[src:${sourceMessageId}]%`)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { data: null, error: toErpError(error) };
  return { data: data ?? null, error: null };
}

export async function updateLeadNotes(
  supabase: SupabaseClient,
  id: string,
  qualificationNotes: string,
): Promise<ErpResult<Lead>> {
  const { data, error } = await supabase
    .from('lead')
    .update({ qualification_notes: qualificationNotes })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('lead', id) };
  return { data, error: null };
}

export async function getLead(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Lead>> {
  const { data, error } = await supabase
    .from('lead')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('lead', id) };
  return { data, error: null };
}

export async function listLeads(
  supabase: SupabaseClient,
): Promise<ErpResult<Lead[]>> {
  const { data, error } = await supabase
    .from('lead')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: toErpError(error) };
  return { data: data ?? [], error: null };
}

export async function createLead(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    display_name: string;
    email: string;
    phone?: string;
    source: LeadSource;
    intent_summary?: string;
    received_at: string;
  },
): Promise<ErpResult<Lead>> {
  const { data, error } = await supabase
    .from('lead')
    .insert(input)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('lead', 'new') };

  try {
    await publish(
      {
        type: 'lead.created',
        photographer_id: data.photographer_id,
        lead_id: data.id,
        occurred_at: data.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.lead.create.event_publish_failed', {
      lead_id: data.id,
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

export async function qualifyLead(
  supabase: SupabaseClient,
  id: string,
  input: {
    qualification_status: LeadQualificationStatus;
    qualification_notes?: string;
  },
): Promise<ErpResult<Lead>> {
  if (input.qualification_status === 'converted') {
    return {
      data: null,
      error: validationError(
        'Use convertLeadToClient to convert a lead, not qualifyLead',
      ),
    };
  }

  const { data, error } = await supabase
    .from('lead')
    .update(input)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('lead', id) };

  try {
    await publish(
      {
        type: 'lead.qualified',
        photographer_id: data.photographer_id,
        lead_id: data.id,
        qualification_status: data.qualification_status,
        occurred_at: data.updated_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.lead.qualify.event_publish_failed', {
      lead_id: data.id,
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

const LEAD_SOURCE_TO_CLIENT_SOURCE: Record<string, string> = {
  web_form: 'web_form',
  gmail_inbound: 'gmail',
  referral: 'manual',
  social: 'manual',
  other: 'manual',
};

export async function convertLeadToClient(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<{ lead: Lead; client: Client }>> {
  const { data: lead, error: leadError } = await supabase
    .from('lead')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (leadError) return { data: null, error: toErpError(leadError) };
  if (!lead) return { data: null, error: notFound('lead', id) };

  if (lead.qualification_status === 'converted') {
    return {
      data: null,
      error: validationError(`Lead ${id} is already converted`),
    };
  }

  const clientSource =
    LEAD_SOURCE_TO_CLIENT_SOURCE[lead.source] ?? 'manual';

  const { data: client, error: clientError } = await supabase
    .from('client')
    .insert({
      photographer_id: lead.photographer_id,
      display_name: lead.display_name,
      email: lead.email,
      phone: lead.phone,
      source: clientSource,
    })
    .select()
    .single();

  if (clientError) return { data: null, error: toErpError(clientError) };
  if (!client) return { data: null, error: notFound('client', 'new') };

  const { data: updatedLead, error: updateError } = await supabase
    .from('lead')
    .update({
      qualification_status: 'converted' as LeadQualificationStatus,
      converted_client_id: client.id,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('erp.lead.convert.lead_update_failed', {
      lead_id: id,
      orphaned_client_id: client.id,
      error: updateError.message,
    });
    return {
      data: null,
      error: {
        code: 'db_error',
        detail: `Lead update failed after client ${client.id} was created: ${updateError.message}`,
      },
    };
  }

  if (!updatedLead) {
    console.error('erp.lead.convert.lead_update_returned_null', {
      lead_id: id,
      orphaned_client_id: client.id,
    });
    return {
      data: null,
      error: {
        code: 'db_error',
        detail: `Lead update returned null after client ${client.id} was created`,
      },
    };
  }

  const warnings: string[] = [];

  try {
    await publish(
      {
        type: 'client.created',
        photographer_id: client.photographer_id,
        client_id: client.id,
        occurred_at: client.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.lead.convert.client_event_publish_failed', {
      client_id: client.id,
      error: message,
    });
    warnings.push(`client.created event_publish_failed: ${message}`);
  }

  try {
    await publish(
      {
        type: 'lead.converted',
        photographer_id: updatedLead.photographer_id,
        lead_id: updatedLead.id,
        client_id: client.id,
        occurred_at: updatedLead.updated_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.lead.convert.lead_event_publish_failed', {
      lead_id: updatedLead.id,
      error: message,
    });
    warnings.push(`lead.converted event_publish_failed: ${message}`);
  }

  return {
    data: { lead: updatedLead, client },
    error: null,
    ...(warnings.length > 0 && { warning: warnings.join('; ') }),
  };
}
