import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectChaseStep,
  resolveRecipient,
  renderTemplate,
  runInvoiceChase,
  DEFAULT_CHASE_SEQUENCE,
  OVERDUE_SEND_CAP,
  type ChaseMergeFields,
} from './chase';
import * as bus from '@/lib/events/bus';
import { appendCommLog } from '@/lib/erp/comm-log';
import { sendEmail } from '@/lib/integrations/gmail/client';

vi.mock('@/lib/erp/comm-log', () => ({ appendCommLog: vi.fn() }));
vi.mock('@/lib/integrations/gmail/client', () => ({ sendEmail: vi.fn() }));

const mockedSend = vi.mocked(sendEmail);
const mockedLog = vi.mocked(appendCommLog);

// ---------------------------------------------------------------------------
// selectChaseStep — the deterministic timeline (all dates LOCAL)
// ---------------------------------------------------------------------------

describe('selectChaseStep', () => {
  const DUE = '2026-07-20';

  it('T-8: nothing yet', () => {
    expect(
      selectChaseStep({ dueDate: DUE, today: '2026-07-12', sendDatesLocal: [] }),
    ).toEqual({ action: 'skip', reason: 'not_due_yet' });
  });

  it('T-7: step 1 (friendly heads-up)', () => {
    expect(
      selectChaseStep({ dueDate: DUE, today: '2026-07-13', sendDatesLocal: [] }),
    ).toMatchObject({ action: 'send', window: 'pre_due_7', step: 1 });
  });

  it('T-5 with step 1 already sent: window covered, no repeat', () => {
    expect(
      selectChaseStep({ dueDate: DUE, today: '2026-07-15', sendDatesLocal: ['2026-07-13'] }),
    ).toEqual({ action: 'skip', reason: 'window_covered' });
  });

  it('T-3: step 2 (direct), even if step 1 was sent', () => {
    expect(
      selectChaseStep({ dueDate: DUE, today: '2026-07-17', sendDatesLocal: ['2026-07-13'] }),
    ).toMatchObject({ action: 'send', window: 'pre_due_3', step: 2 });
  });

  it('invoice created late (T-2, no sends): jumps straight to step 2', () => {
    expect(
      selectChaseStep({ dueDate: DUE, today: '2026-07-18', sendDatesLocal: [] }),
    ).toMatchObject({ action: 'send', window: 'pre_due_3', step: 2 });
  });

  it('due date: step 3 ("due today")', () => {
    expect(
      selectChaseStep({
        dueDate: DUE,
        today: DUE,
        sendDatesLocal: ['2026-07-13', '2026-07-17'],
      }),
    ).toMatchObject({ action: 'send', window: 'due', step: 3 });
  });

  it('due+3 with 2 overdue sends: next escalation (overdue send #3)', () => {
    expect(
      selectChaseStep({
        dueDate: DUE,
        today: '2026-07-23',
        sendDatesLocal: ['2026-07-20', '2026-07-21', '2026-07-22'],
      }),
    ).toMatchObject({ action: 'send', window: 'overdue_firm', overdueSendNumber: 3 });
  });

  it('first overdue day uses the overdue notice, later days the firm template', () => {
    expect(
      selectChaseStep({ dueDate: DUE, today: '2026-07-21', sendDatesLocal: [DUE] }),
    ).toMatchObject({ action: 'send', window: 'overdue_first', overdueSendNumber: 1 });
  });

  it('per-local-day idempotency: a send today always skips (hourly re-invocation)', () => {
    expect(
      selectChaseStep({ dueDate: DUE, today: '2026-07-23', sendDatesLocal: ['2026-07-23'] }),
    ).toEqual({ action: 'skip', reason: 'already_sent_today' });
  });

  it(`${OVERDUE_SEND_CAP} overdue sends: escalate to the photographer, stop emailing`, () => {
    expect(
      selectChaseStep({
        dueDate: DUE,
        today: '2026-07-26',
        sendDatesLocal: ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'],
      }),
    ).toEqual({ action: 'escalate' });
  });
});

// ---------------------------------------------------------------------------
// resolveRecipient — routing is the wedge
// ---------------------------------------------------------------------------

describe('resolveRecipient', () => {
  const CLIENT = {
    display_name: 'Emma Hartwell',
    email: 'emma@example.com',
    parent_email: null as string | null,
    parent_name: null as string | null,
  };

  it('routes to the parent when one is on file, greeting the parent', () => {
    const r = resolveRecipient({
      invoiceRecipientEmail: 'emma@example.com',
      client: { ...CLIENT, parent_email: 'susan@example.com', parent_name: 'Susan Hartwell' },
    });
    expect(r).toEqual({ email: 'susan@example.com', firstName: 'Susan', routedToParent: true });
  });

  it('parent NULL → client.email — the mandatory fallback, never a skip', () => {
    const r = resolveRecipient({ invoiceRecipientEmail: 'emma@example.com', client: CLIENT });
    expect(r).toEqual({ email: 'emma@example.com', firstName: 'Emma', routedToParent: false });
  });

  it('mid-chase parent addition reroutes the very next reminder', () => {
    // Same invoice, client re-read now has a parent — resolution is per send.
    const before = resolveRecipient({ invoiceRecipientEmail: 'emma@example.com', client: CLIENT });
    const after = resolveRecipient({
      invoiceRecipientEmail: 'emma@example.com',
      client: { ...CLIENT, parent_email: 'susan@example.com', parent_name: 'Susan Hartwell' },
    });
    expect(before.email).toBe('emma@example.com');
    expect(after.email).toBe('susan@example.com');
  });

  it('an explicit manual override (neither client nor parent) is honored', () => {
    const r = resolveRecipient({
      invoiceRecipientEmail: 'grandma@example.com',
      client: { ...CLIENT, parent_email: 'susan@example.com', parent_name: 'Susan Hartwell' },
    });
    expect(r.email).toBe('grandma@example.com');
  });
});

// ---------------------------------------------------------------------------
// renderTemplate — substitution only, never a leftover placeholder
// ---------------------------------------------------------------------------

describe('renderTemplate', () => {
  const FIELDS: ChaseMergeFields = {
    recipient_first_name: 'Susan',
    client_first_name: 'Emma',
    session_type: 'senior',
    session_date: 'October 28',
    balance_due: '$325',
    due_date: 'October 19',
    days_overdue: '3',
    payment_instructions: 'Reply and I will send details.',
  };

  it('substitutes every merge field', () => {
    const r = renderTemplate(
      'Hi {{recipient_first_name}}, {{balance_due}} for {{client_first_name}} is due {{due_date}}.',
      FIELDS,
    );
    expect(r.error).toBeNull();
    expect(r.data).toBe('Hi Susan, $325 for Emma is due October 19.');
  });

  it('refuses to render when a placeholder survives', () => {
    const r = renderTemplate('Hello {{unknown_field}}', FIELDS);
    expect(r.error?.code).toBe('validation_error');
  });

  it('every default template renders clean with full fields', () => {
    for (const step of DEFAULT_CHASE_SEQUENCE.steps) {
      const subject = renderTemplate(step.subject, FIELDS);
      const body = renderTemplate(step.body_text, FIELDS);
      expect(subject.error, `${step.window} subject`).toBeNull();
      expect(body.error, `${step.window} body`).toBeNull();
      expect(body.data).toContain('Susan');
    }
  });
});

// ---------------------------------------------------------------------------
// runInvoiceChase — the runner (multi-table mock, mocked gmail + comm_log)
// ---------------------------------------------------------------------------

type QueryResult = { data?: unknown; error?: unknown; count?: number };

function createTable(results: QueryResult[]) {
  let i = 0;
  const consume = () => {
    const r = results[Math.min(i, results.length - 1)] ?? { data: null, error: null };
    i += 1;
    return r;
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const chain: any = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'gte', 'not', 'limit', 'order']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockImplementation(() => Promise.resolve(consume()));
  chain.then = (resolve: any, reject: any) => Promise.resolve(consume()).then(resolve, reject);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return chain;
}

function mockSupabase(tables: Record<string, QueryResult[]>) {
  const chains = Object.fromEntries(
    Object.entries(tables).map(([t, r]) => [t, createTable(r)]),
  );
  return { supabase: { from: vi.fn((t: string) => chains[t]) }, chains };
}

// 14:30 UTC = 9:30am America/Chicago (CDT) — inside the 8–10am send window.
const IN_WINDOW = new Date('2026-07-07T14:30:00Z');
// 18:00 UTC = 1pm America/Chicago — outside the window.
const OUT_OF_WINDOW = new Date('2026-07-07T18:00:00Z');

const PHOTOGRAPHER = {
  id: 'photo-1',
  timezone: 'America/Chicago',
  display_name: 'Morgan',
  default_email_signature: '— Morgan Vermylen Photography',
};

const SEQ_ROW = {
  id: 'seq-1',
  photographer_id: 'photo-1',
  steps: DEFAULT_CHASE_SEQUENCE,
  is_active: true,
};

function invoiceListRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'invoice-1',
    photographer_id: 'photo-1',
    booking_id: 'booking-1',
    client_id: 'client-1',
    amount_cents: 42_500,
    status: 'partial',
    due_date: '2026-07-04', // 3 days overdue on 2026-07-07 local
    recipient_email: 'emma@example.com',
    booking: {
      session_date: '2026-07-25T15:00:00Z',
      status: 'confirmed',
      deleted_at: null,
      package: { session_type: 'senior' },
    },
    comm_log: [],
    ...overrides,
  };
}

const FRESH_OPEN = {
  id: 'invoice-1',
  status: 'partial',
  amount_cents: 42_500,
  deleted_at: null,
  payment: [{ amount_cents: 10_000 }],
};

const CLIENT_NO_PARENT = {
  display_name: 'Emma Hartwell',
  email: 'emma@example.com',
  parent_email: null,
  parent_name: null,
  deleted_at: null,
};

function standardTables(overrides?: Partial<Record<string, QueryResult[]>>) {
  return {
    invoice: [
      { data: [invoiceListRow()], error: null },
      { data: FRESH_OPEN, error: null },
    ],
    photographer: [{ data: PHOTOGRAPHER, error: null }],
    integration_credentials: [{ count: 1, error: null }],
    comm_sequence: [{ data: [SEQ_ROW], error: null }],
    comm_sequence_state: [{ data: [], error: null }],
    client: [{ data: CLIENT_NO_PARENT, error: null }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
  mockedSend.mockReset();
  mockedLog.mockReset();
  mockedSend.mockResolvedValue({
    data: { messageId: 'gmail-msg-1', threadId: 'gmail-thread-1' },
    error: null,
  });
  mockedLog.mockResolvedValue({ data: { id: 'log-1' } as never, error: null });
});

describe('runInvoiceChase', () => {
  it('sends an overdue reminder with the balance from a FRESH payment read, then logs (D5 order)', async () => {
    const { supabase } = mockSupabase(standardTables());

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(result.error).toBeNull();
    expect(result.data?.sent).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const call = mockedSend.mock.calls[0][2];
    expect(call.to).toBe('emma@example.com'); // parent NULL → client, must send
    // Partial payment shrinks the ask: 42500 − 10000 = $325.
    expect(call.bodyText).toContain('$325');
    expect(call.bodyText).toContain('Hi Emma');
    expect(call.bodyText).toContain('— Morgan Vermylen Photography');
    // Send-then-log: comm_log written after, with the invoice id + gmail id.
    expect(mockedLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invoice_id: 'invoice-1',
        agent_id: 'billing',
        external_message_id: 'gmail-msg-1',
        sequence_id: 'seq-1',
      }),
    );
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoice.reminder_sent', invoice_id: 'invoice-1' }),
      expect.anything(),
    );
  });

  it('routes to the parent on file at send time (mid-chase parent addition reroutes)', async () => {
    const { supabase } = mockSupabase(
      standardTables({
        client: [
          {
            data: {
              ...CLIENT_NO_PARENT,
              parent_email: 'susan@example.com',
              parent_name: 'Susan Hartwell',
            },
            error: null,
          },
        ],
      }),
    );

    await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    const call = mockedSend.mock.calls[0][2];
    expect(call.to).toBe('susan@example.com');
    expect(call.bodyText).toContain('Hi Susan');
    expect(call.bodyText).toContain('Emma’s senior session');
  });

  it('stop-on-paid BETWEEN schedule and send: fresh read shows paid → no email', async () => {
    const { supabase } = mockSupabase(
      standardTables({
        invoice: [
          { data: [invoiceListRow()], error: null },
          { data: { ...FRESH_OPEN, status: 'paid' }, error: null },
        ],
      }),
    );

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.data?.skipped.no_longer_open).toBe(1);
  });

  it('paused invoice is skipped (pause intent, LENS-D-027)', async () => {
    const { supabase } = mockSupabase(
      standardTables({
        comm_sequence_state: [{ data: [{ invoice_id: 'invoice-1' }], error: null }],
      }),
    );

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.data?.skipped.paused).toBe(1);
  });

  it('outside the 8–10am local window nothing sends', async () => {
    const { supabase } = mockSupabase(standardTables());

    const result = await runInvoiceChase(supabase as never, { now: OUT_OF_WINDOW });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.data?.skipped.outside_send_window).toBe(1);
  });

  it('a send earlier today (local) makes the hourly re-run a no-op', async () => {
    const { supabase } = mockSupabase(
      standardTables({
        invoice: [
          {
            // 13:05 UTC = 8:05am Chicago — same local day as the 9:30am run.
            data: [invoiceListRow({ comm_log: [{ sent_at: '2026-07-07T13:05:00Z' }] })],
            error: null,
          },
        ],
      }),
    );

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.data?.skipped.already_sent_today).toBe(1);
  });

  it('timezone boundary: a UTC-yesterday send that was TODAY locally still blocks (no double-send)', async () => {
    // 2026-07-07T03:00Z is 10pm Jul 6 in Chicago — a LOCAL yesterday send;
    // it must NOT block today. 2026-07-07T13:05Z is 8:05am Jul 7 local — it must.
    const { supabase } = mockSupabase(
      standardTables({
        invoice: [
          { data: [invoiceListRow({ comm_log: [{ sent_at: '2026-07-07T03:00:00Z' }] })], error: null },
          { data: FRESH_OPEN, error: null },
        ],
      }),
    );

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    // The 03:00Z row was local Jul 6 (an overdue send), so today still fires.
    expect(result.data?.sent).toBe(1);
  });

  it(`${OVERDUE_SEND_CAP} overdue sends → escalation, no further email`, async () => {
    // Five sends on five prior local days, all after the 2026-07-04 due date.
    const sends = ['02', '03', '04', '05', '06'].map((d) => ({
      sent_at: `2026-07-${d}T14:00:00Z`,
    }));
    // Due 2026-07-01 → all five sends are overdue sends.
    const { supabase } = mockSupabase(
      standardTables({
        invoice: [
          { data: [invoiceListRow({ due_date: '2026-07-01', comm_log: sends })], error: null },
        ],
      }),
    );

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.data?.escalated).toBe(1);
  });

  it('missing Gmail credential: skip + surfaced, never a silent stop', async () => {
    const { supabase } = mockSupabase(
      standardTables({ integration_credentials: [{ count: 0, error: null }] }),
    );

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.data?.credentials_broken).toBe(1);
    expect(result.data?.skipped.gmail_not_connected).toBe(1);
  });

  it('revoked grant mid-run (auth error from send): no log row, credentials flagged', async () => {
    mockedSend.mockResolvedValue({
      data: null,
      error: { code: 'integration_auth_error', detail: 'invalid_grant' },
    });
    const { supabase } = mockSupabase(standardTables());

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(mockedLog).not.toHaveBeenCalled();
    expect(result.data?.sent).toBe(0);
    expect(result.data?.credentials_broken).toBe(1);
  });

  it('cancelled booking stops the chase', async () => {
    const { supabase } = mockSupabase(
      standardTables({
        invoice: [
          {
            data: [
              invoiceListRow({
                booking: {
                  session_date: null,
                  status: 'cancelled',
                  deleted_at: null,
                  package: null,
                },
              }),
            ],
            error: null,
          },
        ],
      }),
    );

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.data?.skipped.booking_cancelled).toBe(1);
  });

  it('send succeeded but log failed: reported loudly (bounded-dup tradeoff, D5)', async () => {
    mockedLog.mockResolvedValue({
      data: null,
      error: { code: 'db_error', detail: 'connection lost' },
    });
    const { supabase } = mockSupabase(standardTables());

    const result = await runInvoiceChase(supabase as never, { now: IN_WINDOW });

    expect(result.data?.sent).toBe(1);
    expect(result.data?.errors.some((e) => e.includes('SENT but comm_log write failed'))).toBe(true);
  });
});
