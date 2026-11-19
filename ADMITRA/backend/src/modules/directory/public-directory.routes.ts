import { Router, type Request } from 'express';
import { z } from 'zod';
import { ADVISOR_NOTICE, INTER_GROUPS } from '../../constants/advisor';
import { DEGREE_LEVELS, PROVINCES, SECTORS, SHIFTS } from '../../constants/enums';
import { ApiError, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import type { Id } from '../../lib/types';
import { idParams, objectId, parse } from '../../lib/validate';
import { optionalAuth } from '../../middleware/auth';
import { publicLimiter } from '../../middleware/rateLimit';
import { CampaignModel } from '../campaigns/campaign.model';
import { advise, explain, savedMarks, type AdvisorInput, type MarksBasis } from './advisor.service';
import { AdvisorLogModel, DirInstitutionModel, DirProgramModel, MeritHistoryModel } from './directory.models';

/** DIR-6, DIR-7 and the Admission Advisor (Section 3.15) for visitors and applicants. */
export const publicDirectoryRouter = Router();
publicDirectoryRouter.use(publicLimiter);

const pct = z.coerce
  .number()
  .min(0, 'Enter a percentage between 0 and 100.')
  .max(100, 'Enter a percentage between 0 and 100.');
const optionalText = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((v) => v || undefined);

const filters = {
  city: optionalText,
  province: z.enum(PROVINCES).optional(),
  sector: z.enum(SECTORS).optional(),
  degreeLevel: z.enum(DEGREE_LEVELS).optional(),
  maxFee: z.coerce.number().positive().optional(),
  shift: z.enum(SHIFTS).optional(),
  q: optionalText,
};

/** Latest verified closing merit and data status of each program (Figure 4.4). */
async function historySummary(programIds: Id[]) {
  const rows = await MeritHistoryModel.find({
    directoryProgramId: { $in: programIds },
    status: { $in: ['VERIFIED', 'DRAFT'] },
  })
    .sort({ year: -1, round: -1 })
    .lean();
  return (id: unknown) => {
    const mine = rows.filter((r) => String(r.directoryProgramId) === String(id));
    const verified = mine.filter((r) => r.status === 'VERIFIED');
    const latest = verified[0] ?? null;
    const lastYear = latest ? verified.filter((r) => r.year === latest.year) : [];
    const closing = lastYear.length
      ? Math.min(
          ...lastYear
            .filter((r) => r.round === Math.max(...lastYear.map((x) => x.round)))
            .map((r) => r.closingMerit),
        )
      : null;
    return {
      dataStatus: verified.length ? 'VERIFIED' : mine.length ? 'DRAFT' : 'NONE',
      dataYear: latest?.year ?? null,
      lastClosing: closing,
      source: latest?.source ?? null,
      sourceUrl: latest?.sourceUrl ?? null,
      origin: latest?.origin ?? null,
    };
  };
}

async function openCampaignFor(programIds: Id[]) {
  const campaigns = await CampaignModel.find({
    status: 'OPEN',
    closesAt: { $gt: new Date() },
    'programs.programId': { $in: programIds },
  })
    .select('title closesAt programs')
    .lean();
  return (programId: unknown) => {
    if (!programId) return null;
    const c = campaigns.find((x) => x.programs.some((p) => String(p.programId) === String(programId)));
    return c ? { campaignId: c._id, title: c.title, closesAt: c.closesAt } : null;
  };
}

publicDirectoryRouter.get('/directory/filters', async (_req, res) => {
  const [cities, fieldGroups] = await Promise.all([
    DirInstitutionModel.distinct('city', { status: 'ACTIVE' }),
    DirProgramModel.distinct('fieldGroup', { status: 'ACTIVE' }),
  ]);
  ok(res, {
    cities: cities.sort(),
    provinces: PROVINCES,
    sectors: SECTORS,
    degreeLevels: DEGREE_LEVELS,
    fieldGroups: fieldGroups.filter(Boolean).sort(),
    interGroups: INTER_GROUPS,
    shifts: SHIFTS,
  });
});

publicDirectoryRouter.get('/directory/programs', async (req, res) => {
  const q = parse(
    paginationQuery.extend({ ...filters, fieldGroup: optionalText, openOnly: z.coerce.boolean().optional() }),
    req.query,
  );
  const instFilter: Record<string, unknown> = { status: 'ACTIVE' };
  if (q.city) instFilter.city = q.city;
  if (q.province) instFilter.province = q.province;
  if (q.sector) instFilter.sector = q.sector;
  const insts = await DirInstitutionModel.find(instFilter).lean();
  const filter: Record<string, unknown> = {
    status: 'ACTIVE',
    directoryInstitutionId: { $in: insts.map((i) => i._id) },
  };
  if (q.degreeLevel) filter.degreeLevel = q.degreeLevel;
  if (q.fieldGroup) filter.fieldGroup = q.fieldGroup;
  if (q.maxFee) filter.feePerSemester = { $lte: q.maxFee };
  if (q.shift) filter.shifts = q.shift;
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    const byName = insts
      .filter((i) => new RegExp(escapeRegex(q.q!), 'i').test(`${i.name} ${i.shortName}`))
      .map((i) => i._id);
    filter.$or = [{ title: rx }, { directoryInstitutionId: { $in: byName } }];
  }
  // DIR-6 "deadline": only programs of an open ADMITRA campaign.
  if (q.openOnly) {
    const open = await CampaignModel.find({ status: 'OPEN', closesAt: { $gt: new Date() } }).distinct(
      'programs.programId',
    );
    filter.programId = { $in: open };
  }
  const [items, total] = await Promise.all([
    DirProgramModel.find(filter)
      .sort({ title: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    DirProgramModel.countDocuments(filter),
  ]);
  const summary = await historySummary(items.map((p) => p._id));
  const open = await openCampaignFor(items.map((p) => p.programId).filter(Boolean) as Id[]);
  ok(
    res,
    items.map((p) => {
      const inst = insts.find((i) => String(i._id) === String(p.directoryInstitutionId))!;
      return {
        _id: p._id,
        title: p.title,
        degreeLevel: p.degreeLevel,
        fieldGroup: p.fieldGroup,
        durationYears: p.durationYears,
        feePerSemester: p.feePerSemester,
        shifts: p.shifts,
        seats: p.seats,
        institution: {
          _id: inst._id,
          name: inst.name,
          shortName: inst.shortName,
          slug: inst.slug,
          city: inst.city,
          sector: inst.sector,
          onAdmitra: Boolean(inst.institutionId),
        },
        ...summary(p._id),
        openCampaign: open(p.programId),
      };
    }),
    pageMeta(q.page, q.limit, total),
  );
});

publicDirectoryRouter.get('/directory/programs/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const p = await DirProgramModel.findOne({ _id: id, status: 'ACTIVE' }).lean();
  if (!p) throw ApiError.notFound('Program');
  const inst = await DirInstitutionModel.findById(p.directoryInstitutionId).lean();
  const history = await MeritHistoryModel.find({
    directoryProgramId: p._id,
    status: { $in: ['VERIFIED', 'DRAFT'] },
  })
    .sort({ year: -1, round: -1, shift: 1 })
    .select('-enteredBy -verifiedBy')
    .lean();
  const open = await openCampaignFor(p.programId ? [p.programId] : []);
  ok(res, { program: p, institution: inst, history, openCampaign: open(p.programId) });
});

/** DIR-6: comparison of up to four programs. */
publicDirectoryRouter.get('/directory/compare', async (req, res) => {
  const { ids } = parse(
    z.object({ ids: z.string().transform((s) => s.split(',').filter(Boolean)) }),
    req.query,
  );
  const list = z.array(objectId).min(1).max(4, 'Compare at most four programs.').parse(ids);
  const programs = await DirProgramModel.find({ _id: { $in: list } }).lean();
  const insts = await DirInstitutionModel.find({
    _id: { $in: programs.map((p) => p.directoryInstitutionId) },
  }).lean();
  const summary = await historySummary(programs.map((p) => p._id));
  const history = await MeritHistoryModel.find({ directoryProgramId: { $in: list }, status: 'VERIFIED' })
    .sort({ year: -1 })
    .lean();
  const open = await openCampaignFor(programs.map((p) => p.programId).filter(Boolean) as Id[]);
  ok(
    res,
    list
      .map((id) => programs.find((p) => String(p._id) === id))
      .filter(Boolean)
      .map((p) => ({
        program: p,
        institution: insts.find((i) => String(i._id) === String(p!.directoryInstitutionId)),
        ...summary(p!._id),
        history: history.filter((h) => String(h.directoryProgramId) === String(p!._id)).slice(0, 9),
        openCampaign: open(p!.programId),
      })),
  );
});

publicDirectoryRouter.get('/directory/institutions', async (req, res) => {
  const q = parse(
    paginationQuery.extend({
      city: filters.city,
      province: filters.province,
      sector: filters.sector,
      q: filters.q,
    }),
    req.query,
  );
  const filter: Record<string, unknown> = { status: 'ACTIVE' };
  if (q.city) filter.city = q.city;
  if (q.province) filter.province = q.province;
  if (q.sector) filter.sector = q.sector;
  if (q.q)
    filter.$or = [
      { name: { $regex: escapeRegex(q.q), $options: 'i' } },
      { shortName: { $regex: escapeRegex(q.q), $options: 'i' } },
    ];
  const [items, total] = await Promise.all([
    DirInstitutionModel.find(filter)
      .sort({ name: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    DirInstitutionModel.countDocuments(filter),
  ]);
  const counts = await DirProgramModel.aggregate([
    { $match: { directoryInstitutionId: { $in: items.map((i) => i._id) }, status: 'ACTIVE' } },
    { $group: { _id: '$directoryInstitutionId', n: { $sum: 1 } } },
  ]);
  ok(
    res,
    items.map((i) => ({
      ...i,
      claim: undefined,
      programs: counts.find((c) => String(c._id) === String(i._id))?.n ?? 0,
      onAdmitra: Boolean(i.institutionId),
    })),
    pageMeta(q.page, q.limit, total),
  );
});

publicDirectoryRouter.get('/directory/institutions/:slug', async (req, res) => {
  const { slug } = parse(z.object({ slug: z.string().max(120) }), req.params);
  const inst = await DirInstitutionModel.findOne({ slug, status: 'ACTIVE' }).select('-claim').lean();
  if (!inst) throw ApiError.notFound('Institution');
  const programs = await DirProgramModel.find({ directoryInstitutionId: inst._id, status: 'ACTIVE' })
    .sort({ title: 1 })
    .lean();
  const summary = await historySummary(programs.map((p) => p._id));
  const open = await openCampaignFor(programs.map((p) => p.programId).filter(Boolean) as Id[]);
  ok(res, {
    institution: { ...inst, onAdmitra: Boolean(inst.institutionId) },
    programs: programs.map((p) => ({ ...p, ...summary(p._id), openCampaign: open(p.programId) })),
  });
});

// ------------------------------------------------------------------ Admission Advisor (PRED)
const advisorBody = z.object({
  useSaved: z.boolean().default(false),
  matric: pct.optional(),
  inter: pct.optional(),
  test: pct.nullable().optional(),
  fieldGroup: z.string().trim().max(60).optional(),
  ...filters,
});

const filtersOf = (b: z.infer<typeof advisorBody>) => ({
  city: b.city,
  province: b.province,
  sector: b.sector,
  degreeLevel: b.degreeLevel,
  maxFee: b.maxFee,
  shift: b.shift,
  q: b.q,
});

/** Builds the advisor input from the form or, for a signed-in applicant, from the saved record (PRED-2). */
async function inputFrom(req: Request, raw: unknown) {
  const b = parse(advisorBody, raw);
  let basis: MarksBasis = 'ENTERED';
  let input: AdvisorInput;
  if (b.useSaved) {
    if (req.auth?.accountType !== 'APPLICANT')
      throw ApiError.unauthorized('Sign in as an applicant to use your saved marks.');
    const saved = await savedMarks(req.auth.userId);
    if (saved.matric == null || saved.inter == null)
      throw ApiError.validation('Add your Matric and Intermediate results to your academic record first.');
    basis = saved.basis;
    const { test, fieldGroup } = b;
    const rest = filtersOf(b);
    input = {
      ...rest,
      matric: saved.matric,
      inter: saved.inter,
      // What-if: a test value sent by the page replaces the saved one.
      test: test !== undefined ? test : saved.test,
      fieldGroup: fieldGroup || saved.fieldGroup,
    };
  } else {
    if (b.matric == null || b.inter == null)
      throw ApiError.validation('Enter your Matric and Intermediate percentages.', {
        fields: {
          ...(b.matric == null ? { matric: 'Required.' } : {}),
          ...(b.inter == null ? { inter: 'Required.' } : {}),
        },
      });
    input = {
      ...filtersOf(b),
      fieldGroup: b.fieldGroup,
      matric: b.matric,
      inter: b.inter,
      test: b.test ?? null,
    };
  }
  return { input, basis };
}

const round = (n: number | null | undefined) => (n == null ? null : Math.round(n));

/** Table 3.17, steps 1-3: "Show my chances". */
publicDirectoryRouter.post('/advisor', optionalAuth, async (req, res) => {
  const { input, basis } = await inputFrom(req, req.body);
  const results = await advise(input);
  // PRED-12: anonymous log with rounded inputs and no identity.
  await AdvisorLogModel.create({
    inputs: {
      matric: round(input.matric),
      inter: round(input.inter),
      test: round(input.test),
      fieldGroup: input.fieldGroup ?? '',
      degreeLevel: input.degreeLevel ?? '',
      city: input.city ?? '',
      province: input.province ?? '',
      sector: input.sector ?? '',
    },
    resultCount: results.length,
    programs: results
      .filter((r) => r.eligible)
      .slice(0, 40)
      .map((r) => ({ directoryProgramId: r.directoryProgramId, band: r.band })),
    signedIn: Boolean(req.auth),
  });
  const bands = results.reduce<Record<string, number>>((m, r) => ((m[r.band] = (m[r.band] ?? 0) + 1), m), {});
  ok(res, results, {
    basis,
    inputs: {
      matric: input.matric,
      inter: input.inter,
      test: input.test ?? null,
      fieldGroup: input.fieldGroup ?? '',
    },
    bands,
    notice: ADVISOR_NOTICE,
  });
});

/** PRED-8: "Explain" for one program, with the what-if values from the query. */
publicDirectoryRouter.post('/advisor/programs/:id', optionalAuth, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { input, basis } = await inputFrom(req, req.body);
  const r = await explain(id as Id, input);
  if (!r) throw ApiError.notFound('Program');
  ok(res, r, { basis, notice: ADVISOR_NOTICE });
});
