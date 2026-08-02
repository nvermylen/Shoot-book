import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpResult } from '../types';
import { toErpError } from '../types';
import { publish } from '@/lib/events/bus';
import { appendCommLog } from '@/lib/erp/comm-log';
import {
  listInboxMessageIds,
  getMessage,
} from '@/lib/integrations/gmail/client';
import { GMAIL_READONLY_SCOPE } from '@/lib/integrations/google/oauth';
import { runLeadAgent } from '@/lib/ai/agents/lead/run';

/**
 * Gmail lead intake (LENS-023b) — the production caller LeadAgent has been
 * waiting for since Sprint 2. Polls a rolling inbox window on cron (spec D1:
 * stateless, no sync cursor — the (photographer_id, source_message_id)
 * unique index plus the pre-checks below make re-processing a no-op),
 * filters to lead candidates (D3: thread-starters from unknown senders),
 * and runs each through LeadAgent.
 *
 * Extraction is deterministic (D2): payload fields come from headers; the
 * qualification call inside LeadAgent is the only model involvement. Bodies
 * go to `intent_summary` and the comm_log ledger — app logs and cron
 * responses carry counts and IDs only (#11).
 */

/** Rolling inbox window (days) — matches the adapter default (spec D1). */
export const INTAKE_WINDOW_DAYS = 2;
/** Max messages fetched per photographer per run. */
export const INTAKE_MAX_MESSAGES = 50;
/** intent_summary cap — subject + body, truncated (D2). */
export const INTENT_SUMMARY_MAX_CHARS = 2000;
/** comm_log body cap — the ledger holds content, not unbounded newsletters. */
export const COMM_LOG_BODY_MAX_CHARS = 20_000;

export interface PhotographerIntakeReport {
  /** Messages in the window. */
  seen: number;
  /** Passed the candidate filter (thread-start + unknown sender). */
  candidates: number;
  /** Leads created (any qualification outcome — rejected leads still exist). */
  created: number;
  /** Already ingested (source_message_id known) — the stateless-poll no-op. */
  duplicates: number;
  /** Gmail credential revoked/broken mid-run — reconnect required. */
  credentials_broken: boolean;
  skipped: Record<string, number>;
  errors: string[];
}

/**
 * Run intake for one photographer. Callers must have verified the
 * `gmail.readonly` grant (see runGmailLeadIntakeAll) — a missing grant
 * surfaces there as `readonly_missing`, never as a silent no-op.
 *
 * Invoked from the cron route with the ADMIN client (no user session), so
 * every query here is explicitly photographer-scoped — RLS does not apply
 * to the service role.
 */
export async function runGmailLeadIntake(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<ErpResult<PhotographerIntakeReport>> {
  const report: PhotographerIntakeReport = {
    seen: 0,
    candidates: 0,
    created: 0,
    duplicates: 0,
    credentials_broken: false,
    skipped: {},
    errors: [],
  };
  const skip = (reason: string) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
  };

  const list = await listInboxMessageIds(supabase, photographerId, {
    newerThanDays: INTAKE_WINDOW_DAYS,
    maxResults: INTAKE_MAX_MESSAGES,
  });
  if (list.error) {
    if (list.error.code === 'integration_auth_error') {
      // Revoked grant → surfaced by the aggregate report + connection status
      // in the UI ("inquiry capture paused — reconnect Google"), never a
      // silent stop.
      report.credentials_broken = true;
      return { data: report, error: null };
    }
    return { data: null, error: list.error };
  }
  report.seen = list.data.length;
  if (report.seen === 0) return { data: report, error: null };

  // Candidate filter inputs (D3) — one query each against client and lead
  // emails. Lead rows also seed the source_message_id dedup set; deleted
  // leads stay in THAT set (the partial unique index doesn't exempt them —
  // re-inserting would be a constraint violation, so it's a duplicate, not
  // an error) but drop out of the known-sender set (a deleted lead's sender
  // may legitimately inquire again).
  const { data: clients, error: clientErr } = await supabase
    .from('client')
    .select('email')
    .eq('photographer_id', photographerId)
    .is('deleted_at', null);
  if (clientErr) return { data: null, error: toErpError(clientErr) };

  const { data: leads, error: leadErr } = await supabase
    .from('lead')
    .select('email, source_message_id, deleted_at')
    .eq('photographer_id', photographerId);
  if (leadErr) return { data: null, error: toErpError(leadErr) };

  const knownEmails = new Set<string>();
  for (const c of clients ?? []) {
    if (c.email) knownEmails.add(String(c.email).toLowerCase());
  }
  const knownMessageIds = new Set<string>();
  for (const l of leads ?? []) {
    if (l.source_message_id) knownMessageIds.add(l.source_message_id);
    if (l.email && !l.deleted_at) knownEmails.add(String(l.email).toLowerCase());
  }

  for (const ref of list.data) {
    // Scoped dedup BEFORE fetching — the common stateless-poll case (message
    // already ingested on a prior run) costs one Set lookup, no API call.
    // (runLeadAgent re-checks via findLeadBySourceMessage; under the admin
    // client that check is unscoped, but it can only skip, never create.)
    if (knownMessageIds.has(ref.id)) {
      report.duplicates += 1;
      continue;
    }

    const fetched = await getMessage(supabase, photographerId, ref.id);
    if (fetched.error) {
      if (fetched.error.code === 'integration_auth_error') {
        report.credentials_broken = true;
        break;
      }
      if (fetched.error.code === 'validation_error') {
        // No parseable sender / malformed payload — can't be attributed,
        // can't be a lead. One bad email must not stall the batch.
        skip('unattributable');
        continue;
      }
      report.errors.push(`message ${ref.id}: fetch failed: ${fetched.error.detail}`);
      continue;
    }
    const msg = fetched.data;

    // Mail this account itself sent (Gmail SENT label — catches the chase's
    // reminders looping back via aliases, and any send-as address). The
    // photographer is never their own lead.
    if (msg.labelIds.includes('SENT')) {
      skip('self_sender');
      continue;
    }
    // D3 candidate filter: replies belong to conversations, not intake…
    if (!msg.isThreadStart) {
      skip('reply_not_thread_start');
      continue;
    }
    // …and a known client or lead emailing again is not a new lead —
    // creating one would be a fabricated business event (Rule 4).
    if (knownEmails.has(msg.fromEmail)) {
      skip('known_sender');
      continue;
    }

    report.candidates += 1;

    const intentSummary = [msg.subject, msg.bodyText]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, INTENT_SUMMARY_MAX_CHARS);

    // A thrown exception (gateway misconfiguration, SDK failure) must stay a
    // per-message error, not kill the batch — the route 500s otherwise and
    // every later message in the window goes unprocessed.
    let outcome: Awaited<ReturnType<typeof runLeadAgent>>;
    try {
      outcome = await runLeadAgent(supabase, {
        source_message_id: msg.messageId,
        photographer_id: photographerId,
        display_name: msg.fromName ?? msg.fromEmail,
        email: msg.fromEmail,
        source: 'gmail_inbound',
        intent_summary: intentSummary,
        received_at: msg.receivedAt,
      });
    } catch (err) {
      report.errors.push(
        `message ${msg.messageId}: lead agent threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    if (outcome.error) {
      // Race window: another run ingested this message between our set-build
      // and now. The agent's own dedup catches it — a duplicate, not a failure.
      if (outcome.error.detail.startsWith('Duplicate lead')) {
        report.duplicates += 1;
        continue;
      }
      report.errors.push(
        `message ${msg.messageId}: lead agent failed: ${outcome.error.detail}`,
      );
      continue;
    }

    report.created += 1;
    knownEmails.add(msg.fromEmail); // two inquiries from one sender in one window → one lead
    const lead = outcome.data.lead;

    // Thread linkage (migration_007) — how CommsAgent will join the
    // conversation later. Non-fatal: the lead exists either way.
    const { error: threadErr } = await supabase
      .from('lead')
      .update({ thread_id: msg.threadId })
      .eq('id', lead.id)
      .eq('photographer_id', photographerId);
    if (threadErr) {
      report.errors.push(`lead ${lead.id}: thread_id write failed: ${threadErr.message}`);
    }

    // Ledger write AFTER createLead succeeds (D5) — the ledger records what
    // happened; it is not a lock. Content lives here, never in app logs.
    const logged = await appendCommLog(supabase, {
      photographer_id: photographerId,
      lead_id: lead.id,
      direction: 'inbound',
      channel: 'email',
      agent_id: 'lead',
      subject: msg.subject,
      body: msg.bodyText.slice(0, COMM_LOG_BODY_MAX_CHARS),
      external_message_id: msg.messageId,
      sent_at: msg.receivedAt,
    });
    if (logged.error) {
      report.errors.push(
        `lead ${lead.id}: created but comm_log write failed: ${logged.error.detail}`,
      );
    }

    try {
      await publish(
        {
          type: 'gmail.message_received',
          photographer_id: photographerId,
          thread_id: msg.threadId,
          message_id: msg.messageId,
          occurred_at: msg.receivedAt,
        },
        supabase,
      );
    } catch (err) {
      report.errors.push(
        `lead ${lead.id}: event publish failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { data: report, error: null };
}

export interface IntakeRunReport {
  /** Photographers with the readonly grant whose intake ran. */
  photographers: number;
  /** Gmail rows whose scope[] lacks gmail.readonly — intake off, surfaced. */
  readonly_missing: number;
  /** Photographers whose grant proved revoked mid-run. */
  credentials_broken: number;
  seen: number;
  candidates: number;
  created: number;
  duplicates: number;
  skipped: Record<string, number>;
  errors: string[];
}

/**
 * Cron entry point: run intake for every photographer whose `gmail`
 * credential row's verified scope[] includes `gmail.readonly` (LENS-D-025:
 * a row never claims a scope its token lacks, so the check is honest).
 * Send-only grants are counted as `readonly_missing` — the chase keeps
 * working, intake reports itself off rather than silently no-oping (D4).
 */
export async function runGmailLeadIntakeAll(
  supabase: SupabaseClient,
): Promise<ErpResult<IntakeRunReport>> {
  const report: IntakeRunReport = {
    photographers: 0,
    readonly_missing: 0,
    credentials_broken: 0,
    seen: 0,
    candidates: 0,
    created: 0,
    duplicates: 0,
    skipped: {},
    errors: [],
  };

  const { data: rows, error } = await supabase
    .from('integration_credentials')
    .select('photographer_id, scope')
    .eq('service', 'gmail');
  if (error) return { data: null, error: toErpError(error) };

  for (const row of (rows ?? []) as { photographer_id: string; scope: string[] | null }[]) {
    if (!(row.scope ?? []).includes(GMAIL_READONLY_SCOPE)) {
      report.readonly_missing += 1;
      continue;
    }
    report.photographers += 1;

    const result = await runGmailLeadIntake(supabase, row.photographer_id);
    if (result.error) {
      report.errors.push(
        `photographer ${row.photographer_id}: ${result.error.detail}`,
      );
      continue;
    }
    const r = result.data;
    report.seen += r.seen;
    report.candidates += r.candidates;
    report.created += r.created;
    report.duplicates += r.duplicates;
    if (r.credentials_broken) report.credentials_broken += 1;
    for (const [reason, count] of Object.entries(r.skipped)) {
      report.skipped[reason] = (report.skipped[reason] ?? 0) + count;
    }
    report.errors.push(...r.errors);
  }

  return { data: report, error: null };
}
