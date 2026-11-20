import { ProviderError, type ChatMessage, type ChatProvider, type ChatResult, type ToolSpec } from './types';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export class AnthropicProvider implements ChatProvider {
  readonly name = 'anthropic';
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}

  async chat(req: {
    messages: ChatMessage[];
    tools: ToolSpec[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<ChatResult> {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages: { role: 'user' | 'assistant'; content: Block[] }[] = [];
    for (const m of req.messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        const block: Block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
        const last = messages.at(-1);
        if (last?.role === 'user' && last.content.every((b) => b.type === 'tool_result'))
          last.content.push(block);
        else messages.push({ role: 'user', content: [block] });
      } else if (m.role === 'assistant') {
        const content: Block[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const t of m.toolCalls ?? [])
          content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.args });
        messages.push({ role: 'assistant', content });
      } else messages.push({ role: 'user', content: [{ type: 'text', text: m.content }] });
    }
    const r = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system,
        messages,
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
        max_tokens: req.maxTokens ?? 1500,
        temperature: req.temperature ?? 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    if (!r.ok)
      throw new ProviderError(
        `anthropic returned ${r.status}: ${text.slice(0, 300)}`,
        r.status === 429 ? 429 : 502,
      );
    const data = JSON.parse(text) as {
      content: Block[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      content: data.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n'),
      toolCalls: data.content
        .filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    };
  }
}
