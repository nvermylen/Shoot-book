export type AgentId =
  | 'lead'
  | 'booking'
  | 'comms'
  | 'billing'
  | 'expense'
  | 'delivery';

export interface ToolCall {
  tool_name: string;
  input: unknown;
}

export interface ToolResult {
  tool_name: string;
  status: 'ok' | 'error';
  output: unknown;
  error?: string;
  latency_ms: number;
}

export interface AgentResult {
  agent_id: AgentId;
  prompt_version: string;
  tool_calls: ToolCall[];
  final_message: string | null;
  input_token_count: number;
  output_token_count: number;
  latency_ms: number;
  status: 'ok' | 'error';
  error?: string;
}

export type AgentMode = 'live' | 'eval';
