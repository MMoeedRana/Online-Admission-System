import { Router } from 'express';
import { z } from 'zod';
import { cached } from '../../lib/cache';
import { ok } from '../../lib/http';
import { parse } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { ApplicationModel } from '../applications/application.model';
import { AdvisorLogModel, DirInstitutionModel, DirProgramModel } from '../directory/directory.models';
import { InstitutionModel } from '../institutions/institution.model';
import { VerificationModel } from '../records/record.models';
import { SupportTicketModel } from '../support/support.model';
import { lastDays, REPORT_TZ } from './analytics.service';

const DAY = 24 * 60 * 60 * 1000;
const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

export async function platformAnalytics(days: number) {
  const since = new Date(Date.now() - days * DAY);

  const [runs, signedIn, daily, byField, byLevel, topPrograms, bands] = await Promise.all([
    AdvisorLogModel.countDocuments({ createdAt: { $gte: since } }),
    AdvisorLogModel.countDocuments({ createdAt: { $gte: since }, signedIn: true }),
    AdvisorLogModel.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TZ } },
          n: { $sum: 1 },
        },
      },
    ]),
    AdvisorLogModel.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            $cond: [{ $gt: [{ $ifNull: ['$inputs.fieldGroup', ''] }, ''] }, '$inputs.fieldGroup', 'Any'],
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
    ]),
    AdvisorLogModel.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            $cond: [{ $gt: [{ $ifNull: ['$inputs.degreeLevel', ''] }, ''] }, '$inputs.degreeLevel', 'Any'],
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
    ]),
    AdvisorLogModel.aggregate<{ _id: unknown; n: number; safe: number; target: number; reach: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $unwind: '$programs' },
      {
        $group: {
          _id: '$programs.directoryProgramId',
          n: { $sum: 1 },
          safe: { $sum: { $cond: [{ $eq: ['$programs.band', 'SAFE'] }, 1, 0] } },
          target: { $sum: { $cond: [{ $eq: ['$programs.band', 'TARGET'] }, 1, 0] } },
          reach: { $sum: { $cond: [{ $in: ['$programs.band', ['REACH', 'UNLIKELY']] }, 1, 0] } },
        },
      },
      { $sort: { n: -1 } },
      { $limit: 15 },
    ]),
    AdvisorLogModel.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $unwind: '$programs' },
      { $group: { _id: '$programs.band', n: { $sum: 1 } } },
    ]),
  ]);
  const dirPrograms = await DirProgramModel.find({ _id: { $in: topPrograms.map((p) => p._id) } })
    .select('title directoryInstitutionId fieldGroup')
    .lean();
  const dirInsts = await DirInstitutionModel.find({
    _id: { $in: dirPrograms.map((p) => p.directoryInstitutionId) },
  })
    .select('name shortName')
    .lean();
  const advisor = {
    runs,
    signedInShare: rate(signedIn, runs),
    averagePerDay: Math.round((runs / days) * 10) / 10,
    daily: lastDays(days).map((d) => ({ date: d, count: daily.find((x) => x._id === d)?.n ?? 0 })),
    byField: byField.map((r) => ({ name: r._id || 'Any', count: r.n })),
    byLevel: byLevel.map((r) => ({ name: r._id || 'Any', count: r.n })),
    bands: Object.fromEntries(
      ['SAFE', 'TARGET', 'REACH', 'UNLIKELY', 'INSUFFICIENT_DATA', 'NOT_ELIGIBLE'].map((b) => [
        b,
        bands.find((x) => x._id === b)?.n ?? 0,
      ]),
    ),
    topPrograms: topPrograms.map((r) => {
      const p = dirPrograms.find((x) => String(x._id) === String(r._id));
      const i = dirInsts.find((x) => String(x._id) === String(p?.directoryInstitutionId));
      return {
        id: String(r._id),
        title: p?.title ?? 'Removed program',
        institution: i?.shortName || i?.name || '',
        appearances: r.n,
        safe: r.safe,
        target: r.target,
        reach: r.reach,
      };
    }),
  };

  const [checks, byBoard] = await Promise.all([
    VerificationModel.aggregate<{ _id: string; n: number }>([
      { $match: { method: 'REGISTRY', createdAt: { $gte: since } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    VerificationModel.aggregate<{ _id: { board: string; status: string }; n: number }>([
      { $match: { method: 'REGISTRY', createdAt: { $gte: since } } },
      { $lookup: { from: 'academicrecords', localField: 'recordId', foreignField: '_id', as: 'r' } },
      { $unwind: '$r' },
      { $group: { _id: { board: '$r.board', status: '$status' }, n: { $sum: 1 } } },
    ]),
  ]);
  const c = (s: string) => checks.find((x) => x._id === s)?.n ?? 0;
  const total = c('MATCH') + c('MISMATCH') + c('NOT_FOUND');
  const boards = [...new Set(byBoard.map((b) => b._id.board))].map((board) => {
    const n = (s: string) => byBoard.find((b) => b._id.board === board && b._id.status === s)?.n ?? 0;
    const t = n('MATCH') + n('MISMATCH') + n('NOT_FOUND');
    return {
      board,
      checks: t,
      matched: n('MATCH'),
      mismatched: n('MISMATCH'),
      notFound: n('NOT_FOUND'),
      matchRate: rate(n('MATCH'), t),
    };
  });
  const registry = {
    checks: total,
    matched: c('MATCH'),
    mismatched: c('MISMATCH'),
    notFound: c('NOT_FOUND'),
    matchRate: rate(c('MATCH'), total),
    mismatchRate: rate(c('MISMATCH'), total),
    notFoundRate: rate(c('NOT_FOUND'), total),
    boards: boards.sort((a, b) => b.checks - a.checks),
  };

  const [institutions, applications, appsPerInst, tickets] = await Promise.all([
    InstitutionModel.countDocuments({ status: 'ACTIVE' }),
    ApplicationModel.countDocuments({ status: { $ne: 'DRAFT' }, submittedAt: { $gte: since } }),
    ApplicationModel.aggregate<{ _id: unknown; n: number }>([
      { $match: { status: { $ne: 'DRAFT' }, submittedAt: { $gte: since } } },
      { $group: { _id: '$institutionId', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
    ]),
    SupportTicketModel.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  const instNames = await InstitutionModel.find({ _id: { $in: appsPerInst.map((a) => a._id) } })
    .select('name shortName')
    .lean();
  const [responded, onTime] = await Promise.all([
    SupportTicketModel.countDocuments({ createdAt: { $gte: since }, firstResponseAt: { $ne: null } }),
    SupportTicketModel.countDocuments({
      createdAt: { $gte: since },
      firstResponseAt: { $ne: null },
      $expr: { $lte: ['$firstResponseAt', '$responseDueAt'] },
    }),
  ]);

  return {
    days,
    generatedAt: new Date(),
    advisor,
    registry,
    activity: {
      activeInstitutions: institutions,
      applications,
      applicationsByInstitution: appsPerInst.map((a) => {
        const i = instNames.find((x) => String(x._id) === String(a._id));
        return { name: i?.shortName || i?.name || '', count: a.n };
      }),
      tickets: Object.fromEntries(tickets.map((t) => [t._id, t.n])),
      ticketResponseOnTime: rate(onTime, responded),
    },
  };
}

export const platformAnalyticsRouter = Router();
platformAnalyticsRouter.use(authenticate, requireSuperAdmin);
platformAnalyticsRouter.get('/', async (req, res) => {
  const { days } = parse(
    z.object({
      days: z.coerce
        .number()
        .pipe(z.union([z.literal(14), z.literal(30), z.literal(90)]))
        .default(30),
    }),
    req.query,
  );
  ok(res, await cached(`platform-analytics:${days}`, () => platformAnalytics(days)));
});
