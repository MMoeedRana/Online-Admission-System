import { ProviderError, type ChatMessage, type ChatProvider, type ChatResult, type ToolSpec } from './types';

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export class OpenAICompatibleProvider implements ChatProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  private toWire(m: ChatMessage): OpenAIMessage {
    if (m.role === 'tool')
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId, name: m.name };
    if (m.role === 'assistant')
      return {
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((t) => ({
                id: t.id,
                type: 'function' as const,
                function: { name: t.name, arguments: JSON.stringify(t.args) },
              })),
            }
          : {}),
      };
    return { role: m.role, content: m.content };
  }

  async chat(req: {
    messages: ChatMessage[];
    tools: ToolSpec[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<ChatResult> {
    const body = {
      model: this.model,
      messages: req.messages.map((m) => this.toWire(m)),
      ...(req.tools.length
        ? { tools: req.tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' }
        : {}),
      max_tokens: req.maxTokens ?? 1500,
      temperature: req.temperature ?? 0.2,
    };
    const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    if (!r.ok)
      throw new ProviderError(
        `${this.name} returned ${r.status}: ${text.slice(0, 300)}`,
        r.status === 429 ? 429 : 502,
      );
    const data = JSON.parse(text) as {
      choices: { message: OpenAIMessage }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new ProviderError(`${this.name} returned no answer.`);
    return {
      content: msg.content ?? '',
      toolCalls: (msg.tool_calls ?? []).map((t, i) => ({
        id: t.id || `call_${i}`,
        name: t.function.name,
        args: safeJson(t.function.arguments),
      })),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

export function safeJson(s: string | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(s || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
