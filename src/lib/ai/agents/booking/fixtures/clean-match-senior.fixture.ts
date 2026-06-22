import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'clean-match-senior';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        selected_package_id: 'pkg-senior-premium',
        session_type_match: 'senior portraits → senior',
        reasons: [
          'Lead requests senior portraits — exact session_type match',
          'Only one senior package available — clear selection',
        ],
        suggested_duration_minutes: 90,
        suggested_session_date: '2027-04-15',
        notes: 'Client mentioned outdoor downtown preference — compatible with package locations',
        confidence: 0.95,
      }),
    },
  ],
  stopReason: 'end_turn',
};
