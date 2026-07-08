import { registerGmailSendTool } from '@/lib/ai/tools/gmail-send';

/**
 * BillingAgent allowed tool set (AGENT_ARCHITECTURE: each agent's tools.ts
 * declares its tools; the registry enforces per-call).
 *
 * Phase 1 ships only the deterministic chase substrate (LENS-022d/e) — the
 * BillingAgent LLM run loop is Phase 2. `gmail.send` is declared now because
 * the chase runner executes in BillingAgent's territory and calls tools under
 * agentId 'billing'.
 */
export const BILLING_AGENT_TOOLS = ['gmail.send'] as const;

export type BillingAgentTool = (typeof BILLING_AGENT_TOOLS)[number];

/** Register every tool BillingAgent is allowed to call. Idempotent. */
export function registerBillingAgentTools(): void {
  registerGmailSendTool();
}
