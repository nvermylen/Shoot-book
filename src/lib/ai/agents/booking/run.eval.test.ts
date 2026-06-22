import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerFixture, clearFixtures } from '@/lib/ai/gateway/fixtures';
import { clearClient } from '@/lib/ai/gateway/gateway';
import { runBookingAgent, type BookingAgentPayload, type BookingAgentResult, type BookingAgentNoMatch } from './run';

import { fixture as cleanMatchFixture, FIXTURE_KEY as CLEAN_MATCH_KEY } from './fixtures/clean-match-senior.fixture';
import { fixture as judgmentFixture, FIXTURE_KEY as JUDGMENT_KEY } from './fixtures/judgment-match-three-tiers.fixture';
import { fixture as noMatchFixture, FIXTURE_KEY as NO_MATCH_KEY } from './fixtures/no-match-newborn.fixture';
import { fixture as inactiveFixture, FIXTURE_KEY as INACTIVE_KEY } from './fixtures/inactive-package-selected.fixture';
import { fixture as reentryFixture, FIXTURE_KEY as REENTRY_KEY } from './fixtures/already-converted-reentry.fixture';

import type { Lead, Client, Booking, Package } from '@/types/erp';
import type { LeadQualificationOutput } from '../lead/schema';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetLead = vi.fn();
const mockConvertLeadToClient = vi.fn();
const mockGetClient = vi.fn();
const mockListPackages = vi.fn();
const mockCreateBooking = vi.fn();

vi.mock('@/lib/erp/lead', () => ({
  getLead: (...args: unknown[]) => mockGetLead(...args),
  convertLeadToClient: (...args: unknown[]) => mockConvertLeadToClient(...args),
}));

vi.mock('@/lib/erp/client', () => ({
  getClient: (...args: unknown[]) => mockGetClient(...args),
}));

vi.mock('@/lib/erp/package', () => ({
  listPackages: (...args: unknown[]) => mockListPackages(...args),
}));

vi.mock('@/lib/erp/booking', () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

vi.mock('@/lib/events/bus', () => ({
  publish: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseQualification: LeadQualificationOutput = {
  decision: 'qualified',
  reasons: ['Clear senior portrait request'],
  extracted: {
    event_type: 'senior portraits',
    date_signal: 'Spring 2027',
    budget_signal: null,
    location_preference: 'outdoor downtown',
    party_size: 1,
  },
  confidence: 0.92,
};

function makePayload(overrides?: Partial<BookingAgentPayload>): BookingAgentPayload {
  return {
    lead_id: 'lead-001',
    photographer_id: 'photo-001',
    qualification: baseQualification,
    ...overrides,
  };
}

const qualifiedLead: Lead = {
  id: 'lead-001',
  photographer_id: 'photo-001',
  display_name: 'Jane Smith',
  email: 'jane@example.com',
  phone: null,
  source: 'web_form',
  intent_summary: 'Senior portraits for my daughter\n\n[lens:src_msg_id=msg-001]',
  qualification_status: 'qualified',
  qualification_notes: 'Clear senior portrait request',
  converted_client_id: null,
  received_at: '2026-06-22T10:00:00Z',
  created_at: '2026-06-22T10:00:00Z',
  updated_at: '2026-06-22T10:00:00Z',
  deleted_at: null,
};

const convertedLead: Lead = {
  ...qualifiedLead,
  qualification_status: 'converted',
  converted_client_id: 'client-001',
};

const fakeClient: Client = {
  id: 'client-001',
  photographer_id: 'photo-001',
  display_name: 'Jane Smith',
  email: 'jane@example.com',
  phone: null,
  parent_email: null,
  parent_name: null,
  parent_phone: null,
  notes: null,
  source: 'web_form',
  created_at: '2026-06-22T10:00:00Z',
  updated_at: '2026-06-22T10:00:00Z',
  deleted_at: null,
};

const seniorPremiumPackage: Package = {
  id: 'pkg-senior-premium',
  photographer_id: 'photo-001',
  name: 'Senior Portrait — Premium',
  description: 'Full senior portrait experience',
  price_cents: 80000,
  deposit_cents: 20000,
  session_type: 'senior',
  included_locations_count: 3,
  included_outfits_count: 4,
  delivery_count: 50,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

const seniorStandardPackage: Package = {
  id: 'pkg-senior-standard',
  photographer_id: 'photo-001',
  name: 'Senior Portrait — Standard',
  description: 'Standard senior portrait session',
  price_cents: 45000,
  deposit_cents: 10000,
  session_type: 'senior',
  included_locations_count: 2,
  included_outfits_count: 2,
  delivery_count: 30,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

const seniorBasicPackage: Package = {
  id: 'pkg-senior-basic',
  photographer_id: 'photo-001',
  name: 'Senior Portrait — Basic',
  description: 'Basic senior portrait session',
  price_cents: 20000,
  deposit_cents: 5000,
  session_type: 'senior',
  included_locations_count: 1,
  included_outfits_count: 1,
  delivery_count: 15,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

const familyPackage: Package = {
  id: 'pkg-family',
  photographer_id: 'photo-001',
  name: 'Family Session',
  description: 'Family portrait session',
  price_cents: 35000,
  deposit_cents: 10000,
  session_type: 'family',
  included_locations_count: 1,
  included_outfits_count: null,
  delivery_count: 25,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

const fakeBooking: Booking = {
  id: 'booking-001',
  photographer_id: 'photo-001',
  client_id: 'client-001',
  package_id: 'pkg-senior-premium',
  session_date: '2027-04-15',
  duration_minutes: 90,
  status: 'tentative',
  contract_id: null,
  deposit_invoice_id: null,
  final_invoice_id: null,
  external_calendar_event_id: null,
  notes: 'Client mentioned outdoor downtown preference',
  created_at: '2026-06-22T10:00:00Z',
  updated_at: '2026-06-22T10:00:00Z',
  deleted_at: null,
};

function makeMockSupabase() {
  return {} as unknown as Parameters<typeof runBookingAgent>[0];
}

function hasNoMatch(result: BookingAgentResult): result is { data: null; error: null; noMatch: BookingAgentNoMatch } {
  return 'noMatch' in result;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.LENS_GATEWAY_MODE = 'eval';

  clearFixtures();
  clearClient();

  registerFixture('booking', CLEAN_MATCH_KEY, cleanMatchFixture);
  registerFixture('booking', JUDGMENT_KEY, judgmentFixture);
  registerFixture('booking', NO_MATCH_KEY, noMatchFixture);
  registerFixture('booking', INACTIVE_KEY, inactiveFixture);
  registerFixture('booking', REENTRY_KEY, reentryFixture);

  mockGetLead.mockReset();
  mockConvertLeadToClient.mockReset();
  mockGetClient.mockReset();
  mockListPackages.mockReset();
  mockCreateBooking.mockReset();

  mockGetLead.mockResolvedValue({ data: qualifiedLead, error: null });
  mockListPackages.mockResolvedValue({
    data: [seniorPremiumPackage, familyPackage],
    error: null,
  });

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.LENS_GATEWAY_MODE;
  vi.restoreAllMocks();
});

// ===========================================================================
// Gateway-fixture evals (cases 1-5)
// ===========================================================================

describe('BookingAgent gateway-fixture evals', () => {
  it('case 1: clean match — one senior package → client + booking written, tentative', async () => {
    mockConvertLeadToClient.mockResolvedValue({
      data: { lead: convertedLead, client: fakeClient },
      error: null,
    });
    mockGetLead.mockResolvedValueOnce({ data: qualifiedLead, error: null });
    mockGetLead.mockResolvedValueOnce({ data: convertedLead, error: null });
    mockCreateBooking.mockResolvedValue({ data: fakeBooking, error: null });

    const result = await runBookingAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: CLEAN_MATCH_KEY }),
    );

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.booking.status).toBe('tentative');
    expect(result.data!.booking.package_id).toBe('pkg-senior-premium');
    expect(result.data!.selection.selected_package_id).toBe('pkg-senior-premium');
    expect(result.data!.selection.confidence).toBeGreaterThan(0.9);

    expect(mockConvertLeadToClient).toHaveBeenCalledWith(expect.anything(), 'lead-001');
    expect(mockCreateBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        client_id: 'client-001',
        package_id: 'pkg-senior-premium',
      }),
    );
  });

  it('case 2: judgment match — three tiers, budget signal → mid-tier selected', async () => {
    mockListPackages.mockResolvedValue({
      data: [seniorBasicPackage, seniorStandardPackage, seniorPremiumPackage, familyPackage],
      error: null,
    });
    mockConvertLeadToClient.mockResolvedValue({
      data: { lead: convertedLead, client: fakeClient },
      error: null,
    });
    mockGetLead.mockResolvedValueOnce({ data: qualifiedLead, error: null });
    mockGetLead.mockResolvedValueOnce({ data: convertedLead, error: null });
    mockCreateBooking.mockResolvedValue({
      data: { ...fakeBooking, package_id: 'pkg-senior-standard' },
      error: null,
    });

    const result = await runBookingAgent(
      makeMockSupabase(),
      makePayload({
        qualification: {
          ...baseQualification,
          extracted: { ...baseQualification.extracted, budget_signal: 'something affordable' },
        },
        fixtureKey: JUDGMENT_KEY,
      }),
    );

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.selection.selected_package_id).toBe('pkg-senior-standard');
    expect(result.data!.selection.reasons.length).toBeGreaterThanOrEqual(2);

    expect(mockCreateBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ package_id: 'pkg-senior-standard' }),
    );
  });

  it('case 3: no match — newborn lead, no newborn package → zero writes, no client', async () => {
    mockListPackages.mockResolvedValue({
      data: [seniorPremiumPackage, familyPackage],
      error: null,
    });

    const result = await runBookingAgent(
      makeMockSupabase(),
      makePayload({
        qualification: {
          ...baseQualification,
          extracted: { ...baseQualification.extracted, event_type: 'newborn' },
        },
        fixtureKey: NO_MATCH_KEY,
      }),
    );

    expect(hasNoMatch(result)).toBe(true);
    if (hasNoMatch(result)) {
      expect(result.noMatch.reason).toContain('newborn');
    }

    expect(mockConvertLeadToClient).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it('case 4: already-converted re-entry → skips conversion, exactly one booking', async () => {
    mockGetLead.mockResolvedValue({ data: convertedLead, error: null });
    mockGetClient.mockResolvedValue({ data: fakeClient, error: null });
    mockCreateBooking.mockResolvedValue({ data: fakeBooking, error: null });

    const result = await runBookingAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: REENTRY_KEY }),
    );

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.client.id).toBe('client-001');
    expect(result.data!.booking.id).toBe('booking-001');

    expect(mockConvertLeadToClient).not.toHaveBeenCalled();
    expect(mockGetClient).toHaveBeenCalledWith(expect.anything(), 'client-001');
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });

  it('case 5: inactive package selected by model → code rejects, no booking write', async () => {
    mockListPackages.mockResolvedValue({
      data: [seniorPremiumPackage, familyPackage],
      error: null,
    });

    const result = await runBookingAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: INACTIVE_KEY }),
    );

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('validation_error');
    expect(result.error!.detail).toContain('pkg-senior-discontinued');
    expect(result.error!.detail).toContain('not in the active packages list');

    expect(mockConvertLeadToClient).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });
});
