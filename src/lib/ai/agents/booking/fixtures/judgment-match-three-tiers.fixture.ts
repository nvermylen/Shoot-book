import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'judgment-match-three-tiers';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        selected_package_id: 'pkg-senior-standard',
        session_type_match: 'senior portraits → senior (mid-tier selected based on budget signal)',
        reasons: [
          'Three senior packages available: Basic ($200), Standard ($450), Premium ($800)',
          'Lead mentioned wanting something affordable — budget signal suggests mid-tier',
          'Standard package includes 2 locations and 30 edited images — good fit for stated party_size of 1',
        ],
        suggested_duration_minutes: 60,
        suggested_session_date: '2027-05-20',
        notes: 'Selected Standard over Basic due to location flexibility; Premium exceeds budget signal',
        confidence: 0.78,
      }),
    },
  ],
  stopReason: 'end_turn',
};
