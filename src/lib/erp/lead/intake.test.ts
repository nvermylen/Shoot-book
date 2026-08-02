import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runGmailLeadIntake,
  runGmailLeadIntakeAll,
  INTAKE_WINDOW_DAYS,
  INTAKE_MAX_MESSAGES,
  INTENT_SUMMARY_MAX_CHARS,
} from './intake';
import * as bus from '@/lib/events/bus';
import { appendCommLog } from '@/lib/erp/comm-log';
import {
  listInboxMessageIds,
  getMessage,
  type InboundMessage,
} from '@/lib/integrations/gmail/client';
import { GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE } from '@/lib/integrations/google/oauth';
import { runLeadAgent } from '@/lib/ai/agents/lead/run';
import type { Lead } from '@/types/erp';

vi.mock('@/lib/integrations/gmail/client', () => ({
  listInboxMessageIds: vi.fn(),
  getMessage: vi.fn(),
}));
vi.mock('@/lib/ai/agents/lead/run', () => ({ runLeadAgent: vi.fn() }));
vi.mock('@/lib/ai/gateway/gateway', () => ({ isGatewayConfigured: vi.fn(() => true) }));
vi.mock('@/lib/erp/comm-log', () => ({ appendCommLog: vi.fn() }));

const mockedList = vi.mocked(listInboxMessageIds);
const mockedGet = vi.mocked(getMessage);
const mockedAgent = vi.mocked(runLeadAgent);
const mockedLog = vi.mocked(appendCommLog);

// ---------------------------------------------------------------------------
// Supabase mock — sequential results per table (chase.test.ts pattern).
// ---------------------------------------------------------------------------

type QueryResult = { data?: unknown; error?: unknown };

function createTable(results: QueryResult[]) {
  let i = 0;
  const consume = () => {
    const r = results[Math.min(i, results.length - 1)] ?? { data: null, error: null };
    i += 1;
    return r;
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const chain: any = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'not', 'limit', 'order']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockImplementation(() => Promise.resolve(consume()));
  chain.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(consume()));
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PHOTOGRAPHER_ID = 'photo-1';

function inbound(overrides?: Partial<InboundMessage>): InboundMessage {
  return {
    messageId: 'm1',
    threadId: 'm1',
    isThreadStart: true,
    fromName: 'Susan Hartwell',
    fromEmail: 'susan@example.com',
    subject: 'Senior photos for Emma?',
    bodyText: 'Do you have August availability?',
    receivedAt: '2026-08-01T14:00:00.000Z',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

const CREATED_LEAD = {
  id: 'lead-1',
  photographer_id: PHOTOGRAPHER_ID,
  display_name: 'Susan Hartwell',
  email: 'susan@example.com',
} as unknown as Lead;

function agentSuccess(lead = CREATED_LEAD) {
  return {
    data: {
      lead,
      qualification: { decision: 'qualified' as const, reasons: [], missing_fields: null },
      event_emitted: 'lead.qualified',
      warnings: [],
    },
    error: null,
  } as never;
}

/** Tables for a photographer with no known clients/leads; lead update ok. */
function emptyBookTables(overrides?: Partial<Record<string, QueryResult[]>>) {
  return {
    client: [{ data: [], error: null }],
    lead: [
      { data: [], error: null }, // known-sender / dedup set build
      { data: null, error: null }, // thread_id update
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(bus, 'publish').mockResolvedValue(undefined);
  mockedList.mockReset();
  mockedGet.mockReset();
  mockedAgent.mockReset();
  mockedLog.mockReset();
  mockedLog.mockResolvedValue({ data: { id: 'log-1' } as never, error: null });
});

// ---------------------------------------------------------------------------
// runGmailLeadIntake — one photographer
// ---------------------------------------------------------------------------

describe('runGmailLeadIntake', () => {
  it('ingests a thread-starting inquiry from an unknown sender end-to-end (D2/D5 order)', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({ data: inbound(), error: null });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase, chains } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ seen: 1, candidates: 1, created: 1, duplicates: 0 });

    // Window query uses the spec'd rolling window.
    expect(mockedList).toHaveBeenCalledWith(supabase, PHOTOGRAPHER_ID, {
      newerThanDays: INTAKE_WINDOW_DAYS,
      maxResults: INTAKE_MAX_MESSAGES,
    });

    // D2: payload built from headers, deterministically.
    expect(mockedAgent).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        source_message_id: 'm1',
        photographer_id: PHOTOGRAPHER_ID,
        display_name: 'Susan Hartwell',
        email: 'susan@example.com',
        source: 'gmail_inbound',
        intent_summary: 'Senior photos for Emma?\n\nDo you have August availability?',
        received_at: '2026-08-01T14:00:00.000Z',
      }),
    );

    // thread_id linked (migration_007).
    expect(chains.lead.update).toHaveBeenCalledWith({ thread_id: 'm1' });

    // D5: ledger written after the lead exists, content in the ledger only.
    expect(mockedLog).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        photographer_id: PHOTOGRAPHER_ID,
        lead_id: 'lead-1',
        direction: 'inbound',
        channel: 'email',
        agent_id: 'lead',
        external_message_id: 'm1',
        sent_at: '2026-08-01T14:00:00.000Z',
      }),
    );

    // First emitter of gmail.message_received.
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gmail.message_received',
        photographer_id: PHOTOGRAPHER_ID,
        thread_id: 'm1',
        message_id: 'm1',
      }),
      supabase,
    );
  });

  it('skips mail this account itself sent (SENT label) — the photographer is never their own lead', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({
      data: inbound({ labelIds: ['SENT', 'INBOX'] }),
      error: null,
    });
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(mockedAgent).not.toHaveBeenCalled();
    expect(res.data?.skipped.self_sender).toBe(1);
    expect(res.data?.candidates).toBe(0);
  });

  it('a thrown lead agent stays a per-message error — the batch continues', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 'm1', threadId: 'm1' },
        { id: 'm2', threadId: 'm2' },
      ],
      error: null,
    });
    mockedGet
      .mockResolvedValueOnce({ data: inbound(), error: null })
      .mockResolvedValueOnce({
        data: inbound({ messageId: 'm2', threadId: 'm2', fromEmail: 'other@example.com' }),
        error: null,
      });
    mockedAgent
      .mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY is not set'))
      .mockResolvedValueOnce(agentSuccess());
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.error).toBeNull();
    expect(res.data?.errors).toHaveLength(1);
    expect(res.data?.errors[0]).toContain('lead agent threw');
    expect(res.data?.created).toBe(1); // m2 still processed after m1 threw
  });

  it('skips replies — only thread-starters are lead candidates (D3)', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm9', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({
      data: inbound({ messageId: 'm9', threadId: 'm1', isThreadStart: false }),
      error: null,
    });
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(mockedAgent).not.toHaveBeenCalled();
    expect(res.data?.skipped.reply_not_thread_start).toBe(1);
    expect(res.data?.candidates).toBe(0);
  });

  it('skips a known client emailing again — case-insensitively (D3)', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({ data: inbound(), error: null });
    const { supabase } = mockSupabase(
      emptyBookTables({ client: [{ data: [{ email: 'Susan@Example.com' }], error: null }] }),
    );

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(mockedAgent).not.toHaveBeenCalled();
    expect(res.data?.skipped.known_sender).toBe(1);
  });

  it('skips a sender who already has a live lead; a deleted lead does NOT block re-inquiry', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 'm1', threadId: 'm1' },
        { id: 'm2', threadId: 'm2' },
      ],
      error: null,
    });
    mockedGet
      .mockResolvedValueOnce({ data: inbound(), error: null })
      .mockResolvedValueOnce({
        data: inbound({ messageId: 'm2', threadId: 'm2', fromEmail: 'returning@example.com' }),
        error: null,
      });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase } = mockSupabase(
      emptyBookTables({
        lead: [
          {
            data: [
              { email: 'susan@example.com', source_message_id: 'old-1', deleted_at: null },
              { email: 'returning@example.com', source_message_id: 'old-2', deleted_at: '2026-07-01T00:00:00Z' },
            ],
            error: null,
          },
          { data: null, error: null },
        ],
      }),
    );

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    // susan has a live lead → skipped; the deleted lead's sender gets a new one.
    expect(res.data?.skipped.known_sender).toBe(1);
    expect(res.data?.created).toBe(1);
    expect(mockedAgent).toHaveBeenCalledTimes(1);
    expect(mockedAgent.mock.calls[0][1].email).toBe('returning@example.com');
  });

  it('second run over the same window is a no-op: known source_message_id → duplicate, no fetch (D1)', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    const { supabase } = mockSupabase(
      emptyBookTables({
        lead: [
          {
            data: [{ email: 'susan@example.com', source_message_id: 'm1', deleted_at: null }],
            error: null,
          },
        ],
      }),
    );

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.duplicates).toBe(1);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedAgent).not.toHaveBeenCalled();
    expect(mockedLog).not.toHaveBeenCalled();
  });

  it('a deleted lead still blocks its source_message_id (unique index reality)', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    const { supabase } = mockSupabase(
      emptyBookTables({
        lead: [
          {
            data: [{ email: 'x@example.com', source_message_id: 'm1', deleted_at: '2026-07-01T00:00:00Z' }],
            error: null,
          },
        ],
      }),
    );

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.duplicates).toBe(1);
    expect(mockedAgent).not.toHaveBeenCalled();
  });

  it('truncates intent_summary to the cap (D2)', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({
      data: inbound({ bodyText: 'x'.repeat(INTENT_SUMMARY_MAX_CHARS * 2) }),
      error: null,
    });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase } = mockSupabase(emptyBookTables());

    await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    const payload = mockedAgent.mock.calls[0][1];
    expect(payload.intent_summary?.length).toBe(INTENT_SUMMARY_MAX_CHARS);
  });

  it('falls back to the address as display_name when From has no name', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({ data: inbound({ fromName: null }), error: null });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase } = mockSupabase(emptyBookTables());

    await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(mockedAgent.mock.calls[0][1].display_name).toBe('susan@example.com');
  });

  it('one malformed message never stalls the batch (per-message failure isolation)', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 'bad-1', threadId: 'bad-1' },
        { id: 'boom-1', threadId: 'boom-1' },
        { id: 'm1', threadId: 'm1' },
      ],
      error: null,
    });
    mockedGet
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'validation_error', detail: 'message has no parseable From header' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'integration_error', detail: 'gmail api http_500' },
      })
      .mockResolvedValueOnce({ data: inbound(), error: null });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.skipped.unattributable).toBe(1);
    expect(res.data?.errors).toHaveLength(1);
    expect(res.data?.created).toBe(1);
  });

  it('a lead-agent failure records the error and continues; no ledger row for it', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 'm1', threadId: 'm1' },
        { id: 'm2', threadId: 'm2' },
      ],
      error: null,
    });
    mockedGet
      .mockResolvedValueOnce({ data: inbound(), error: null })
      .mockResolvedValueOnce({
        data: inbound({ messageId: 'm2', threadId: 'm2', fromEmail: 'two@example.com' }),
        error: null,
      });
    mockedAgent
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'validation_error', detail: 'Model output is not valid JSON: …' },
      } as never)
      .mockResolvedValueOnce(agentSuccess());
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.errors.some((e) => e.includes('lead agent failed'))).toBe(true);
    expect(res.data?.created).toBe(1);
    expect(mockedLog).toHaveBeenCalledTimes(1); // only for the created lead
  });

  it("maps the agent's own dedup rejection to a duplicate, not an error (race window)", async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({ data: inbound(), error: null });
    mockedAgent.mockResolvedValue({
      data: null,
      error: { code: 'validation_error', detail: 'Duplicate lead: source_message_id m1 already processed as lead lead-9' },
    } as never);
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.duplicates).toBe(1);
    expect(res.data?.errors).toHaveLength(0);
  });

  it('revoked grant on list → credentials_broken surfaced, never a silent stop', async () => {
    mockedList.mockResolvedValue({
      data: null,
      error: { code: 'integration_auth_error', detail: 'invalid_grant — reconnect Google' },
    });
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.error).toBeNull();
    expect(res.data?.credentials_broken).toBe(true);
  });

  it('revoked grant mid-batch stops fetching but reports what was done', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 'm1', threadId: 'm1' },
        { id: 'm2', threadId: 'm2' },
      ],
      error: null,
    });
    mockedGet
      .mockResolvedValueOnce({ data: inbound(), error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'integration_auth_error', detail: 'gmail api http_401 — reconnect Google' },
      });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.created).toBe(1);
    expect(res.data?.credentials_broken).toBe(true);
  });

  it('a created lead with a failed comm_log write is reported loudly, not rolled back', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({ data: inbound(), error: null });
    mockedAgent.mockResolvedValue(agentSuccess());
    mockedLog.mockResolvedValue({
      data: null,
      error: { code: 'db_error', detail: 'connection lost' },
    });
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.created).toBe(1);
    expect(res.data?.errors.some((e) => e.includes('created but comm_log write failed'))).toBe(true);
  });

  it('two inquiries from the same new sender in one window create one lead', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 'm1', threadId: 'm1' },
        { id: 'm2', threadId: 'm2' },
      ],
      error: null,
    });
    mockedGet
      .mockResolvedValueOnce({ data: inbound(), error: null })
      .mockResolvedValueOnce({
        data: inbound({ messageId: 'm2', threadId: 'm2' }),
        error: null,
      });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase } = mockSupabase(emptyBookTables());

    const res = await runGmailLeadIntake(supabase as never, PHOTOGRAPHER_ID);

    expect(res.data?.created).toBe(1);
    expect(res.data?.skipped.known_sender).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// runGmailLeadIntakeAll — grant gating (D4)
// ---------------------------------------------------------------------------

describe('runGmailLeadIntakeAll', () => {
  it('fails closed with zero work when the gateway is unconfigured — no unjudged leads, mail retried later', async () => {
    const { isGatewayConfigured } = await import('@/lib/ai/gateway/gateway');
    vi.mocked(isGatewayConfigured).mockReturnValueOnce(false);
    const { supabase } = mockSupabase({});

    const res = await runGmailLeadIntakeAll(supabase as never);

    expect(res.error).toBeNull();
    expect(res.data?.agent_unavailable).toBe(true);
    expect(res.data?.photographers).toBe(0);
    expect(mockedList).not.toHaveBeenCalled();
    expect(mockedAgent).not.toHaveBeenCalled();
  });

  it('runs intake only for photographers whose scope[] includes gmail.readonly', async () => {
    mockedList.mockResolvedValue({ data: [], error: null });
    const { supabase } = mockSupabase({
      integration_credentials: [
        {
          data: [
            { photographer_id: 'photo-1', scope: [GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE] },
            { photographer_id: 'photo-2', scope: [GMAIL_SEND_SCOPE] },
            { photographer_id: 'photo-3', scope: null },
          ],
          error: null,
        },
      ],
    });

    const res = await runGmailLeadIntakeAll(supabase as never);

    expect(res.error).toBeNull();
    // Send-only and scope-less rows: chase stays alive, intake off — surfaced.
    expect(res.data).toMatchObject({ photographers: 1, readonly_missing: 2 });
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(mockedList.mock.calls[0][1]).toBe('photo-1');
  });

  it('aggregates per-photographer counts and surfaces broken credentials', async () => {
    mockedList
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'integration_auth_error', detail: 'invalid_grant' },
      });
    const { supabase } = mockSupabase({
      integration_credentials: [
        {
          data: [
            { photographer_id: 'photo-1', scope: [GMAIL_READONLY_SCOPE] },
            { photographer_id: 'photo-2', scope: [GMAIL_READONLY_SCOPE] },
          ],
          error: null,
        },
      ],
    });

    const res = await runGmailLeadIntakeAll(supabase as never);

    expect(res.data).toMatchObject({ photographers: 2, credentials_broken: 1 });
  });

  it('one failing photographer never blocks the rest', async () => {
    mockedList
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'integration_error', detail: 'gmail api http_503' },
      })
      .mockResolvedValueOnce({ data: [{ id: 'm1', threadId: 'm1' }], error: null });
    mockedGet.mockResolvedValue({ data: inbound(), error: null });
    mockedAgent.mockResolvedValue(agentSuccess());
    const { supabase } = mockSupabase({
      integration_credentials: [
        {
          data: [
            { photographer_id: 'photo-1', scope: [GMAIL_READONLY_SCOPE] },
            { photographer_id: 'photo-2', scope: [GMAIL_READONLY_SCOPE] },
          ],
          error: null,
        },
      ],
      client: [{ data: [], error: null }],
      lead: [
        { data: [], error: null },
        { data: null, error: null },
      ],
    });

    const res = await runGmailLeadIntakeAll(supabase as never);

    expect(res.data?.errors.some((e) => e.includes('photo-1'))).toBe(true);
    expect(res.data?.created).toBe(1);
  });
});
