import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpResult } from '../types';
import { toErpError, validationError } from '../types';
import { publish } from '@/lib/events/bus';
import { appendCommLog } from '@/lib/erp/comm-log';
import { sendEmail } from '@/lib/integrations/gmail/client';
import { localDateString } from './index';

/**
 * The payment chase (LENS-022e) — deterministic code, never an LLM loop
 * (spec D3): escalating templated reminders on a schedule with hard stop
 * conditions. A hallucinated dollar amount in a payment email is a
 * trust-ending event, so template rendering is string substitution only and
 * every amount comes from a fresh balance read at send time.
 *
 * State model (LENS-D-024): comm_log IS the chase history — step selection
 * and per-day idempotency derive from prior reminder rows; there is no state
 * table. comm_sequence_state stores pause INTENT only (LENS-D-027).
 * Send-then-log per D5 (LENS-D-026): worst case after a crash between send
 * and log is one duplicate reminder the next day — bounded, and better than
 * a log row claiming a send that never happened.
 */

export const CHASE_TRIGGER_EVENT = 'invoice.chase';
/** After this many overdue sends, the chase stops and escalates to the photographer. */
export const OVERDUE_SEND_CAP = 5;
/** Reminders fire only between these local hours (inclusive start, exclusive end). */
export const SEND_WINDOW_START_HOUR = 8;
export const SEND_WINDOW_END_HOUR = 10;

// ---------------------------------------------------------------------------
// Sequence definition — cadence and copy are DATA (comm_sequence.steps),
// seeded per photographer so a future settings UI edits them without a
// schema change. This constant is only the seed.
// ---------------------------------------------------------------------------

export type ChaseWindow = 'pre_due_7' | 'pre_due_3' | 'due' | 'overdue_first' | 'overdue_firm';

export interface ChaseStepTemplate {
  window: ChaseWindow;
  subject: string;
  body_text: string;
}

export interface ChaseSequenceData {
  /** Photographer-editable payment instructions — pre-Stripe there is no payment link. */
  payment_instructions: string;
  steps: ChaseStepTemplate[];
}

export const DEFAULT_CHASE_SEQUENCE: ChaseSequenceData = {
  payment_instructions:
    'You can pay by check, cash, or Venmo — just reply to this email and I’ll send the details.',
  steps: [
    {
      window: 'pre_due_7',
      subject:
        'Heads up — {{balance_due}} for {{client_first_name}}’s {{session_type}} session is due {{due_date}}',
      body_text:
        'Hi {{recipient_first_name}},\n\n' +
        'Just a friendly heads-up: the {{balance_due}} balance for {{client_first_name}}’s {{session_type}} session is due on {{due_date}}.\n\n' +
        '{{payment_instructions}}\n\n' +
        'Thank you!',
    },
    {
      window: 'pre_due_3',
      subject:
        '{{balance_due}} due {{due_date}} — {{client_first_name}}’s {{session_type}} session',
      body_text:
        'Hi {{recipient_first_name}},\n\n' +
        'A quick reminder that {{balance_due}} for {{client_first_name}}’s {{session_type}} session is due on {{due_date}}.\n\n' +
        '{{payment_instructions}}\n\n' +
        'Thanks so much!',
    },
    {
      window: 'due',
      subject: 'Due today — {{balance_due}} for {{client_first_name}}’s {{session_type}} session',
      body_text:
        'Hi {{recipient_first_name}},\n\n' +
        'The {{balance_due}} balance for {{client_first_name}}’s {{session_type}} session is due today ({{due_date}}).\n\n' +
        '{{payment_instructions}}\n\n' +
        'Thank you!',
    },
    {
      window: 'overdue_first',
      subject: 'Overdue — {{balance_due}} for {{client_first_name}}’s {{session_type}} session',
      body_text:
        'Hi {{recipient_first_name}},\n\n' +
        'The {{balance_due}} balance for {{client_first_name}}’s {{session_type}} session was due on {{due_date}} and is now outstanding.\n\n' +
        '{{payment_instructions}}\n\n' +
        'If you’ve already sent payment, thank you — please disregard this note.',
    },
    {
      window: 'overdue_firm',
      subject: 'Balance due — {{balance_due}}, {{days_overdue}} days overdue',
      body_text:
        'Hi {{recipient_first_name}},\n\n' +
        'This is a reminder that {{balance_due}} for {{client_first_name}}’s {{session_type}} session is now {{days_overdue}} days past its {{due_date}} due date.\n\n' +
        '{{payment_instructions}}\n\n' +
        'Please get in touch if anything needs sorting out — otherwise I’ll look for payment soon.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests.
// ---------------------------------------------------------------------------

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative = `to` is earlier. */
function dayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export type ChaseDecision =
  | { action: 'skip'; reason: 'already_sent_today' | 'not_due_yet' | 'window_covered' }
  | { action: 'send'; window: ChaseWindow; step: number; overdueSendNumber: number }
  | { action: 'escalate' };

/**
 * Decide what (if anything) to send for one invoice today.
 *
 * All dates are LOCAL (photographer timezone) YYYY-MM-DD strings —
 * `sendDatesLocal` are the local dates of prior reminders for this invoice,
 * derived from comm_log (the ledger is the state, LENS-D-024).
 *
 * Timeline: step 1 at due-7, step 2 at due-3, step 3 on the due date, then
 * one escalating send per local day while overdue, capped at
 * OVERDUE_SEND_CAP, after which the chase escalates to the photographer.
 * Idempotency: never more than one send per invoice per local day.
 */
export function selectChaseStep(input: {
  dueDate: string;
  today: string;
  sendDatesLocal: string[];
}): ChaseDecision {
  const { dueDate, today, sendDatesLocal } = input;

  if (sendDatesLocal.includes(today)) {
    return { action: 'skip', reason: 'already_sent_today' };
  }

  const untilDue = dayDiff(today, dueDate); // >0 = due in future, <0 = overdue

  if (untilDue < 0) {
    const overdueSends = sendDatesLocal.filter((d) => dayDiff(dueDate, d) > 0).length;
    if (overdueSends >= OVERDUE_SEND_CAP) return { action: 'escalate' };
    return {
      action: 'send',
      window: overdueSends === 0 ? 'overdue_first' : 'overdue_firm',
      step: 4 + overdueSends,
      overdueSendNumber: overdueSends + 1,
    };
  }

  if (untilDue === 0) {
    // Step 3 — "due today". One send on the due date itself.
    return { action: 'send', window: 'due', step: 3, overdueSendNumber: 0 };
  }

  if (untilDue <= 3) {
    // Step 2 window: [due-3, due). One send within the window.
    const covered = sendDatesLocal.some(
      (d) => dayDiff(d, dueDate) <= 3 && dayDiff(d, dueDate) > 0,
    );
    return covered
      ? { action: 'skip', reason: 'window_covered' }
      : { action: 'send', window: 'pre_due_3', step: 2, overdueSendNumber: 0 };
  }

  if (untilDue <= 7) {
    // Step 1 window: [due-7, due-3). One send within the window.
    const covered = sendDatesLocal.some(
      (d) => dayDiff(d, dueDate) <= 7 && dayDiff(d, dueDate) > 3,
    );
    return covered
      ? { action: 'skip', reason: 'window_covered' }
      : { action: 'send', window: 'pre_due_7', step: 1, overdueSendNumber: 0 };
  }

  return { action: 'skip', reason: 'not_due_yet' };
}

export interface ChaseRecipient {
  email: string;
  /** First name used in the greeting — whoever actually receives the email. */
  firstName: string;
  routedToParent: boolean;
}

/**
 * Recipient resolution — AT SEND TIME, re-read per send (spec): parent_email
 * when set, else client.email. The NULL-parent fallback is explicit,
 * mandatory behavior — a chase that no-ops on a missing parent silently
 * disables the wedge for the whole imported book.
 *
 * One refinement: an explicit manual override entered on the invoice (a
 * recipient that matches neither the client nor the parent on file) is
 * honored — Morgan typed it on purpose. Parent-vs-client routing, however,
 * always re-resolves so a parent added mid-chase reroutes the very next
 * reminder.
 */
export function resolveRecipient(input: {
  invoiceRecipientEmail: string;
  client: {
    display_name: string;
    email: string;
    parent_email: string | null;
    parent_name: string | null;
  };
}): ChaseRecipient {
  const { invoiceRecipientEmail, client } = input;
  const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? s;

  const isOverride =
    invoiceRecipientEmail !== client.email &&
    invoiceRecipientEmail !== (client.parent_email ?? '');
  if (isOverride && invoiceRecipientEmail.trim() !== '') {
    return {
      email: invoiceRecipientEmail,
      firstName: firstWord(client.parent_name ?? client.display_name),
      routedToParent: false,
    };
  }

  if (client.parent_email) {
    return {
      email: client.parent_email,
      firstName: firstWord(client.parent_name ?? client.parent_email),
      routedToParent: true,
    };
  }
  return {
    email: client.email,
    firstName: firstWord(client.display_name),
    routedToParent: false,
  };
}

export interface ChaseMergeFields {
  recipient_first_name: string;
  client_first_name: string;
  session_type: string;
  session_date: string;
  balance_due: string;
  due_date: string;
  days_overdue: string;
  payment_instructions: string;
}

const MERGE_FIELD_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * String substitution only (D3) — never generation. Returns an error if any
 * placeholder survives substitution: a template artifact in a money email is
 * worse than a skipped day.
 */
export function renderTemplate(
  template: string,
  fields: ChaseMergeFields,
): ErpResult<string> {
  const rendered = template.replace(MERGE_FIELD_RE, (match, key: string) => {
    const value = fields[key as keyof ChaseMergeFields];
    return value !== undefined ? value : match;
  });
  const leftover = rendered.match(MERGE_FIELD_RE);
  if (leftover) {
    return {
      data: null,
      error: validationError(`unresolved merge field(s): ${leftover.join(', ')}`),
    };
  }
  return { data: rendered, error: null };
}

export function formatCentsUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/** "October 19" from a YYYY-MM-DD date-only string (no tz math on date-onlys). */
function humanDate(dateOnly: string): string {
  return new Date(`${dateOnly}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function localHour(timezone: string, now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
}

// ---------------------------------------------------------------------------
// Sequence get-or-create
// ---------------------------------------------------------------------------

interface ChaseSequenceRow {
  id: string;
  photographer_id: string;
  steps: ChaseSequenceData;
  is_active: boolean;
}

async function getOrCreateChaseSequence(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<ErpResult<ChaseSequenceRow>> {
  const { data: existing, error: readErr } = await supabase
    .from('comm_sequence')
    .select('id, photographer_id, steps, is_active')
    .eq('photographer_id', photographerId)
    .eq('trigger_event', CHASE_TRIGGER_EVENT)
    .limit(1);
  if (readErr) return { data: null, error: toErpError(readErr) };
  if (existing && existing.length > 0) {
    return { data: existing[0] as ChaseSequenceRow, error: null };
  }

  const { data: created, error: insertErr } = await supabase
    .from('comm_sequence')
    .insert({
      photographer_id: photographerId,
      name: 'Payment chase',
      trigger_event: CHASE_TRIGGER_EVENT,
      steps: DEFAULT_CHASE_SEQUENCE,
      is_active: true,
    })
    .select('id, photographer_id, steps, is_active')
    .single();
  if (insertErr) return { data: null, error: toErpError(insertErr) };
  return { data: created as ChaseSequenceRow, error: null };
}

// ---------------------------------------------------------------------------
// The runner — invoked hourly by the cron route with the ADMIN client
// (cron has no user session). Every query below is explicitly
// photographer-scoped because RLS does not apply to the service role.
// ---------------------------------------------------------------------------

export interface ChaseRunReport {
  photographers: number;
  sent: number;
  escalated: number;
  skipped: Record<string, number>;
  /** Photographers whose Gmail credential is missing/revoked — chase paused, surfaced in UI. */
  credentials_broken: number;
  errors: string[];
}

interface ChaseInvoiceRow {
  id: string;
  photographer_id: string;
  booking_id: string;
  client_id: string;
  amount_cents: number;
  status: string;
  due_date: string;
  recipient_email: string;
  booking: {
    session_date: string | null;
    status: string;
    deleted_at: string | null;
    package: { session_type: string } | null;
  } | null;
  comm_log: { sent_at: string }[];
}

export async function runInvoiceChase(
  supabase: SupabaseClient,
  opts?: { now?: Date },
): Promise<ErpResult<ChaseRunReport>> {
  const now = opts?.now ?? new Date();
  const report: ChaseRunReport = {
    photographers: 0,
    sent: 0,
    escalated: 0,
    skipped: {},
    credentials_broken: 0,
    errors: [],
  };
  const skip = (reason: string) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
  };

  const { data: openInvoices, error: listErr } = await supabase
    .from('invoice')
    .select(
      `id, photographer_id, booking_id, client_id, amount_cents, status, due_date, recipient_email,
       booking:booking_id (session_date, status, deleted_at, package:package_id (session_type)),
       comm_log (sent_at)`,
    )
    .in('status', ['sent', 'partial'])
    .is('deleted_at', null);
  if (listErr) return { data: null, error: toErpError(listErr) };

  const byPhotographer = new Map<string, ChaseInvoiceRow[]>();
  for (const row of (openInvoices ?? []) as unknown as ChaseInvoiceRow[]) {
    const list = byPhotographer.get(row.photographer_id) ?? [];
    list.push(row);
    byPhotographer.set(row.photographer_id, list);
  }

  for (const [photographerId, invoices] of byPhotographer) {
    report.photographers += 1;

    const { data: photographer, error: pErr } = await supabase
      .from('photographer')
      .select('id, timezone, display_name, default_email_signature')
      .eq('id', photographerId)
      .single();
    if (pErr || !photographer) {
      report.errors.push(`photographer ${photographerId}: ${pErr?.message ?? 'not found'}`);
      continue;
    }

    // Send timing is local: fire only 8am–10am in the photographer's timezone.
    const hour = localHour(photographer.timezone, now);
    if (hour < SEND_WINDOW_START_HOUR || hour >= SEND_WINDOW_END_HOUR) {
      skip('outside_send_window');
      continue;
    }

    // Stop condition 4: missing Gmail credential → skip and surface, never
    // fail silently. (Revoked-mid-run is caught via send errors below.)
    const { count: credCount, error: credErr } = await supabase
      .from('integration_credentials')
      .select('id', { count: 'exact', head: true })
      .eq('photographer_id', photographerId)
      .eq('service', 'gmail');
    if (credErr) {
      report.errors.push(`credentials ${photographerId}: ${credErr.message}`);
      continue;
    }
    if ((credCount ?? 0) === 0) {
      report.credentials_broken += 1;
      skip('gmail_not_connected');
      continue;
    }

    const sequence = await getOrCreateChaseSequence(supabase, photographerId);
    if (sequence.error) {
      report.errors.push(`sequence ${photographerId}: ${sequence.error.detail}`);
      continue;
    }
    if (!sequence.data.is_active) {
      skip('chase_disabled');
      continue;
    }
    const sequenceData: ChaseSequenceData =
      sequence.data.steps && Array.isArray(sequence.data.steps.steps)
        ? sequence.data.steps
        : DEFAULT_CHASE_SEQUENCE;

    // Stop condition 3: per-invoice pause intent (LENS-D-027).
    const { data: pausedRows, error: pausedErr } = await supabase
      .from('comm_sequence_state')
      .select('invoice_id')
      .eq('sequence_id', sequence.data.id)
      .eq('status', 'paused')
      .not('invoice_id', 'is', null);
    if (pausedErr) {
      report.errors.push(`paused ${photographerId}: ${pausedErr.message}`);
      continue;
    }
    const paused = new Set((pausedRows ?? []).map((r) => r.invoice_id as string));

    const today = localDateString(photographer.timezone, now);
    let authBroken = false;

    for (const invoice of invoices) {
      if (authBroken) {
        skip('gmail_auth_broken');
        continue;
      }
      if (paused.has(invoice.id)) {
        skip('paused');
        continue;
      }
      // Stop condition 2: cancelled or deleted booking.
      if (!invoice.booking || invoice.booking.status === 'cancelled' || invoice.booking.deleted_at) {
        skip('booking_cancelled');
        continue;
      }

      const sendDatesLocal = (invoice.comm_log ?? []).map((r) =>
        localDateString(photographer.timezone, new Date(r.sent_at)),
      );
      const decision = selectChaseStep({
        dueDate: invoice.due_date,
        today,
        sendDatesLocal,
      });

      if (decision.action === 'skip') {
        skip(decision.reason);
        continue;
      }
      if (decision.action === 'escalate') {
        // Past the cap it's a relationship conversation, not a template's
        // job. Escalation is DERIVED state — the dashboard surfaces it from
        // the same comm_log read; nothing to write here.
        report.escalated += 1;
        continue;
      }

      // Stop condition 1, checked immediately before the send ("stops the
      // second money hits"): fresh invoice + payments read. A reminder sent
      // for a paid invoice is a P0 bug.
      const { data: fresh, error: freshErr } = await supabase
        .from('invoice')
        .select('id, status, amount_cents, deleted_at, payment (amount_cents)')
        .eq('id', invoice.id)
        .single();
      if (freshErr || !fresh) {
        report.errors.push(`invoice ${invoice.id}: ${freshErr?.message ?? 'not found'}`);
        continue;
      }
      if (fresh.deleted_at || (fresh.status !== 'sent' && fresh.status !== 'partial')) {
        skip('no_longer_open');
        continue;
      }
      const paidCents = ((fresh.payment ?? []) as { amount_cents: number }[]).reduce(
        (sum, p) => sum + p.amount_cents,
        0,
      );
      const balanceCents = fresh.amount_cents - paidCents;
      if (balanceCents <= 0) {
        skip('no_longer_open');
        continue;
      }

      // Recipient resolution at send time — re-read the client so a parent
      // added mid-chase (LENS-020 drawer) reroutes THIS reminder.
      const { data: client, error: clientErr } = await supabase
        .from('client')
        .select('display_name, email, parent_email, parent_name, deleted_at')
        .eq('id', invoice.client_id)
        .single();
      if (clientErr || !client || client.deleted_at) {
        skip('client_missing');
        continue;
      }
      const recipient = resolveRecipient({
        invoiceRecipientEmail: invoice.recipient_email,
        client,
      });

      const template = sequenceData.steps.find((s) => s.window === decision.window);
      if (!template) {
        report.errors.push(`invoice ${invoice.id}: no template for window ${decision.window}`);
        continue;
      }

      const fields: ChaseMergeFields = {
        recipient_first_name: recipient.firstName,
        client_first_name: client.display_name.trim().split(/\s+/)[0] ?? client.display_name,
        session_type: invoice.booking.package?.session_type ?? 'photo',
        session_date: invoice.booking.session_date
          ? humanDate(localDateString(photographer.timezone, new Date(invoice.booking.session_date)))
          : 'your upcoming session',
        balance_due: formatCentsUsd(balanceCents),
        due_date: humanDate(invoice.due_date),
        days_overdue: String(Math.max(0, dayDiff(invoice.due_date, today))),
        payment_instructions: sequenceData.payment_instructions,
      };

      const subject = renderTemplate(template.subject, fields);
      const bodyCore = renderTemplate(template.body_text, fields);
      if (subject.error || bodyCore.error) {
        report.errors.push(
          `invoice ${invoice.id}: template render failed: ${(subject.error ?? bodyCore.error)?.detail}`,
        );
        continue;
      }
      const signature = photographer.default_email_signature;
      const bodyText = signature ? `${bodyCore.data}\n\n${signature}` : bodyCore.data;
      const bodyHtml = bodyText
        .split('\n\n')
        .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');

      // Send-then-log (D5 / LENS-D-026): the ledger never claims a send that
      // didn't happen. If the log write fails AFTER a successful send, worst
      // case is one duplicate tomorrow — bounded, and reported loudly.
      const sent = await sendEmail(supabase, photographerId, {
        to: recipient.email,
        subject: subject.data,
        bodyHtml,
        bodyText,
      });
      if (sent.error) {
        if (sent.error.code === 'integration_auth_error') {
          // Revoked mid-run: stop this photographer's sends; the UI surfaces
          // "chase paused — reconnect Google" from connection status.
          authBroken = true;
          report.credentials_broken += 1;
          skip('gmail_auth_broken');
        } else {
          report.errors.push(`invoice ${invoice.id}: send failed: ${sent.error.detail}`);
        }
        continue;
      }

      report.sent += 1;

      const logged = await appendCommLog(supabase, {
        photographer_id: photographerId,
        client_id: invoice.client_id,
        booking_id: invoice.booking_id,
        invoice_id: invoice.id,
        direction: 'outbound',
        channel: 'email',
        agent_id: 'billing',
        subject: subject.data,
        body: bodyText,
        external_message_id: sent.data.messageId,
        sequence_id: sequence.data.id,
        sent_at: now.toISOString(),
      });
      if (logged.error) {
        // Send happened; log didn't. Report loudly — accepted bounded-dup
        // failure mode per D5, never a silent stop.
        report.errors.push(
          `invoice ${invoice.id}: SENT but comm_log write failed: ${logged.error.detail}`,
        );
      }

      try {
        await publish(
          {
            type: 'invoice.reminder_sent',
            photographer_id: photographerId,
            invoice_id: invoice.id,
            step: decision.step,
            recipient: recipient.email,
            occurred_at: now.toISOString(),
          },
          supabase,
        );
      } catch (err) {
        report.errors.push(
          `invoice ${invoice.id}: event publish failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { data: report, error: null };
}

// ---------------------------------------------------------------------------
// UI read — chase state per open invoice, derived from the ledger (RLS
// client; used by the payments page and the dashboard money card).
// ---------------------------------------------------------------------------

export interface InvoiceChaseState {
  invoice_id: string;
  reminders_sent: number;
  overdue_sends: number;
  /** Cap reached while still open — "your turn", surfaced as needs-attention. */
  escalated: boolean;
  paused: boolean;
}

export async function listChaseStates(
  supabase: SupabaseClient,
): Promise<ErpResult<Record<string, InvoiceChaseState>>> {
  const { data: photographer, error: pErr } = await supabase
    .from('photographer')
    .select('timezone')
    .single();
  if (pErr) return { data: null, error: toErpError(pErr) };

  const { data: invoices, error: invErr } = await supabase
    .from('invoice')
    .select('id, due_date, comm_log (sent_at)')
    .in('status', ['sent', 'partial'])
    .is('deleted_at', null);
  if (invErr) return { data: null, error: toErpError(invErr) };

  const { data: pausedRows, error: pausedErr } = await supabase
    .from('comm_sequence_state')
    .select('invoice_id')
    .eq('status', 'paused')
    .not('invoice_id', 'is', null);
  if (pausedErr) return { data: null, error: toErpError(pausedErr) };
  const paused = new Set((pausedRows ?? []).map((r) => r.invoice_id as string));

  const today = localDateString(photographer.timezone);
  const states: Record<string, InvoiceChaseState> = {};
  for (const inv of (invoices ?? []) as unknown as {
    id: string;
    due_date: string;
    comm_log: { sent_at: string }[];
  }[]) {
    const sendDates = (inv.comm_log ?? []).map((r) =>
      localDateString(photographer.timezone, new Date(r.sent_at)),
    );
    const overdueSends = sendDates.filter((d) => dayDiff(inv.due_date, d) > 0).length;
    states[inv.id] = {
      invoice_id: inv.id,
      reminders_sent: sendDates.length,
      overdue_sends: overdueSends,
      escalated: overdueSends >= OVERDUE_SEND_CAP && inv.due_date < today,
      paused: paused.has(inv.id),
    };
  }
  return { data: states, error: null };
}

// ---------------------------------------------------------------------------
// Pause / resume — pause INTENT lives in comm_sequence_state (LENS-D-027);
// it never rewrites history.
// ---------------------------------------------------------------------------

export async function setChasePaused(
  supabase: SupabaseClient,
  input: { photographer_id: string; invoice_id: string; paused: boolean },
): Promise<ErpResult<{ paused: boolean }>> {
  const { data: invoice, error: invErr } = await supabase
    .from('invoice')
    .select('id, client_id, booking_id')
    .eq('id', input.invoice_id)
    .is('deleted_at', null)
    .single();
  if (invErr) return { data: null, error: toErpError(invErr) };
  if (!invoice) return { data: null, error: validationError('invoice not found') };

  const sequence = await getOrCreateChaseSequence(supabase, input.photographer_id);
  if (sequence.error) return { data: null, error: sequence.error };

  const { data: existing, error: readErr } = await supabase
    .from('comm_sequence_state')
    .select('id')
    .eq('invoice_id', input.invoice_id)
    .limit(1);
  if (readErr) return { data: null, error: toErpError(readErr) };

  const status = input.paused ? 'paused' : 'active';
  if (existing && existing.length > 0) {
    const { error: updateErr } = await supabase
      .from('comm_sequence_state')
      .update({ status })
      .eq('id', existing[0].id);
    if (updateErr) return { data: null, error: toErpError(updateErr) };
  } else {
    const { error: insertErr } = await supabase.from('comm_sequence_state').insert({
      sequence_id: sequence.data.id,
      client_id: invoice.client_id,
      booking_id: invoice.booking_id,
      invoice_id: invoice.id,
      status,
    });
    if (insertErr) return { data: null, error: toErpError(insertErr) };
  }
  return { data: { paused: input.paused }, error: null };
}
