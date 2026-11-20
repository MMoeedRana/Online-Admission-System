import { Types } from 'mongoose';
import { ApplicationModel } from '../applications/application.model';
import { AuditLogModel } from '../audit/audit.model';
import { PaymentModel, VoucherModel } from '../fees/fee.models';
import { InstitutionModel } from '../institutions/institution.model';
import { MeritListModel, OfferModel } from '../merit/merit.models';
import { FraudFlagModel, VerificationModel } from '../records/record.models';
import { ProgramModel } from '../programs/program.model';
import { MemberModel } from '../staff/member.model';
import { IntegrityAlertModel } from './agent.models';

export interface Finding {
  key: string;
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  institutionId: Types.ObjectId | null;
  title: string;
  detail: string;
  evidence: string[];
  count: number;
}

const DAY = 24 * 3600_000;
const PKT = 5 * 3600_000;
const pktHour = (d: Date) => new Date(d.getTime() + PKT).getUTCHours();
const pktDay = (d: Date) => new Date(d.getTime() + PKT).toISOString().slice(0, 10);

export const RULES = {
  BULK_OFFICER_VERIFICATION: 'One officer verified an unusually high number of marks records in a day',
  VERIFIED_DESPITE_REGISTRY_DIFFERENCE:
    'Marks were verified by an officer although the registry showed different values',
  PAYMENT_BELOW_CHALLAN: 'A payment was verified although its amount is lower than the challan',
  STALE_PAYMENT_PROOFS: 'Payment proofs have been waiting for verification for more than 3 days',
  STALE_FRAUD_FLAGS: 'Fraud flags have stayed open for more than 3 days',
  REPEATED_LIST_REVISIONS: 'A campaign has several revisions of published merit lists',
  REVOCATION_SPIKE: 'Several admissions were revoked within a week',
  OFF_HOURS_SENSITIVE_ACTIONS: 'Sensitive actions were taken between midnight and 5 a.m.',
  OFFERS_OVER_CAPACITY: 'Active offers exceed the seats of a program and shift',
  LATE_APPLICATIONS: 'Applications were accepted after the campaign closed',
} as const;

export async function runIntegrityRules(
  opts: { institutionId?: string | Types.ObjectId | null; days?: number; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.days ?? 30) * DAY);
  const inst = opts.institutionId ? new Types.ObjectId(String(opts.institutionId)) : null;
  const scope = inst ? { institutionId: inst } : {};
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, 'key'> & { keyPart: string }) => {
    const { keyPart, ...rest } = f;
    findings.push({ ...rest, key: `${f.code}:${String(f.institutionId ?? 'platform')}:${keyPart}` });
  };

  const decisions = await AuditLogModel.find({
    ...scope,
    action: 'MARKS_VERIFIED',
    createdAt: { $gte: since },
  })
    .select('actorId actorName institutionId createdAt')
    .lean();
  const perDay = new Map<string, { n: number; name: string; inst: Types.ObjectId | null; day: string }>();
  for (const d of decisions) {
    const k = `${String(d.actorId)}|${pktDay(d.createdAt)}`;
    const e = perDay.get(k) ?? {
      n: 0,
      name: d.actorName,
      inst: (d.institutionId as Types.ObjectId) ?? null,
      day: pktDay(d.createdAt),
    };
    e.n++;
    perDay.set(k, e);
  }
  for (const [k, e] of perDay)
    if (e.n >= 15)
      add({
        code: 'BULK_OFFICER_VERIFICATION',
        severity: 'MEDIUM',
        institutionId: e.inst,
        title: RULES.BULK_OFFICER_VERIFICATION,
        detail: `${e.name || 'An officer'} confirmed ${e.n} marks records on ${e.day}. Check a sample against the result cards.`,
        evidence: [`officer: ${e.name}`, `date: ${e.day}`, `records: ${e.n}`],
        count: e.n,
        keyPart: k,
      });

  const overridden = await VerificationModel.find({
    ...(inst ? { institutionId: inst } : {}),
    method: 'OFFICER',
    status: 'VERIFIED',
    'diff.0': { $exists: true },
    createdAt: { $gte: since },
  })
    .select('recordId institutionId diff createdAt')
    .lean();
  const byInst = new Map<string, typeof overridden>();
  for (const v of overridden)
    byInst.set(String(v.institutionId ?? 'none'), [
      ...(byInst.get(String(v.institutionId ?? 'none')) ?? []),
      v,
    ]);
  for (const [k, list] of byInst)
    add({
      code: 'VERIFIED_DESPITE_REGISTRY_DIFFERENCE',
      severity: 'HIGH',
      institutionId: k === 'none' ? null : new Types.ObjectId(k),
      title: RULES.VERIFIED_DESPITE_REGISTRY_DIFFERENCE,
      detail: `${list.length} record(s) were confirmed although the board registry showed other values (${[...new Set(list.flatMap((v) => v.diff.map((d) => d.field)))].slice(0, 4).join(', ')}).`,
      evidence: list.slice(0, 8).map((v) => `record ${String(v.recordId).slice(-6)}`),
      count: list.length,
      keyPart: 'recent',
    });

  const verified = await PaymentModel.find({ ...scope, status: 'VERIFIED', decidedAt: { $gte: since } })
    .select('voucherId amount reference institutionId')
    .lean();
  const vouchers = await VoucherModel.find({ _id: { $in: verified.map((p) => p.voucherId) } })
    .select('amount voucherNumber')
    .lean();
  const short = verified.filter((p) => {
    const v = vouchers.find((x) => String(x._id) === String(p.voucherId));
    return v && p.amount < v.amount;
  });
  for (const p of short) {
    const v = vouchers.find((x) => String(x._id) === String(p.voucherId))!;
    add({
      code: 'PAYMENT_BELOW_CHALLAN',
      severity: 'HIGH',
      institutionId: p.institutionId as Types.ObjectId,
      title: RULES.PAYMENT_BELOW_CHALLAN,
      detail: `Reference ${p.reference}: Rs. ${p.amount} paid against challan ${v.voucherNumber} of Rs. ${v.amount}.`,
      evidence: [`challan ${v.voucherNumber}`, `reference ${p.reference}`],
      count: 1,
      keyPart: String(p._id),
    });
  }

  const stale = await PaymentModel.aggregate<{ _id: Types.ObjectId; n: number; oldest: Date }>([
    { $match: { ...scope, status: 'PENDING', createdAt: { $lt: new Date(now.getTime() - 3 * DAY) } } },
    { $group: { _id: '$institutionId', n: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
  ]);
  for (const s of stale)
    add({
      code: 'STALE_PAYMENT_PROOFS',
      severity: 'LOW',
      institutionId: s._id,
      title: RULES.STALE_PAYMENT_PROOFS,
      detail: `${s.n} proof(s) of payment are waiting; the oldest since ${pktDay(s.oldest)}.`,
      evidence: [`waiting: ${s.n}`],
      count: s.n,
      keyPart: 'pending',
    });

  if (!inst) {
    const flags = await FraudFlagModel.find({
      status: 'OPEN',
      createdAt: { $lt: new Date(now.getTime() - 3 * DAY) },
    })
      .select('type details')
      .lean();
    if (flags.length)
      add({
        code: 'STALE_FRAUD_FLAGS',
        severity: 'MEDIUM',
        institutionId: null,
        title: RULES.STALE_FRAUD_FLAGS,
        detail: `${flags.length} fraud flag(s) (${[...new Set(flags.map((f) => f.type))].join(', ')}) have not been resolved.`,
        evidence: flags.slice(0, 6).map((f) => f.details || f.type),
        count: flags.length,
        keyPart: 'open',
      });
  }

  const revisions = await MeritListModel.aggregate<{
    _id: { campaignId: Types.ObjectId; institutionId: Types.ObjectId };
    n: number;
  }>([
    { $match: { ...scope, revision: { $gt: 1 }, createdAt: { $gte: since } } },
    { $group: { _id: { campaignId: '$campaignId', institutionId: '$institutionId' }, n: { $sum: 1 } } },
    { $match: { n: { $gte: 2 } } },
  ]);
  for (const r of revisions)
    add({
      code: 'REPEATED_LIST_REVISIONS',
      severity: 'MEDIUM',
      institutionId: r._id.institutionId,
      title: RULES.REPEATED_LIST_REVISIONS,
      detail: `${r.n} revised merit lists in one campaign. Check the reasons in the audit log.`,
      evidence: [`campaign ${String(r._id.campaignId).slice(-6)}`],
      count: r.n,
      keyPart: String(r._id.campaignId),
    });

  const revoked = await AuditLogModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    {
      $match: {
        ...scope,
        action: 'ADMISSION_REVOKED',
        createdAt: { $gte: new Date(now.getTime() - 7 * DAY) },
      },
    },
    { $group: { _id: '$institutionId', n: { $sum: 1 } } },
    { $match: { n: { $gte: 3 } } },
  ]);
  for (const r of revoked)
    add({
      code: 'REVOCATION_SPIKE',
      severity: 'MEDIUM',
      institutionId: r._id,
      title: RULES.REVOCATION_SPIKE,
      detail: `${r.n} admissions were revoked in the last 7 days.`,
      evidence: [`revocations: ${r.n}`],
      count: r.n,
      keyPart: pktDay(now),
    });

  const sensitive = [
    'MARKS_VERIFIED',
    'PAYMENT_VERIFIED',
    'MERIT_LIST_PUBLISHED',
    'ADMISSION_REVOKED',
    'STAFF_ROLES_CHANGED',
    'MERIT_LIST_APPROVED',
  ];
  const night = (
    await AuditLogModel.find({ ...scope, action: { $in: sensitive }, createdAt: { $gte: since } })
      .select('action actorName institutionId createdAt')
      .lean()
  ).filter((a) => pktHour(a.createdAt) < 5);
  const nightByInst = new Map<string, typeof night>();
  for (const a of night)
    nightByInst.set(String(a.institutionId), [...(nightByInst.get(String(a.institutionId)) ?? []), a]);
  for (const [k, list] of nightByInst)
    if (list.length >= 3)
      add({
        code: 'OFF_HOURS_SENSITIVE_ACTIONS',
        severity: 'LOW',
        institutionId: k === 'null' ? null : new Types.ObjectId(k),
        title: RULES.OFF_HOURS_SENSITIVE_ACTIONS,
        detail: `${list.length} sensitive action(s) between 00:00 and 05:00 (Pakistan time), by ${[...new Set(list.map((a) => a.actorName))].slice(0, 3).join(', ')}.`,
        evidence: list.slice(0, 6).map((a) => `${a.action} ${pktDay(a.createdAt)} ${a.actorName}`),
        count: list.length,
        keyPart: 'night',
      });

  const active = await OfferModel.aggregate<{
    _id: {
      programId: Types.ObjectId;
      shift: string;
      campaignId: Types.ObjectId;
      institutionId: Types.ObjectId;
    };
    n: number;
  }>([
    { $match: { ...scope, status: { $in: ['OFFERED', 'ACCEPTED', 'ENROLLED'] } } },
    {
      $group: {
        _id: {
          programId: '$programId',
          shift: '$shift',
          campaignId: '$campaignId',
          institutionId: '$institutionId',
        },
        n: { $sum: 1 },
      },
    },
  ]);
  if (active.length) {
    const programs = await ProgramModel.find({ _id: { $in: active.map((a) => a._id.programId) } })
      .select('title shifts')
      .lean();
    for (const a of active) {
      const p = programs.find((x) => String(x._id) === String(a._id.programId));
      const seats = p?.shifts.find((s) => s.name === a._id.shift)?.seats;
      if (seats != null && a.n > seats)
        add({
          code: 'OFFERS_OVER_CAPACITY',
          severity: 'HIGH',
          institutionId: a._id.institutionId,
          title: RULES.OFFERS_OVER_CAPACITY,
          detail: `${p!.title} (${a._id.shift.toLowerCase()}): ${a.n} active offers for ${seats} seats.`,
          evidence: [`program ${p!.title}`],
          count: a.n,
          keyPart: `${String(a._id.programId)}:${a._id.shift}`,
        });
    }
  }

  const late = await ApplicationModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { ...scope, late: true, submittedAt: { $gte: since } } },
    { $group: { _id: '$institutionId', n: { $sum: 1 } } },
  ]);
  for (const l of late)
    add({
      code: 'LATE_APPLICATIONS',
      severity: 'LOW',
      institutionId: l._id,
      title: RULES.LATE_APPLICATIONS,
      detail: `${l.n} application(s) were submitted after the closing time (allowed by the campaign's late policy).`,
      evidence: [`late: ${l.n}`],
      count: l.n,
      keyPart: 'late',
    });

  return findings;
}

export async function refreshAlerts(
  opts: { institutionId?: string | Types.ObjectId | null; days?: number; now?: Date } = {},
) {
  const findings = await runIntegrityRules(opts);
  const now = opts.now ?? new Date();
  for (const f of findings)
    await IntegrityAlertModel.updateOne(
      { key: f.key },
      {
        $set: {
          code: f.code,
          severity: f.severity,
          institutionId: f.institutionId,
          title: f.title,
          detail: f.detail,
          evidence: f.evidence,
          count: f.count,
          lastSeenAt: now,
        },
        $setOnInsert: { firstSeenAt: now, status: 'OPEN' },
      },
      { upsert: true },
    );
  return findings;
}

export async function institutionNames(ids: unknown[]) {
  const list = await InstitutionModel.find({ _id: { $in: ids.filter(Boolean) } })
    .select('name shortName')
    .lean();
  return new Map(list.map((i) => [String(i._id), i.shortName || i.name]));
}

export async function adminUserIds(institutionId: string | Types.ObjectId) {
  return (
    await MemberModel.find({
      institutionId: new Types.ObjectId(String(institutionId)),
      status: 'ACTIVE',
      roles: 'INSTITUTION_ADMIN',
    }).distinct('userId')
  ).filter(Boolean);
}
