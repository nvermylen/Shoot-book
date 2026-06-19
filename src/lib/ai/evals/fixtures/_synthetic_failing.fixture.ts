import type { Fixture } from '../types';

export const fixture: Fixture = {
  id: 'synthetic-failing',
  agentId: 'lead',
  description: 'Synthetic fixture that always fails — proves diff output',
  input: {
    messages: [{ role: 'user', content: 'Hello' }],
  },
  expected: {
    content: [{ type: 'text', text: 'Expected response' }],
    stopReason: 'end_turn',
  },
  mockOutput: {
    content: [{ type: 'text', text: 'Different response' }],
    stopReason: 'end_turn',
  },
};
