import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerFixture, clearFixtures } from '@/lib/ai/gateway/fixtures';
import { clearClient } from '@/lib/ai/gateway/gateway';
import { runBookingAgent, type BookingAgentPayload } from './run';

import { fixture as cleanMatchFixture, FIXTURE_KEY as CLEAN_MATCH_KEY } from './fixtures/clean-match-senior.fixture';

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
  source_message_id: 'msg-001',
  thread_id: null,
  intent_summary: 'Senior portraits for my daughter',
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.LENS_GATEWAY_MODE = 'eval';

  clearFixtures();
  clearClient();

  registerFixture('booking', CLEAN_MATCH_KEY, cleanMatchFixture);

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
// Unit tests — deterministic guards, no model judgment (cases 6-10)
// ===========================================================================

describe('BookingAgent unit tests', () => {
  it('case 6: disqualified lead → rejected, not ready for booking', async () => {
    const disqualifiedLead: Lead = {
      ...qualifiedLead,
      qualification_status: 'disqualified',
    };
    mockGetLead.mockResolvedValue({ data: disqualifiedLead, error: null });

    const result = await runBookingAgent(makeMockSupabase(), makePayload());

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('validation_error');
    expect(result.error!.detail).toContain('disqualified');
    expect(result.error!.detail).toContain('requires');

    expect(mockListPackages).not.toHaveBeenCalled();
    expect(mockConvertLeadToClient).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it('case 7: new (unqualified) lead → rejected', async () => {
    const newLead: Lead = {
      ...qualifiedLead,
      qualification_status: 'new',
    };
    mockGetLead.mockResolvedValue({ data: newLead, error: null });

    const result = await runBookingAgent(makeMockSupabase(), makePayload());

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('validation_error');
    expect(result.error!.detail).toContain("'new'");

    expect(mockListPackages).not.toHaveBeenCalled();
  });

  it('case 8: createBooking fails after conversion → error logged, no swallow', async () => {
    mockConvertLeadToClient.mockResolvedValue({
      data: { lead: convertedLead, client: fakeClient },
      error: null,
    });
    mockGetLead.mockResolvedValueOnce({ data: qualifiedLead, error: null });
    mockGetLead.mockResolvedValueOnce({ data: convertedLead, error: null });
    mockCreateBooking.mockResolvedValue({
      data: null,
      error: { code: 'db_error', detail: 'unique constraint violation' },
    });

    const result = await runBookingAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: CLEAN_MATCH_KEY }),
    );

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('db_error');
    expect(result.data).toBeNull();

    expect(console.error).toHaveBeenCalledWith(
      'booking_agent.create_booking_failed',
      expect.objectContaining({
        lead_id: 'lead-001',
        client_id: 'client-001',
      }),
    );
  });

  it('case 9: no active packages → validation error before gateway call', async () => {
    mockListPackages.mockResolvedValue({ data: [], error: null });

    const result = await runBookingAgent(makeMockSupabase(), makePayload());

    expect(result.error).not.toBeNull();
    expect(result.error!.detail).toContain('No active packages');

    expect(mockConvertLeadToClient).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it('case 10: convert → booking fails → re-run → exactly one client, one booking', async () => {
    // --- First run: qualified lead, conversion succeeds, booking FAILS ---
    mockGetLead
      .mockResolvedValueOnce({ data: qualifiedLead, error: null })
      .mockResolvedValueOnce({ data: convertedLead, error: null });
    mockConvertLeadToClient.mockResolvedValueOnce({
      data: { lead: convertedLead, client: fakeClient },
      error: null,
    });
    mockCreateBooking.mockResolvedValueOnce({
      data: null,
      error: { code: 'db_error', detail: 'connection lost' },
    });

    const firstResult = await runBookingAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: CLEAN_MATCH_KEY }),
    );

    expect(firstResult.error).not.toBeNull();
    expect(firstResult.error!.code).toBe('db_error');

    // --- Second run: same lead, now converted, booking SUCCEEDS ---
    mockGetLead.mockResolvedValueOnce({ data: convertedLead, error: null });
    mockGetClient.mockResolvedValueOnce({ data: fakeClient, error: null });
    mockCreateBooking.mockResolvedValueOnce({ data: fakeBooking, error: null });

    const secondResult = await runBookingAgent(
      makeMockSupabase(),
      makePayload({ fixtureKey: CLEAN_MATCH_KEY }),
    );

    expect(secondResult.error).toBeNull();
    expect(secondResult.data).not.toBeNull();
    expect(secondResult.data!.booking.id).toBe('booking-001');
    expect(secondResult.data!.client.id).toBe('client-001');

    // Recovery contract: exactly one client, one booking
    expect(mockConvertLeadToClient).toHaveBeenCalledTimes(1);
    expect(mockGetClient).toHaveBeenCalledTimes(1);
    expect(mockGetClient).toHaveBeenCalledWith(expect.anything(), 'client-001');
    expect(mockCreateBooking).toHaveBeenCalledTimes(2);
  });
});
