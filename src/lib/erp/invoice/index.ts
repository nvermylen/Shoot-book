import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Invoice,
  InvoiceKind,
  InvoiceStatus,
  PaymentMethod,
  Payment,
} from '@/types/erp';
import type { ErpResult } from '../types';
import { toErpError, notFound, validationError } from '../types';
import { publish } from '@/lib/events/bus';

// ---------------------------------------------------------------------------
// Derived-overdue helpers (LENS-D-023)
//
// 'overdue' is never stored. It is computed here, at read time, in the
// photographer's timezone — a due_date is "past" per her calendar's midnight,
// not UTC's.
// ---------------------------------------------------------------------------

/** YYYY-MM-DD for `now` in the given IANA timezone. */
export function localDateString(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD date-only strings. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

const OPEN_STATUSES: InvoiceStatus[] = ['sent', 'partial'];

export interface InvoiceDerived {
  paid_cents: number;
  balance_cents: number;
  is_overdue: boolean;
  /** 0 unless is_overdue. */
  days_overdue: number;
}

export interface InvoiceListRow extends Invoice, InvoiceDerived {
  client: {
    display_name: string;
    email: string;
    parent_name: string | null;
    parent_email: string | null;
  };
  booking: {
    session_date: string | null;
    status: string;
  };
  payments: { id: string; amount_cents: number; method: PaymentMethod; received_at: string }[];
  reminders_sent: number;
}

export interface InvoiceListResult {
  invoices: InvoiceListRow[];
  /** Photographer's IANA timezone — the one all derived fields were computed in. */
  timezone: string;
}

interface InvoiceQueryRow extends Invoice {
  client: InvoiceListRow['client'];
  booking: InvoiceListRow['booking'];
  payment: InvoiceListRow['payments'];
  comm_log: { count: number }[];
}

const LIST_SELECT = `*,
  client:client_id (display_name, email, parent_name, parent_email),
  booking:booking_id (session_date, status),
  payment (id, amount_cents, method, received_at),
  comm_log (count)`;

async function getTimezone(
  supabase: SupabaseClient,
): Promise<ErpResult<string>> {
  const { data, error } = await supabase
    .from('photographer')
    .select('timezone')
    .single();

  if (error) return { data: null, error: toErpError(error) };
  if (!data) return { data: null, error: notFound('photographer', 'self') };
  return { data: data.timezone, error: null };
}

function derive(row: InvoiceQueryRow, today: string): InvoiceListRow {
  const { payment, comm_log, ...invoice } = row;
  const payments = payment ?? [];
  const paid_cents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const open = OPEN_STATUSES.includes(invoice.status);
  const is_overdue = open && invoice.due_date < today;
  return {
    ...invoice,
    client: row.client,
    booking: row.booking,
    payments,
    reminders_sent: comm_log?.[0]?.count ?? 0,
    paid_cents,
    balance_cents: invoice.amount_cents - paid_cents,
    is_overdue,
    days_overdue: is_overdue ? daysBetween(invoice.due_date, today) : 0,
  };
}

async function listInvoicesWhere(
  supabase: SupabaseClient,
  openOnly: boolean,
): Promise<ErpResult<InvoiceListResult>> {
  const tz = await getTimezone(supabase);
  if (tz.error) return { data: null, error: tz.error };

  let query = supabase
    .from('invoice')
    .select(LIST_SELECT)
    .is('deleted_at', null)
    .order('due_date', { ascending: true });
  if (openOnly) query = query.in('status', OPEN_STATUSES);

  const { data, error } = await query;
  if (error) return { data: null, error: toErpError(error) };

  const today = localDateString(tz.data);
  const rows = ((data ?? []) as unknown as InvoiceQueryRow[]).map((r) =>
    derive(r, today),
  );
  return { data: { invoices: rows, timezone: tz.data }, error: null };
}

/**
 * The sweep read (spec LENS-022): open money — status sent/partial, not
 * deleted — ordered soonest-due first, each row carrying derived
 * balance/is_overdue/days_overdue computed in the photographer's timezone.
 */
export function listOpenInvoices(
  supabase: SupabaseClient,
): Promise<ErpResult<InvoiceListResult>> {
  return listInvoicesWhere(supabase, true);
}

/** All non-deleted invoices with the same derived shape (payments page tabs + stats). */
export function listInvoices(
  supabase: SupabaseClient,
): Promise<ErpResult<InvoiceListResult>> {
  return listInvoicesWhere(supabase, false);
}

// ---------------------------------------------------------------------------
// createInvoice — manual entry is the pre-Stripe data source
// ---------------------------------------------------------------------------

export interface CreateInvoiceInput {
  photographer_id: string;
  booking_id: string;
  kind: InvoiceKind;
  amount_cents: number;
  due_date: string; // YYYY-MM-DD
  /** Override for the routing default. Empty/undefined → routing rule applies. */
  recipient_email?: string;
  /** Manual entry is "money already asked for" (D4) — editable, defaults to now. */
  sent_at?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Create a manually-entered invoice. Born 'sent' (LENS-022 D4: pre-Stripe,
 * creating an invoice means "I have already asked for this money").
 *
 * Recipient routing — Morgan's #1 pain: defaults to client.parent_email when
 * set (the mom with the credit card), else client.email. The NULL-parent
 * fallback is the mainline path, not an edge case: every imported client
 * starts with parent_email = NULL.
 */
export async function createInvoice(
  supabase: SupabaseClient,
  input: CreateInvoiceInput,
): Promise<ErpResult<Invoice>> {
  if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) {
    return { data: null, error: validationError('amount_cents must be a positive integer') };
  }
  if (!DATE_RE.test(input.due_date)) {
    return { data: null, error: validationError('due_date must be YYYY-MM-DD') };
  }
  const override = input.recipient_email?.trim();
  if (override && !EMAIL_RE.test(override)) {
    return { data: null, error: validationError('recipient_email is not a valid email') };
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('booking')
    .select('id, client_id, status, deposit_invoice_id, final_invoice_id')
    .eq('id', input.booking_id)
    .is('deleted_at', null)
    .single();
  if (bookingErr) return { data: null, error: toErpError(bookingErr) };
  if (!booking) return { data: null, error: notFound('booking', input.booking_id) };
  if (booking.status === 'cancelled') {
    return { data: null, error: validationError('cannot invoice a cancelled booking') };
  }

  const { data: client, error: clientErr } = await supabase
    .from('client')
    .select('id, email, parent_email')
    .eq('id', booking.client_id)
    .is('deleted_at', null)
    .single();
  if (clientErr) return { data: null, error: toErpError(clientErr) };
  if (!client) return { data: null, error: notFound('client', booking.client_id) };

  const recipient_email = override || client.parent_email || client.email;

  const { data: invoice, error: insertErr } = await supabase
    .from('invoice')
    .insert({
      photographer_id: input.photographer_id,
      booking_id: booking.id,
      client_id: client.id,
      amount_cents: input.amount_cents,
      kind: input.kind,
      status: 'sent',
      due_date: input.due_date,
      recipient_email,
      sent_at: input.sent_at ?? new Date().toISOString(),
    })
    .select()
    .single();
  if (insertErr) return { data: null, error: toErpError(insertErr) };
  if (!invoice) return { data: null, error: notFound('invoice', 'new') };

  const warnings: string[] = [];

  // Link the booking's deposit/final slot when it's empty (spec 022b).
  const slot =
    input.kind === 'deposit' && !booking.deposit_invoice_id
      ? 'deposit_invoice_id'
      : input.kind === 'final' && !booking.final_invoice_id
        ? 'final_invoice_id'
        : null;
  if (slot) {
    const { error: linkErr } = await supabase
      .from('booking')
      .update({ [slot]: invoice.id })
      .eq('id', booking.id);
    if (linkErr) {
      // Invoice exists; the booking link is a secondary write. Flag, don't drop (#37).
      warnings.push(`booking_link_failed: ${linkErr.message}`);
    }
  }

  try {
    await publish(
      {
        type: 'invoice.created',
        photographer_id: invoice.photographer_id,
        invoice_id: invoice.id,
        booking_id: invoice.booking_id,
        kind: invoice.kind,
        amount_cents: invoice.amount_cents,
        occurred_at: invoice.created_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.invoice.create.event_publish_failed', {
      invoice_id: invoice.id,
      error: message,
    });
    warnings.push(`event_publish_failed: ${message}`);
  }

  if (warnings.length > 0) {
    return { data: invoice, error: null, warning: warnings.join('; ') };
  }
  return { data: invoice, error: null };
}

// ---------------------------------------------------------------------------
// recordPayment — manual payment recording (cash / check / "paid me on Venmo")
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  photographer_id: string;
  invoice_id: string;
  amount_cents: number;
  method: PaymentMethod;
  received_at?: string;
}

/**
 * Recompute an invoice's status from the sum of its payments. Only statuses in
 * the payment-driven lifecycle (sent/partial/paid) are recomputed — cancelled
 * and draft are preserved. Without this guard, deleting a stale payment record
 * off a cancelled invoice would flip it back to 'sent' and resurrect it into
 * "who owes" (a Rule 4 accuracy breach).
 */
async function recomputeInvoiceStatus(
  supabase: SupabaseClient,
  invoice: Pick<Invoice, 'id' | 'amount_cents' | 'status'>,
): Promise<ErpResult<{ status: InvoiceStatus; paid_cents: number }>> {
  const { data: payments, error: payErr } = await supabase
    .from('payment')
    .select('amount_cents, received_at')
    .eq('invoice_id', invoice.id);
  if (payErr) return { data: null, error: toErpError(payErr) };

  const rows = payments ?? [];
  const paid_cents = rows.reduce((sum, p) => sum + p.amount_cents, 0);

  if (invoice.status === 'cancelled' || invoice.status === 'draft') {
    return { data: { status: invoice.status, paid_cents }, error: null };
  }

  const status: InvoiceStatus =
    paid_cents >= invoice.amount_cents ? 'paid' : paid_cents > 0 ? 'partial' : 'sent';
  const paid_at =
    status === 'paid'
      ? rows.reduce<string | null>(
          (latest, p) => (latest && latest > p.received_at ? latest : p.received_at),
          null,
        )
      : null;

  const { error: updateErr } = await supabase
    .from('invoice')
    .update({ status, paid_at })
    .eq('id', invoice.id);
  if (updateErr) return { data: null, error: toErpError(updateErr) };

  return { data: { status, paid_cents }, error: null };
}

export async function recordPayment(
  supabase: SupabaseClient,
  input: RecordPaymentInput,
): Promise<ErpResult<Payment>> {
  if (input.method === 'stripe') {
    return {
      data: null,
      error: validationError('stripe payments arrive via reconciliation (Phase 2), not manual entry'),
    };
  }
  if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) {
    return { data: null, error: validationError('amount_cents must be a positive integer') };
  }

  const { data: invoice, error: invErr } = await supabase
    .from('invoice')
    .select('id, amount_cents, status')
    .eq('id', input.invoice_id)
    .is('deleted_at', null)
    .single();
  if (invErr) return { data: null, error: toErpError(invErr) };
  if (!invoice) return { data: null, error: notFound('invoice', input.invoice_id) };
  if (!OPEN_STATUSES.includes(invoice.status)) {
    return {
      data: null,
      error: validationError(`cannot record a payment against a ${invoice.status} invoice`),
    };
  }

  const { data: payment, error: insertErr } = await supabase
    .from('payment')
    .insert({
      photographer_id: input.photographer_id,
      invoice_id: invoice.id,
      amount_cents: input.amount_cents,
      method: input.method,
      received_at: input.received_at ?? new Date().toISOString(),
    })
    .select()
    .single();
  if (insertErr) return { data: null, error: toErpError(insertErr) };
  if (!payment) return { data: null, error: notFound('payment', 'new') };

  const warnings: string[] = [];

  const recompute = await recomputeInvoiceStatus(supabase, invoice);
  if (recompute.error) {
    // Payment row exists but the invoice status is stale — surface loudly so
    // the caller can retry; a silently stale "who owes" is a Rule 4 breach.
    warnings.push(`status_recompute_failed: ${recompute.error.detail}`);
  } else if (recompute.data.paid_cents > invoice.amount_cents) {
    // Recorded as asked (tips and rounding are real) but flagged, not silent.
    warnings.push(
      `overpayment_recorded: payments total ${recompute.data.paid_cents}¢ exceeds invoice amount ${invoice.amount_cents}¢`,
    );
  }

  try {
    await publish(
      {
        type: 'payment.received',
        photographer_id: payment.photographer_id,
        invoice_id: payment.invoice_id,
        amount_cents: payment.amount_cents,
        stripe_payment_intent_id: null,
        occurred_at: payment.received_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.invoice.record_payment.event_publish_failed', {
      payment_id: payment.id,
      error: message,
    });
    warnings.push(`event_publish_failed: ${message}`);
  }

  if (warnings.length > 0) {
    return { data: payment, error: null, warning: warnings.join('; ') };
  }
  return { data: payment, error: null };
}

// ---------------------------------------------------------------------------
// deletePayment — manual-correction path (fat-fingered check amount)
// ---------------------------------------------------------------------------

export async function deletePayment(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Payment>> {
  const { data: payment, error: payErr } = await supabase
    .from('payment')
    .select('*')
    .eq('id', id)
    .single();
  if (payErr) return { data: null, error: toErpError(payErr) };
  if (!payment) return { data: null, error: notFound('payment', id) };
  if (payment.stripe_charge_id) {
    return {
      data: null,
      error: validationError('stripe-sourced payments cannot be deleted; correct in Stripe'),
    };
  }

  const { data: invoice, error: invErr } = await supabase
    .from('invoice')
    .select('id, amount_cents, status')
    .eq('id', payment.invoice_id)
    .single();
  if (invErr) return { data: null, error: toErpError(invErr) };
  if (!invoice) return { data: null, error: notFound('invoice', payment.invoice_id) };

  const { error: deleteErr } = await supabase
    .from('payment')
    .delete()
    .eq('id', id);
  if (deleteErr) return { data: null, error: toErpError(deleteErr) };

  const recompute = await recomputeInvoiceStatus(supabase, invoice);
  if (recompute.error) {
    return {
      data: payment,
      error: null,
      warning: `status_recompute_failed: ${recompute.error.detail}`,
    };
  }
  return { data: payment, error: null };
}

// ---------------------------------------------------------------------------
// cancelInvoice
// ---------------------------------------------------------------------------

export async function cancelInvoice(
  supabase: SupabaseClient,
  id: string,
): Promise<ErpResult<Invoice>> {
  const { data: existing, error: getErr } = await supabase
    .from('invoice')
    .select('id, status')
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  if (getErr) return { data: null, error: toErpError(getErr) };
  if (!existing) return { data: null, error: notFound('invoice', id) };
  if (existing.status === 'paid') {
    return { data: null, error: validationError('cannot cancel a paid invoice') };
  }
  if (existing.status === 'cancelled') {
    return { data: null, error: validationError('invoice is already cancelled') };
  }

  const { data: invoice, error: updateErr } = await supabase
    .from('invoice')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single();
  if (updateErr) return { data: null, error: toErpError(updateErr) };
  if (!invoice) return { data: null, error: notFound('invoice', id) };

  try {
    await publish(
      {
        type: 'invoice.cancelled',
        photographer_id: invoice.photographer_id,
        invoice_id: invoice.id,
        occurred_at: invoice.updated_at,
      },
      supabase,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('erp.invoice.cancel.event_publish_failed', {
      invoice_id: invoice.id,
      error: message,
    });
    return { data: invoice, error: null, warning: `event_publish_failed: ${message}` };
  }

  return { data: invoice, error: null };
}

// ---------------------------------------------------------------------------
// Cutover assist (HABIT_DESIGN Rule 3 — never open empty)
// ---------------------------------------------------------------------------

export interface UninvoicedBooking {
  id: string;
  session_date: string | null;
  status: string;
  client: {
    id: string;
    display_name: string;
    email: string;
    parent_name: string | null;
    parent_email: string | null;
  };
  package: { name: string; price_cents: number; deposit_cents: number } | null;
}

/**
 * Upcoming bookings with no invoice on file — the seed list for the
 * cutover-assist empty state ("6 upcoming shoots have no invoice on file").
 *
 * "Upcoming" starts at the photographer's local calendar day, not the UTC
 * instant: a shoot earlier today still deserves an invoice. Soft-deleted
 * invoices don't count as "on file" — a booking whose only invoice was
 * deleted needs one again.
 */
export async function listUpcomingBookingsWithoutInvoice(
  supabase: SupabaseClient,
): Promise<ErpResult<UninvoicedBooking[]>> {
  const tz = await getTimezone(supabase);
  if (tz.error) return { data: null, error: tz.error };

  const { data, error } = await supabase
    .from('booking')
    .select(
      `id, session_date, status,
       client:client_id (id, display_name, email, parent_name, parent_email),
       package:package_id (name, price_cents, deposit_cents),
       invoice (id, deleted_at)`,
    )
    .is('deleted_at', null)
    .in('status', ['tentative', 'confirmed'])
    // Local date at UTC midnight — errs inclusive by the tz offset, which for
    // a "needs an invoice" list is the right direction to be wrong in.
    .gte('session_date', localDateString(tz.data))
    .order('session_date', { ascending: true });

  if (error) return { data: null, error: toErpError(error) };

  const rows = (data ?? []) as unknown as (UninvoicedBooking & {
    invoice: { id: string; deleted_at: string | null }[];
  })[];
  const uninvoiced = rows
    .filter((b) => (b.invoice ?? []).filter((i) => !i.deleted_at).length === 0)
    .map((b) => ({
      id: b.id,
      session_date: b.session_date,
      status: b.status,
      client: b.client,
      package: b.package,
    }));
  return { data: uninvoiced, error: null };
}
