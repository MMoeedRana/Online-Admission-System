import { Types } from 'mongoose';
import { cached } from '../../lib/cache';
import type { Id } from '../../lib/types';
import { ApplicationModel } from '../applications/application.model';
import { CampaignModel } from '../campaigns/campaign.model';
import { ApplicantDocumentModel } from '../documents/document.models';
import { PaymentModel, VoucherModel } from '../fees/fee.models';
import { EnrollmentModel, OfferModel } from '../merit/merit.models';
import { ProgramModel, totalSeats } from '../programs/program.model';
import { RecordModel } from '../records/record.models';

export const REPORT_TZ = 'Asia/Karachi';
const DAY = 24 * 60 * 60 * 1000;

const AFTER_VERIFIED = [
  'VERIFIED',
  'OFFER_ISSUED',
  'WAITLISTED',
  'NOT_SELECTED',
  'OFFER_DECLINED',
  'OFFER_EXPIRED',
  'ENROLLED',
  'REVOKED',
];

export interface AnalyticsFilter {
  campaignId?: string;
  days: 14 | 30;
}

export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ }).format(d);
}

export function lastDays(days: number, now = new Date()): string[] {
  return Array.from({ length: days }, (_, i) => dayKey(new Date(now.getTime() - (days - 1 - i) * DAY)));
}

export function institutionAnalytics(institutionId: Id, f: AnalyticsFilter) {
  return cached(`analytics:${String(institutionId)}:${f.campaignId ?? 'all'}:${f.days}`, () =>
    computeAnalytics(new Types.ObjectId(String(institutionId)), f),
  );
}

async function computeAnalytics(institutionId: Types.ObjectId, f: AnalyticsFilter) {
  const scope: Record<string, unknown> = { institutionId };
  if (f.campaignId) scope.campaignId = new Types.ObjectId(f.campaignId);
  const submittedFilter: Record<string, unknown> = { ...scope, status: { $ne: 'DRAFT' } };

  const campaigns = await CampaignModel.find(
    f.campaignId ? { _id: f.campaignId, institutionId } : { institutionId },
  )
    .select('title code status opensAt closesAt programs')
    .lean();

  const [submittedIds, verifiedIds, paidAppIds, offeredIds, acceptedIds, enrolledIds] = await Promise.all([
    ApplicationModel.find(submittedFilter).distinct('_id'),
    ApplicationModel.find({
      ...submittedFilter,
      $or: [{ status: { $in: AFTER_VERIFIED } }, { 'history.to': 'VERIFIED' }],
    } as Record<string, unknown>).distinct('_id'),
    VoucherModel.find({ institutionId, type: 'APPLICATION', status: 'PAID' }).distinct('applicationId'),
    OfferModel.find(scope).distinct('applicationId'),
    OfferModel.find({ ...scope, status: { $in: ['ACCEPTED', 'ENROLLED'] } }).distinct('applicationId'),
    EnrollmentModel.find({ ...scope, status: 'ENROLLED' }).distinct('applicationId'),
  ]);
  const submittedSet = new Set(submittedIds.map(String));
  const feePaid = paidAppIds.filter((id) => submittedSet.has(String(id))).length;

  const funnel = [
    { key: 'SUBMITTED', label: 'Submitted', value: submittedIds.length },
    { key: 'FEE_PAID', label: 'Fee paid', value: feePaid },
    { key: 'VERIFIED', label: 'Verified', value: verifiedIds.length },
    { key: 'OFFERED', label: 'Offered', value: offeredIds.length },
    { key: 'ACCEPTED', label: 'Accepted', value: acceptedIds.length },
    { key: 'ENROLLED', label: 'Enrolled', value: enrolledIds.length },
  ];

  const days = lastDays(f.days);
  const since = new Date(Date.now() - (f.days + 1) * DAY);
  const daily = await ApplicationModel.aggregate<{ _id: string; n: number }>([
    { $match: { ...submittedFilter, submittedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt', timezone: REPORT_TZ } },
        n: { $sum: 1 },
      },
    },
  ]);
  const dailySubmissions = days.map((d) => ({ date: d, count: daily.find((x) => x._id === d)?.n ?? 0 }));

  const programIds = [...new Set(campaigns.flatMap((c) => c.programs.map((p) => String(p.programId))))];
  const [programs, perProgram] = await Promise.all([
    ProgramModel.find({ _id: { $in: programIds } })
      .select('title code shifts degreeLevel')
      .lean(),
    ApplicationModel.aggregate<{
      _id: Types.ObjectId;
      applications: number;
      firstChoice: number;
      applicants: Types.ObjectId[];
    }>([
      { $match: submittedFilter },
      { $unwind: '$preferences' },
      {
        $group: {
          _id: '$preferences.programId',
          applications: { $sum: 1 },
          firstChoice: { $sum: { $cond: [{ $eq: ['$preferences.order', 1] }, 1, 0] } },
          applicants: { $addToSet: '$applicantId' },
        },
      },
    ]),
  ]);
  const programRows = programs
    .map((p) => {
      const caps = campaigns.flatMap((c) => c.programs.filter((x) => String(x.programId) === String(p._id)));
      const own = totalSeats(p);
      const seats = caps.reduce((s, c) => s + (c.seatCap ? Math.min(c.seatCap, own) : own), 0) || own;
      const row = perProgram.find((x) => String(x._id) === String(p._id));
      const applications = row?.applications ?? 0;
      const applicants = row?.applicants.length ?? 0;
      return {
        programId: String(p._id),
        title: p.title,
        code: p.code,
        seats,
        applications,
        firstChoice: row?.firstChoice ?? 0,
        applicants,
        applicationsPerSeat: seats ? Math.round((applications / seats) * 100) / 100 : 0,
        applicantsPerSeat: seats ? Math.round((applicants / seats) * 100) / 100 : 0,
      };
    })
    .sort((a, b) => b.applicationsPerSeat - a.applicationsPerSeat);

  const [vouchers, payments] = await Promise.all([
    VoucherModel.aggregate<{ _id: { type: string; status: string }; amount: number; n: number }>([
      { $match: f.campaignId ? { institutionId, applicationId: { $in: submittedIds } } : { institutionId } },
      { $group: { _id: { type: '$type', status: '$status' }, amount: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
    PaymentModel.aggregate<{ _id: string; amount: number; n: number }>([
      {
        $match: f.campaignId ? { institutionId, applicationId: { $in: submittedIds } } : { institutionId },
      },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
  ]);
  const sumV = (type: string, statuses: string[]) =>
    vouchers
      .filter((v) => v._id.type === type && statuses.includes(v._id.status))
      .reduce((s, v) => s + v.amount, 0);
  const pay = (s: string) => payments.find((p) => p._id === s) ?? { amount: 0, n: 0 };
  const fees = {
    application: {
      issued: sumV('APPLICATION', ['ISSUED', 'AWAITING_VERIFICATION', 'PAID', 'EXPIRED']),
      collected: sumV('APPLICATION', ['PAID']),
      outstanding: sumV('APPLICATION', ['ISSUED', 'AWAITING_VERIFICATION']),
    },
    admission: {
      issued: sumV('ADMISSION', ['ISSUED', 'AWAITING_VERIFICATION', 'PAID', 'EXPIRED']),
      collected: sumV('ADMISSION', ['PAID']),
      outstanding: sumV('ADMISSION', ['ISSUED', 'AWAITING_VERIFICATION']),
    },
    payments: {
      verified: pay('VERIFIED').n,
      verifiedAmount: pay('VERIFIED').amount,
      pending: pay('PENDING').n,
      rejected: pay('REJECTED').n,
    },
  };
  const feeTotal = fees.application.collected + fees.admission.collected;

  const [decisions, docStates] = await Promise.all([
    ApplicantDocumentModel.aggregate<{ _id: string; n: number }>([
      { $match: f.campaignId ? { institutionId, applicationId: { $in: submittedIds } } : { institutionId } },
      { $unwind: '$reviewTrail' },
      { $group: { _id: '$reviewTrail.decision', n: { $sum: 1 } } },
    ]),
    ApplicantDocumentModel.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          ...(f.campaignId ? { applicationId: { $in: submittedIds } } : {}),
          institutionId,
          current: true,
        },
      },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  const approved = decisions.find((d) => d._id === 'APPROVED')?.n ?? 0;
  const rejected = decisions.find((d) => d._id === 'REJECTED')?.n ?? 0;
  const documents = {
    reviewed: approved + rejected,
    approved,
    rejected,
    rejectionRate: approved + rejected ? Math.round((rejected / (approved + rejected)) * 1000) / 10 : 0,
    awaitingReview: docStates.find((d) => d._id === 'UPLOADED')?.n ?? 0,
  };

  const applicantIds = await ApplicationModel.find(submittedFilter).distinct('applicantId');
  const recordStates = await RecordModel.aggregate<{ _id: { status: string; verified: boolean }; n: number }>(
    [
      { $match: { userId: { $in: applicantIds }, current: true } },
      {
        $group: {
          _id: { status: '$verificationStatus', verified: { $gte: ['$trustLevel', 2] } },
          n: { $sum: 1 },
        },
      },
    ],
  );
  const totalRecords = recordStates.reduce((s, r) => s + r.n, 0);
  const verifiedRecords = recordStates.filter((r) => r._id.verified).reduce((s, r) => s + r.n, 0);
  const byStatus: Record<string, number> = {};
  for (const r of recordStates) byStatus[r._id.status] = (byStatus[r._id.status] ?? 0) + r.n;
  const marks = {
    totalRecords,
    verifiedRecords,
    verifiedShare: totalRecords ? Math.round((verifiedRecords / totalRecords) * 1000) / 10 : 0,
    byStatus,
  };

  const statusRows = await ApplicationModel.aggregate<{ _id: string; n: number }>([
    { $match: submittedFilter },
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);

  return {
    generatedAt: new Date(),
    campaigns: campaigns.map((c) => ({ id: String(c._id), title: c.title, code: c.code, status: c.status })),
    kpis: {
      submitted: submittedIds.length,
      applicants: applicantIds.length,
      seats: programRows.reduce((s, p) => s + p.seats, 0),
      feeCollected: feeTotal,
      enrolled: enrolledIds.length,
      documentRejectionRate: documents.rejectionRate,
      verifiedMarksShare: marks.verifiedShare,
    },
    funnel,
    dailySubmissions,
    programs: programRows,
    fees,
    documents,
    marks,
    statuses: statusRows.map((s) => ({ status: s._id, count: s.n })),
  };
}
