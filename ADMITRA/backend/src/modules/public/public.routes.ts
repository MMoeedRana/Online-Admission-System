import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { DEGREE_LEVELS, INSTITUTION_TYPES, PROVINCES, SECTORS } from '../../constants/enums';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { sendMail } from '../../lib/mailer';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { emailSchema, idParams, parse, phoneSchema } from '../../lib/validate';
import { publicLimiter } from '../../middleware/rateLimit';
import { CampaignModel } from '../campaigns/campaign.model';
import { InstitutionModel } from '../institutions/institution.model';
import { uniqueSlug } from '../platform/platform.service';
import { ProgramModel, totalSeats } from '../programs/program.model';
import { CampusModel, DepartmentModel } from '../structure/structure.models';
import { UserModel } from '../users/user.model';

export const publicRouter = Router();
publicRouter.use(publicLimiter);

const INST_PUBLIC = 'name shortName slug type sector city province website branding about';

/** Open campaigns (CAMP-3) of active institutions, keyed by program id. */
async function openCampaignsByProgram(programIds?: unknown[]) {
  const filter: Record<string, unknown> = { status: 'OPEN', closesAt: { $gt: new Date() } };
  if (programIds) filter['programs.programId'] = { $in: programIds };
  const campaigns = await CampaignModel.find(filter)
    .select('title code closesAt programs institutionId')
    .lean();
  const map = new Map<string, { campaignId: string; title: string; closesAt: Date }>();
  for (const c of campaigns) {
    for (const p of c.programs) {
      const key = String(p.programId);
      const prev = map.get(key);
      if (!prev || prev.closesAt > c.closesAt)
        map.set(key, { campaignId: String(c._id), title: c.title, closesAt: c.closesAt });
    }
  }
  return map;
}

interface ProgramLike {
  _id: unknown;
  title: string;
  code: string;
  degreeLevel: string;
  fieldGroup?: string | null;
  durationYears: number;
  shifts: { name: string; seats: number }[];
  applicationFee: number;
  admissionFee: number;
  testRequired?: boolean | null;
}
interface InstitutionLike {
  name: string;
  shortName: string;
  slug: string;
  city: string;
  province: string;
  sector?: string | null;
  branding?: { logoUrl?: string | null } | null;
}

function programCard(
  p: ProgramLike,
  inst: InstitutionLike | undefined,
  open?: { campaignId: string; title: string; closesAt: Date },
) {
  return {
    id: String(p._id),
    title: p.title,
    code: p.code,
    degreeLevel: p.degreeLevel,
    fieldGroup: p.fieldGroup,
    durationYears: p.durationYears,
    seats: totalSeats(p),
    shifts: p.shifts,
    applicationFee: p.applicationFee,
    admissionFee: p.admissionFee,
    testRequired: p.testRequired,
    institution: inst
      ? {
          name: inst.name,
          shortName: inst.shortName,
          slug: inst.slug,
          city: inst.city,
          province: inst.province,
          sector: inst.sector,
          logoUrl: inst.branding?.logoUrl ?? '',
        }
      : null,
    openCampaign: open ?? null,
  };
}

publicRouter.get('/stats', async (_req, res) => {
  const insts = await InstitutionModel.find({ status: 'ACTIVE' }).select('_id city').lean();
  const ids = insts.map((i) => i._id);
  const [programs, openCampaigns] = await Promise.all([
    ProgramModel.countDocuments({ institutionId: { $in: ids }, status: 'ACTIVE' }),
    CampaignModel.countDocuments({
      institutionId: { $in: ids },
      status: 'OPEN',
      closesAt: { $gt: new Date() },
    }),
  ]);
  ok(res, {
    institutions: insts.length,
    programs,
    openCampaigns,
    cities: new Set(insts.map((i) => i.city)).size,
  });
});

publicRouter.get('/filters', async (_req, res) => {
  const cities = await InstitutionModel.distinct('city', { status: 'ACTIVE' });
  ok(res, {
    cities: cities.sort(),
    provinces: PROVINCES,
    degreeLevels: DEGREE_LEVELS,
    sectors: SECTORS,
    types: INSTITUTION_TYPES,
  });
});

/** Rows for the "Open admission campaigns" table on the home page. */
publicRouter.get('/open-admissions', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(8) }), req.query);
  const insts = await InstitutionModel.find({ status: 'ACTIVE' }).select(INST_PUBLIC).lean();
  const campaigns = await CampaignModel.find({
    status: 'OPEN',
    closesAt: { $gt: new Date() },
    institutionId: { $in: insts.map((i) => i._id) },
  })
    .sort({ closesAt: 1 })
    .lean();
  const programIds = campaigns.flatMap((c) => c.programs.map((p) => p.programId));
  const programs = await ProgramModel.find({ _id: { $in: programIds }, status: 'ACTIVE' })
    .select('title code degreeLevel')
    .lean();
  const rows = campaigns.flatMap((c) => {
    const inst = insts.find((i) => String(i._id) === String(c.institutionId));
    return c.programs
      .map((cp) => programs.find((p) => String(p._id) === String(cp.programId)))
      .filter(Boolean)
      .map((p) => ({
        programId: String(p!._id),
        program: p!.title,
        degreeLevel: p!.degreeLevel,
        institution: inst?.name ?? '',
        institutionSlug: inst?.slug ?? '',
        city: inst?.city ?? '',
        campaign: c.title,
        closesAt: c.closesAt,
      }));
  });
  ok(res, rows.slice(0, limit), { total: rows.length });
});

const programSearch = paginationQuery.extend({
  province: z.enum(PROVINCES).optional(),
  city: z.string().trim().max(60).optional(),
  sector: z.enum(SECTORS).optional(),
  degreeLevel: z.enum(DEGREE_LEVELS).optional(),
  maxFee: z.coerce.number().min(0).optional(),
  openOnly: z.enum(['true', 'false']).optional(),
  institution: z.string().trim().max(100).optional(),
});

publicRouter.get('/programs', async (req, res) => {
  const q = parse(programSearch, req.query);
  const instFilter: Record<string, unknown> = { status: 'ACTIVE' };
  if (q.province) instFilter.province = q.province;
  if (q.city) instFilter.city = { $regex: `^${escapeRegex(q.city)}$`, $options: 'i' };
  if (q.sector) instFilter.sector = q.sector;
  if (q.institution) instFilter.slug = q.institution;
  const insts = await InstitutionModel.find(instFilter).select(INST_PUBLIC).lean();

  const filter: Record<string, unknown> = {
    institutionId: { $in: insts.map((i) => i._id) },
    status: 'ACTIVE',
  };
  if (q.degreeLevel) filter.degreeLevel = q.degreeLevel;
  if (q.maxFee !== undefined) filter.admissionFee = { $lte: q.maxFee };
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    const instIds = insts.filter((i) => new RegExp(escapeRegex(q.q!), 'i').test(i.name)).map((i) => i._id);
    filter.$or = [{ title: rx }, { code: rx }, { fieldGroup: rx }, { institutionId: { $in: instIds } }];
  }
  if (q.openOnly === 'true') {
    const open = await openCampaignsByProgram();
    filter._id = { $in: [...open.keys()].map((k) => new Types.ObjectId(k)) };
  }
  const [items, total] = await Promise.all([
    ProgramModel.find(filter)
      .sort({ title: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    ProgramModel.countDocuments(filter),
  ]);
  const open = await openCampaignsByProgram(items.map((p) => p._id));
  ok(
    res,
    items.map((p) =>
      programCard(
        p,
        insts.find((i) => String(i._id) === String(p.institutionId)),
        open.get(String(p._id)),
      ),
    ),
    pageMeta(q.page, q.limit, total),
  );
});

publicRouter.get('/programs/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const p = await ProgramModel.findOne({ _id: id, status: 'ACTIVE' })
    .populate('departmentId', 'name')
    .populate('campusId', 'name city address')
    .lean();
  if (!p) throw ApiError.notFound('Program');
  const inst = await InstitutionModel.findOne({ _id: p.institutionId, status: 'ACTIVE' })
    .select(INST_PUBLIC)
    .lean();
  if (!inst) throw ApiError.notFound('Program');
  const open = await openCampaignsByProgram([p._id]);
  const related = await ProgramModel.find({
    institutionId: p.institutionId,
    status: 'ACTIVE',
    _id: { $ne: p._id },
    degreeLevel: p.degreeLevel,
  })
    .limit(4)
    .lean();
  const relOpen = await openCampaignsByProgram(related.map((r) => r._id));
  ok(res, {
    ...programCard(p, inst, open.get(String(p._id))),
    description: p.description,
    eligibility: p.eligibility,
    testName: p.testName,
    department: (p.departmentId as unknown as { name: string })?.name ?? '',
    campus: p.campusId,
    related: related.map((r) => programCard(r, inst, relOpen.get(String(r._id)))),
  });
});

publicRouter.get('/institutions', async (req, res) => {
  const q = parse(
    paginationQuery.extend({
      province: z.enum(PROVINCES).optional(),
      city: z.string().trim().max(60).optional(),
      sector: z.enum(SECTORS).optional(),
      type: z.enum(INSTITUTION_TYPES).optional(),
    }),
    req.query,
  );
  const filter: Record<string, unknown> = { status: 'ACTIVE' };
  if (q.province) filter.province = q.province;
  if (q.city) filter.city = { $regex: `^${escapeRegex(q.city)}$`, $options: 'i' };
  if (q.sector) filter.sector = q.sector;
  if (q.type) filter.type = q.type;
  if (q.q) filter.name = { $regex: escapeRegex(q.q), $options: 'i' };
  const [items, total] = await Promise.all([
    InstitutionModel.find(filter)
      .select(INST_PUBLIC)
      .sort({ name: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    InstitutionModel.countDocuments(filter),
  ]);
  const ids = items.map((i) => i._id);
  const [progCounts, openCounts] = await Promise.all([
    ProgramModel.aggregate([
      { $match: { institutionId: { $in: ids }, status: 'ACTIVE' } },
      { $group: { _id: '$institutionId', n: { $sum: 1 } } },
    ]),
    CampaignModel.aggregate([
      { $match: { institutionId: { $in: ids }, status: 'OPEN', closesAt: { $gt: new Date() } } },
      { $group: { _id: '$institutionId', n: { $sum: 1 } } },
    ]),
  ]);
  ok(
    res,
    items.map((i) => ({
      ...i,
      id: String(i._id),
      programs: progCounts.find((x) => String(x._id) === String(i._id))?.n ?? 0,
      openCampaigns: openCounts.find((x) => String(x._id) === String(i._id))?.n ?? 0,
    })),
    pageMeta(q.page, q.limit, total),
  );
});

publicRouter.get('/institutions/:slug', async (req, res) => {
  const { slug } = parse(z.object({ slug: z.string().trim().min(1).max(90) }), req.params);
  const inst = await InstitutionModel.findOne({ slug, status: 'ACTIVE' })
    .select(`${INST_PUBLIC} email phone address`)
    .lean();
  if (!inst) throw ApiError.notFound('Institution');
  const [campuses, departments, programs, campaigns] = await Promise.all([
    CampusModel.find({ institutionId: inst._id })
      .select('name city address isMain')
      .sort({ isMain: -1 })
      .lean(),
    DepartmentModel.find({ institutionId: inst._id }).select('name').sort({ name: 1 }).lean(),
    ProgramModel.find({ institutionId: inst._id, status: 'ACTIVE' }).sort({ title: 1 }).lean(),
    CampaignModel.find({ institutionId: inst._id, status: 'OPEN', closesAt: { $gt: new Date() } })
      .select('title code opensAt closesAt programs')
      .lean(),
  ]);
  const open = await openCampaignsByProgram(programs.map((p) => p._id));
  ok(res, {
    ...inst,
    id: String(inst._id),
    campuses,
    departments,
    programs: programs.map((p) => programCard(p, inst, open.get(String(p._id)))),
    openCampaigns: campaigns.map((c) => ({
      id: String(c._id),
      title: c.title,
      code: c.code,
      opensAt: c.opensAt,
      closesAt: c.closesAt,
      programs: c.programs.length,
    })),
  });
});

/** INST-1: an institution requests a workspace from the public website. */
publicRouter.post('/onboarding-requests', async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(3, 'Enter the institution name.').max(150),
      shortName: z.string().trim().min(2).max(10),
      type: z.enum(INSTITUTION_TYPES),
      sector: z.enum(SECTORS),
      city: z.string().trim().min(2).max(60),
      province: z.enum(PROVINCES),
      website: z.string().trim().url('Enter a full URL starting with https://').or(z.literal('')).default(''),
      message: z.string().trim().max(1000).default(''),
      contact: z.object({
        name: z.string().trim().min(3).max(120),
        designation: z.string().trim().min(2).max(80),
        email: emailSchema,
        phone: phoneSchema,
      }),
    }),
    req.body,
  );
  const duplicate = await InstitutionModel.exists({
    name: { $regex: `^${escapeRegex(body.name)}$`, $options: 'i' },
    status: { $in: ['PENDING', 'ACTIVE', 'SUSPENDED'] },
  });
  if (duplicate)
    throw ApiError.conflict('This institution has already requested or has a workspace.', {
      fields: { name: 'Already registered.' },
    });

  const inst = await InstitutionModel.create({
    name: body.name,
    shortName: body.shortName,
    slug: await uniqueSlug(body.name),
    type: body.type,
    sector: body.sector,
    city: body.city,
    province: body.province,
    website: body.website,
    about: body.message,
    email: body.contact.email,
    phone: body.contact.phone,
    contact: body.contact,
    status: 'PENDING',
  });
  await audit(
    req,
    'ONBOARDING_REQUESTED',
    'Institution',
    inst._id,
    { name: inst.name },
    { institutionId: inst._id },
  );
  const admins = await UserModel.find({ platformRole: 'SUPER_ADMIN', status: 'ACTIVE' })
    .select('email')
    .lean();
  await Promise.all(
    admins.map((a) =>
      sendMail({
        to: a.email,
        subject: `New onboarding request: ${inst.name}`,
        heading: 'New institution onboarding request',
        paragraphs: [
          `<b>${inst.name}</b> (${inst.city}) has requested an ADMITRA workspace. Contact: ${body.contact.name}, ${body.contact.email}.`,
        ],
      }),
    ),
  );
  await sendMail({
    to: body.contact.email,
    subject: 'We received your ADMITRA onboarding request',
    heading: 'Thank you for your request',
    paragraphs: [
      `Dear ${body.contact.name}, we received the request for <b>${inst.name}</b>. Our team will review it and contact you soon.`,
    ],
  });
  created(res, { id: String(inst._id), status: inst.status });
});
