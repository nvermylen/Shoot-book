import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead, LeadSource } from '@/types/erp';
import type { ErpResult } from '@/lib/erp/types';
import { validationError } from '@/lib/erp/types';
import { createLead, qualifyLead, findLeadBySourceMessage, updateLeadNotes } from '@/lib/erp/lead';
import { publish } from '@/lib/events/bus';
import { callAgent } from '@/lib/ai/gateway/gateway';
import { LEAD_AGENT_SYSTEM_PROMPT_V1 } from './prompts/system.v1';
import { LeadQualificationOutputSchema, type LeadQualificationOutput } from './schema';

export interface InboundLeadPayload {
  source_message_id: string;
  photographer_id: string;
  display_name: string;
  email: string;
  phone?: string;
  source: LeadSource;
  intent_summary?: string;
  received_at: string;
  fixtureKey?: string;
}

export interface LeadAgentOutcome {
  lead: Lead;
  qualification: LeadQualificationOutput;
  event_emitted: string | null;
  warnings: string[];
}

export async function runLeadAgent(
  supabase: SupabaseClient,
  payload: InboundLeadPayload,
): Promise<ErpResult<LeadAgentOutcome>> {
  const warnings: string[] = [];

  // Step 1: Dedup — check for existing lead by source_message_id
  const dedupResult = await findLeadBySourceMessage(supabase, payload.source_message_id);
  if (dedupResult.error) return dedupResult as ErpResult<LeadAgentOutcome>;
  if (dedupResult.data) {
    return {
      data: null,
      error: validationError(`Duplicate lead: source_message_id ${payload.source_message_id} already processed as lead ${dedupResult.data.id}`),
    };
  }

  // Step 2: Create lead via ERP module
  const sentinel = `\n\n[lens:src_msg_id=${payload.source_message_id}]`;
  const intentSummary = (payload.intent_summary ?? '') + sentinel;
  const createResult = await createLead(supabase, {
    photographer_id: payload.photographer_id,
    display_name: payload.display_name,
    email: payload.email,
    phone: payload.phone,
    source: payload.source,
    intent_summary: intentSummary,
    received_at: payload.received_at,
  });

  if (createResult.error) return createResult as ErpResult<LeadAgentOutcome>;
  if (createResult.warning) {
    warnings.push(createResult.warning);
  }
  const lead = createResult.data;

  // Step 3: Call gateway for qualification judgment
  const gatewayResponse = await callAgent({
    agentId: 'lead',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          display_name: payload.display_name,
          email: payload.email,
          phone: payload.phone ?? null,
          source: payload.source,
          intent_summary: payload.intent_summary ?? '',
          received_at: payload.received_at,
        }),
      },
    ],
    systemPrompt: LEAD_AGENT_SYSTEM_PROMPT_V1,
    metadata: {
      requestId: `lead-qualify-${lead.id}`,
      workspaceId: payload.photographer_id,
      userId: payload.photographer_id,
      ...(payload.fixtureKey && { fixtureKey: payload.fixtureKey }),
    },
  });

  // Parse structured output from model response
  const textBlock = gatewayResponse.content.find((b) => b.type === 'text');
  if (!textBlock || !('text' in textBlock)) {
    return {
      data: null,
      error: validationError('Model response contained no text block'),
    };
  }

  const rawText = (textBlock as { text: string }).text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      data: null,
      error: validationError(`Model output is not valid JSON: ${rawText.slice(0, 200)}`),
    };
  }

  const validation = LeadQualificationOutputSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      data: null,
      error: validationError(`Model output failed schema validation: ${validation.error.message}`),
    };
  }

  const qualification = validation.data;

  // Step 4: Map decision → ERP action
  let eventEmitted: string | null = null;

  if (qualification.decision === 'qualified') {
    const qualifyResult = await qualifyLead(supabase, lead.id, {
      qualification_status: 'qualified',
      qualification_notes: qualification.reasons.join('; '),
    });
    if (qualifyResult.error) return qualifyResult as ErpResult<LeadAgentOutcome>;
    if (qualifyResult.warning) warnings.push(qualifyResult.warning);
    eventEmitted = 'lead.qualified';

  } else if (qualification.decision === 'rejected') {
    const qualifyResult = await qualifyLead(supabase, lead.id, {
      qualification_status: 'disqualified',
      qualification_notes: qualification.reasons.join('; '),
    });
    if (qualifyResult.error) return qualifyResult as ErpResult<LeadAgentOutcome>;
    if (qualifyResult.warning) warnings.push(qualifyResult.warning);
    eventEmitted = null;

  } else if (qualification.decision === 'needs_info') {
    // Status stays 'new'; write notes with missing fields
    const notes = [
      ...qualification.reasons,
      `Missing: ${(qualification.missing_fields ?? []).join(', ')}`,
    ].join('; ');

    const notesResult = await updateLeadNotes(supabase, lead.id, notes);
    if (notesResult.error) return notesResult as ErpResult<LeadAgentOutcome>;
    if (notesResult.warning) warnings.push(notesResult.warning);

    // Publish lead.needs_info event
    try {
      await publish(
        {
          type: 'lead.needs_info',
          photographer_id: lead.photographer_id,
          lead_id: lead.id,
          missing_fields: qualification.missing_fields ?? [],
          occurred_at: new Date().toISOString(),
        },
        supabase,
      );
      eventEmitted = 'lead.needs_info';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('lead_agent.needs_info.event_publish_failed', {
        lead_id: lead.id,
        error: message,
      });
      warnings.push(`event_publish_failed: ${message}`);
    }
  }

  return {
    data: {
      lead,
      qualification,
      event_emitted: eventEmitted,
      warnings,
    },
    error: null,
    ...(warnings.length > 0 && { warning: warnings.join('; ') }),
  };
}
