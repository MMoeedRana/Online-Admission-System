import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  DEGREE_LEVELS,
  INSTITUTION_TYPES,
  PROVINCES,
  QUALIFICATION_LEVELS,
  SECTORS,
  SHIFTS,
} from '../../constants/enums';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { MERIT_COMPONENTS } from '../../lib/merit';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { slugify } from '../../lib/slug';
import { upload } from '../../lib/storage';
import type { Id } from '../../lib/types';
import { idParams, objectId, parse } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { requirePermission } from '../../middleware/tenant';
import { readTable } from '../registry/registry.service';
import { AdvisorLogModel, DirInstitutionModel, DirProgramModel, MeritHistoryModel } from './directory.models';
import { ensureDirectoryInstitution } from './directory.service';

function sent<T extends object>(parsed: T, body: unknown): Partial<T> {
  const keys = new Set(Object.keys((body ?? {}) as object));
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => keys.has(k))) as Partial<T>;
}

const url = z.string().trim().max(300).url('Enter a full web address (https://...).').or(z.literal(''));

const institutionBody = z.object({
  name: z.string().trim().min(3).max(150),
  shortName: z.string().trim().max(20).default(''),
  type: z.enum(INSTITUTION_TYPES),
  sector: z.enum(SECTORS),
  city: z.string().trim().min(2).max(60),
  province: z.enum(PROVINCES),
  website: url.default(''),
  about: z.string().trim().max(1000).default(''),
  campuses: z
    .array(z.object({ name: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(60) }))
    .max(20)
    .default([]),
  status: z.enum(['ACTIVE', 'HIDDEN']).default('ACTIVE'),
});

const programBody = z.object({
  directoryInstitutionId: objectId,
  title: z.string().trim().min(3).max(150),
  degreeLevel: z.enum(DEGREE_LEVELS),
  fieldGroup: z.string().trim().max(60).default(''),
  durationYears: z.coerce.number().min(1).max(8).default(4),
  feePerSemester: z.coerce.number().min(0).max(5_000_000).default(0),
  shifts: z.array(z.enum(SHIFTS)).min(1).default(['MORNING']),
  seats: z.coerce.number().int().min(0).max(10000).default(0),
  eligibility: z
    .array(
      z.object({
        level: z.enum(QUALIFICATION_LEVELS),
        minPercentage: z.coerce.number().min(0).max(100),
        groups: z.array(z.string().trim().max(60)).default([]),
      }),
    )
    .max(6)
    .default([]),
  formula: z
    .array(z.object({ component: z.enum(MERIT_COMPONENTS), weight: z.coerce.number().positive().max(100) }))
    .max(6)
    .default([])
    .refine(
      (f) => !f.length || Math.round(f.reduce((s, x) => s + x.weight, 0)) === 100,
      'Formula weights must total 100.',
    ),
  testName: z.string().trim().max(60).default(''),
  admissionMonths: z.array(z.coerce.number().int().min(1).max(12)).max(12).default([]),
  applyUrl: url.default(''),
  status: z.enum(['ACTIVE', 'HIDDEN']).default('ACTIVE'),
});

const historyBody = z
  .object({
    directoryProgramId: objectId,
    year: z.coerce.number().int().min(2000).max(2100),
    round: z.coerce.number().int().min(1).max(20).default(1),
    shift: z.enum(SHIFTS).default('MORNING'),
    quota: z.string().trim().min(2).max(40).default('OPEN'),
    openingMerit: z.coerce.number().min(0).max(100).nullable().default(null),
    closingMerit: z.coerce.number().min(0).max(100),
    seats: z.coerce.number().int().min(0).max(10000).nullable().default(null),
    source: z
      .string()
      .trim()
      .min(5, 'Name the official source (for example the published merit list).')
      .max(300),
    sourceUrl: url.default(''),
  })
  .refine((h) => h.openingMerit == null || h.openingMerit >= h.closingMerit, {
    message: 'The opening merit cannot be below the closing merit.',
    path: ['openingMerit'],
  });

export const HISTORY_COLUMNS = [
  'institution',
  'program',
  'year',
  'round',
  'shift',
  'quota',
  'opening_merit',
  'closing_merit',
  'seats',
  'source_url',
];

async function parseHistoryFile(
  file: Express.Multer.File | undefined,
  scope: { directoryInstitutionId?: Id } = {},
) {
  if (!file) throw ApiError.validation('Choose a file to import.', { fields: { file: 'Choose a file.' } });
  const rows = await readTable(file);
  if (!rows.length)
    throw ApiError.validation('The file has no data rows.', { fields: { file: 'Empty file.' } });
  const missing = ['institution', 'program', 'year', 'closing_merit'].filter((c) => !(c in rows[0]!));
  if (missing.length)
    throw ApiError.validation(`Missing column(s): ${missing.join(', ')}`, {
      fields: { file: `Missing column(s): ${missing.join(', ')}` },
    });
  const insts = await DirInstitutionModel.find(
    scope.directoryInstitutionId ? { _id: scope.directoryInstitutionId } : {},
  ).lean();
  const programs = await DirProgramModel.find({
    directoryInstitutionId: { $in: insts.map((i) => i._id) },
  }).lean();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const valid: (z.infer<typeof historyBody> & { line: number })[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const inst = insts.find(
      (x) =>
        norm(x.name) === norm(r.institution ?? '') ||
        (x.shortName && norm(x.shortName) === norm(r.institution ?? '')),
    );
    if (!inst)
      return errors.push({
        line,
        message: `Institution "${r.institution}" is not in the directory${scope.directoryInstitutionId ? ' profile of your institution' : ''}.`,
      });
    const prog = programs.find(
      (p) => String(p.directoryInstitutionId) === String(inst._id) && norm(p.title) === norm(r.program ?? ''),
    );
    if (!prog)
      return errors.push({ line, message: `Program "${r.program}" is not listed for ${inst.name}.` });
    const parsed = historyBody.safeParse({
      directoryProgramId: String(prog._id),
      year: r.year,
      round: r.round || 1,
      shift: (r.shift || 'MORNING').toUpperCase(),
      quota: (r.quota || 'OPEN').toUpperCase(),
      openingMerit: r.opening_merit === '' || r.opening_merit === undefined ? null : r.opening_merit,
      closingMerit: r.closing_merit,
      seats: r.seats === '' || r.seats === undefined ? null : r.seats,
      source: 'import',
      sourceUrl: r.source_url ?? '',
    });
    if (!parsed.success)
      return errors.push({
        line,
        message: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
      });
    const key = `${prog._id}|${parsed.data.year}|${parsed.data.round}|${parsed.data.shift}|${parsed.data.quota}`;
    if (seen.has(key)) return errors.push({ line, message: 'Duplicate row in this file.' });
    seen.add(key);
    valid.push({ ...parsed.data, line });
  });
  return { valid, errors, rows: rows.length };
}

async function commitHistory(
  req: Request,
  valid: Awaited<ReturnType<typeof parseHistoryFile>>['valid'],
  source: string,
) {
  let saved = 0;
  let skipped = 0;
  for (const v of valid) {
    const { line: _line, ...data } = v;
    void _line;
    const exists = await MeritHistoryModel.findOne({
      directoryProgramId: data.directoryProgramId,
      year: data.year,
      round: data.round,
      shift: data.shift,
      quota: data.quota,
    });
    if (exists && (exists.status === 'VERIFIED' || exists.origin === 'ADMITRA')) {
      skipped++;
      continue;
    }
    await MeritHistoryModel.updateOne(
      {
        directoryProgramId: data.directoryProgramId,
        year: data.year,
        round: data.round,
        shift: data.shift,
        quota: data.quota,
      },
      {
        $set: {
          ...data,
          source,
          origin: 'IMPORT',
          status: 'DRAFT',
          enteredBy: req.auth!.userId,
          enteredByName: req.auth!.name,
          rejectReason: '',
        },
      },
      { upsert: true },
    );
    saved++;
  }
  return { saved, skipped };
}

export const platformDirectoryRouter = Router();
platformDirectoryRouter.use(authenticate, requireSuperAdmin);

platformDirectoryRouter.get('/institutions', async (req, res) => {
  const q = parse(paginationQuery.extend({ claim: z.enum(['PENDING']).optional() }), req.query);
  const filter: Record<string, unknown> = {};
  if (q.q) filter.name = { $regex: escapeRegex(q.q), $options: 'i' };
  if (q.claim) filter['claim.status'] = q.claim;
  const [items, total] = await Promise.all([
    DirInstitutionModel.find(filter)
      .sort({ name: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    DirInstitutionModel.countDocuments(filter),
  ]);
  const counts = await DirProgramModel.aggregate([
    { $match: { directoryInstitutionId: { $in: items.map((i) => i._id) } } },
    { $group: { _id: '$directoryInstitutionId', n: { $sum: 1 } } },
  ]);
  ok(
    res,
    items.map((i) => ({ ...i, programs: counts.find((c) => String(c._id) === String(i._id))?.n ?? 0 })),
    pageMeta(q.page, q.limit, total),
  );
});

platformDirectoryRouter.post('/institutions', async (req, res) => {
  const b = parse(institutionBody, req.body);
  if (await DirInstitutionModel.exists({ name: b.name }))
    throw ApiError.conflict('An institution with this name is already in the directory.');
  const doc = await DirInstitutionModel.create({
    ...b,
    slug: `${slugify(b.name)}-${Date.now().toString(36).slice(-4)}`,
  });
  await audit(req, 'DIRECTORY_INSTITUTION_CREATED', 'DirectoryInstitution', doc._id, { name: b.name });
  created(res, doc);
});

platformDirectoryRouter.patch('/institutions/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = sent(parse(institutionBody.partial(), req.body), req.body);
  const doc = await DirInstitutionModel.findByIdAndUpdate(id, b, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!doc) throw ApiError.notFound('Institution');
  await audit(req, 'DIRECTORY_INSTITUTION_UPDATED', 'DirectoryInstitution', id, Object.keys(b));
  ok(res, doc);
});

platformDirectoryRouter.get('/institutions/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const inst = await DirInstitutionModel.findById(id).lean();
  if (!inst) throw ApiError.notFound('Institution');
  const programs = await DirProgramModel.find({ directoryInstitutionId: inst._id }).sort({ title: 1 }).lean();
  const history = await MeritHistoryModel.find({ directoryProgramId: { $in: programs.map((p) => p._id) } })
    .sort({ year: -1, round: -1 })
    .lean();
  ok(res, {
    institution: inst,
    programs: programs.map((p) => ({
      ...p,
      history: history.filter((h) => String(h.directoryProgramId) === String(p._id)),
    })),
  });
});

platformDirectoryRouter.post('/programs', async (req, res) => {
  const b = parse(programBody, req.body);
  if (!(await DirInstitutionModel.exists({ _id: b.directoryInstitutionId })))
    throw ApiError.notFound('Institution');
  const doc = await DirProgramModel.create(b);
  await audit(req, 'DIRECTORY_PROGRAM_CREATED', 'DirectoryProgram', doc._id, { title: b.title });
  created(res, doc);
});

platformDirectoryRouter.patch('/programs/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = sent(parse(programBody.partial(), req.body), req.body);
  const doc = await DirProgramModel.findByIdAndUpdate(id, b, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!doc) throw ApiError.notFound('Program');
  await audit(req, 'DIRECTORY_PROGRAM_UPDATED', 'DirectoryProgram', id, Object.keys(b));
  ok(res, doc);
});

platformDirectoryRouter.get('/history', async (req, res) => {
  const q = parse(
    paginationQuery.extend({
      status: z.enum(['DRAFT', 'VERIFIED', 'REJECTED']).optional(),
      directoryProgramId: objectId.optional(),
    }),
    req.query,
  );
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.directoryProgramId) filter.directoryProgramId = q.directoryProgramId;
  const [items, total, counts] = await Promise.all([
    MeritHistoryModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    MeritHistoryModel.countDocuments(filter),
    MeritHistoryModel.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const programs = await DirProgramModel.find({ _id: { $in: items.map((h) => h.directoryProgramId) } })
    .select('title directoryInstitutionId')
    .lean();
  const insts = await DirInstitutionModel.find({
    _id: { $in: programs.map((p) => p.directoryInstitutionId) },
  })
    .select('name city')
    .lean();
  ok(
    res,
    items.map((h) => {
      const p = programs.find((x) => String(x._id) === String(h.directoryProgramId));
      return {
        ...h,
        program: p?.title ?? '',
        institution: insts.find((i) => String(i._id) === String(p?.directoryInstitutionId))?.name ?? '',
      };
    }),
    { ...pageMeta(q.page, q.limit, total), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) },
  );
});

platformDirectoryRouter.post('/history', async (req, res) => {
  const b = parse(historyBody, req.body);
  const exists = await MeritHistoryModel.exists({
    directoryProgramId: b.directoryProgramId,
    year: b.year,
    round: b.round,
    shift: b.shift,
    quota: b.quota,
  });
  if (exists) throw ApiError.conflict('A row for this year, round, shift and quota already exists.');
  const doc = await MeritHistoryModel.create({
    ...b,
    origin: 'MANUAL',
    status: 'DRAFT',
    enteredBy: req.auth!.userId,
    enteredByName: req.auth!.name,
  });
  await audit(req, 'MERIT_HISTORY_ADDED', 'MeritHistory', doc._id, { year: b.year });
  created(res, doc);
});

platformDirectoryRouter.post('/history/decision', async (req, res) => {
  const b = parse(
    z.object({
      ids: z.array(objectId).min(1).max(500),
      decision: z.enum(['VERIFIED', 'REJECTED']),
      reason: z.string().trim().max(300).default(''),
    }),
    req.body,
  );
  if (b.decision === 'REJECTED' && b.reason.length < 5)
    throw ApiError.validation('Write the reason for rejection.', { fields: { reason: 'Required.' } });
  const r = await MeritHistoryModel.updateMany(
    { _id: { $in: b.ids }, origin: { $ne: 'ADMITRA' } },
    {
      status: b.decision,
      verifiedBy: req.auth!.userId,
      verifiedAt: new Date(),
      rejectReason: b.decision === 'REJECTED' ? b.reason : '',
    },
  );
  await audit(req, `MERIT_HISTORY_${b.decision}`, 'MeritHistory', '', {
    ids: b.ids.length,
    reason: b.reason,
  });
  ok(res, { updated: r.modifiedCount });
});

platformDirectoryRouter.delete('/history/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const h = await MeritHistoryModel.findById(id);
  if (!h) throw ApiError.notFound('Merit history');
  if (h.origin === 'ADMITRA') throw ApiError.conflict('Official ADMITRA history cannot be deleted.');
  await h.deleteOne();
  await audit(req, 'MERIT_HISTORY_DELETED', 'MeritHistory', id);
  ok(res, { deleted: true });
});

platformDirectoryRouter.post('/import/preview', upload.single('file'), async (req, res) => {
  const p = await parseHistoryFile(req.file);
  ok(res, {
    rows: p.rows,
    valid: p.valid.length,
    errors: p.errors.slice(0, 200),
    sample: p.valid.slice(0, 8),
  });
});

platformDirectoryRouter.post('/import', upload.single('file'), async (req, res) => {
  const { source } = parse(
    z.object({
      source: z.string().trim().min(5, 'Describe the official source of the merit lists.').max(300),
    }),
    req.body,
  );
  const p = await parseHistoryFile(req.file);
  if (!p.valid.length)
    throw ApiError.validation('There are no valid rows to import.', { report: p.errors.slice(0, 200) });
  const r = await commitHistory(req, p.valid, source);
  await audit(req, 'MERIT_HISTORY_IMPORTED', 'MeritHistory', '', { ...r, source });
  created(res, { ...r, errors: p.errors.slice(0, 200) });
});

platformDirectoryRouter.get('/data-gaps', async (req, res) => {
  const { year } = parse(
    z.object({ year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()) }),
    req.query,
  );
  const programs = await DirProgramModel.find({ status: 'ACTIVE' })
    .select('title degreeLevel directoryInstitutionId programId')
    .lean();
  const latest = await MeritHistoryModel.aggregate([
    { $match: { status: 'VERIFIED' } },
    { $group: { _id: '$directoryProgramId', year: { $max: '$year' } } },
  ]);
  const drafts = await MeritHistoryModel.aggregate([
    { $match: { status: 'DRAFT', year } },
    { $group: { _id: '$directoryProgramId', n: { $sum: 1 } } },
  ]);
  const insts = await DirInstitutionModel.find({
    _id: { $in: programs.map((p) => p.directoryInstitutionId) },
  })
    .select('name city institutionId')
    .lean();
  const gaps = programs
    .map((p) => {
      const last = latest.find((l) => String(l._id) === String(p._id))?.year ?? null;
      const inst = insts.find((i) => String(i._id) === String(p.directoryInstitutionId));
      return {
        _id: p._id,
        title: p.title,
        degreeLevel: p.degreeLevel,
        institution: inst?.name ?? '',
        city: inst?.city ?? '',
        onAdmitra: Boolean(inst?.institutionId),
        lastVerifiedYear: last,
        draftsThisYear: drafts.find((d) => String(d._id) === String(p._id))?.n ?? 0,
      };
    })
    .filter((g) => g.lastVerifiedYear === null || g.lastVerifiedYear < year)
    .sort(
      (a, b) =>
        (a.lastVerifiedYear ?? 0) - (b.lastVerifiedYear ?? 0) || a.institution.localeCompare(b.institution),
    );
  ok(res, gaps, { year, programs: programs.length, missing: gaps.length });
});

platformDirectoryRouter.post('/institutions/:id/claim', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { decision } = parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }), req.body);
  const inst = await DirInstitutionModel.findById(id);
  if (!inst || inst.claim?.status !== 'PENDING') throw ApiError.notFound('Pending claim');
  if (decision === 'APPROVED') {
    if (
      await DirInstitutionModel.exists({ institutionId: inst.claim.institutionId, _id: { $ne: inst._id } })
    ) {
      const own = await DirInstitutionModel.findOne({
        institutionId: inst.claim.institutionId,
        _id: { $ne: inst._id },
      });
      await DirProgramModel.updateMany(
        { directoryInstitutionId: own!._id },
        { directoryInstitutionId: inst._id },
      );
      await own!.deleteOne();
    }
    inst.institutionId = inst.claim.institutionId;
  }
  inst.claim!.status = decision;
  await inst.save();
  await audit(req, `DIRECTORY_CLAIM_${decision}`, 'DirectoryInstitution', inst._id);
  ok(res, inst);
});

platformDirectoryRouter.get('/advisor-stats', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 864e5);
  const [runs, byDay, demand, bands] = await Promise.all([
    AdvisorLogModel.countDocuments({ createdAt: { $gte: since } }),
    AdvisorLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AdvisorLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $unwind: '$programs' },
      { $match: { 'programs.band': { $in: ['SAFE', 'TARGET'] } } },
      { $group: { _id: '$programs.directoryProgramId', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
    ]),
    AdvisorLogModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          matric: { $avg: '$inputs.matric' },
          inter: { $avg: '$inputs.inter' },
          signedIn: { $sum: { $cond: ['$signedIn', 1, 0] } },
        },
      },
    ]),
  ]);
  const programs = await DirProgramModel.find({ _id: { $in: demand.map((d) => d._id) } })
    .select('title directoryInstitutionId')
    .lean();
  const insts = await DirInstitutionModel.find({
    _id: { $in: programs.map((p) => p.directoryInstitutionId) },
  })
    .select('name')
    .lean();
  ok(res, {
    runs,
    byDay: byDay.map((d) => ({ day: d._id, runs: d.n })),
    demand: demand.map((d) => {
      const p = programs.find((x) => String(x._id) === String(d._id));
      return {
        program: p?.title ?? '',
        institution: insts.find((i) => String(i._id) === String(p?.directoryInstitutionId))?.name ?? '',
        count: d.n,
      };
    }),
    averages: bands[0]
      ? {
          matric: Math.round(bands[0].matric ?? 0),
          inter: Math.round(bands[0].inter ?? 0),
          signedIn: bands[0].signedIn,
        }
      : null,
  });
});

export const institutionDirectoryRouter = Router();
institutionDirectoryRouter.use(requirePermission(PERMISSIONS.DIRECTORY_EDIT));

institutionDirectoryRouter.get('/', async (req, res) => {
  const inst = await ensureDirectoryInstitution(req.tenant!.institutionId);
  const programs = await DirProgramModel.find({ directoryInstitutionId: inst._id }).sort({ title: 1 }).lean();
  const history = await MeritHistoryModel.find({ directoryProgramId: { $in: programs.map((p) => p._id) } })
    .sort({ year: -1, round: -1 })
    .lean();
  const claim = await DirInstitutionModel.findOne({
    'claim.institutionId': req.tenant!.institutionId,
    'claim.status': 'PENDING',
  })
    .select('name')
    .lean();
  ok(res, {
    institution: inst,
    programs: programs.map((p) => ({
      ...p,
      history: history.filter((h) => String(h.directoryProgramId) === String(p._id)),
    })),
    pendingClaim: claim,
  });
});

institutionDirectoryRouter.patch('/profile', async (req, res) => {
  const b = sent(
    parse(institutionBody.pick({ website: true, about: true, campuses: true }).partial(), req.body),
    req.body,
  );
  const inst = await ensureDirectoryInstitution(req.tenant!.institutionId);
  inst.set(b);
  await inst.save();
  await audit(req, 'DIRECTORY_PROFILE_UPDATED', 'DirectoryInstitution', inst._id, Object.keys(b));
  ok(res, inst);
});

institutionDirectoryRouter.patch('/programs/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const inst = await ensureDirectoryInstitution(req.tenant!.institutionId);
  const b = sent(
    parse(
      programBody
        .pick({ feePerSemester: true, formula: true, admissionMonths: true, applyUrl: true, seats: true })
        .partial(),
      req.body,
    ),
    req.body,
  );
  const p = await DirProgramModel.findOneAndUpdate({ _id: id, directoryInstitutionId: inst._id }, b, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!p) throw ApiError.notFound('Program');
  await audit(req, 'DIRECTORY_PROGRAM_UPDATED', 'DirectoryProgram', id, Object.keys(b));
  ok(res, p);
});

institutionDirectoryRouter.post('/history', async (req, res) => {
  const b = parse(historyBody, req.body);
  const inst = await ensureDirectoryInstitution(req.tenant!.institutionId);
  if (!(await DirProgramModel.exists({ _id: b.directoryProgramId, directoryInstitutionId: inst._id })))
    throw ApiError.notFound('Program');
  if (
    await MeritHistoryModel.exists({
      directoryProgramId: b.directoryProgramId,
      year: b.year,
      round: b.round,
      shift: b.shift,
      quota: b.quota,
    })
  )
    throw ApiError.conflict('A row for this year, round, shift and quota already exists.');
  const doc = await MeritHistoryModel.create({
    ...b,
    origin: 'MANUAL',
    status: 'DRAFT',
    enteredBy: req.auth!.userId,
    enteredByName: req.auth!.name,
  });
  await audit(req, 'MERIT_HISTORY_ADDED', 'MeritHistory', doc._id, { year: b.year });
  created(res, doc);
});

institutionDirectoryRouter.post('/import/preview', upload.single('file'), async (req, res) => {
  const inst = await ensureDirectoryInstitution(req.tenant!.institutionId);
  const p = await parseHistoryFile(req.file, { directoryInstitutionId: inst._id });
  ok(res, {
    rows: p.rows,
    valid: p.valid.length,
    errors: p.errors.slice(0, 200),
    sample: p.valid.slice(0, 8),
  });
});

institutionDirectoryRouter.post('/import', upload.single('file'), async (req, res) => {
  const { source } = parse(
    z.object({
      source: z.string().trim().min(5, 'Describe the official source of the merit lists.').max(300),
    }),
    req.body,
  );
  const inst = await ensureDirectoryInstitution(req.tenant!.institutionId);
  const p = await parseHistoryFile(req.file, { directoryInstitutionId: inst._id });
  if (!p.valid.length)
    throw ApiError.validation('There are no valid rows to import.', { report: p.errors.slice(0, 200) });
  const r = await commitHistory(req, p.valid, source);
  await audit(req, 'MERIT_HISTORY_IMPORTED', 'MeritHistory', '', { ...r, source });
  created(res, { ...r, errors: p.errors.slice(0, 200) });
});

institutionDirectoryRouter.get('/claimable', async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().max(80).default('') }), req.query);
  const filter: Record<string, unknown> = { institutionId: null, 'claim.status': { $ne: 'PENDING' } };
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
  ok(
    res,
    await DirInstitutionModel.find(filter).select('name city sector type').sort({ name: 1 }).limit(20).lean(),
  );
});

institutionDirectoryRouter.post('/claim', async (req, res) => {
  const b = parse(
    z.object({
      directoryInstitutionId: objectId,
      note: z.string().trim().min(10, 'Explain why this profile is yours.').max(300),
    }),
    req.body,
  );
  const inst = await DirInstitutionModel.findOne({ _id: b.directoryInstitutionId, institutionId: null });
  if (!inst) throw ApiError.notFound('Directory institution');
  inst.claim = {
    institutionId: req.tenant!.institutionId as never,
    institutionName: req.tenant!.institution.name,
    note: b.note,
    status: 'PENDING',
    at: new Date(),
  } as never;
  await inst.save();
  await audit(req, 'DIRECTORY_CLAIM_REQUESTED', 'DirectoryInstitution', inst._id);
  ok(res, { requested: true });
});
