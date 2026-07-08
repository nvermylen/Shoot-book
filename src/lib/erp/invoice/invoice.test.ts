import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createInvoice,
  recordPayment,
  deletePayment,
  cancelInvoice,
  listOpenInvoices,
  listUpcomingBookingsWithoutInvoice,
  localDateString,
} from './index';
import * as bus from '@/lib/events/bus';

// ---------------------------------------------------------------------------
// Multi-table mock: each table gets a queue of results, consumed in call
// order. A chain is thenable so `await query.eq(...)` (no .single()) works.
// ---------------------------------------------------------------------------

type QueryResult = { data?: unknown; error?: unknown; count?: number };

function createTable(results: QueryResult[]) {
  let i = 0;
  const next = () =>
    results[Math.min(i, results.length - 1)] ?? { data: null, error: null };
  const consume = () => {
    const r = next();
    i += 1;
    return r;
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const chain: any = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'gte', 'order']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockImplementation(() => Promise.resolve(consume()));
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(consume()).then(resolve, reject);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return chain;
}

function mockSupabase(tables: Record<string, QueryResult[]>) {
  const chains = Object.fromEntries(
    Object.entries(tables).map(([t, r]) => [t, createTable(r)]),
  );
  return {
    supabase: { from: vi.fn((t: string) => chains[t]) },
    chains,
  };
}

const BOOKING_ROW = {
  id: 'booking-1',
  client_id: 'client-1',
  status: 'confirmed',
  deposit_invoice_id: null,
  final_invoice_id: null,
};

const CLIENT_WITH_PARENT = {
  id: 'client-1',
  email: 'emma@example.com',
  parent_email: 'susan@example.com',
};

const CLIENT_NO_PARENT = {
  id: 'client-1',
  email: 'emma@example.com',
  parent_email: null,
};

const INVOICE_ROW = {
  id: 'invoice-1',
  photographer_id: 'photo-1',
  booking_id: 'booking-1',
  client_id: 'client-1',
  amount_cents: 42_500,
  kind: 'final',
  status: 'sent',
  due_date: '2026-07-20',
  recipient_email: 'susan@example.com',
  stripe_payment_link_url: null,
  stripe_payment_intent_id: null,
  quickbooks_invoice_id: null,
  sent_at: '2026-07-01T12:00:00Z',
  paid_at: null,
  created_at: '2026-07-01T12:00:00Z',
  updated_at: '2026-07-01T12:00:00Z',
  deleted_at: null,
};

const CREATE_INPUT = {
  photographer_id: 'photo-1',
  booking_id: 'booking-1',
  kind: 'final' as const,
  amount_cents: 42_500,
  due_date: '2026-07-20',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createInvoice — recipient routing (the wedge)', () => {
  it('routes to parent_email when the client has a parent on file', async () => {
    const { supabase, chains } = mockSupabase({
      booking: [{ data: BOOKING_ROW, error: null }, { error: null }],
      client: [{ data: CLIENT_WITH_PARENT, error: null }],
      invoice: [{ data: INVOICE_ROW, error: null }],
    });

    const result = await createInvoice(supabase as never, CREATE_INPUT);

    expect(result.error).toBeNull();
    expect(chains.invoice.insert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_email: 'susan@example.com' }),
    );
  });

  it('falls back to client.email when parent_email is NULL (mainline path — all imported clients start here)', async () => {
    const { supabase, chains } = mockSupabase({
      booking: [{ data: BOOKING_ROW, error: null }, { error: null }],
      client: [{ data: CLIENT_NO_PARENT, error: null }],
      invoice: [{ data: INVOICE_ROW, error: null }],
    });

    const result = await createInvoice(supabase as never, CREATE_INPUT);

    expect(result.error).toBeNull();
    expect(chains.invoice.insert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_email: 'emma@example.com' }),
    );
  });

  it('respects an explicit recipient override', async () => {
    const { supabase, chains } = mockSupabase({
      booking: [{ data: BOOKING_ROW, error: null }, { error: null }],
      client: [{ data: CLIENT_WITH_PARENT, error: null }],
      invoice: [{ data: INVOICE_ROW, error: null }],
    });

    await createInvoice(supabase as never, {
      ...CREATE_INPUT,
      recipient_email: 'other@example.com',
    });

    expect(chains.invoice.insert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_email: 'other@example.com' }),
    );
  });
});

describe('createInvoice — lifecycle', () => {
  it('is born sent (D4), links the booking slot, and publishes invoice.created', async () => {
    const { supabase, chains } = mockSupabase({
      booking: [{ data: BOOKING_ROW, error: null }, { error: null }],
      client: [{ data: CLIENT_WITH_PARENT, error: null }],
      invoice: [{ data: INVOICE_ROW, error: null }],
    });

    const result = await createInvoice(supabase as never, CREATE_INPUT);

    expect(result.error).toBeNull();
    expect(result.warning).toBeUndefined();
    expect(chains.invoice.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', sent_at: expect.any(String) }),
    );
    expect(chains.booking.update).toHaveBeenCalledWith({
      final_invoice_id: 'invoice-1',
    });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoice.created', invoice_id: 'invoice-1' }),
      expect.anything(),
    );
  });

  it('does not overwrite an already-linked booking slot', async () => {
    const { supabase, chains } = mockSupabase({
      booking: [
        { data: { ...BOOKING_ROW, final_invoice_id: 'other-invoice' }, error: null },
      ],
      client: [{ data: CLIENT_WITH_PARENT, error: null }],
      invoice: [{ data: INVOICE_ROW, error: null }],
    });

    const result = await createInvoice(supabase as never, CREATE_INPUT);

    expect(result.error).toBeNull();
    expect(chains.booking.update).not.toHaveBeenCalled();
  });

  it('returns data with warning when event publish fails', async () => {
    vi.spyOn(bus, 'publish').mockRejectedValue(new Error('bus down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = mockSupabase({
      booking: [{ data: BOOKING_ROW, error: null }, { error: null }],
      client: [{ data: CLIENT_WITH_PARENT, error: null }],
      invoice: [{ data: INVOICE_ROW, error: null }],
    });

    const result = await createInvoice(supabase as never, CREATE_INPUT);

    expect(result.data).not.toBeNull();
    expect(result.warning).toContain('event_publish_failed');
  });

  it('rejects a non-integer or non-positive amount without any db call', async () => {
    const { supabase } = mockSupabase({});

    for (const amount_cents of [0, -100, 42.5]) {
      const result = await createInvoice(supabase as never, {
        ...CREATE_INPUT,
        amount_cents,
      });
      expect(result.error?.code).toBe('validation_error');
    }
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rejects a cancelled booking', async () => {
    const { supabase } = mockSupabase({
      booking: [{ data: { ...BOOKING_ROW, status: 'cancelled' }, error: null }],
    });

    const result = await createInvoice(supabase as never, CREATE_INPUT);
    expect(result.error?.code).toBe('validation_error');
  });
});

describe('recordPayment', () => {
  const PAYMENT_ROW = {
    id: 'payment-1',
    photographer_id: 'photo-1',
    invoice_id: 'invoice-1',
    amount_cents: 42_500,
    method: 'check',
    stripe_charge_id: null,
    received_at: '2026-07-07T10:00:00Z',
    reconciled_at: null,
    created_at: '2026-07-07T10:00:00Z',
    updated_at: '2026-07-07T10:00:00Z',
  };

  it('full payment flips the invoice to paid with paid_at, publishes payment.received', async () => {
    const { supabase, chains } = mockSupabase({
      invoice: [
        { data: { id: 'invoice-1', amount_cents: 42_500, status: 'sent' }, error: null },
        { error: null }, // status update
      ],
      payment: [
        { data: PAYMENT_ROW, error: null }, // insert
        { data: [{ amount_cents: 42_500, received_at: '2026-07-07T10:00:00Z' }], error: null }, // recompute read
      ],
    });

    const result = await recordPayment(supabase as never, {
      photographer_id: 'photo-1',
      invoice_id: 'invoice-1',
      amount_cents: 42_500,
      method: 'check',
    });

    expect(result.error).toBeNull();
    expect(result.warning).toBeUndefined();
    expect(chains.invoice.update).toHaveBeenCalledWith({
      status: 'paid',
      paid_at: '2026-07-07T10:00:00Z',
    });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment.received',
        invoice_id: 'invoice-1',
        stripe_payment_intent_id: null,
      }),
      expect.anything(),
    );
  });

  it('partial payment sets status partial with no paid_at', async () => {
    const { supabase, chains } = mockSupabase({
      invoice: [
        { data: { id: 'invoice-1', amount_cents: 42_500, status: 'sent' }, error: null },
        { error: null },
      ],
      payment: [
        { data: { ...PAYMENT_ROW, amount_cents: 10_000 }, error: null },
        { data: [{ amount_cents: 10_000, received_at: '2026-07-07T10:00:00Z' }], error: null },
      ],
    });

    const result = await recordPayment(supabase as never, {
      photographer_id: 'photo-1',
      invoice_id: 'invoice-1',
      amount_cents: 10_000,
      method: 'cash',
    });

    expect(result.error).toBeNull();
    expect(chains.invoice.update).toHaveBeenCalledWith({
      status: 'partial',
      paid_at: null,
    });
  });

  it('records an overpayment but flags it with a warning, never silently', async () => {
    const { supabase, chains } = mockSupabase({
      invoice: [
        { data: { id: 'invoice-1', amount_cents: 42_500, status: 'sent' }, error: null },
        { error: null },
      ],
      payment: [
        { data: { ...PAYMENT_ROW, amount_cents: 50_000 }, error: null },
        { data: [{ amount_cents: 50_000, received_at: '2026-07-07T10:00:00Z' }], error: null },
      ],
    });

    const result = await recordPayment(supabase as never, {
      photographer_id: 'photo-1',
      invoice_id: 'invoice-1',
      amount_cents: 50_000,
      method: 'check',
    });

    expect(result.error).toBeNull();
    expect(result.warning).toContain('overpayment_recorded');
    expect(chains.invoice.update).toHaveBeenCalledWith({
      status: 'paid',
      paid_at: '2026-07-07T10:00:00Z',
    });
  });

  it('rejects method stripe until Phase 2, with no db call', async () => {
    const { supabase } = mockSupabase({});

    const result = await recordPayment(supabase as never, {
      photographer_id: 'photo-1',
      invoice_id: 'invoice-1',
      amount_cents: 100,
      method: 'stripe',
    });

    expect(result.error?.code).toBe('validation_error');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rejects payment against a paid or cancelled invoice', async () => {
    for (const status of ['paid', 'cancelled', 'draft']) {
      const { supabase } = mockSupabase({
        invoice: [
          { data: { id: 'invoice-1', amount_cents: 42_500, status }, error: null },
        ],
      });
      const result = await recordPayment(supabase as never, {
        photographer_id: 'photo-1',
        invoice_id: 'invoice-1',
        amount_cents: 100,
        method: 'cash',
      });
      expect(result.error?.code).toBe('validation_error');
    }
  });

  it('surfaces a warning when the status recompute fails after the payment insert', async () => {
    const { supabase } = mockSupabase({
      invoice: [
        { data: { id: 'invoice-1', amount_cents: 42_500, status: 'sent' }, error: null },
      ],
      payment: [
        { data: PAYMENT_ROW, error: null },
        { data: null, error: { code: 'XX000', message: 'connection lost' } },
      ],
    });

    const result = await recordPayment(supabase as never, {
      photographer_id: 'photo-1',
      invoice_id: 'invoice-1',
      amount_cents: 42_500,
      method: 'check',
    });

    expect(result.data).not.toBeNull();
    expect(result.warning).toContain('status_recompute_failed');
  });
});

describe('deletePayment', () => {
  const PAYMENT_ROW = {
    id: 'payment-1',
    photographer_id: 'photo-1',
    invoice_id: 'invoice-1',
    amount_cents: 42_500,
    method: 'check',
    stripe_charge_id: null,
    received_at: '2026-07-07T10:00:00Z',
  };

  it('refuses stripe-sourced payments', async () => {
    const { supabase } = mockSupabase({
      payment: [
        { data: { ...PAYMENT_ROW, stripe_charge_id: 'ch_123' }, error: null },
      ],
    });

    const result = await deletePayment(supabase as never, 'payment-1');
    expect(result.error?.code).toBe('validation_error');
  });

  it('recomputes the invoice downward: paid → sent when the only payment is deleted', async () => {
    const { supabase, chains } = mockSupabase({
      payment: [
        { data: PAYMENT_ROW, error: null }, // fetch
        { error: null }, // delete
        { data: [], error: null }, // recompute read — none left
      ],
      invoice: [
        { data: { id: 'invoice-1', amount_cents: 42_500, status: 'paid' }, error: null },
        { error: null }, // status update
      ],
    });

    const result = await deletePayment(supabase as never, 'payment-1');

    expect(result.error).toBeNull();
    expect(chains.invoice.update).toHaveBeenCalledWith({
      status: 'sent',
      paid_at: null,
    });
  });

  it('preserves a cancelled invoice — deleting a stale payment must NOT resurrect it into "who owes"', async () => {
    const { supabase, chains } = mockSupabase({
      payment: [
        { data: PAYMENT_ROW, error: null }, // fetch
        { error: null }, // delete
        { data: [], error: null }, // recompute read — none left
      ],
      invoice: [
        {
          data: { id: 'invoice-1', amount_cents: 42_500, status: 'cancelled' },
          error: null,
        },
      ],
    });

    const result = await deletePayment(supabase as never, 'payment-1');

    expect(result.error).toBeNull();
    // The payment is gone, but the cancelled status is never rewritten.
    expect(chains.invoice.update).not.toHaveBeenCalled();
  });
});

describe('cancelInvoice', () => {
  it('cancels an open invoice and publishes invoice.cancelled', async () => {
    const { supabase } = mockSupabase({
      invoice: [
        { data: { id: 'invoice-1', status: 'sent' }, error: null },
        { data: { ...INVOICE_ROW, status: 'cancelled' }, error: null },
      ],
    });

    const result = await cancelInvoice(supabase as never, 'invoice-1');

    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('cancelled');
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoice.cancelled', invoice_id: 'invoice-1' }),
      expect.anything(),
    );
  });

  it('refuses to cancel a paid invoice', async () => {
    const { supabase } = mockSupabase({
      invoice: [{ data: { id: 'invoice-1', status: 'paid' }, error: null }],
    });

    const result = await cancelInvoice(supabase as never, 'invoice-1');
    expect(result.error?.code).toBe('validation_error');
  });
});

describe('derived overdue (LENS-D-023) — computed in the photographer timezone', () => {
  function invoiceQueryRow(overrides: Partial<typeof INVOICE_ROW>) {
    return {
      ...INVOICE_ROW,
      ...overrides,
      client: {
        display_name: 'Emma Hartwell',
        email: 'emma@example.com',
        parent_name: 'Susan Hartwell',
        parent_email: 'susan@example.com',
      },
      booking: { session_date: '2026-07-25T15:00:00Z', status: 'confirmed' },
      payment: [{ id: 'payment-1', amount_cents: 10_000, method: 'check', received_at: '2026-07-01T00:00:00Z' }],
      comm_log: [{ count: 2 }],
    };
  }

  it('localDateString respects the timezone across the midnight boundary', () => {
    // 03:00 UTC on Jul 7 = still Jul 6 in Chicago, already Jul 7 in UTC.
    const instant = new Date('2026-07-07T03:00:00Z');
    expect(localDateString('America/Chicago', instant)).toBe('2026-07-06');
    expect(localDateString('UTC', instant)).toBe('2026-07-07');
  });

  it('an invoice due "yesterday UTC" is NOT overdue while it is still that day locally', async () => {
    // Fixed instant: 2026-07-07T03:00 UTC. In America/Chicago it is Jul 6 —
    // an invoice due 2026-07-06 is due TODAY locally, not overdue.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T03:00:00Z'));

    const { supabase } = mockSupabase({
      photographer: [{ data: { timezone: 'America/Chicago' }, error: null }],
      invoice: [
        { data: [invoiceQueryRow({ due_date: '2026-07-06', status: 'sent' })], error: null },
      ],
    });

    const result = await listOpenInvoices(supabase as never);

    expect(result.error).toBeNull();
    expect(result.data?.timezone).toBe('America/Chicago');
    expect(result.data?.invoices[0].is_overdue).toBe(false);
    expect(result.data?.invoices[0].days_overdue).toBe(0);
  });

  it('the same invoice IS overdue once the local calendar passes the due date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00Z')); // Jul 9 everywhere

    const { supabase } = mockSupabase({
      photographer: [{ data: { timezone: 'America/Chicago' }, error: null }],
      invoice: [
        { data: [invoiceQueryRow({ due_date: '2026-07-06', status: 'sent' })], error: null },
      ],
    });

    const result = await listOpenInvoices(supabase as never);

    expect(result.data?.invoices[0].is_overdue).toBe(true);
    expect(result.data?.invoices[0].days_overdue).toBe(3);
  });

  it('derives balance from payments and carries the reminder count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T12:00:00Z'));

    const { supabase } = mockSupabase({
      photographer: [{ data: { timezone: 'America/Chicago' }, error: null }],
      invoice: [
        { data: [invoiceQueryRow({ due_date: '2026-08-01', status: 'partial' })], error: null },
      ],
    });

    const result = await listOpenInvoices(supabase as never);
    const row = result.data?.invoices[0];

    expect(row?.paid_cents).toBe(10_000);
    expect(row?.balance_cents).toBe(32_500);
    expect(row?.reminders_sent).toBe(2);
    expect(row?.is_overdue).toBe(false);
  });

  it('a paid invoice is never overdue regardless of due_date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00Z'));

    const { supabase } = mockSupabase({
      photographer: [{ data: { timezone: 'America/Chicago' }, error: null }],
      invoice: [
        { data: [invoiceQueryRow({ due_date: '2026-07-01', status: 'paid' })], error: null },
      ],
    });

    // listInvoices (all statuses) shape — use the non-open list via status filter
    const result = await listOpenInvoices(supabase as never);
    // Even if a paid row slips into the result set, derivation must not mark it overdue.
    expect(result.data?.invoices[0].is_overdue).toBe(false);
  });
});

describe('listUpcomingBookingsWithoutInvoice — cutover assist (Rule 3)', () => {
  const CLIENT = {
    id: 'client-1',
    display_name: 'Emma Hartwell',
    email: 'emma@example.com',
    parent_name: 'Susan Hartwell',
    parent_email: 'susan@example.com',
  };
  const PKG = { name: 'Senior', price_cents: 85_000, deposit_cents: 25_000 };

  function bookingRow(id: string, invoice: { id: string; deleted_at: string | null }[]) {
    return {
      id,
      session_date: '2026-07-20T17:00:00Z',
      status: 'confirmed',
      client: CLIENT,
      package: PKG,
      invoice,
    };
  }

  it('lists bookings with no live invoice — a soft-deleted invoice does not count as "on file"', async () => {
    const { supabase, chains } = mockSupabase({
      photographer: [{ data: { timezone: 'America/Chicago' }, error: null }],
      booking: [
        {
          data: [
            bookingRow('booking-none', []),
            bookingRow('booking-deleted-invoice', [
              { id: 'invoice-gone', deleted_at: '2026-07-01T00:00:00Z' },
            ]),
            bookingRow('booking-live-invoice', [{ id: 'invoice-live', deleted_at: null }]),
          ],
          error: null,
        },
      ],
    });

    const result = await listUpcomingBookingsWithoutInvoice(supabase as never);

    expect(result.error).toBeNull();
    expect(result.data?.map((b) => b.id)).toEqual([
      'booking-none',
      'booking-deleted-invoice',
    ]);
    // "Upcoming" starts at the photographer's local calendar day, not a UTC instant.
    expect(chains.booking.gte).toHaveBeenCalledWith(
      'session_date',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });
});
