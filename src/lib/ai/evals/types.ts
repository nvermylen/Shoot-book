import type { AgentId } from '@/types/agent';

export interface EvalContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}

export interface EvalExpected {
  content: EvalContentBlock[];
  stopReason: string;
}

export interface Fixture {
  id: string;
  agentId: AgentId;
  description: string;
  input: {
    messages: Array<{ role: string; content: string }>;
    systemPrompt?: string;
    tools?: string[];
  };
  expected: EvalExpected;
  mockOutput: EvalExpected;
}

export interface EvalResult {
  fixtureId: string;
  passed: boolean;
  expected: EvalExpected;
  actual: EvalExpected;
  diff?: string;
}

export interface EvalReport {
  total: number;
  passed: number;
  failed: number;
  results: EvalResult[];
}
