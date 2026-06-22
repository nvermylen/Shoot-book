import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'vague-inquiry-needs-info';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        decision: 'needs_info',
        reasons: [
          'Interested in photography services but no event type specified',
          'No timeline or date mentioned',
        ],
        extracted: {
          event_type: null,
          date_signal: null,
          budget_signal: 'mentioned wanting something affordable',
          location_preference: null,
          party_size: null,
        },
        missing_fields: ['event_type', 'date_signal'],
        confidence: 0.78,
      }),
    },
  ],
  stopReason: 'end_turn',
};
