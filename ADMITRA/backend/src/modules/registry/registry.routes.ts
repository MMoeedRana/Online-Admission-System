import { Router, type Request } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { ok, created } from '../../lib/http';
import { pageMeta, paginationQuery } from '../../lib/pagination';
import { upload } from '../../lib/storage';
import { idParams, parse } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { requirePermission } from '../../middleware/tenant';
import { RegistryBatchModel } from './registry.models';
import { commitImport, parseRegistryFile, rollbackBatch, ROLLBACK_DAYS } from './registry.service';

const sourceBody = z.object({
  source: z.string().trim().min(5, 'Describe the official source of the file.').max(300),
});

function routes(scope: (req: Request) => { institutionId: string | null; onlyLevel?: 'ENTRY_TEST' }) {
  const r = Router();
  r.post('/preview', upload.single('file'), async (req, res) => {
    const s = scope(req);
    const p = await parseRegistryFile(req.file, s);
    ok(res, { summary: p.summary, errors: p.errors.slice(0, 200), sample: p.valid.slice(0, 5) });
  });
  r.post('/import', upload.single('file'), async (req, res) => {
    const { source } = parse(sourceBody, req.body);
    created(res, await commitImport(req, req.file, source, scope(req)));
  });
  r.get('/batches', async (req, res) => {
    const q = parse(paginationQuery, req.query);
    const filter = { institutionId: scope(req).institutionId };
    const [items, total] = await Promise.all([
      RegistryBatchModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .populate('uploadedBy', 'fullName')
        .lean(),
      RegistryBatchModel.countDocuments(filter),
    ]);
    const now = Date.now();
    ok(
      res,
      items.map((b) => ({
        ...b,
        canRollback: b.status === 'ACTIVE' && now - new Date(b.createdAt!).getTime() <= ROLLBACK_DAYS * 864e5,
      })),
      pageMeta(q.page, q.limit, total),
    );
  });
  r.post('/batches/:id/rollback', async (req, res) => {
    const { id } = parse(idParams, req.params);
    ok(res, await rollbackBatch(req, id, scope(req).institutionId));
  });
  return r;
}

/** REG-1: board result gazettes imported by the super admin. */
export const platformRegistryRouter = Router();
platformRegistryRouter.use(
  authenticate,
  requireSuperAdmin,
  routes(() => ({ institutionId: null })),
);

/** REG-5: an institution's own entry-test results, private to that institution. */
export const institutionRegistryRouter = Router();
institutionRegistryRouter.use(
  requirePermission(PERMISSIONS.INSTITUTION_SETTINGS),
  routes((req) => ({ institutionId: req.tenant!.institutionId, onlyLevel: 'ENTRY_TEST' })),
);
