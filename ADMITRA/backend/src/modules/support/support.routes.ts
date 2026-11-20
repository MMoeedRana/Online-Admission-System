import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { idParams, objectId, parse } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { requirePermission } from '../../middleware/tenant';
import { InstitutionModel } from '../institutions/institution.model';
import { UserModel } from '../users/user.model';
import {
  RESPONSE_TARGET_HOURS,
  SupportTicketModel,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from './support.model';
import { applyStatus, openTicket, reply, view } from './support.service';

const message = z.string().trim().min(5, 'Write at least 5 characters.').max(5000);

const listQuery = paginationQuery.extend({
  status: z.enum([...TICKET_STATUSES, 'ACTIVE']).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
});

function listFilter(q: z.infer<typeof listQuery>, base: Record<string, unknown>) {
  const f: Record<string, unknown> = { ...base };
  if (q.status === 'ACTIVE') f.status = { $in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_INSTITUTION'] };
  else if (q.status) f.status = q.status;
  if (q.priority) f.priority = q.priority;
  if (q.category) f.category = q.category;
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    f.$or = [{ ticketNumber: rx }, { subject: rx }];
  }
  return f;
}

async function counts(base: Record<string, unknown>) {
  const rows = await SupportTicketModel.aggregate<{ _id: string; n: number }>([
    { $match: base },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const overdue = await SupportTicketModel.countDocuments({
    ...base,
    firstResponseAt: null,
    status: { $in: ['OPEN', 'IN_PROGRESS'] },
    responseDueAt: { $lt: new Date() },
  });
  return {
    ...Object.fromEntries(TICKET_STATUSES.map((s) => [s, rows.find((r) => r._id === s)?.n ?? 0])),
    overdue,
  };
}

// ---------------- Institution side (SUP-2: only its own tickets) ----------------
export const institutionSupportRouter = Router();
institutionSupportRouter.use(requirePermission(PERMISSIONS.SUPPORT_TICKETS));

institutionSupportRouter.get('/meta', (_req, res) => {
  ok(res, {
    categories: TICKET_CATEGORIES,
    priorities: TICKET_PRIORITIES,
    statuses: TICKET_STATUSES,
    targets: RESPONSE_TARGET_HOURS,
  });
});

institutionSupportRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const base = { institutionId: req.tenant!.institution._id };
  const filter = listFilter(q, base);
  const [items, total, c] = await Promise.all([
    SupportTicketModel.find(filter)
      .sort({ lastActivityAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    SupportTicketModel.countDocuments(filter),
    counts(base),
  ]);
  ok(
    res,
    items.map((t) => view(t, false)),
    { ...pageMeta(q.page, q.limit, total), counts: c },
  );
});

institutionSupportRouter.post('/', async (req, res) => {
  const b = parse(
    z.object({
      subject: z.string().trim().min(5, 'Write a short subject (at least 5 characters).').max(150),
      category: z.enum(TICKET_CATEGORIES, { message: 'Choose a category.' }),
      priority: z.enum(TICKET_PRIORITIES).default('NORMAL'),
      message,
    }),
    req.body,
  );
  created(res, view(await openTicket(req, b)));
});

institutionSupportRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const t = await SupportTicketModel.findOne({ _id: id, institutionId: req.tenant!.institutionId }).lean();
  if (!t) throw ApiError.notFound('Ticket');
  ok(res, view(t));
});

institutionSupportRouter.post('/:id/replies', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = parse(z.object({ message, status: z.enum(['OPEN', 'CLOSED']).optional() }), req.body);
  ok(res, view(await reply(req, id, 'INSTITUTION', b, { institutionId: req.tenant!.institutionId })));
});

/** The institution confirms a resolved ticket and closes it, without writing a reply. */
institutionSupportRouter.post('/:id/close', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const t = await SupportTicketModel.findOne({ _id: id, institutionId: req.tenant!.institutionId });
  if (!t) throw ApiError.notFound('Ticket');
  applyStatus(t, 'CLOSED');
  t.lastActivityAt = new Date();
  await t.save();
  await audit(req, 'SUPPORT_TICKET_CLOSED', 'SupportTicket', t._id);
  ok(res, view(t));
});

// ---------------- Platform side (Super Admin) ----------------
export const platformSupportRouter = Router();
platformSupportRouter.use(authenticate, requireSuperAdmin);

platformSupportRouter.get('/', async (req, res) => {
  const q = parse(
    listQuery.extend({ institutionId: objectId.optional(), overdue: z.coerce.boolean().optional() }),
    req.query,
  );
  const base: Record<string, unknown> = {};
  if (q.institutionId) base.institutionId = q.institutionId;
  const filter = listFilter(q, base);
  if (q.overdue) {
    filter.firstResponseAt = null;
    filter.status = { $in: ['OPEN', 'IN_PROGRESS'] };
    filter.responseDueAt = { $lt: new Date() };
  }
  const [items, total, c] = await Promise.all([
    SupportTicketModel.find(filter)
      .sort({ lastActivityAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    SupportTicketModel.countDocuments(filter),
    counts(base),
  ]);
  const insts = await InstitutionModel.find({ _id: { $in: items.map((t) => t.institutionId) } })
    .select('name shortName')
    .lean();
  ok(
    res,
    items.map((t) => ({
      ...view(t, false),
      institution: insts.find((i) => String(i._id) === String(t.institutionId)) ?? null,
    })),
    { ...pageMeta(q.page, q.limit, total), counts: c },
  );
});

platformSupportRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const t = await SupportTicketModel.findById(id).lean();
  if (!t) throw ApiError.notFound('Ticket');
  const inst = await InstitutionModel.findById(t.institutionId).select('name shortName city contact').lean();
  ok(res, { ...view(t), institution: inst });
});

platformSupportRouter.post('/:id/replies', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = parse(
    z.object({
      message,
      status: z.enum(['IN_PROGRESS', 'WAITING_ON_INSTITUTION', 'RESOLVED', 'CLOSED']).optional(),
    }),
    req.body,
  );
  ok(res, view(await reply(req, id, 'PLATFORM', b)));
});

/** Changes the status, priority or assignee without a reply. */
platformSupportRouter.patch('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = parse(
    z.object({
      status: z.enum(TICKET_STATUSES).optional(),
      priority: z.enum(TICKET_PRIORITIES).optional(),
      assignToMe: z.boolean().optional(),
    }),
    req.body,
  );
  const t = await SupportTicketModel.findById(id);
  if (!t) throw ApiError.notFound('Ticket');
  if (b.status) applyStatus(t, b.status);
  if (b.priority && b.priority !== t.priority) {
    t.priority = b.priority;
    // A new priority moves the response target, counted from when the ticket was opened.
    if (!t.firstResponseAt)
      t.responseDueAt = new Date(t.createdAt.getTime() + RESPONSE_TARGET_HOURS[b.priority] * 3600_000);
  }
  if (b.assignToMe) {
    const me = await UserModel.findById(req.auth!.userId).select('fullName').lean();
    t.assignedTo = me!._id;
    t.assignedToName = me!.fullName;
  }
  t.lastActivityAt = new Date();
  await t.save();
  await audit(req, 'SUPPORT_TICKET_UPDATED', 'SupportTicket', t._id, b, { institutionId: t.institutionId });
  ok(res, view(t));
});
