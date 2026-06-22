import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'already-converted-reentry';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        selected_package_id: 'pkg-senior-premium',
        session_type_match: 'senior portraits → senior',
        reasons: [
          'Clear senior portrait request with premium budget signal',
          'Re-entry after prior booking failure — same selection applies',
        ],
        suggested_duration_minutes: 120,
        suggested_session_date: '2027-04-15',
        notes: null,
        confidence: 0.90,
      }),
    },
  ],
  stopReason: 'end_turn',
};
