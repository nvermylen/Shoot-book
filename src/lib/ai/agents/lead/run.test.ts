import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerFixture, clearFixtures } from '@/lib/ai/gateway/fixtures';
import { clearClient } from '@/lib/ai/gateway/gateway';
import { runLeadAgent, type InboundLeadPayload } from './run';

import { fixture as qualifiedFixture, FIXTURE_KEY as QUALIFIED_KEY } from './fixtures/senior-portrait-qualified.fixture';
import { fixture as needsInfoFixture, FIXTURE_KEY as NEEDS_INFO_KEY } from './fixtures/vague-inquiry-needs-info.fixture';
import { fixture as rejectedFixture, FIXTURE_KEY as REJECTED_KEY } from './fixtures/spam-rejected.fixture';
import { fixture as malformedFixture, FIXTURE_KEY as MALFORMED_KEY } from './fixtures/malformed-model-output.fixture';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindLeadBySourceMessage = vi.fn();
const mockUpdateLeadNotes = vi.fn();
const mockCreateLead = vi.fn();
const mockQualifyLead = vi.fn();

vi.mock('@/lib/erp/lead', () => ({
  findLeadBySourceMessage: (...args: unknown[]) => mockFindLeadBySourceMessage(...args),
  updateLeadNotes: (...args: unknown[]) => mockUpdateLeadNotes(...args),
  createLead: (...args: unknown[]) => mockCreateLead(...args),
  qualifyLead: (...args: unknown[]) => mockQualifyLead(...args),
}));

const mockPublish = vi.fn();

vi.mock('@/lib/events/bus', () => ({
  publish: (...args: unknown[]) => mockPublish(...args),
}));

// Mock the Anthropic SDK so gateway doesn't try to connect
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayload(overrides?: Partial<InboundLeadPayload>): InboundLeadPayload {
  return {
    source_message_id: 'msg-001',
    photographer_id: 'photo-001',
    display_name: 'Jane Smith',
    email: 'jane@example.com',
    source: 'web_form',
    intent_summary: 'I want senior portraits for my daughter next spring',
    received_at: '2026-06-22T10:00:00Z',
    ...overrides,
  };
}

const fakeLead = {
  id: 'lead-001',
  photographer_id: 'photo-001',
  display_name: 'Jane Smith',
  email: 'jane@example.com',
  phone: null,
  source: 'web_form' as const,
  intent_summary: 'I want senior portraits for my daughter next spring\n\n[lens:src_msg_id=msg-001]',
  qualification_status: 'new' as const,
  qualification_notes: null,
  converted_client_id: null,
  received_at: '2026-06-22T10:00:00Z',
  created_at: '2026-06-22T10:00:00Z',
  updated_at: '2026-06-22T10:00:00Z',
  deleted_at: null,
};

// Stub supabase client — only needed as passthrough to ERP/event mocks
function makeMockSupabase() {
  return {} as unknown as Parameters<typeof runLeadAgent>[0];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.LENS_GATEWAY_MODE = 'eval';

  clearFixtures();
  clearClient();

  registerFixture('lead', QUALIFIED_KEY, qualifiedFixture);
  registerFixture('lead', NEEDS_INFO_KEY, needsInfoFixture);
  registerFixture('lead', REJECTED_KEY, rejectedFixture);
  registerFixture('lead', MALFORMED_KEY, malformedFixture);

  mockFindLeadBySourceMessage.mockReset();
  mockFindLeadBySourceMessage.mockResolvedValue({ data: null, error: null });
  mockUpdateLeadNotes.mockReset();
  mockCreateLead.mockReset();
  mockQualifyLead.mockReset();
  mockPublish.mockReset();

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.LENS_GATEWAY_MODE;
  vi.restoreAllMocks();
});

// ===========================================================================
// Gateway-fixture evals (cases 1-4)
// These replay frozen GatewayResponses and assert agent-logic correctness
// ===========================================================================

describe('LeadAgent gateway-fixture evals', () => {
  it('case 1: qualified lead → qualifyLead(qualified) + lead.qualified event', async () => {
    mockCreateLead.mockResolvedValue({ data: fakeLead, error: null });
    mockQualifyLead.mockResolvedValue({ data: { ...fakeLead, qualification_status: 'qualified' }, error: null });

    const result = await runLeadAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: QUALIFIED_KEY }),
    );

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.qualification.decision).toBe('qualified');
    expect(result.data!.event_emitted).toBe('lead.qualified');

    expect(mockQualifyLead).toHaveBeenCalledWith(
      expect.anything(),
      'lead-001',
      expect.objectContaining({ qualification_status: 'qualified' }),
    );
  });

  it('case 2: needs-info → status stays new, notes written, lead.needs_info event', async () => {
    mockCreateLead.mockResolvedValue({ data: fakeLead, error: null });
    mockUpdateLeadNotes.mockResolvedValue({ data: { ...fakeLead, qualification_notes: 'notes' }, error: null });
    mockPublish.mockResolvedValue(undefined);

    const result = await runLeadAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: NEEDS_INFO_KEY }),
    );

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.qualification.decision).toBe('needs_info');
    expect(result.data!.event_emitted).toBe('lead.needs_info');

    // qualifyLead should NOT have been called — status stays 'new'
    expect(mockQualifyLead).not.toHaveBeenCalled();

    // Notes written via ERP module
    expect(mockUpdateLeadNotes).toHaveBeenCalledWith(
      expect.anything(),
      'lead-001',
      expect.stringContaining('Missing:'),
    );

    // lead.needs_info event was published
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lead.needs_info',
        lead_id: 'lead-001',
        missing_fields: ['event_type', 'date_signal'],
      }),
      expect.anything(),
    );
  });

  it('case 3: spam → qualifyLead(disqualified), no event emitted', async () => {
    mockCreateLead.mockResolvedValue({ data: fakeLead, error: null });
    mockQualifyLead.mockResolvedValue({ data: { ...fakeLead, qualification_status: 'disqualified' }, error: null });

    const result = await runLeadAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: REJECTED_KEY }),
    );

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.qualification.decision).toBe('rejected');
    expect(result.data!.event_emitted).toBeNull();

    expect(mockQualifyLead).toHaveBeenCalledWith(
      expect.anything(),
      'lead-001',
      expect.objectContaining({ qualification_status: 'disqualified' }),
    );
  });

  it('case 4: malformed model output → validation_error, no crash', async () => {
    mockCreateLead.mockResolvedValue({ data: fakeLead, error: null });

    const result = await runLeadAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: MALFORMED_KEY }),
    );

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('validation_error');
    expect(result.error!.detail).toContain('schema validation');
    expect(result.data).toBeNull();

    // No ERP write after the create
    expect(mockQualifyLead).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// ERP-behavior unit tests (cases 5-6)
// These mock the ERP module returns, not the gateway
// ===========================================================================

describe('LeadAgent ERP-behavior tests', () => {
  it('case 5: idempotent rerun → returns validation_error, no duplicate lead', async () => {
    const existingLead = { id: 'lead-existing', photographer_id: 'photo-001' };
    mockFindLeadBySourceMessage.mockResolvedValue({ data: existingLead, error: null });

    const result = await runLeadAgent(makeMockSupabase(), makePayload());

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('validation_error');
    expect(result.error!.detail).toContain('Duplicate lead');
    expect(result.error!.detail).toContain('msg-001');

    // createLead should never have been called
    expect(mockCreateLead).not.toHaveBeenCalled();
  });

  it('case 6: createLead warning (event publish failed) → no retry, warning surfaced', async () => {
    mockCreateLead.mockResolvedValue({
      data: fakeLead,
      error: null,
      warning: 'event_publish_failed: domain_event_log insert failed',
    });
    mockQualifyLead.mockResolvedValue({ data: { ...fakeLead, qualification_status: 'qualified' }, error: null });

    const result = await runLeadAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: QUALIFIED_KEY }),
    );

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();

    // Warning surfaced, not swallowed
    expect(result.data!.warnings).toContain('event_publish_failed: domain_event_log insert failed');

    // createLead was called exactly once — no retry
    expect(mockCreateLead).toHaveBeenCalledTimes(1);
  });
});
