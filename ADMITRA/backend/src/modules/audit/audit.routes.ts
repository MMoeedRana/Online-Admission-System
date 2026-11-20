import { Router, type Request } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { sendCsv } from '../../lib/csv';
import { ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { objectId, parse } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { requirePermission } from '../../middleware/tenant';
import { InstitutionModel } from '../institutions/institution.model';
import { AuditLogModel } from './audit.model';

const auditQuery = paginationQuery.extend({
  action: z.string().trim().max(60).optional(),
  entity: z.string().trim().max(60).optional(),
  actorId: objectId.optional(),
  institutionId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
type AuditQuery = z.infer<typeof auditQuery>;

function auditFilter(q: AuditQuery, base: Record<string, unknown>) {
  const f: Record<string, unknown> = { ...base };
  if (q.action) f.action = q.action;
  if (q.entity) f.entity = q.entity;
  if (q.actorId) f.actorId = q.actorId;
  if (q.from || q.to) {
    const to = q.to ? new Date(q.to.getTime() + 24 * 3600_000 - 1) : undefined;
    f.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(to ? { $lte: to } : {}) };
  }
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    f.$or = [{ action: rx }, { actorName: rx }, { entity: rx }, { entityId: rx }];
  }
  return f;
}

async function list(req: Request, base: Record<string, unknown>) {
  const q = parse(auditQuery, req.query);
  const filter = auditFilter(q, base);
  const [items, total, actions, entities] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
    AuditLogModel.distinct('action', base),
    AuditLogModel.distinct('entity', base),
  ]);
  return {
    q,
    items,
    meta: { ...pageMeta(q.page, q.limit, total), actions: actions.sort(), entities: entities.sort() },
  };
}

async function exportCsv(req: Request, res: Parameters<typeof sendCsv>[0], base: Record<string, unknown>) {
  const q = parse(auditQuery, req.query);
  const items = await AuditLogModel.find(auditFilter(q, base)).sort({ createdAt: -1 }).limit(20000).lean();
  const insts = await InstitutionModel.find({
    _id: { $in: items.map((a) => a.institutionId).filter(Boolean) },
  })
    .select('name')
    .lean();
  sendCsv(
    res,
    'audit-log.csv',
    ['Time', 'Actor', 'Institution', 'Action', 'Entity', 'Entity id', 'IP address', 'Changes'],
    items.map((a) => [
      a.createdAt,
      a.actorName || 'System',
      insts.find((i) => String(i._id) === String(a.institutionId))?.name ?? '',
      a.action,
      a.entity,
      a.entityId,
      a.ip,
      a.changes ? JSON.stringify(a.changes) : '',
    ]),
  );
}

export const institutionAuditRouter = Router();
institutionAuditRouter.use(requirePermission(PERMISSIONS.AUDIT_VIEW));
institutionAuditRouter.get('/', async (req, res) => {
  const r = await list(req, { institutionId: req.tenant!.institution._id });
  ok(res, r.items, r.meta);
});
institutionAuditRouter.get('/export.csv', (req, res) =>
  exportCsv(req, res, { institutionId: req.tenant!.institution._id }),
);

export const platformAuditRouter = Router();
platformAuditRouter.use(authenticate, requireSuperAdmin);
const platformBase = (req: Request) => {
  const id = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  return id ? { institutionId: parse(objectId, id) } : {};
};
platformAuditRouter.get('/', async (req, res) => {
  const r = await list(req, platformBase(req));
  const insts = await InstitutionModel.find({
    _id: { $in: r.items.map((a) => a.institutionId).filter(Boolean) },
  })
    .select('name shortName')
    .lean();
  ok(
    res,
    r.items.map((a) => ({
      ...a,
      institution: insts.find((i) => String(i._id) === String(a.institutionId)) ?? null,
    })),
    r.meta,
  );
});
platformAuditRouter.get('/export.csv', (req, res) => exportCsv(req, res, platformBase(req)));
