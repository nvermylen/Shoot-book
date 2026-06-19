import type { Fixture } from '../types';

export const fixture: Fixture = {
  id: 'synthetic-passing',
  agentId: 'lead',
  promptVersion: 'lead.v0-stub',
  description: 'Synthetic fixture that always passes — proves harness wiring',
  input: {
    messages: [{ role: 'user', content: 'Hello' }],
  },
  expected: {
    content: [{ type: 'text', text: 'Hello from eval harness' }],
    stopReason: 'end_turn',
  },
  mockOutput: {
    content: [{ type: 'text', text: 'Hello from eval harness' }],
    stopReason: 'end_turn',
  },
};
