import type { FixtureResponse } from '@/lib/ai/gateway/fixtures';

export const FIXTURE_KEY = 'malformed-model-output';

export const fixture: FixtureResponse = {
  content: [
    {
      type: 'text' as const,
      citations: null,
      text: '{"decision": "maybe", "reasons": 42, "not_a_valid_schema": true}',
    },
  ],
  stopReason: 'end_turn',
};
