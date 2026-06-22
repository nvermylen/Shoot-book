import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'senior-portrait-qualified';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        decision: 'qualified',
        reasons: [
          'Clear senior portrait request with specific timeline',
          'Complete contact information provided',
        ],
        extracted: {
          event_type: 'senior portraits',
          date_signal: 'Spring 2027',
          budget_signal: null,
          location_preference: 'outdoor downtown area',
          party_size: 1,
        },
        confidence: 0.92,
      }),
    },
  ],
  stopReason: 'end_turn',
};
