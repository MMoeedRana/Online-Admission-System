import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { brand } from '../../lib/brand';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mailer';
import { InstitutionModel, subscriptionState } from '../institutions/institution.model';
import { notify } from '../notifications/notify';
import { PlanModel } from '../plans/plan.model';
import { UserModel } from '../users/user.model';
import { BriefingModel, IntegrityAlertModel } from './agent.models';
import { adminUserIds, refreshAlerts } from './integrity.rules';
import { getProvider } from './providers';
import { pktDay, type AgentContext } from './tools/common';
import { readTools } from './tools/read';

const tool = (name: string) => readTools.find((t) => t.name === name)!;

function systemCtx(
  scope: 'PLATFORM' | 'INSTITUTION',
  institutionId: Types.ObjectId | null,
  name = '',
): AgentContext {
  const req = { auth: { userId: '', name: brand().agentName }, ip: '' } as unknown as Request;
  return {
    req,
    scope,
    userId: '',
    userName: brand().agentName,
    institutionId,
    institutionName: name,
    permissions: [],
  };
}

const n = (v: unknown) => Number(v ?? 0);

async function summarise(kind: string, highlights: string[]) {
  const provider = getProvider();
  if (!provider || provider.name === 'mock' || !highlights.length)
    return { summary: highlights.join(' '), generatedBy: 'TEMPLATE' as const };
  try {
    const r = await provider.chat({
      messages: [
        {
          role: 'system',
          content: `You are ${brand().agentName}. Write a short morning briefing (3 to 5 sentences, plain English, no headings) for the ${kind}. Use only the facts given. Mention what needs attention first.`,
        },
        { role: 'user', content: highlights.join('\n') },
      ],
      tools: [],
      maxTokens: 400,
    });
    return { summary: r.content.trim() || highlights.join(' '), generatedBy: 'AI' as const };
  } catch (err) {
    logger.warn({ err }, 'Briefing summary failed; using the template');
    return { summary: highlights.join(' '), generatedBy: 'TEMPLATE' as const };
  }
}

export async function platformBriefing(date = pktDay()) {
  const ctx = systemCtx('PLATFORM', null);
  const overview = (await tool('get_overview').run(ctx, { days: 1 })) as Record<string, unknown>;
  const subs = (await tool('subscriptions_and_fees').run(ctx, { days: 1 })) as Record<string, unknown>;
  await refreshAlerts({ days: 30 });
  const alerts = await IntegrityAlertModel.find({ status: 'OPEN' }).sort({ severity: 1 }).limit(10).lean();
  const ending = subs.endingWithin30Days as { institution: string; ends: string }[];
  const grace = subs.inGracePeriod as string[];
  const fees = overview.platformFeesReceived as { payments: number; amount: string };
  const h: string[] = [];
  h.push(
    `In the last 24 hours ${n(overview.newApplicantAccounts)} applicant account(s) were created and ${n(overview.applicationsSubmitted)} application(s) were submitted.`,
  );
  h.push(
    `${n(overview.paymentsVerified)} payment(s) were verified (${overview.amountVerified}) and ${n(overview.enrollments)} student(s) enrolled.`,
  );
  if (fees.payments) h.push(`Platform fees received: ${fees.payments} payment(s), ${fees.amount}.`);
  if (ending.length)
    h.push(
      `Subscriptions ending within 30 days: ${ending.map((e) => `${e.institution} (${e.ends})`).join(', ')}.`,
    );
  if (grace.length) h.push(`In the grace period: ${grace.join(', ')}.`);
  if (n(overview.paymentProofsWaiting))
    h.push(`${n(overview.paymentProofsWaiting)} proof(s) of payment are waiting for finance offices.`);
  if (n(overview.openSupportTickets)) h.push(`${n(overview.openSupportTickets)} support ticket(s) are open.`);
  const high = alerts.filter((a) => a.severity === 'HIGH');
  if (alerts.length)
    h.push(
      `${alerts.length} integrity alert(s) are open${high.length ? `, ${high.length} of high importance` : ''}: ${alerts
        .slice(0, 3)
        .map((a) => a.title.toLowerCase())
        .join('; ')}.`,
    );
  const { summary, generatedBy } = await summarise(`Super Admin of ${brand().platformName}`, h);
  const b = await BriefingModel.findOneAndUpdate(
    { scope: 'PLATFORM', institutionId: null, date },
    {
      $set: {
        figures: { overview, subscriptions: subs, alerts: alerts.length },
        highlights: h,
        summary,
        generatedBy,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  return b!;
}

export async function institutionBriefing(institutionId: Types.ObjectId, date = pktDay()) {
  const inst = await InstitutionModel.findById(institutionId).lean();
  if (!inst) return null;
  const ctx = systemCtx('INSTITUTION', inst._id, inst.name);
  const overview = (await tool('get_overview').run(ctx, { days: 1 })) as Record<string, unknown>;
  const merit = (await tool('merit_and_offers')
    .run(ctx, {})
    .catch(() => null)) as { campaign?: string; seats?: { freeSeats: number }[] } | null;
  await refreshAlerts({ institutionId: inst._id, days: 30 });
  const alerts = await IntegrityAlertModel.countDocuments({ institutionId: inst._id, status: 'OPEN' });
  const h: string[] = [];
  h.push(
    `In the last 24 hours ${n(overview.applicationsSubmitted)} application(s) were submitted, ${n(overview.paymentsVerified)} payment(s) verified (${overview.amountVerified}) and ${n(overview.enrollments)} student(s) enrolled.`,
  );
  if (n(overview.paymentProofsWaiting))
    h.push(`${n(overview.paymentProofsWaiting)} proof(s) of payment wait for verification.`);
  if (n(overview.marksRecordsWaitingForOfficer))
    h.push(`${n(overview.marksRecordsWaitingForOfficer)} marks record(s) wait for an officer.`);
  if (n(overview.offersWaitingForAnswer))
    h.push(`${n(overview.offersWaitingForAnswer)} offer(s) wait for the applicant's answer.`);
  if (n(overview.draftsNotSubmitted))
    h.push(`${n(overview.draftsNotSubmitted)} application(s) were started but not submitted.`);
  if (merit?.seats?.length)
    h.push(
      `${merit.seats.reduce((s, x) => s + x.freeSeats, 0)} seat(s) are still free in ${merit.campaign}.`,
    );
  if (alerts) h.push(`${alerts} integrity alert(s) need a review.`);
  if (subscriptionState(inst) !== 'ACTIVE')
    h.push(
      `The subscription state is ${subscriptionState(inst).replace('_', ' ').toLowerCase()}; please renew it.`,
    );
  const { summary, generatedBy } = await summarise(`admin of ${inst.name}`, h);
  const b = await BriefingModel.findOneAndUpdate(
    { scope: 'INSTITUTION', institutionId: inst._id, date },
    { $set: { figures: { overview, alerts }, highlights: h, summary, generatedBy } },
    { upsert: true, returnDocument: 'after' },
  );
  return b;
}

async function deliver(userIds: unknown[], title: string, summary: string, link: string) {
  const users = await UserModel.find({ _id: { $in: userIds }, status: 'ACTIVE' })
    .select('email')
    .lean();
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  for (const u of users) {
    await notify(u._id, { type: 'BRIEFING', title, body: summary.slice(0, 300), link });
    await sendMail({
      to: u.email,
      subject: title,
      heading: esc(title),
      paragraphs: [esc(summary)],
      action: { label: 'Open the briefing', url: `${env.WEB_URL}${link}` },
    });
  }
}

export async function runDailyBriefings(date = pktDay()) {
  let made = 0;
  if (!(await BriefingModel.exists({ scope: 'PLATFORM', institutionId: null, date }))) {
    const b = await platformBriefing(date);
    const admins = await UserModel.find({ platformRole: 'SUPER_ADMIN', status: 'ACTIVE' }).distinct('_id');
    await deliver(admins, `${brand().agentName} briefing for ${date}`, b.summary, '/platform/mitra');
    made++;
  }
  const plans = await PlanModel.find({ 'features.aiBriefing': true }).distinct('_id');
  const insts = await InstitutionModel.find({ status: 'ACTIVE', planId: { $in: plans } })
    .select('_id name')
    .lean();
  for (const i of insts) {
    if (await BriefingModel.exists({ scope: 'INSTITUTION', institutionId: i._id, date })) continue;
    const b = await institutionBriefing(i._id, date);
    if (b)
      await deliver(
        await adminUserIds(i._id),
        `${brand().agentName} briefing for ${i.name}, ${date}`,
        b.summary,
        '/institution/mitra',
      );
    made++;
  }
  return made;
}

export function startBriefingJob() {
  const tick = async () => {
    const hour = new Date(Date.now() + 5 * 3600_000).getUTCHours();
    if (hour < env.AI_BRIEFING_HOUR) return;
    const made = await runDailyBriefings();
    if (made) logger.info({ made }, 'Daily briefings created');
  };
  const timer = setInterval(
    () => void tick().catch((err) => logger.error({ err }, 'Briefing job failed')),
    10 * 60_000,
  );
  timer.unref();
  void tick().catch((err) => logger.error({ err }, 'Briefing job failed'));
  return timer;
}
