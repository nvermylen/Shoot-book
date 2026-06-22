import type { AgentId } from '@/types/agent';

const ACTIVE_VERSIONS: Record<AgentId, string> = {
  lead: 'lead.v1',
  booking: 'booking.v0-stub',
  comms: 'comms.v0-stub',
  billing: 'billing.v0-stub',
  expense: 'expense.v0-stub',
  delivery: 'delivery.v0-stub',
};

export function getActiveVersion(agentId: AgentId): string {
  return ACTIVE_VERSIONS[agentId];
}
