import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerFixture, clearFixtures } from '@/lib/ai/gateway/fixtures';
import { clearClient } from '@/lib/ai/gateway/gateway';
import { runLeadAgent, type InboundLeadPayload } from './run';

import { fixture as qualifiedFixture, FIXTURE_KEY as QUALIFIED_KEY } from './fixtures/senior-portrait-qualified.fixture';

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

vi.mock('@/lib/events/bus', () => ({
  publish: vi.fn(),
}));

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
  source_message_id: 'msg-001',
  intent_summary: 'I want senior portraits for my daughter next spring',
  qualification_status: 'new' as const,
  qualification_notes: null,
  converted_client_id: null,
  received_at: '2026-06-22T10:00:00Z',
  created_at: '2026-06-22T10:00:00Z',
  updated_at: '2026-06-22T10:00:00Z',
  deleted_at: null,
};

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

  mockFindLeadBySourceMessage.mockReset();
  mockFindLeadBySourceMessage.mockResolvedValue({ data: null, error: null });
  mockUpdateLeadNotes.mockReset();
  mockCreateLead.mockReset();
  mockQualifyLead.mockReset();

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.LENS_GATEWAY_MODE;
  vi.restoreAllMocks();
});

// ===========================================================================
// ERP-behavior unit tests (cases 5-6)
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

    expect(result.data!.warnings).toContain('event_publish_failed: domain_event_log insert failed');

    expect(mockCreateLead).toHaveBeenCalledTimes(1);
  });
});
