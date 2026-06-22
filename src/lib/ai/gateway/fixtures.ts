import type Anthropic from '@anthropic-ai/sdk';
import type { AgentId } from '@/types/agent';

export interface FixtureResponse {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.Message['stop_reason'];
}

const store = new Map<string, FixtureResponse>();

function key(agentId: AgentId, fixtureKey: string): string {
  return `${agentId}:${fixtureKey}`;
}

export function registerFixture(
  agentId: AgentId,
  fixtureKey: string,
  response: FixtureResponse,
): void {
  store.set(key(agentId, fixtureKey), response);
}

export function getFixture(
  agentId: AgentId,
  fixtureKey: string,
): FixtureResponse | undefined {
  return store.get(key(agentId, fixtureKey));
}

export function clearFixtures(): void {
  store.clear();
}
