/**
 * AGENT-1: one interface for every AI provider. The agent only talks to `ChatProvider`, so switching
 * between Gemini, OpenAI, Claude or any OpenAI-compatible service is a change of environment values.
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the arguments (an object). */
  parameters: Record<string, unknown>;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  chat(req: {
    messages: ChatMessage[];
    tools: ToolSpec[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<ChatResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}
