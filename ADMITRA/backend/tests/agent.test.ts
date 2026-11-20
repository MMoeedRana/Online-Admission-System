import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentMails } from '../src/lib/mailer';
import {
  AgentActionModel,
  AgentUsageModel,
  BriefingModel,
  ConversationModel,
  IntegrityAlertModel,
} from '../src/modules/agent/agent.models';
import { runDailyBriefings } from '../src/modules/agent/briefing.service';
import { refreshAlerts } from '../src/modules/agent/integrity.rules';
import { setProvider } from '../src/modules/agent/providers';
import { AnthropicProvider } from '../src/modules/agent/providers/anthropic';
import { OpenAICompatibleProvider } from '../src/modules/agent/providers/openai';
import type { ChatMessage, ChatProvider, ChatResult, ToolSpec } from '../src/modules/agent/providers/types';
import { ALL_TOOLS, toolSpec } from '../src/modules/agent/tools';
import { pktDay } from '../src/modules/agent/tools/common';
import { ApplicationModel } from '../src/modules/applications/application.model';
import { PaymentModel, VoucherModel } from '../src/modules/fees/fee.models';
import { OfferModel } from '../src/modules/merit/merit.models';
import { NotificationModel } from '../src/modules/notifications/notification.models';
import { PlanModel } from '../src/modules/plans/plan.model';
import { SubscriptionPaymentModel } from '../src/modules/platform/billing.model';
import { VerificationModel } from '../src/modules/records/record.models';
import { api, createInstitution, createPlan, createUser, superAdminToken } from './helpers';

class FakeProvider implements ChatProvider {
  readonly name = 'fake';
  readonly model = 'fake-1';
  calls: { messages: ChatMessage[]; tools: ToolSpec[] }[] = [];
  constructor(private queue: Partial<ChatResult>[]) {}
  async chat(req: { messages: ChatMessage[]; tools: ToolSpec[] }): Promise<ChatResult> {
    this.calls.push(req);
    const next = this.queue.shift() ?? { content: 'ok' };
    return {
      content: next.content ?? '',
      toolCalls: next.toolCalls ?? [],
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }
}

afterEach(() => {
  setProvider(null);
  vi.unstubAllGlobals();
});

const oid = () => new Types.ObjectId();
const copilotPlan = () => createPlan({}, { aiCopilot: true, aiBriefing: true });

describe('provider layer (AGENT-1)', () => {
  it('speaks the OpenAI tool-calling format used by Gemini, OpenAI and compatible services', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'c1',
                      type: 'function',
                      function: { name: 'get_overview', arguments: '{"days":1}' },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const p = new OpenAICompatibleProvider(
      'gemini',
      'https://generativelanguage.googleapis.com/v1beta/openai',
      'KEY',
      'gemini-2.5-flash',
    );
    const r = await p.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [toolSpec(ALL_TOOLS[0]!)] });
    expect(r.toolCalls).toEqual([{ id: 'c1', name: 'get_overview', args: { days: 1 } }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer KEY');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('gemini-2.5-flash');
    expect(body.tools[0].function.name).toBe('get_overview');
    expect(body.tools[0].function.parameters.$schema).toBeUndefined();
  });

  it('speaks the Anthropic Messages format for Claude', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [
              { type: 'text', text: 'Checking' },
              { type: 'tool_use', id: 't1', name: 'payment_review', input: {} },
            ],
            usage: { input_tokens: 20, output_tokens: 4 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const p = new AnthropicProvider('KEY', 'claude-sonnet-5-5');
    const r = await p.chat({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'a', name: 'x', args: {} },
            { id: 'b', name: 'y', args: {} },
          ],
        },
        { role: 'tool', toolCallId: 'a', name: 'x', content: '1' },
        { role: 'tool', toolCallId: 'b', name: 'y', content: '2' },
      ],
      tools: [],
    });
    expect(r).toMatchObject({
      content: 'Checking',
      toolCalls: [{ id: 't1', name: 'payment_review', args: {} }],
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.system).toBe('sys');
    expect(body.messages.at(-1).content).toHaveLength(2);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      'x-api-key': 'KEY',
    });
  });

  it('works without a key: the assistant explains how to connect a provider', async () => {
    const root = await superAdminToken();
    const as = (m: 'get' | 'post', u: string) =>
      api()[m](`/api/v1/platform/agent${u}`).set('Authorization', `Bearer ${root}`);
    expect((await as('get', '/status')).body.data.configured).toBe(false);
    const c = await as('post', '/conversations');
    const r = await as('post', `/conversations/${c.body.data._id}/messages`).send({ message: 'Hello' });
    expect(r.body.data.message.content).toContain('AI_API_KEY');
  });
});

describe('the assistant at work (AGENT-2, AGENT-3, AGENT-4)', () => {
  it('answers a platform question with tools, keeps the conversation and counts usage', async () => {
    const root = await superAdminToken();
    const inst = await createInstitution(`ag${Math.random().toString(36).slice(2, 6)}`);
    await ApplicationModel.create({
      institutionId: inst.inst._id,
      campaignId: oid(),
      applicantId: oid(),
      applicationNumber: 'AG-1',
      status: 'SUBMITTED',
      preferences: [],
      submittedAt: new Date(),
    } as never);
    const fake = new FakeProvider([
      {
        toolCalls: [
          { id: '1', name: 'get_overview', args: {} },
          { id: '2', name: 'list_institutions', args: {} },
        ],
      },
      { content: 'Today 1 application was submitted.' },
    ]);
    setProvider(fake);
    const as = (m: 'get' | 'post', u: string) =>
      api()[m](`/api/v1/platform/agent${u}`).set('Authorization', `Bearer ${root}`);
    const c = await as('post', '/conversations');
    const r = await as('post', `/conversations/${c.body.data._id}/messages`).send({
      message: 'Aaj kitni applications aayin?',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.message.content).toBe('Today 1 application was submitted.');
    expect(
      r.body.data.events
        .filter((e: { type: string }) => e.type === 'tool')
        .map((e: { name: string }) => e.name),
    ).toEqual(['get_overview', 'list_institutions']);
    const toolMsgs = fake.calls[1]!.messages.filter((m) => m.role === 'tool');
    expect(JSON.parse(toolMsgs[0]!.content).applicationsSubmitted).toBe(1);
    expect(fake.calls[0]!.messages[0]!.content).toContain('Super Admin');
    const conv = await as('get', `/conversations/${c.body.data._id}`);
    expect(conv.body.data.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(conv.body.data.title).toBe('Aaj kitni applications aayin?');
    expect((await AgentUsageModel.findOne({}).lean())!.messages).toBe(1);
  });

  it('gives an institution only its own tools and data, and only on a plan with the copilot', async () => {
    const basic = await createInstitution(`ab${Math.random().toString(36).slice(2, 6)}`);
    expect((await basic.as.post('/agent/conversations')).status).toBe(403);
    const inst = await createInstitution(`ai${Math.random().toString(36).slice(2, 6)}`, {
      plan: await copilotPlan(),
    });
    const other = await createInstitution(`ot${Math.random().toString(36).slice(2, 6)}`);
    await ApplicationModel.create({
      institutionId: other.inst._id,
      campaignId: oid(),
      applicantId: oid(),
      applicationNumber: 'OTHER-99',
      status: 'SUBMITTED',
      preferences: [],
      submittedAt: new Date(),
      snapshot: { profile: { fullName: 'Hidden Person' } },
    } as never);
    const fake = new FakeProvider([
      {
        toolCalls: [
          { id: '1', name: 'find_application', args: { query: 'OTHER-99' } },
          { id: '2', name: 'list_institutions', args: {} },
        ],
      },
      { content: 'Not found.' },
    ]);
    setProvider(fake);
    const c = await inst.as.post('/agent/conversations');
    await inst.as.post(`/agent/conversations/${c.body.data._id}/messages`).send({ message: 'Find OTHER-99' });
    const names = fake.calls[0]!.tools.map((t) => t.name);
    expect(names).toContain('find_application');
    expect(names).not.toContain('list_institutions');
    expect(names).not.toContain('send_renewal_reminder');
    const results = fake.calls[1]!.messages.filter((m) => m.role === 'tool');
    expect(JSON.parse(results[0]!.content)).toEqual([]);
    expect(JSON.parse(results[1]!.content).error).toMatch(/not allowed/);
    expect(fake.calls[0]!.messages[0]!.content).toContain(inst.inst.name);
    const officer = await createUser(`off.${inst.id}@x.test`);
    expect(officer).toBeTruthy();
  });

  it('prepares an action, does nothing until it is confirmed, then runs it', async () => {
    const inst = await createInstitution(`ac${Math.random().toString(36).slice(2, 6)}`, {
      plan: await copilotPlan(),
    });
    const applicant = await createUser(`stud.${inst.id}@example.com`, 'APPLICANT');
    await OfferModel.create({
      institutionId: inst.inst._id,
      campaignId: oid(),
      meritListId: oid(),
      entryId: oid(),
      applicationId: oid(),
      applicantId: applicant._id,
      programId: oid(),
      shift: 'MORNING',
      deadline: new Date(Date.now() + 864e5),
      status: 'OFFERED',
    });
    setProvider(
      new FakeProvider([
        { toolCalls: [{ id: '1', name: 'remind_offer_deadline', args: { withinDays: 2 } }] },
        { content: 'I prepared the reminder; press Confirm.' },
      ]),
    );
    const c = await inst.as.post('/agent/conversations');
    const r = await inst.as
      .post(`/agent/conversations/${c.body.data._id}/messages`)
      .send({ message: 'Remind expiring offers' });
    const action = r.body.data.events.find((e: { type: string }) => e.type === 'action').action;
    expect(action.summary).toContain('Remind 1 applicant');
    expect(await NotificationModel.countDocuments({ userId: applicant._id })).toBe(0);
    const done = await inst.as.post(`/agent/actions/${action._id}/confirm`);
    expect(done.body.data.status).toBe('DONE');
    expect(await NotificationModel.countDocuments({ userId: applicant._id, type: 'REMINDER' })).toBe(1);
    expect(sentMails.some((m) => m.to === applicant.email)).toBe(true);
    expect((await inst.as.post(`/agent/actions/${action._id}/confirm`)).status).toBe(409);
    const conv = await inst.as.get(`/agent/conversations/${c.body.data._id}`);
    expect(conv.body.data.messages.at(-1).content).toMatch(/^Done:/);

    setProvider(
      new FakeProvider([
        { toolCalls: [{ id: '1', name: 'remind_offer_deadline', args: {} }] },
        { content: 'Prepared.' },
      ]),
    );
    const r2 = await inst.as
      .post(`/agent/conversations/${c.body.data._id}/messages`)
      .send({ message: 'again' });
    const a2 = r2.body.data.events.find((e: { type: string }) => e.type === 'action').action;
    expect((await inst.as.post(`/agent/actions/${a2._id}/cancel`)).body.data.status).toBe('CANCELLED');
    expect(await AgentActionModel.countDocuments({ status: 'DONE' })).toBe(1);
  });

  it('stops at the daily message limit', async () => {
    const root = await superAdminToken();
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${root}`);
    await AgentUsageModel.create({ userId: me.body.data.user.id, date: pktDay(), messages: 200 });
    setProvider(new FakeProvider([{ content: 'x' }]));
    const c = await api().post('/api/v1/platform/agent/conversations').set('Authorization', `Bearer ${root}`);
    const r = await api()
      .post(`/api/v1/platform/agent/conversations/${c.body.data._id}/messages`)
      .set('Authorization', `Bearer ${root}`)
      .send({ message: 'hi' });
    expect(r.status).toBe(429);
    expect(await ConversationModel.countDocuments()).toBe(1);
  });
});

describe('integrity alerts and briefings (AGENT-5, AGENT-6, AGENT-7)', () => {
  it('flags payments below the challan and marks confirmed despite registry differences, once each', async () => {
    const inst = await createInstitution(`ir${Math.random().toString(36).slice(2, 6)}`);
    const v = await VoucherModel.create({
      institutionId: inst.inst._id,
      applicationId: oid(),
      applicantId: oid(),
      voucherNumber: `V-${inst.id.slice(-5)}`,
      type: 'APPLICATION',
      amount: 3000,
      dueDate: new Date(),
    });
    await PaymentModel.create({
      institutionId: inst.inst._id,
      voucherId: v._id,
      applicationId: v.applicationId,
      applicantId: v.applicantId,
      method: 'BANK_DEPOSIT',
      reference: 'LOW-1',
      amount: 1000,
      paidOn: new Date(),
      proofFileId: oid(),
      status: 'VERIFIED',
      decidedAt: new Date(),
    });
    await VerificationModel.create({
      recordId: oid(),
      userId: oid(),
      institutionId: inst.inst._id,
      method: 'OFFICER',
      status: 'VERIFIED',
      diff: [{ field: 'obtained', entered: 900, official: 800 }],
    });
    const f = await refreshAlerts({ institutionId: inst.inst._id });
    expect(f.map((x) => x.code).sort()).toEqual([
      'PAYMENT_BELOW_CHALLAN',
      'VERIFIED_DESPITE_REGISTRY_DIFFERENCE',
    ]);
    await refreshAlerts({ institutionId: inst.inst._id });
    expect(await IntegrityAlertModel.countDocuments()).toBe(2);
    const list = await api()
      .get('/api/v1/platform/agent/alerts')
      .set('Authorization', `Bearer ${await superAdminToken()}`);
    expect(list.body.data.every((a: { severity: string }) => a.severity === 'HIGH')).toBe(true);
  });

  it('records platform fees on renewal and sends the daily briefings', async () => {
    const root = await superAdminToken();
    const inst = await createInstitution(`br${Math.random().toString(36).slice(2, 6)}`, {
      plan: await copilotPlan(),
    });
    const plan = await PlanModel.findById(inst.plan._id).lean();
    await api()
      .post(`/api/v1/platform/institutions/${inst.id}/renew`)
      .set('Authorization', `Bearer ${root}`)
      .send({ months: 3, reference: 'IBFT-778' });
    const fee = await SubscriptionPaymentModel.findOne({ institutionId: inst.inst._id }).lean();
    expect(fee).toMatchObject({ months: 3, amount: plan!.priceMonthly * 3, reference: 'IBFT-778' });
    const made = await runDailyBriefings('2026-11-20');
    expect(made).toBe(2);
    const b = await BriefingModel.findOne({ scope: 'PLATFORM' }).lean();
    expect(b!.highlights.join(' ')).toContain('Platform fees received: 1 payment(s)');
    expect(await NotificationModel.countDocuments({ type: 'BRIEFING' })).toBeGreaterThanOrEqual(2);
    expect(await runDailyBriefings('2026-11-20')).toBe(0);
  });
});

describe('offline provider for development (AGENT-1)', () => {
  it('runs the real tools and summarises their result without an API key', async () => {
    const { MockProvider } = await import('../src/modules/agent/providers/mock.js');
    setProvider(new MockProvider());
    const root = await superAdminToken();
    const c = await api().post('/api/v1/platform/agent/conversations').set('Authorization', `Bearer ${root}`);
    const r = await api()
      .post(`/api/v1/platform/agent/conversations/${c.body.data._id}/messages`)
      .set('Authorization', `Bearer ${root}`)
      .send({ message: 'Any suspicious activity?' });
    expect(r.body.data.events[0]).toMatchObject({ type: 'tool', name: 'integrity_alerts' });
    expect(r.body.data.message.content).toContain('Here is what I found');
  });

  it('answers greetings and small talk warmly without tools', async () => {
    const { MockProvider } = await import('../src/modules/agent/providers/mock.js');
    setProvider(new MockProvider());
    const root = await superAdminToken();
    const c = await api().post('/api/v1/platform/agent/conversations').set('Authorization', `Bearer ${root}`);
    const ask = (message: string) =>
      api()
        .post(`/api/v1/platform/agent/conversations/${c.body.data._id}/messages`)
        .set('Authorization', `Bearer ${root}`)
        .send({ message });
    const hello = await ask('Hello!');
    expect(hello.body.data.events.filter((e: { type: string }) => e.type === 'tool')).toHaveLength(0);
    expect(hello.body.data.message.content).toMatch(/^Hello .*I am Mitra/);
    const howAreYou = await ask('How are you?');
    expect(howAreYou.body.data.message.content).toContain('I am doing great');
    const salam = await ask('Assalam o Alaikum, aap kaise hain?');
    expect(salam.body.data.message.content).toContain('Main bilkul theek hoon');
    const thanks = await ask('shukriya');
    expect(thanks.body.data.message.content).toContain('Koi baat nahi');
    const local = await ask('aaj koi suspicious alert hai kya?');
    expect(local.body.data.events[0]).toMatchObject({ type: 'tool', name: 'integrity_alerts' });
    expect(local.body.data.message.content).toContain('Yeh raha jo mujhe mila');
  });

  it('detects the language of a message', async () => {
    const { isLocalLanguage } = await import('../src/modules/agent/providers/mock.js');
    expect(isLocalLanguage('aaj kitni applications aayi hain?')).toBe(true);
    expect(isLocalLanguage('kaise ho')).toBe(true);
    expect(isLocalLanguage('How many applications arrived today?')).toBe(false);
    expect(isLocalLanguage('Show pending payments')).toBe(false);
  });
});
