import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { brand } from '../../lib/brand';
import { ApiError, created, ok } from '../../lib/http';
import { pageMeta, paginationQuery } from '../../lib/pagination';
import { fileStore } from '../../lib/file-store';
import { idParams, parse } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { requirePermission } from '../../middleware/tenant';
import { planOf } from '../institutions/limits';
import {
  AgentActionModel,
  AgentExportModel,
  BriefingModel,
  ConversationModel,
  IntegrityAlertModel,
  type AgentScope,
} from './agent.models';
import { contextFor, decideAction, runTurn, usageToday, type AgentEvent } from './agent.service';
import { institutionBriefing, platformBriefing } from './briefing.service';
import { institutionNames, refreshAlerts } from './integrity.rules';
import { aiStatus } from './providers';
import { pktDay } from './tools/common';

const SUGGESTIONS: Record<AgentScope, string[]> = {
  PLATFORM: [
    'Give me today’s briefing: applicants, applications, payments and enrollments.',
    'Which subscriptions end this month and which institutions paid their platform fee?',
    'Is there any suspicious or irregular activity at any institution?',
    'Show the support tickets whose first response is overdue.',
    'Compare the institutions by applications and enrollments.',
    'How is the Admission Advisor being used and what is the registry match rate?',
    'Make a list of all institutions with their plans as an Excel file.',
  ],
  INSTITUTION: [
    'How many applications did we receive today and how many are waiting for review?',
    'Show the admission funnel of our current campaign.',
    'Which payments are waiting for verification, and do any amounts not match the challan?',
    'How many seats are still free per program?',
    'Are there any integrity alerts we should look at?',
    'Remind applicants whose offer expires in the next two days.',
    'Export the payments waiting for verification to Excel.',
  ],
};

function agentRouter(scope: AgentScope) {
  const r = Router();
  const own = (req: Request) => ({
    userId: req.auth!.userId,
    scope,
    institutionId: scope === 'INSTITUTION' ? new Types.ObjectId(String(req.tenant!.institutionId)) : null,
  });

  r.get('/status', async (req, res) => {
    const s = aiStatus();
    let available = true;
    let reason = '';
    if (scope === 'INSTITUTION') {
      const plan = await planOf(req.tenant!.institution);
      available = Boolean(plan.features?.aiCopilot);
      if (!available)
        reason = `The ${brand().agentName} assistant is included in plans with AI Copilot (your plan: ${plan.name}).`;
    }
    ok(res, {
      agentName: brand().agentName,
      configured: s.configured,
      ...(scope === 'PLATFORM' ? { provider: s.provider, model: s.model } : {}),
      available,
      reason,
      usage: await usageToday(req.auth!.userId),
      suggestions: SUGGESTIONS[scope],
    });
  });

  r.get('/conversations', async (req, res) => {
    const list = await ConversationModel.find(own(req))
      .select('title lastMessageAt createdAt')
      .sort({ lastMessageAt: -1 })
      .limit(30)
      .lean();
    ok(res, list);
  });
  r.post('/conversations', async (req, res) => {
    await contextFor(req, scope);
    created(res, await ConversationModel.create({ ...own(req), title: 'New conversation' }));
  });
  r.get('/conversations/:id', async (req, res) => {
    const { id } = parse(idParams, req.params);
    const c = await ConversationModel.findOne({ _id: id, ...own(req) }).lean();
    if (!c) throw ApiError.notFound('Conversation');
    const actions = await AgentActionModel.find({ conversationId: c._id })
      .select('tool summary status result decidedAt')
      .lean();
    const fileIds = c.messages.flatMap((m) => (m as { fileIds?: Types.ObjectId[] }).fileIds ?? []);
    const files = new Map(
      (
        await AgentExportModel.find({ _id: { $in: fileIds }, userId: req.auth!.userId })
          .select('name format rows')
          .lean()
      ).map((f) => [String(f._id), { _id: String(f._id), name: f.name, format: f.format, rows: f.rows }]),
    );
    ok(res, {
      _id: c._id,
      title: c.title,
      messages: c.messages
        .filter((m) => m.role !== 'tool' && (m.content || m.actionId))
        .map((m) => ({
          _id: m._id,
          role: m.role,
          content: m.content,
          actionId: m.actionId,
          files: ((m as { fileIds?: Types.ObjectId[] }).fileIds ?? [])
            .map((id) => files.get(String(id)))
            .filter(Boolean),
          createdAt: (m as unknown as { createdAt: Date }).createdAt,
        })),
      steps: c.messages.filter((m) => m.role === 'tool').map((m) => ({ name: m.name, actionId: m.actionId })),
      actions,
    });
  });
  r.delete('/conversations/:id', async (req, res) => {
    const { id } = parse(idParams, req.params);
    const c = await ConversationModel.findOneAndDelete({ _id: id, ...own(req) });
    if (!c) throw ApiError.notFound('Conversation');
    await AgentActionModel.updateMany(
      { conversationId: c._id, status: 'PENDING' },
      { $set: { status: 'CANCELLED' } },
    );
    ok(res, { deleted: true });
  });

  r.post('/conversations/:id/messages', async (req: Request, res: Response) => {
    const { id } = parse(idParams, req.params);
    const { message } = parse(
      z.object({ message: z.string().trim().min(1, 'Write a message.').max(2000) }),
      req.body,
    );
    const ctx = await contextFor(req, scope);
    if (!req.headers.accept?.includes('text/event-stream')) {
      const events: AgentEvent[] = [];
      const last = await runTurn(ctx, id, message, (e) => events.push(e));
      return ok(res, { message: last, events });
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (e: AgentEvent | { type: 'done' }) =>
      res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    try {
      await runTurn(ctx, id, message, send);
    } catch (err) {
      send({ type: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
    send({ type: 'done' });
    res.end();
  });

  r.get('/exports/:id', async (req, res) => {
    const { id } = parse(idParams, req.params);
    const f = await AgentExportModel.findOne({ _id: id, ...own(req) }).lean();
    if (!f) throw ApiError.notFound('File');
    const body = await fileStore().get(f.storageKey);
    if (!body) throw ApiError.notFound('File');
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    body.pipe(res);
  });

  r.post('/actions/:id/:decision', async (req, res) => {
    const { id, decision } = parse(
      z.object({
        id: z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id'),
        decision: z.enum(['confirm', 'cancel']),
      }),
      req.params,
    );
    const ctx = await contextFor(req, scope);
    ok(res, await decideAction(ctx, id, decision === 'confirm'));
  });

  r.get('/alerts', async (req, res) => {
    const q = parse(
      paginationQuery.extend({
        status: z.enum(['OPEN', 'REVIEWED', 'DISMISSED']).optional(),
        refresh: z.coerce.boolean().optional(),
      }),
      req.query,
    );
    const base = scope === 'INSTITUTION' ? { institutionId: own(req).institutionId } : {};
    if (q.refresh) await refreshAlerts({ institutionId: base.institutionId ?? null });
    const f = { ...base, ...(q.status ? { status: q.status } : {}) };
    const [items, total, counts] = await Promise.all([
      IntegrityAlertModel.find(f)
        .sort({ status: 1, severity: 1, lastSeenAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      IntegrityAlertModel.countDocuments(f),
      IntegrityAlertModel.aggregate<{ _id: { status: string; severity: string }; n: number }>([
        { $match: base },
        { $group: { _id: { status: '$status', severity: '$severity' }, n: { $sum: 1 } } },
      ]),
    ]);
    const names = await institutionNames(items.map((a) => a.institutionId));
    ok(
      res,
      items.map((a) => ({ ...a, institution: a.institutionId ? names.get(String(a.institutionId)) : null })),
      { ...pageMeta(q.page, q.limit, total), counts },
    );
  });
  r.post('/alerts/:id/review', async (req, res) => {
    const { id } = parse(idParams, req.params);
    const b = parse(
      z.object({
        outcome: z.enum(['REVIEWED', 'DISMISSED', 'OPEN']),
        note: z.string().trim().max(500).default(''),
      }),
      req.body,
    );
    const a = await IntegrityAlertModel.findOneAndUpdate(
      { _id: id, ...(scope === 'INSTITUTION' ? { institutionId: own(req).institutionId } : {}) },
      {
        $set: {
          status: b.outcome,
          note: b.note,
          reviewedBy: req.auth!.userId,
          reviewedByName: req.auth!.name,
        },
      },
      { returnDocument: 'after' },
    );
    if (!a) throw ApiError.notFound('Alert');
    await audit(req, 'INTEGRITY_ALERT_REVIEWED', 'IntegrityAlert', a._id, b, {
      institutionId: a.institutionId as Types.ObjectId | null,
    });
    ok(res, a);
  });

  r.get('/briefings', async (req, res) => {
    const list = await BriefingModel.find({ scope, institutionId: own(req).institutionId })
      .sort({ date: -1 })
      .limit(14)
      .lean();
    ok(res, list);
  });
  r.post('/briefings/generate', async (req, res) => {
    if (scope === 'INSTITUTION') {
      const plan = await planOf(req.tenant!.institution);
      if (!plan.features?.aiBriefing && !plan.features?.aiCopilot)
        throw new ApiError(403, 'PLAN_FEATURE', `Daily briefings are not included in the ${plan.name} plan.`);
    }
    const b =
      scope === 'PLATFORM'
        ? await platformBriefing(pktDay())
        : await institutionBriefing(own(req).institutionId!, pktDay());
    ok(res, b);
  });
  return r;
}

export const platformAgentRouter = Router();
platformAgentRouter.use(authenticate, requireSuperAdmin, agentRouter('PLATFORM'));

export const institutionAgentRouter = Router();
institutionAgentRouter.use(requirePermission(PERMISSIONS.AI_COPILOT), agentRouter('INSTITUTION'));
