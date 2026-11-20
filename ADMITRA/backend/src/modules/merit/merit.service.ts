import type { Request } from 'express';
import type { ClientSession } from 'mongoose';
import type { ApplicationStatus } from '../../constants/applications';
import { audit } from '../../lib/audit';
import { withTransaction } from '../../lib/db';
import { ApiError } from '../../lib/http';
import {
  allocateSeats,
  compareCandidates,
  computeAggregate,
  shortName,
  type AllocationApplicant,
  type BreakdownLine,
  type FormulaComponent,
  type TieBreaker,
} from '../../lib/merit';
import type { Id } from '../../lib/types';
import { ApplicationModel } from '../applications/application.model';
import {
  currentRecords,
  eligibilityFor,
  pushHistory,
  type AppDoc,
} from '../applications/application.service';
import { CampaignModel } from '../campaigns/campaign.model';
import { recordOfficialMerit } from '../directory/directory.service';
import { InstitutionModel } from '../institutions/institution.model';
import { notify } from '../notifications/notify';
import { ProfileModel } from '../profile/profile.model';
import { ProgramModel } from '../programs/program.model';
import { UserModel } from '../users/user.model';
import {
  CnicBlockModel,
  MeritEntryModel,
  MeritFormulaModel,
  MeritListModel,
  OfferModel,
} from './merit.models';

export const SEAT_HOLDING = ['OFFERED', 'ACCEPTED', 'ENROLLED'] as const;

const IN_PROGRESS: ApplicationStatus[] = [
  'SUBMITTED',
  'PAYMENT_PENDING',
  'UNDER_REVIEW',
  'DOCUMENT_VERIFICATION',
  'DEFICIENT',
  'ELIGIBILITY_CHECK',
];

const STATUS_TEXT: Record<string, string> = {
  SUBMITTED: 'submitted',
  PAYMENT_PENDING: 'application fee not verified',
  UNDER_REVIEW: 'under review',
  DOCUMENT_VERIFICATION: 'documents not verified',
  DEFICIENT: 'corrections requested',
  ELIGIBILITY_CHECK: 'eligibility not confirmed',
};

const poolKey = (programId: unknown, shift: string) => `${String(programId)}:${shift}`;

export function poolCapacities(
  program: { _id: unknown; shifts: { name: string; seats: number }[] },
  seatCap: number | null | undefined,
) {
  const total = program.shifts.reduce((s, x) => s + x.seats, 0);
  const factor = seatCap && seatCap < total ? seatCap / total : 1;
  return program.shifts.map((s) => ({ shift: s.name, capacity: Math.max(1, Math.floor(s.seats * factor)) }));
}

async function occupiedSeats(campaignId: Id, excludeListId?: Id | null) {
  const offers = await OfferModel.find({
    campaignId,
    status: { $in: SEAT_HOLDING },
    ...(excludeListId ? { meritListId: { $ne: excludeListId } } : {}),
  })
    .select('programId shift')
    .lean();
  const m = new Map<string, number>();
  for (const o of offers)
    m.set(poolKey(o.programId, o.shift), (m.get(poolKey(o.programId, o.shift)) ?? 0) + 1);
  return m;
}

interface Built {
  pools: {
    programId: unknown;
    programTitle: string;
    programCode: string;
    shift: string;
    capacity: number;
    seats: number;
    selected: number;
    waitlisted: number;
    openingAggregate: number | null;
    closingAggregate: number | null;
  }[];
  excluded: { applicationId: unknown; applicationNumber: string; name: string; reason: string }[];
  entries: {
    applicationId: unknown;
    applicantId: unknown;
    applicationNumber: string;
    shortName: string;
    programId: unknown;
    shift: string;
    preferenceOrder: number;
    aggregate: number;
    breakdown: BreakdownLine[];
    meritPosition: number;
    outcome: 'SELECTED' | 'WAITLISTED' | 'NOT_SELECTED';
    waitingPosition: number | null;
  }[];
  formulas: { programId: unknown; formulaId: unknown; version: number }[];
  candidates: number;
}

export async function buildList(
  institutionId: Id,
  campaignId: Id,
  opts: { candidateIds?: string[]; supersedesId?: Id | null } = {},
): Promise<Built> {
  const campaign = await CampaignModel.findOne({ _id: campaignId, institutionId }).lean();
  if (!campaign) throw ApiError.notFound('Campaign');
  const minTrust = campaign.settings?.minTrustLevel ?? 2;
  const programs = await ProgramModel.find({
    _id: { $in: campaign.programs.map((p) => p.programId) },
  }).lean();
  const formulas = await MeritFormulaModel.find({ campaignId, status: 'ACTIVE' }).lean();

  const appFilter: Record<string, unknown> = { campaignId, institutionId };
  if (opts.candidateIds)
    Object.assign(appFilter, {
      _id: { $in: opts.candidateIds },
      status: { $in: ['VERIFIED', 'WAITLISTED', 'NOT_SELECTED', 'OFFER_ISSUED', ...IN_PROGRESS] },
    });
  else appFilter.status = { $in: ['VERIFIED', 'WAITLISTED', 'NOT_SELECTED', ...IN_PROGRESS] };
  const apps = await ApplicationModel.find(appFilter).lean();

  const profiles = await ProfileModel.find({ userId: { $in: apps.map((a) => a.applicantId) } })
    .select('userId fullName dateOfBirth cnic')
    .lean();
  const blocked = new Set(
    (await CnicBlockModel.find({ campaignId }).select('cnic').lean()).map((b) => b.cnic),
  );

  const excluded: Built['excluded'] = [];
  const applicants: (AllocationApplicant & {
    applicantId: unknown;
    name: string;
    order: Map<string, number>;
    breakdowns: Map<string, BreakdownLine[]>;
  })[] = [];

  const needed = new Set<string>();
  for (const app of apps) {
    const prof = profiles.find((p) => String(p.userId) === String(app.applicantId));
    const name = prof?.fullName ?? (app.snapshot?.profile as { fullName?: string } | null)?.fullName ?? '';
    const base = { applicationId: app._id, applicationNumber: app.applicationNumber ?? '', name };
    if (IN_PROGRESS.includes(app.status as ApplicationStatus)) {
      excluded.push({ ...base, reason: `Application not ready: ${STATUS_TEXT[app.status] ?? app.status}` });
      continue;
    }
    if (prof && blocked.has(prof.cnic)) {
      excluded.push({ ...base, reason: 'CNIC blocked for this admission cycle (MARK-11)' });
      continue;
    }
    const records = await currentRecords(app.applicantId as Id);
    const aggregates: Record<string, number> = {};
    const breakdowns = new Map<string, BreakdownLine[]>();
    const order = new Map<string, number>();
    const reasons: string[] = [];
    const prefs: string[] = [];
    for (const pref of [...app.preferences].sort((a, b) => a.order - b.order)) {
      const program = programs.find((p) => String(p._id) === String(pref.programId));
      if (!program) continue;
      const key = poolKey(program._id, pref.shift);
      prefs.push(key);
      order.set(key, pref.order);
      needed.add(String(program._id));
      const formula = formulas.find((f) => String(f.programId) === String(program._id));
      if (!formula) {
        reasons.push(`${program.title}: no active merit formula`);
        continue;
      }
      const elig = eligibilityFor(program as never, records);
      if (!elig.eligible) {
        reasons.push(`${program.title}: ${elig.checks.find((c) => !c.ok)?.reason ?? 'not eligible'}`);
        continue;
      }
      const agg = computeAggregate(formula.components as FormulaComponent[], records, minTrust);
      if (!agg.ok) {
        reasons.push(
          agg.reason === 'Marks not verified' ? 'Marks not verified' : `${program.title}: ${agg.reason}`,
        );
        continue;
      }
      aggregates[key] = agg.aggregate;
      breakdowns.set(key, agg.breakdown);
    }
    if (!Object.keys(aggregates).length) {
      excluded.push({
        ...base,
        reason: reasons.includes('Marks not verified')
          ? 'Marks not verified'
          : (reasons[0] ?? 'No eligible preference'),
      });
      continue;
    }
    const best = (lvl: string) =>
      records.filter((r) => r.level.startsWith(lvl)).reduce((m, r) => Math.max(m, r.percentage), -1);
    applicants.push({
      id: String(app._id),
      applicantId: app.applicantId,
      applicationNumber: app.applicationNumber ?? '',
      name,
      dateOfBirth: prof?.dateOfBirth ?? null,
      scores: {
        ENTRY_TEST: best('ENTRY_TEST'),
        INTERMEDIATE: best('INTERMEDIATE'),
        MATRIC: best('MATRIC'),
        BACHELOR: best('BACHELOR'),
      },
      preferences: prefs,
      aggregates,
      order,
      breakdowns,
    });
  }

  const missingFormula = programs.filter(
    (p) => needed.has(String(p._id)) && !formulas.some((f) => String(f.programId) === String(p._id)),
  );
  if (missingFormula.length && applicants.length === 0 && excluded.length) {
    throw ApiError.conflict(
      `Activate a merit formula first: ${missingFormula.map((p) => p.title).join(', ')}.`,
    );
  }

  const occupied = await occupiedSeats(campaignId, opts.supersedesId);
  const pools: Built['pools'] = [];
  for (const cp of campaign.programs) {
    const program = programs.find((p) => String(p._id) === String(cp.programId));
    if (!program) continue;
    for (const c of poolCapacities(program as never, cp.seatCap)) {
      const key = poolKey(program._id, c.shift);
      pools.push({
        programId: program._id,
        programTitle: program.title,
        programCode: program.code,
        shift: c.shift,
        capacity: c.capacity,
        seats: Math.max(0, c.capacity - (occupied.get(key) ?? 0)),
        selected: 0,
        waitlisted: 0,
        openingAggregate: null,
        closingAggregate: null,
      });
    }
  }
  const tieOf = (key: string): TieBreaker[] => {
    const f = formulas.find((x) => String(x.programId) === key.split(':')[0]);
    return (f?.tieBreakers ?? []) as TieBreaker[];
  };
  const result = allocateSeats(
    applicants,
    pools.map((p) => ({ key: poolKey(p.programId, p.shift), seats: p.seats })),
    tieOf,
  );

  const entries: Built['entries'] = [];
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const waiting = new Map<string, typeof applicants>();
  for (const a of applicants) {
    if (result.matched.has(a.id)) continue;
    const key = a.preferences.find(
      (k) => a.aggregates[k] !== undefined && pools.some((p) => poolKey(p.programId, p.shift) === k),
    );
    if (!key) continue;
    waiting.set(key, [...(waiting.get(key) ?? []), a]);
  }
  for (const pool of pools) {
    const key = poolKey(pool.programId, pool.shift);
    const selected = (result.pools.get(key) ?? []).map((id) => byId.get(id)!);
    const rank = (x: (typeof applicants)[number], y: (typeof applicants)[number]) =>
      compareCandidates(
        { ...x, aggregate: x.aggregates[key]! },
        { ...y, aggregate: y.aggregates[key]! },
        tieOf(key),
      );
    const rest = (waiting.get(key) ?? []).sort(rank);
    selected.forEach((a, i) =>
      entries.push({
        applicationId: a.id,
        applicantId: a.applicantId,
        applicationNumber: a.applicationNumber,
        shortName: shortName(a.name),
        programId: pool.programId,
        shift: pool.shift,
        preferenceOrder: a.order.get(key) ?? 0,
        aggregate: a.aggregates[key]!,
        breakdown: a.breakdowns.get(key)!,
        meritPosition: i + 1,
        outcome: 'SELECTED',
        waitingPosition: null,
      }),
    );
    rest.forEach((a, i) => {
      const waits = i < pool.capacity;
      entries.push({
        applicationId: a.id,
        applicantId: a.applicantId,
        applicationNumber: a.applicationNumber,
        shortName: shortName(a.name),
        programId: pool.programId,
        shift: pool.shift,
        preferenceOrder: a.order.get(key) ?? 0,
        aggregate: a.aggregates[key]!,
        breakdown: a.breakdowns.get(key)!,
        meritPosition: selected.length + i + 1,
        outcome: waits ? 'WAITLISTED' : 'NOT_SELECTED',
        waitingPosition: waits ? i + 1 : null,
      });
    });
    pool.selected = selected.length;
    pool.waitlisted = Math.min(rest.length, pool.capacity);
    pool.openingAggregate = selected.length ? selected[0]!.aggregates[key]! : null;
    pool.closingAggregate = selected.length ? selected[selected.length - 1]!.aggregates[key]! : null;
  }

  return {
    pools,
    excluded,
    entries,
    formulas: formulas.map((f) => ({ programId: f.programId, formulaId: f._id, version: f.version })),
    candidates: applicants.length,
  };
}

async function saveList(
  req: Request,
  campaignId: Id,
  built: Built,
  meta: { listNumber: number; revision: number; supersedesId: Id | null; offerDeadline: Date },
) {
  return withTransaction(async (session) => {
    const counts = {
      candidates: built.candidates,
      selected: built.entries.filter((e) => e.outcome === 'SELECTED').length,
      waitlisted: built.entries.filter((e) => e.outcome === 'WAITLISTED').length,
      notSelected: built.entries.filter((e) => e.outcome === 'NOT_SELECTED').length,
      excluded: built.excluded.length,
    };
    const [list] = await MeritListModel.create(
      [
        {
          institutionId: req.tenant!.institutionId,
          campaignId,
          ...meta,
          formulas: built.formulas,
          pools: built.pools,
          excluded: built.excluded,
          counts,
          generatedBy: req.auth!.userId,
          generatedByName: req.auth!.name,
        },
      ],
      { session },
    );
    if (built.entries.length) {
      await MeritEntryModel.insertMany(
        built.entries.map((e) => ({
          ...e,
          meritListId: list!._id,
          institutionId: req.tenant!.institutionId,
          campaignId,
        })),
        { session },
      );
    }
    await audit(
      req,
      'MERIT_LIST_GENERATED',
      'MeritList',
      list!._id,
      { listNumber: meta.listNumber, revision: meta.revision, ...counts },
      { session },
    );
    return list!;
  });
}

async function assertNoOpenList(campaignId: Id) {
  if (await MeritListModel.exists({ campaignId, status: { $in: ['DRAFT', 'APPROVED'] } }))
    throw ApiError.conflict(
      'A list is already waiting for approval or publication. Discard it or publish it first.',
    );
}

export async function generateList(req: Request, campaignId: Id, offerDeadline: Date) {
  await assertNoOpenList(campaignId);
  if (offerDeadline <= new Date())
    throw ApiError.validation('The offer deadline must be in the future.', {
      fields: { offerDeadline: 'Must be in the future.' },
    });
  const last = await MeritListModel.findOne({ campaignId, status: 'PUBLISHED' })
    .sort({ listNumber: -1 })
    .lean();
  const built = await buildList(req.tenant!.institutionId, campaignId);
  if (!built.entries.length && !built.excluded.length)
    throw ApiError.conflict('There are no verified applications to rank in this campaign.');
  return saveList(req, campaignId, built, {
    listNumber: (last?.listNumber ?? 0) + 1,
    revision: 1,
    supersedesId: null,
    offerDeadline,
  });
}

export async function reviseList(req: Request, listId: Id, offerDeadline: Date) {
  const old = await MeritListModel.findOne({ _id: listId, institutionId: req.tenant!.institutionId }).lean();
  if (!old) throw ApiError.notFound('Merit list');
  if (old.status !== 'PUBLISHED') throw ApiError.conflict('Only a published list can be revised.');
  if (await OfferModel.exists({ meritListId: old._id, status: { $in: ['ACCEPTED', 'ENROLLED'] } }))
    throw ApiError.conflict(
      'An offer of this list has already been accepted, so it can no longer be revised.',
    );
  await assertNoOpenList(old.campaignId);
  const entries = await MeritEntryModel.find({ meritListId: old._id }).select('applicationId').lean();
  const ids = [
    ...entries.map((e) => String(e.applicationId)),
    ...old.excluded.map((x) => String(x.applicationId)),
  ];
  const built = await buildList(req.tenant!.institutionId, old.campaignId, {
    candidateIds: ids,
    supersedesId: old._id,
  });
  return saveList(req, old.campaignId, built, {
    listNumber: old.listNumber,
    revision: old.revision + 1,
    supersedesId: old._id,
    offerDeadline,
  });
}

export async function approveList(req: Request, listId: Id) {
  const list = await MeritListModel.findOne({ _id: listId, institutionId: req.tenant!.institutionId });
  if (!list) throw ApiError.notFound('Merit list');
  if (list.status !== 'DRAFT') throw ApiError.conflict('Only a draft list can be approved.');
  if (String(list.generatedBy) === req.auth!.userId)
    throw new ApiError(
      403,
      'FOUR_EYES',
      'The member who generated a list cannot approve it. Ask another committee member.',
    );
  list.status = 'APPROVED';
  list.set('approvedBy', req.auth!.userId);
  list.approvedByName = req.auth!.name;
  list.approvedAt = new Date();
  await list.save();
  await audit(req, 'MERIT_LIST_APPROVED', 'MeritList', list._id);
  return list;
}

export async function discardList(req: Request, listId: Id, reason: string) {
  const list = await MeritListModel.findOne({ _id: listId, institutionId: req.tenant!.institutionId });
  if (!list) throw ApiError.notFound('Merit list');
  if (!['DRAFT', 'APPROVED'].includes(list.status))
    throw ApiError.conflict('A published list cannot be discarded; revise it instead.');
  list.status = 'DISCARDED';
  list.discardReason = reason;
  await list.save();
  await audit(req, 'MERIT_LIST_DISCARDED', 'MeritList', list._id, { reason });
  return list;
}

const OUTCOME_STATUS = {
  SELECTED: 'OFFER_ISSUED',
  WAITLISTED: 'WAITLISTED',
  NOT_SELECTED: 'NOT_SELECTED',
} as const;

export async function publishList(req: Request, listId: Id) {
  const t = req.tenant!;
  const result = await withTransaction(async (session: ClientSession) => {
    const list = await MeritListModel.findOne({ _id: listId, institutionId: t.institutionId }).session(
      session,
    );
    if (!list) throw ApiError.notFound('Merit list');
    if (list.status !== 'APPROVED') throw ApiError.conflict('Only an approved list can be published.');
    const campaign = (await CampaignModel.findById(list.campaignId).session(session).lean())!;

    if (list.supersedesId) {
      const old = await MeritListModel.findById(list.supersedesId).session(session);
      if (!old || old.status !== 'PUBLISHED')
        throw ApiError.conflict('The list being corrected is no longer published.');
      if (
        await OfferModel.exists({ meritListId: old._id, status: { $in: ['ACCEPTED', 'ENROLLED'] } }).session(
          session,
        )
      )
        throw ApiError.conflict(
          'An offer of the earlier list has been accepted; the revision cannot be published.',
        );
      await OfferModel.updateMany(
        { meritListId: old._id, status: 'OFFERED' },
        { status: 'CANCELLED', reason: `Superseded by revision ${list.revision}` },
        { session },
      );
      old.status = 'SUPERSEDED';
      await old.save({ session });
    }

    const occupied = await occupiedSeats(list.campaignId, list.supersedesId);
    for (const pool of list.pools) {
      const free = (pool.capacity ?? 0) - (occupied.get(poolKey(pool.programId, pool.shift)) ?? 0);
      if ((pool.selected ?? 0) > free)
        throw ApiError.conflict(
          `Seats of ${pool.programTitle} (${pool.shift.toLowerCase()}) have changed. Generate the list again.`,
        );
    }

    const entries = await MeritEntryModel.find({ meritListId: list._id }).session(session).lean();
    const apps = await ApplicationModel.find({ _id: { $in: entries.map((e) => e.applicationId) } }).session(
      session,
    );
    const allowed = list.supersedesId
      ? ['VERIFIED', 'WAITLISTED', 'NOT_SELECTED', 'OFFER_ISSUED']
      : ['VERIFIED', 'WAITLISTED', 'NOT_SELECTED'];
    for (const e of entries) {
      const app = apps.find((a) => String(a._id) === String(e.applicationId)) as AppDoc | undefined;
      if (!app || !allowed.includes(app.status))
        throw ApiError.conflict(
          `Application ${e.applicationNumber} changed after generation. Generate the list again.`,
        );
      const to = OUTCOME_STATUS[e.outcome as keyof typeof OUTCOME_STATUS];
      const pool = list.pools.find((p) => String(p.programId) === String(e.programId) && p.shift === e.shift);
      const note =
        e.outcome === 'SELECTED'
          ? `Merit list ${list.listNumber}: selected for ${pool?.programTitle}, position ${e.meritPosition}`
          : e.outcome === 'WAITLISTED'
            ? `Merit list ${list.listNumber}: waiting list position ${e.waitingPosition} for ${pool?.programTitle}`
            : `Merit list ${list.listNumber}: not selected`;
      pushHistory(app, to, 'SYSTEM', undefined, note);
      await app.save({ session });
    }
    const selected = entries.filter((e) => e.outcome === 'SELECTED');
    if (selected.length) {
      await OfferModel.insertMany(
        selected.map((e) => ({
          institutionId: t.institutionId,
          campaignId: list.campaignId,
          meritListId: list._id,
          entryId: e._id,
          applicationId: e.applicationId,
          applicantId: e.applicantId,
          programId: e.programId,
          shift: e.shift,
          meritPosition: e.meritPosition,
          aggregate: e.aggregate,
          deadline: list.offerDeadline,
        })),
        { session },
      );
    }
    list.status = 'PUBLISHED';
    list.set('publishedBy', req.auth!.userId);
    list.publishedByName = req.auth!.name;
    list.publishedAt = new Date();
    await list.save({ session });
    await recordOfficialMerit(list as never, campaign, t.institution.name, session);
    await audit(req, 'MERIT_LIST_PUBLISHED', 'MeritList', list._id, { offers: selected.length }, { session });
    return { list, entries, campaign };
  });

  const users = await UserModel.find({ _id: { $in: result.entries.map((e) => e.applicantId) } })
    .select('email fullName')
    .lean();
  const programs = await ProgramModel.find({ _id: { $in: result.list.pools.map((p) => p.programId) } })
    .select('title')
    .lean();
  const inst = await InstitutionModel.findById(t.institutionId).select('name').lean();
  for (const e of result.entries) {
    const u = users.find((x) => String(x._id) === String(e.applicantId));
    if (!u) continue;
    const programName = programs.find((p) => String(p._id) === String(e.programId))?.title ?? '';
    const vars = {
      applicantName: u.fullName,
      institutionName: inst?.name ?? '',
      applicationNumber: e.applicationNumber,
      programName,
      campaignName: result.campaign.title,
      listNumber: result.list.listNumber,
      position: e.outcome === 'WAITLISTED' ? (e.waitingPosition ?? '') : e.meritPosition,
      aggregate: e.aggregate.toFixed(2),
      deadline: new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(result.list.offerDeadline),
    };
    const key =
      e.outcome === 'SELECTED' ? 'OFFER_ISSUED' : e.outcome === 'WAITLISTED' ? 'WAITLISTED' : 'MERIT_RESULT';
    const title =
      e.outcome === 'SELECTED'
        ? `Your name is in merit list ${result.list.listNumber}`
        : e.outcome === 'WAITLISTED'
          ? `You are on the waiting list (position ${e.waitingPosition})`
          : `Merit list ${result.list.listNumber} published`;
    await notify(
      e.applicantId as Id,
      {
        type: key,
        title,
        body: `${inst?.name}: ${programName}. Aggregate ${e.aggregate.toFixed(2)}.`,
        link: '/applicant/results',
      },
      { to: u.email, key, institutionId: t.institutionId, vars },
    );
  }
  return result.list;
}
