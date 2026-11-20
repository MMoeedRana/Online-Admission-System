import { Router, type Request } from 'express';
import { z } from 'zod';
import { APPLICATION_STATUSES } from '../../constants/applications';
import { PERMISSIONS } from '../../constants/permissions';
import { sendCsv } from '../../lib/csv';
import { ApiError, ok } from '../../lib/http';
import { escapeRegex } from '../../lib/pagination';
import { pdfFormat, reportPdf } from '../../lib/pdf';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ApplicationModel } from '../applications/application.model';
import { marksState, scopeFilter } from '../applications/staff.routes';
import { CampaignModel } from '../campaigns/campaign.model';
import { rows as paymentRows } from '../fees/payment.routes';
import { VoucherModel } from '../fees/fee.models';
import { MeritEntryModel, MeritListModel } from '../merit/merit.models';
import { ProgramModel } from '../programs/program.model';
import { RecordModel } from '../records/record.models';
import { institutionAnalytics } from './analytics.service';

export const analyticsRouter = Router();
analyticsRouter.use(requirePermission(PERMISSIONS.ANALYTICS_VIEW));

analyticsRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      campaignId: objectId.optional(),
      days: z.coerce
        .number()
        .pipe(z.union([z.literal(14), z.literal(30)]))
        .default(14),
    }),
    req.query,
  );
  if (
    q.campaignId &&
    !(await CampaignModel.exists({ _id: q.campaignId, institutionId: req.tenant!.institutionId }))
  )
    throw ApiError.notFound('Campaign');
  ok(res, await institutionAnalytics(req.tenant!.institutionId, { campaignId: q.campaignId, days: q.days }));
});

export const EXPORT_LIMIT = 20000;

export const reportRouter = Router();

const appQuery = z.object({
  campaignId: objectId.optional(),
  programId: objectId.optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

async function applicationRows(req: Request) {
  const q = parse(appQuery, req.query);
  const filter = await scopeFilter(req);
  if (q.campaignId) filter.campaignId = q.campaignId;
  if (q.programId) filter['preferences.programId'] = q.programId;
  if (q.status) filter.status = q.status;
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    filter.$or = [{ applicationNumber: rx }, { 'snapshot.profile.fullName': rx }];
  }
  const apps = await ApplicationModel.find(filter)
    .sort({ submittedAt: -1 })
    .limit(EXPORT_LIMIT)
    .select(
      'applicationNumber status submittedAt late preferences applicantId campaignId snapshot.profile.fullName snapshot.profile.fatherName snapshot.profile.domicile snapshot.fee',
    )
    .lean();
  const [programs, campaigns, records, vouchers] = await Promise.all([
    ProgramModel.find({ _id: { $in: apps.flatMap((a) => a.preferences.map((p) => p.programId)) } })
      .select('code title')
      .lean(),
    CampaignModel.find({ _id: { $in: apps.map((a) => a.campaignId) } })
      .select('code title')
      .lean(),
    RecordModel.find({ userId: { $in: apps.map((a) => a.applicantId) }, current: true })
      .select('userId verificationStatus trustLevel')
      .lean(),
    VoucherModel.find({ applicationId: { $in: apps.map((a) => a._id) }, type: 'APPLICATION' })
      .select('applicationId status')
      .lean(),
  ]);
  const title = q.campaignId ? campaigns.find((c) => String(c._id) === q.campaignId)?.title : undefined;
  return {
    title,
    items: apps.map((a) => {
      const p = (a.snapshot?.profile ?? {}) as { fullName?: string; fatherName?: string; domicile?: string };
      const prefs = [...a.preferences]
        .sort((x, y) => x.order - y.order)
        .map((x) => {
          const pr = programs.find((g) => String(g._id) === String(x.programId));
          return `${pr?.code ?? ''} (${x.shift.toLowerCase()})`;
        });
      const v = vouchers.find((x) => String(x.applicationId) === String(a._id));
      return {
        applicationNumber: a.applicationNumber ?? '',
        name: p.fullName ?? '',
        fatherName: p.fatherName ?? '',
        domicile: p.domicile ?? '',
        campaign: campaigns.find((c) => String(c._id) === String(a.campaignId))?.code ?? '',
        preferences: prefs.join(', '),
        status: a.status,
        marks: marksState(records.filter((r) => String(r.userId) === String(a.applicantId))),
        fee: v?.status === 'PAID' ? 'Paid' : v ? 'Unpaid' : '-',
        submittedAt: a.submittedAt ?? null,
        late: a.late ? 'Yes' : 'No',
      };
    }),
  };
}

const appAccess = requirePermission(PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.APPLICATIONS_REVIEW);
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

reportRouter.get('/applications.csv', appAccess, async (req, res) => {
  const r = await applicationRows(req);
  sendCsv(
    res,
    'applications.csv',
    [
      'Application',
      'Applicant',
      'Father name',
      'Domicile',
      'Campaign',
      'Preferences',
      'Status',
      'Marks',
      'Application fee',
      'Submitted at',
      'Late',
    ],
    r.items.map((a) => [
      a.applicationNumber,
      a.name,
      a.fatherName,
      a.domicile,
      a.campaign,
      a.preferences,
      a.status,
      a.marks,
      a.fee,
      a.submittedAt,
      a.late,
    ]),
  );
});

reportRouter.get('/applications.pdf', appAccess, async (req, res) => {
  const r = await applicationRows(req);
  const count = (s: string[]) => r.items.filter((a) => s.includes(a.status)).length;
  reportPdf(res, {
    title: `${req.tenant!.institution.name}: applications`,
    subtitle: `${r.title ?? 'All campaigns'}  |  ${r.items.length} applications`,
    filename: 'applications.pdf',
    landscape: true,
    summary: [
      { label: 'Applications', value: String(r.items.length) },
      { label: 'Fee paid', value: String(r.items.filter((a) => a.fee === 'Paid').length) },
      { label: 'Verified marks', value: String(r.items.filter((a) => a.marks === 'VERIFIED').length) },
      { label: 'Enrolled', value: String(count(['ENROLLED'])) },
    ],
    columns: [
      { label: 'Application', width: 11 },
      { label: 'Applicant', width: 15 },
      { label: 'Father name', width: 14 },
      { label: 'Preferences', width: 20 },
      { label: 'Status', width: 12 },
      { label: 'Marks', width: 9 },
      { label: 'Fee', width: 7 },
      { label: 'Submitted', width: 10 },
    ],
    rows: r.items.map((a) => [
      a.applicationNumber,
      a.name,
      a.fatherName,
      a.preferences,
      label(a.status),
      label(a.marks),
      a.fee,
      pdfFormat.date(a.submittedAt),
    ]),
  });
});

const payAccess = requirePermission(PERMISSIONS.PAYMENTS_VERIFY, PERMISSIONS.ANALYTICS_VIEW);
const payQuery = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  q: z.string().trim().max(100).optional(),
});

async function payments(req: Request) {
  const q = parse(payQuery, req.query);
  return paymentRows(req.tenant!.institutionId, { ...q, page: 1, limit: EXPORT_LIMIT }, true);
}

reportRouter.get('/payments.csv', payAccess, async (req, res) => {
  const r = await payments(req);
  sendCsv(
    res,
    'payments.csv',
    [
      'Application',
      'Applicant',
      'Challan',
      'Method',
      'Reference',
      'Amount',
      'Paid on',
      'Status',
      'Receipt',
      'Decided by',
      'Decided at',
    ],
    r.items.map((p) => [
      p.applicationNumber,
      p.applicantName,
      p.voucherNumber,
      p.method,
      p.reference,
      p.amount,
      p.paidOn?.toISOString().slice(0, 10),
      p.status,
      p.receiptNumber,
      p.decidedByName,
      p.decidedAt,
    ]),
  );
});

reportRouter.get('/payments.pdf', payAccess, async (req, res) => {
  const r = await payments(req);
  const sum = (s: string) => r.items.filter((p) => p.status === s).reduce((t, p) => t + p.amount, 0);
  reportPdf(res, {
    title: `${req.tenant!.institution.name}: payments`,
    subtitle: `${r.items.length} payment proofs`,
    filename: 'payments.pdf',
    landscape: true,
    summary: [
      { label: 'Payments', value: String(r.items.length) },
      { label: 'Verified amount', value: pdfFormat.money(sum('VERIFIED')) },
      { label: 'Pending amount', value: pdfFormat.money(sum('PENDING')) },
      { label: 'Rejected', value: String(r.items.filter((p) => p.status === 'REJECTED').length) },
    ],
    columns: [
      { label: 'Application', width: 11 },
      { label: 'Applicant', width: 14 },
      { label: 'Challan', width: 12 },
      { label: 'Method', width: 8 },
      { label: 'Reference', width: 12 },
      { label: 'Amount', width: 9, align: 'right' },
      { label: 'Paid on', width: 9 },
      { label: 'Status', width: 7 },
      { label: 'Receipt', width: 14 },
    ],
    rows: r.items.map((p) => [
      p.applicationNumber ?? '',
      p.applicantName,
      p.voucherNumber ?? '',
      label(p.method),
      p.reference,
      pdfFormat.money(p.amount),
      pdfFormat.date(p.paidOn),
      label(p.status),
      p.receiptNumber ?? '-',
    ]),
  });
});

const meritAccess = requirePermission(
  PERMISSIONS.MERIT_MANAGE,
  PERMISSIONS.MERIT_PUBLISH,
  PERMISSIONS.ANALYTICS_VIEW,
);

async function meritRows(req: Request) {
  const { id } = parse(idParams, req.params);
  const list = await MeritListModel.findOne({ _id: id, institutionId: req.tenant!.institutionId }).lean();
  if (!list) throw ApiError.notFound('Merit list');
  const [entries, campaign] = await Promise.all([
    MeritEntryModel.find({ meritListId: list._id }).sort({ programId: 1, shift: 1, meritPosition: 1 }).lean(),
    CampaignModel.findById(list.campaignId).select('title').lean(),
  ]);
  const apps = await ApplicationModel.find({ _id: { $in: entries.map((e) => e.applicationId) } })
    .select('snapshot.profile.fullName')
    .lean();
  const pool = (e: (typeof entries)[number]) =>
    list.pools.find((p) => String(p.programId) === String(e.programId) && p.shift === e.shift);
  return {
    list,
    campaign: campaign?.title ?? '',
    items: entries.map((e) => ({
      program: pool(e)?.programTitle ?? '',
      shift: e.shift,
      position: e.meritPosition,
      applicationNumber: e.applicationNumber,
      name:
        (
          apps.find((a) => String(a._id) === String(e.applicationId))?.snapshot?.profile as {
            fullName?: string;
          }
        )?.fullName ?? e.shortName,
      aggregate: e.aggregate,
      outcome: e.outcome,
      waiting: e.waitingPosition ?? null,
    })),
  };
}

reportRouter.get('/merit-lists/:id.csv', meritAccess, async (req, res) => {
  const r = await meritRows(req);
  sendCsv(
    res,
    `merit-list-${r.list.listNumber}.csv`,
    [
      'Program',
      'Shift',
      'Merit position',
      'Application',
      'Applicant',
      'Aggregate',
      'Result',
      'Waiting position',
    ],
    r.items.map((e) => [
      e.program,
      e.shift,
      e.position,
      e.applicationNumber,
      e.name,
      e.aggregate.toFixed(4),
      e.outcome,
      e.waiting ?? '',
    ]),
  );
});

reportRouter.get('/merit-lists/:id.pdf', meritAccess, async (req, res) => {
  const r = await meritRows(req);
  reportPdf(res, {
    title: `${req.tenant!.institution.name}: merit list ${r.list.listNumber} (internal)`,
    subtitle: `${r.campaign}  |  Status ${label(r.list.status)}  |  Revision ${r.list.revision}`,
    filename: `merit-list-${r.list.listNumber}-internal.pdf`,
    summary: [
      { label: 'Candidates', value: String(r.list.counts?.candidates ?? r.items.length) },
      { label: 'Selected', value: String(r.list.counts?.selected ?? 0) },
      { label: 'Waitlisted', value: String(r.list.counts?.waitlisted ?? 0) },
      { label: 'Not selected', value: String(r.list.counts?.notSelected ?? 0) },
    ],
    columns: [
      { label: 'Program', width: 20 },
      { label: 'Shift', width: 8 },
      { label: 'No.', width: 5 },
      { label: 'Application', width: 14 },
      { label: 'Applicant', width: 20 },
      { label: 'Aggregate', width: 10, align: 'right' },
      { label: 'Result', width: 12 },
    ],
    rows: r.items.map((e) => [
      e.program,
      label(e.shift),
      e.position,
      e.applicationNumber,
      e.name,
      e.aggregate.toFixed(4),
      e.outcome === 'WAITLISTED' ? `Waiting ${e.waiting ?? ''}` : label(e.outcome),
    ]),
  });
});
