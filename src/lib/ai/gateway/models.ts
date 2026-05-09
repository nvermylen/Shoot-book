import type { AgentId } from '@/types/agent';

export const AGENT_MODELS: Record<AgentId, string> = {
  lead: 'claude-haiku-4-5-20251001',
  booking: 'claude-sonnet-4-6',
  comms: 'claude-sonnet-4-6',
  billing: 'claude-haiku-4-5-20251001',
  expense: 'claude-haiku-4-5-20251001',
  delivery: 'claude-sonnet-4-6',
};
