import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'inactive-package-selected';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        selected_package_id: 'pkg-senior-discontinued',
        session_type_match: 'senior portraits → senior',
        reasons: [
          'Best match for senior portrait request',
        ],
        suggested_duration_minutes: 90,
        suggested_session_date: null,
        notes: null,
        confidence: 0.85,
      }),
    },
  ],
  stopReason: 'end_turn',
};
