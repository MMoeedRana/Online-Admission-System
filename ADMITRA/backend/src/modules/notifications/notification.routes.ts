import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, ok } from '../../lib/http';
import { pageMeta, paginationQuery } from '../../lib/pagination';
import { idParams, parse } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/tenant';
import { EmailTemplateModel, NotificationModel } from './notification.models';
import { DEFAULT_TEMPLATES, TEMPLATE_VARIABLES, renderTemplate } from './templates';

/** Notifications of the signed-in user (any account type). */
export const notificationRouter = Router();
notificationRouter.use(authenticate);

notificationRouter.get('/', async (req, res) => {
  const q = parse(paginationQuery.extend({ unread: z.enum(['true', 'false']).optional() }), req.query);
  const filter: Record<string, unknown> = { userId: req.auth!.userId };
  if (q.unread === 'true') filter.readAt = null;
  const [items, total, unread] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ userId: req.auth!.userId, readAt: null }),
  ]);
  ok(res, items, { ...pageMeta(q.page, q.limit, total), unread });
});

notificationRouter.get('/unread-count', async (req, res) => {
  ok(res, { unread: await NotificationModel.countDocuments({ userId: req.auth!.userId, readAt: null }) });
});

notificationRouter.post('/read-all', async (req, res) => {
  await NotificationModel.updateMany({ userId: req.auth!.userId, readAt: null }, { readAt: new Date() });
  ok(res, { done: true });
});

notificationRouter.post('/:id/read', async (req, res) => {
  const { id } = parse(idParams, req.params);
  await NotificationModel.updateOne({ _id: id, userId: req.auth!.userId }, { readAt: new Date() });
  ok(res, { done: true });
});

/** NOTIF-3: institution e-mail templates (tenant routes). */
export const emailTemplateRouter = Router();
emailTemplateRouter.use(requirePermission(PERMISSIONS.INSTITUTION_SETTINGS));

emailTemplateRouter.get('/', async (req, res) => {
  const custom = await EmailTemplateModel.find({ institutionId: req.tenant!.institutionId }).lean();
  ok(
    res,
    Object.entries(DEFAULT_TEMPLATES).map(([key, d]) => {
      const c = custom.find((x) => x.key === key);
      return {
        key,
        name: d.name,
        subject: c?.subject ?? d.subject,
        body: c?.body ?? d.body,
        customized: Boolean(c),
        updatedAt: c?.updatedAt ?? null,
      };
    }),
    { variables: TEMPLATE_VARIABLES },
  );
});

const keyParams = z.object({ key: z.string().refine((k) => k in DEFAULT_TEMPLATES, 'Unknown template') });

emailTemplateRouter.put('/:key', async (req, res) => {
  const { key } = parse(keyParams, req.params);
  const body = parse(
    z.object({ subject: z.string().trim().min(3).max(200), body: z.string().trim().min(10).max(5000) }),
    req.body,
  );
  const unknown = [...`${body.subject} ${body.body}`.matchAll(/\{\{(\w+)\}\}/g)]
    .map((m) => m[1]!)
    .filter((v) => !(TEMPLATE_VARIABLES as readonly string[]).includes(v));
  if (unknown.length)
    throw ApiError.validation(`Unknown variable(s): ${unknown.join(', ')}`, {
      fields: { body: 'Unknown variable.' },
    });
  const t = await EmailTemplateModel.findOneAndUpdate(
    { institutionId: req.tenant!.institutionId, key },
    body,
    { upsert: true, returnDocument: 'after' },
  );
  await audit(req, 'EMAIL_TEMPLATE_UPDATED', 'EmailTemplate', t._id, { key });
  ok(res, t);
});

emailTemplateRouter.delete('/:key', async (req, res) => {
  const { key } = parse(keyParams, req.params);
  await EmailTemplateModel.deleteOne({ institutionId: req.tenant!.institutionId, key });
  await audit(req, 'EMAIL_TEMPLATE_RESET', 'EmailTemplate', key);
  ok(res, { reset: true });
});

emailTemplateRouter.post('/preview', async (req, res) => {
  const body = parse(z.object({ subject: z.string(), body: z.string() }), req.body);
  const vars = {
    applicantName: 'Ayesha Noor',
    institutionName: req.tenant!.institution.name,
    applicationNumber: 'CVU-F26-MAIN-00001',
    programName: 'BS Computer Science',
    campaignName: 'Fall 2026',
    amount: 'Rs. 2,500',
    receiptNumber: 'RCPT-2026-000001',
    note: 'The Intermediate result card is not readable.',
  };
  ok(res, { subject: renderTemplate(body.subject, vars), body: renderTemplate(body.body, vars) });
});
