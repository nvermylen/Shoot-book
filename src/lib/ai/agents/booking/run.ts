import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead, Package, Booking, Client } from '@/types/erp';
import type { ErpResult } from '@/lib/erp/types';
import { validationError } from '@/lib/erp/types';
import { getLead, convertLeadToClient } from '@/lib/erp/lead';
import { getClient } from '@/lib/erp/client';
import { listPackages } from '@/lib/erp/package';
import { createBooking } from '@/lib/erp/booking';
import { callAgent } from '@/lib/ai/gateway/gateway';
import { BOOKING_AGENT_SYSTEM_PROMPT_V1 } from './prompts/system.v1';
import { BookingAgentOutputSchema, type BookingAgentOutput } from './schema';
import type { LeadQualificationOutput } from '../lead/schema';

export interface BookingAgentPayload {
  lead_id: string;
  photographer_id: string;
  qualification: LeadQualificationOutput;
  fixtureKey?: string;
}

export interface BookingAgentOutcome {
  lead: Lead;
  client: Client;
  booking: Booking;
  selection: BookingAgentOutput;
  warnings: string[];
}

export interface BookingAgentNoMatch {
  lead: Lead;
  selection: BookingAgentOutput;
  reason: string;
}

export type BookingAgentResult =
  | ErpResult<BookingAgentOutcome>
  | { data: null; error: null; noMatch: BookingAgentNoMatch };

export async function runBookingAgent(
  supabase: SupabaseClient,
  payload: BookingAgentPayload,
): Promise<BookingAgentResult> {
  const warnings: string[] = [];

  // Step 0: Three-way entry predicate on qualification_status
  const leadResult = await getLead(supabase, payload.lead_id);
  if (leadResult.error) return leadResult as ErpResult<BookingAgentOutcome>;
  let lead = leadResult.data;

  if (lead.qualification_status !== 'qualified' && lead.qualification_status !== 'converted') {
    return {
      data: null,
      error: validationError(
        `Lead ${lead.id} has qualification_status '${lead.qualification_status}' — ` +
        `BookingAgent requires 'qualified' or 'converted'`,
      ),
    };
  }

  // Step 1: READ — list active packages, call gateway for selection
  const packagesResult = await listPackages(supabase);
  if (packagesResult.error) return packagesResult as ErpResult<BookingAgentOutcome>;

  const activePackages = packagesResult.data.filter((p: Package) => p.is_active);
  if (activePackages.length === 0) {
    return {
      data: null,
      error: validationError('No active packages available for this photographer'),
    };
  }

  const gatewayResponse = await callAgent({
    agentId: 'booking',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          qualification: payload.qualification,
          packages: activePackages.map((p: Package) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price_cents: p.price_cents,
            deposit_cents: p.deposit_cents,
            session_type: p.session_type,
            included_locations_count: p.included_locations_count,
            delivery_count: p.delivery_count,
          })),
        }),
      },
    ],
    systemPrompt: BOOKING_AGENT_SYSTEM_PROMPT_V1,
    metadata: {
      requestId: `booking-select-${lead.id}`,
      workspaceId: payload.photographer_id,
      userId: payload.photographer_id,
      ...(payload.fixtureKey && { fixtureKey: payload.fixtureKey }),
    },
  });

  // Parse structured output
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

  const validation = BookingAgentOutputSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      data: null,
      error: validationError(`Model output failed schema validation: ${validation.error.message}`),
    };
  }

  const selection = validation.data;

  // No-match case: model says no package fits — exit with zero writes
  if (selection.selected_package_id === null) {
    return {
      data: null,
      error: null,
      noMatch: {
        lead,
        selection,
        reason: selection.reasons.join('; '),
      },
    };
  }

  // Validate selected package exists and is active
  const selectedPackage = activePackages.find((p: Package) => p.id === selection.selected_package_id);
  if (!selectedPackage) {
    return {
      data: null,
      error: validationError(
        `Model selected package_id '${selection.selected_package_id}' which is not in the active packages list`,
      ),
    };
  }

  // Step 2: WRITE — convert lead to client (or read existing client)
  let client: Client;

  if (lead.qualification_status === 'converted') {
    // Already converted — read existing client_id, skip conversion
    if (!lead.converted_client_id) {
      return {
        data: null,
        error: validationError(
          `Lead ${lead.id} has qualification_status 'converted' but converted_client_id is null`,
        ),
      };
    }
    const clientResult = await getClient(supabase, lead.converted_client_id);
    if (clientResult.error) return clientResult as ErpResult<BookingAgentOutcome>;
    client = clientResult.data;
  } else {
    // Fresh qualified lead — convert
    const convertResult = await convertLeadToClient(supabase, lead.id);
    if (convertResult.error) return convertResult as ErpResult<BookingAgentOutcome>;
    if (convertResult.warning) warnings.push(convertResult.warning);
    client = convertResult.data.client;
    // Re-read lead to get updated state (now 'converted')
    const updatedLeadResult = await getLead(supabase, lead.id);
    if (updatedLeadResult.error) return updatedLeadResult as ErpResult<BookingAgentOutcome>;
    lead = updatedLeadResult.data;
  }

  // Step 3: WRITE — create booking (tentative)
  const bookingResult = await createBooking(supabase, {
    photographer_id: payload.photographer_id,
    client_id: client.id,
    package_id: selectedPackage.id,
    duration_minutes: selection.suggested_duration_minutes ?? undefined,
    session_date: selection.suggested_session_date ?? undefined,
    notes: selection.notes ?? undefined,
  });

  if (bookingResult.error) {
    console.error('booking_agent.create_booking_failed', {
      lead_id: lead.id,
      client_id: client.id,
      package_id: selectedPackage.id,
    });
    return bookingResult as ErpResult<BookingAgentOutcome>;
  }
  if (bookingResult.warning) warnings.push(bookingResult.warning);

  return {
    data: {
      lead,
      client,
      booking: bookingResult.data,
      selection,
      warnings,
    },
    error: null,
    ...(warnings.length > 0 && { warning: warnings.join('; ') }),
  };
}
