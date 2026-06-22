import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'spam-rejected';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: JSON.stringify({
        decision: 'rejected',
        reasons: [
          'Message is a marketing solicitation, not a photography inquiry',
          'Content is generic SEO spam with no personal details',
        ],
        extracted: {
          event_type: null,
          date_signal: null,
          budget_signal: null,
          location_preference: null,
          party_size: null,
        },
        confidence: 0.97,
      }),
    },
  ],
  stopReason: 'end_turn',
};
