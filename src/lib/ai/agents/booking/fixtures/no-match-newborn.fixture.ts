import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'no-match-newborn';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        selected_package_id: null,
        session_type_match: 'none',
        reasons: [
          'Lead requests newborn photography but photographer has no newborn packages',
          'Available session types are: senior, family — no newborn offering exists',
        ],
        suggested_duration_minutes: null,
        suggested_session_date: null,
        notes: 'Photographer may want to create a newborn package or refer this lead',
        confidence: 0.92,
      }),
    },
  ],
  stopReason: 'end_turn',
};
