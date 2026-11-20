import type { ChatMessage, ChatProvider, ChatResult, ToolSpec } from './types';

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

const LOCAL_WORDS =
  /\b(kya|kia|kaya|kaise|kaisay|kaisi|aap|ap|hai|hain|hy|mujhe|mera|meri|kitn[ei]|kitna|aaj|kal|batao|bataein|bataiye|dikhao|karo|karein|nahi|nhi|haan|acha|accha|theek|shukriya|salam|assalam|kese|kesy|wala|wali|sab)\b/gi;

export function isLocalLanguage(text: string) {
  const hits = text.match(LOCAL_WORDS)?.length ?? 0;
  const words = text.trim().split(/\s+/).length;
  return hits >= 2 || (hits === 1 && words <= 3);
}

export function smallTalk(text: string, name: string, agent: string): string | null {
  const q = text
    .trim()
    .toLowerCase()
    .replace(/[!?.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ur = isLocalLanguage(q);
  const hi = name ? ` ${name}` : '';
  const offer = ur
    ? 'Main admissions, applications, payments, seats, platform fees aur integrity alerts mein aap ki madad kar sakta hoon. Bataiye, kya dekhna hai?'
    : 'I can help with admissions, applications, payments, seats, platform fees and integrity alerts. What would you like to look at?';
  if (/^(thanks|thank you|thx|shukriya|shukria|bohat shukriya|jazakallah|jazak allah)( .*)?$/.test(q))
    return ur || /shukri|jazak/.test(q)
      ? `Koi baat nahi${hi}! Khushi hui madad kar ke. Aur kuch chahiye to zaroor bataiye.`
      : `You are welcome${hi}! Happy to help. Let me know if you need anything else.`;
  if (/^(bye|goodbye|good bye|allah hafiz|khuda hafiz|see you)( .*)?$/.test(q))
    return /hafiz/.test(q) || ur
      ? `Allah Hafiz${hi}! Jab bhi zaroorat ho, main yahin hoon.`
      : `Goodbye${hi}! I am here whenever you need me.`;
  if (
    /(how are you|how r u|how are u|kaise ho|kaisay ho|kese ho|kesy ho|kaise hain|kaisi ho|kya haal|kia haal|kaya haal|haal chaal)/.test(
      q,
    )
  )
    return ur || /haal|kaise|kaisay|kese|kesy|kaisi/.test(q)
      ? `Main bilkul theek hoon${hi}, shukriya poochne ka! Umeed hai aap bhi khairiyat se hain. ${offer}`
      : `I am doing great${hi}, thanks for asking! I hope you are well too. ${offer}`;
  if (
    /^(hi|hello|hey|hiya|salam|salaam|assalam o alaikum|assalamu alaikum|assalam alaikum|aoa|good (morning|afternoon|evening))( (there|mitra|\w+))?$/.test(
      q,
    )
  )
    return /salam|salaam|aoa|assalam/.test(q) || ur
      ? `Wa Alaikum Assalam${hi}! Main ${agent} hoon, aap ka admission assistant. ${offer}`
      : `Hello${hi}! I am ${agent}, your admission assistant. ${offer}`;
  if (
    /^(who are you|what can you do|tum kaun ho|aap kaun hain|ap kon ho|tum kya kar sakte ho|aap kya kar sakte hain)$/.test(
      q,
    )
  )
    return ur || /kaun|kon|kya|sakte/.test(q)
      ? `Main ${agent} hoon, ${hi ? `${name} ka ` : ''}admission operations copilot. ${offer}`
      : `I am ${agent}, your admission operations copilot. ${offer}`;
  return null;
}

function summarise(name: string, json: string, ur = false) {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return json.slice(0, 600);
  }
  if (data && typeof data === 'object' && 'error' in (data as object))
    return ur
      ? `Maazrat, yeh nahi mil saka: ${(data as { error: string }).error}`
      : `I could not get that: ${(data as { error: string }).error}`;
  if (data && typeof data === 'object' && (data as { status?: string }).status === 'awaiting_confirmation')
    return ur
      ? `Main ne yeh tayyar kar diya hai: **${(data as { summary: string }).summary}** Chalane ke liye card par **Confirm** dabaiye.`
      : `I prepared this for you: **${(data as { summary: string }).summary}** Press **Confirm** on the card to run it.`;
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
  if (!rows.length)
    return [...intro, ur ? 'Is ke ilawa kuch report karne ko nahi.' : 'Nothing else to report.'].join('\n');
  const keys = Object.keys(rows[0] as object).slice(0, 4);
  const cell = (v: unknown) =>
    String(typeof v === 'object' ? JSON.stringify(v) : (v ?? ''))
      .replace(/\|/g, '/')
      .slice(0, 80);
  return [
    ur
      ? `Yeh raha jo mujhe mila (${name.replace(/_/g, ' ')}):`
      : `Here is what I found (${name.replace(/_/g, ' ')}):`,
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
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const fullName = system.match(/You assist ([^,]+),/)?.[1] ?? '';
    const userName = /admin/i.test(fullName) ? '' : (fullName.split(' ')[0] ?? '');
    const agent = system.match(/You are ([^,]+), the admission/)?.[1] ?? 'Mitra';
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const ur = isLocalLanguage(lastUser);
    if (last.role === 'tool') {
      const results = req.messages
        .slice(req.messages.findLastIndex((m) => m.role === 'assistant'))
        .filter((m) => m.role === 'tool');
      return {
        content: results.map((m) => summarise((m as { name: string }).name, m.content, ur)).join('\n\n'),
        toolCalls: [],
        usage,
      };
    }
    const q = last.role === 'user' ? last.content : '';
    const chat = smallTalk(q, userName, agent);
    if (chat) return { content: chat, toolCalls: [], usage };
    const allowed = new Set(req.tools.map((t) => t.name));
    const hit = RULES.find(([rx, tool]) => rx.test(q) && allowed.has(tool));
    const tool = hit ? hit[1] : allowed.has('get_overview') ? 'get_overview' : null;
    if (!tool)
      return {
        content: ur
          ? 'Main admissions, payments, seats aur alerts ke baare mein sawalon ke jawab de sakta hoon.'
          : 'I can answer questions about admissions, payments, seats and alerts.',
        toolCalls: [],
        usage,
      };
    const args: Record<string, unknown> = { ...(hit?.[2] ?? {}) };
    const days = q.match(/(\d+)\s*(day|din)/i);
    if (days && 'withinDays' in args) args.withinDays = Math.min(14, Number(days[1]));
    return { content: '', toolCalls: [{ id: `mock_${Date.now()}`, name: tool, args }], usage };
  }
}
