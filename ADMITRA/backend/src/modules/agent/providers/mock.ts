import type { ChatMessage, ChatProvider, ChatResult, ToolSpec } from './types';

/**
 * AGENT-1 (development and tests only): an offline stand-in for a real model. It picks a tool from
 * keywords in the question, then summarises the tool's real result. It lets the whole flow (tools,
 * streaming, action cards) be shown and tested without an API key. Refused in production.
 */
const RULES: [RegExp, string, Record<string, unknown>][] = [
  [/remind.*offer|offer.*(expire|deadline)/i, 'remind_offer_deadline', { withinDays: 2 }],
  [/remind.*(fee|challan|payment)/i, 'remind_unpaid_fees', {}],
  [/payment|challan|fee proof/i, 'payment_review', {}],
  [/alert|suspicious|illegal|irregular|fraud|ghalat|gadbad/i, 'integrity_alerts', {}],
  [/ticket|support/i, 'support_tickets', {}],
  [/subscription|platform fee|renew|plan/i, 'subscriptions_and_fees', {}],
  [/funnel|analytics/i, 'campaign_analytics', {}],
  [/seat|merit|offer/i, 'merit_and_offers', {}],
  [/institution|compare/i, 'list_institutions', {}],
  [/advisor|registry/i, 'advisor_and_registry', {}],
];

function summarise(name: string, json: string) {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return json.slice(0, 600);
  }
  if (data && typeof data === 'object' && 'error' in (data as object))
    return `I could not get that: ${(data as { error: string }).error}`;
  if (data && typeof data === 'object' && (data as { status?: string }).status === 'awaiting_confirmation')
    return `I prepared this for you: **${(data as { summary: string }).summary}** Press **Confirm** on the card to run it.`;
  const words = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const intro: string[] = [];
  let rows: unknown[];
  if (Array.isArray(data)) rows = data;
  else {
    const obj = data as Record<string, unknown>;
    const listKey = Object.keys(obj).find(
      (k) =>
        Array.isArray(obj[k]) && (obj[k] as unknown[]).length && typeof (obj[k] as unknown[])[0] === 'object',
    );
    for (const [k, v] of Object.entries(obj))
      if (k !== listKey && (typeof v !== 'object' || v === null))
        intro.push(`- **${words(k)}**: ${String(v)}`);
    rows = listKey
      ? (obj[listKey] as unknown[])
      : Object.entries(obj)
          .filter(([, v]) => typeof v === 'object')
          .map(([k, v]) => ({ item: words(k), value: v }));
  }
  if (!rows.length) return [...intro, 'Nothing else to report.'].join('\n');
  const keys = Object.keys(rows[0] as object).slice(0, 4);
  const cell = (v: unknown) =>
    String(typeof v === 'object' ? JSON.stringify(v) : (v ?? ''))
      .replace(/\|/g, '/')
      .slice(0, 80);
  return [
    `Here is what I found (${name.replace(/_/g, ' ')}):`,
    ...intro,
    '',
    `| ${keys.join(' | ')} |`,
    `| ${keys.map(() => '---').join(' | ')} |`,
    ...rows
      .slice(0, 12)
      .map((r) => `| ${keys.map((k) => cell((r as Record<string, unknown>)[k])).join(' | ')} |`),
  ].join('\n');
}

export class MockProvider implements ChatProvider {
  readonly name = 'mock';
  readonly model = 'offline-demo';
  async chat(req: { messages: ChatMessage[]; tools: ToolSpec[] }): Promise<ChatResult> {
    const usage = { inputTokens: 0, outputTokens: 0 };
    const last = req.messages.at(-1)!;
    if (last.role === 'tool') {
      const results = req.messages
        .slice(req.messages.findLastIndex((m) => m.role === 'assistant'))
        .filter((m) => m.role === 'tool');
      return {
        content: results.map((m) => summarise((m as { name: string }).name, m.content)).join('\n\n'),
        toolCalls: [],
        usage,
      };
    }
    const q = last.role === 'user' ? last.content : '';
    const allowed = new Set(req.tools.map((t) => t.name));
    const hit = RULES.find(([rx, tool]) => rx.test(q) && allowed.has(tool));
    const tool = hit ? hit[1] : allowed.has('get_overview') ? 'get_overview' : null;
    if (!tool)
      return {
        content: 'I can answer questions about admissions, payments, seats and alerts.',
        toolCalls: [],
        usage,
      };
    const args: Record<string, unknown> = { ...(hit?.[2] ?? {}) };
    const days = q.match(/(\d+)\s*(day|din)/i);
    if (days && 'withinDays' in args) args.withinDays = Math.min(14, Number(days[1]));
    return { content: '', toolCalls: [{ id: `mock_${Date.now()}`, name: tool, args }], usage };
  }
}
