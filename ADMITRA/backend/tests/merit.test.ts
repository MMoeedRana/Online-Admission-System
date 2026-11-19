import { describe, expect, it } from 'vitest';
import { ApplicationModel } from '../src/modules/applications/application.model';
import { MeritHistoryModel } from '../src/modules/directory/directory.models';
import { CnicBlockModel, EnrollmentModel, OfferModel } from '../src/modules/merit/merit.models';
import { expireOffers } from '../src/modules/merit/offer.service';
import { NotificationModel } from '../src/modules/notifications/notification.models';
import { RecordModel } from '../src/modules/records/record.models';
import { MemberModel } from '../src/modules/staff/member.model';
import {
  PDF,
  api,
  applicantAgent,
  createInstitution,
  createUser,
  login,
  profilePayload,
  programPayload,
} from './helpers';

type Inst = Awaited<ReturnType<typeof createInstitution>>;

/** A second staff member of the same institution with the given roles. */
async function staff(inst: Inst, email: string, roles: string[]) {
  const user = await createUser(email);
  await MemberModel.create({
    institutionId: inst.inst._id,
    userId: user._id,
    email,
    roles: roles as never,
    status: 'ACTIVE',
  });
  const token = await login(email);
  const set = (r: ReturnType<ReturnType<typeof api>['get']>) =>
    r.set('Authorization', `Bearer ${token}`).set('X-Institution-Id', inst.id);
  return {
    get: (url: string) => set(api().get(`/api/v1${url}`)),
    post: (url: string) => set(api().post(`/api/v1${url}`)),
    patch: (url: string) => set(api().patch(`/api/v1${url}`)),
  };
}

let n = 0;
/** A verified application with officer-verified (or weaker) records, created directly. */
async function verifiedApplicant(
  ctx: { inst: Inst; camp: { _id: string } },
  name: string,
  marks: { matric: number; inter: number; test: number },
  prefs: { programId: string; shift: string }[],
  opts: { trust?: number; status?: string } = {},
) {
  n++;
  const email = `${name.toLowerCase().replace(/\s/g, '.')}.${n}@example.com`;
  const a = await applicantAgent(email);
  const cnic = `35202${String(1000000 + n).padStart(8, '0')}`;
  await a
    .put('/me/profile')
    .send({ ...profilePayload(cnic), fullName: name, dateOfBirth: `200${n % 9}-03-01` });
  const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${a.token}`);
  const userId = me.body.data.user.id;
  const rec = (level: string, pct: number, extra: object = {}) =>
    RecordModel.create({
      userId,
      level,
      board: level === 'ENTRY_TEST' ? 'Institution Entry Test' : 'BISE Faisalabad',
      examType: level === 'ENTRY_TEST' ? 'TEST' : 'ANNUAL',
      year: 2024,
      rollNo: `${level[0]}${n}`,
      studentName: name,
      fatherName: 'Father',
      subjects: [{ name: 'Aggregate', obtained: pct, total: 100 }],
      obtained: pct,
      total: 100,
      percentage: pct,
      trustLevel: opts.trust ?? 3,
      verificationStatus: (opts.trust ?? 3) >= 2 ? 'VERIFIED' : 'UNDER_VERIFICATION',
      ...extra,
    } as never);
  await rec('MATRIC', marks.matric, { group: 'Science' });
  await rec('INTERMEDIATE', marks.inter, { group: 'ICS' });
  await rec('ENTRY_TEST', marks.test, { testName: 'Entry Test' });
  const app = await ApplicationModel.create({
    institutionId: ctx.inst.inst._id,
    campaignId: ctx.camp._id,
    applicantId: userId,
    applicationNumber: `T-F26-${String(n).padStart(5, '0')}`,
    status: opts.status ?? 'VERIFIED',
    preferences: prefs.map((p, i) => ({ ...p, order: i + 1 })),
    snapshot: { profile: { fullName: name, cnic }, records: [], fee: 0 },
    submittedAt: new Date(),
  } as never);
  return { agent: a, app: app as unknown as { _id: string }, email, cnic };
}

const FORMULA = {
  components: [
    { type: 'MATRIC', weight: 10, required: true },
    { type: 'INTERMEDIATE', weight: 40, required: true },
    { type: 'ENTRY_TEST', testName: 'Entry Test', weight: 50, required: true },
  ],
  tieBreakers: ['ENTRY_TEST', 'INTERMEDIATE', 'YOUNGER'],
};

async function setup() {
  const inst = await createInstitution(`m${Math.random().toString(36).slice(2, 7)}`);
  const cs = (
    await inst.as.post('/programs').send({
      ...programPayload(inst),
      shifts: [
        { name: 'MORNING', seats: 2 },
        { name: 'EVENING', seats: 1 },
      ],
    })
  ).body.data;
  const se = (
    await inst.as.post('/programs').send({
      ...programPayload(inst, 'BSSE'),
      title: 'BS Software Engineering',
      shifts: [{ name: 'MORNING', seats: 1 }],
    })
  ).body.data;
  const camp = (
    await inst.as.post('/campaigns').send({
      title: 'Fall 2026',
      code: 'F26',
      sessionId: String(inst.session._id),
      opensAt: new Date(Date.now() - 864e5).toISOString(),
      closesAt: new Date(Date.now() + 10 * 864e5).toISOString(),
      programs: [
        { programId: cs._id, seatCap: null },
        { programId: se._id, seatCap: null },
      ],
      settings: { maxPreferences: 3, feePolicy: 'HIGHEST', minTrustLevel: 2 },
    })
  ).body.data;
  await inst.as.post(`/campaigns/${camp._id}/status`).send({ to: 'OPEN' });
  const committee = await staff(inst, `committee.${inst.id}@x.test`, ['MERIT_COMMITTEE']);
  const committee2 = await staff(inst, `committee2.${inst.id}@x.test`, ['MERIT_COMMITTEE']);
  for (const p of [cs, se]) {
    const f = await committee
      .post('/merit-formulas')
      .send({ ...FORMULA, campaignId: camp._id, programId: p._id });
    expect(f.status).toBe(201);
    expect((await committee.post(`/merit-formulas/${f.body.data._id}/activate`)).status).toBe(200);
  }
  return { inst, cs, se, camp, committee, committee2 };
}

const deadline = () => new Date(Date.now() + 5 * 864e5).toISOString();

describe('merit formulas (MERIT-1, MERIT-2)', () => {
  it('checks weights, locks active versions and computes a test aggregate', async () => {
    const { committee, camp, cs } = await setup();
    const bad = await committee.post('/merit-formulas').send({
      campaignId: camp._id,
      programId: cs._id,
      components: [{ type: 'MATRIC', weight: 60, required: true }],
    });
    expect(bad.status).toBe(422);
    const list = await committee.get(`/merit-formulas?campaignId=${camp._id}`);
    const active = list.body.data.find((x: { program: { _id: string } }) => x.program._id === cs._id).active;
    expect((await committee.patch(`/merit-formulas/${active._id}`).send(FORMULA)).status).toBe(409); // locked
    const nv = await committee.post(`/merit-formulas/${active._id}/new-version`);
    expect(nv.status).toBe(201);
    expect(nv.body.data.version).toBe(2);
    const test = await committee.post('/merit-formulas/test').send({
      components: FORMULA.components,
      marks: { MATRIC: 86.4, INTERMEDIATE: 81.2, 'ENTRY_TEST:Entry Test': 84 },
    });
    expect(test.body.data.aggregate).toBeCloseTo(83.12, 2);
  });
});

describe('merit lists, offers and enrollment (Sections 3.12, 3.13)', () => {
  it('runs the whole cycle with four-eyes approval, publication, enrollment, expiry, next list and revocation', async () => {
    const ctx = await setup();
    const { inst, cs, se, camp, committee, committee2 } = ctx;
    const both = [
      { programId: cs._id, shift: 'MORNING' },
      { programId: se._id, shift: 'MORNING' },
      { programId: cs._id, shift: 'EVENING' },
    ];
    const ali = await verifiedApplicant(ctx, 'Ali Raza', { matric: 90, inter: 88, test: 92 }, both);
    const sana = await verifiedApplicant(ctx, 'Sana Iqbal', { matric: 88, inter: 86, test: 85 }, both);
    const umar = await verifiedApplicant(ctx, 'Umar Farooq', { matric: 80, inter: 82, test: 80 }, both);
    const hira = await verifiedApplicant(ctx, 'Hira Shah', { matric: 78, inter: 79, test: 75 }, both);
    const zain = await verifiedApplicant(ctx, 'Zain Abbas', { matric: 75, inter: 74, test: 70 }, both);
    const noor = await verifiedApplicant(ctx, 'Noor Fatima', { matric: 70, inter: 70, test: 65 }, both);
    await verifiedApplicant(ctx, 'Weak Trust', { matric: 95, inter: 95, test: 95 }, both, { trust: 1 });
    await verifiedApplicant(ctx, 'In Review', { matric: 95, inter: 95, test: 95 }, both, {
      status: 'DOCUMENT_VERIFICATION',
    });

    // Generate (MERIT-6, MARK-10)
    const gen = await committee
      .post('/merit-lists')
      .send({ campaignId: camp._id, offerDeadline: deadline() });
    expect(gen.status).toBe(201);
    const listId = gen.body.data._id;
    expect(gen.body.data.counts.selected).toBe(4); // 2 + 1 + 1 seats
    const reasons = gen.body.data.excluded.map((x: { reason: string }) => x.reason);
    expect(reasons).toContain('Marks not verified');
    expect(reasons.some((r: string) => r.startsWith('Application not ready'))).toBe(true);
    const detail = await committee.get(`/merit-lists/${listId}`);
    const outcome = (id: unknown) =>
      detail.body.data.entries.find((e: { applicationId: string }) => e.applicationId === String(id));
    expect(outcome(ali.app._id).outcome).toBe('SELECTED');
    expect(outcome(ali.app._id).breakdown).toHaveLength(3);
    expect(outcome(noor.app._id).outcome).toBe('WAITLISTED');

    // OFFER-1: four-eyes rule
    expect((await committee.post(`/merit-lists/${listId}/approve`)).status).toBe(403);
    expect((await committee2.post(`/merit-lists/${listId}/approve`)).status).toBe(200);
    expect((await committee2.post(`/merit-lists/${listId}/publish`)).status).toBe(403); // admin publishes
    const pub = await inst.as.post(`/merit-lists/${listId}/publish`);
    expect(pub.status).toBe(200);
    expect(await OfferModel.countDocuments({ meritListId: listId })).toBe(4);
    expect((await ApplicationModel.findById(ali.app._id))!.status).toBe('OFFER_ISSUED');
    expect((await ApplicationModel.findById(noor.app._id))!.status).toBe('WAITLISTED');
    // DIR-5 and FIND-5
    expect(await MeritHistoryModel.countDocuments({ origin: 'ADMITRA', status: 'VERIFIED' })).toBeGreaterThan(
      0,
    );
    expect(await NotificationModel.countDocuments({ type: 'OFFER_ISSUED' })).toBeGreaterThanOrEqual(4);

    // Accept, pay the admission fee, finance verifies: enrollment with a registration number (OFFER-4)
    const aliOffer = (await OfferModel.findOne({ applicationId: ali.app._id }))!;
    const acc = await ali.agent.post(`/me/offers/${aliOffer._id}/accept`);
    expect(acc.status).toBe(200);
    const proof = await ali.agent
      .post(`/me/applications/${ali.app._id}/payments`)
      .field('method', 'BANK_DEPOSIT')
      .field('reference', 'ADM-77881')
      .field('amount', '50000')
      .field('paidOn', new Date().toISOString())
      .attach('file', PDF, { filename: 'slip.pdf', contentType: 'application/pdf' });
    expect(proof.status).toBe(201);
    const pay = (await inst.as.get('/payments?status=PENDING')).body.data.find(
      (p: { reference: string }) => p.reference === 'ADM-77881',
    );
    expect((await inst.as.post(`/payments/${pay._id}/decision`).send({ decision: 'VERIFIED' })).status).toBe(
      200,
    );
    const enr = (await EnrollmentModel.findOne({ applicationId: ali.app._id }))!;
    expect(enr.status).toBe('ENROLLED');
    expect(enr.registrationNumber).toMatch(/-F26-BSCS-001$/);
    expect((await ApplicationModel.findById(ali.app._id))!.status).toBe('ENROLLED');
    const letter = await ali.agent.get(`/me/enrollments/${enr._id}/letter.pdf`);
    expect(letter.status).toBe(200);
    expect(letter.headers['content-type']).toContain('application/pdf');

    // Decline and expiry release seats (OFFER-3)
    const sanaOffer = (await OfferModel.findOne({ applicationId: sana.app._id }))!;
    expect((await sana.agent.post(`/me/offers/${sanaOffer._id}/decline`)).status).toBe(200);
    expect(await expireOffers(new Date(Date.now() + 6 * 864e5))).toBe(2);
    expect((await ApplicationModel.findById(umar.app._id))!.status).toBe('OFFER_EXPIRED');

    // Second list: waitlisted applicants move into the released seats
    const gen2 = await committee
      .post('/merit-lists')
      .send({ campaignId: camp._id, offerDeadline: deadline() });
    expect(gen2.status).toBe(201);
    expect(gen2.body.data.listNumber).toBe(2);
    await committee2.post(`/merit-lists/${gen2.body.data._id}/approve`);
    expect((await inst.as.post(`/merit-lists/${gen2.body.data._id}/publish`)).status).toBe(200);
    expect((await ApplicationModel.findById(noor.app._id))!.status).toBe('OFFER_ISSUED');

    // OFFER-2: a correction supersedes the list while no offer is accepted
    const rev = await committee
      .post(`/merit-lists/${gen2.body.data._id}/revise`)
      .send({ offerDeadline: deadline() });
    expect(rev.status).toBe(201);
    expect(rev.body.data.revision).toBe(2);
    await committee2.post(`/merit-lists/${rev.body.data._id}/approve`);
    const revPub = await inst.as.post(`/merit-lists/${rev.body.data._id}/publish`);
    expect(revPub.status).toBe(200);
    expect(
      await OfferModel.countDocuments({ meritListId: gen2.body.data._id, status: 'CANCELLED' }),
    ).toBeGreaterThan(0);

    // MARK-11: revocation with a CNIC block
    const revoke = await inst.as
      .post(`/offers/${aliOffer._id}/revoke`)
      .send({ reason: 'Intermediate marks found to be false', blockCnic: true });
    expect(revoke.status).toBe(200);
    expect((await ApplicationModel.findById(ali.app._id))!.status).toBe('REVOKED');
    expect((await EnrollmentModel.findById(enr._id))!.status).toBe('REVOKED');
    expect(await CnicBlockModel.exists({ cnic: ali.cnic })).toBeTruthy();
    expect((await ali.agent.post('/me/applications').send({ campaignId: camp._id })).status).toBe(403);
    void hira;
    void zain;
  });

  it('waits for the originals check when the institution requires it (MARK-12)', async () => {
    const ctx = await setup();
    await ctx.inst.as.patch('/institution/profile').send({ settings: { requireOriginals: true } });
    const a = await verifiedApplicant(ctx, 'Areeba Khan', { matric: 90, inter: 90, test: 90 }, [
      { programId: ctx.cs._id, shift: 'MORNING' },
    ]);
    const gen = await ctx.committee
      .post('/merit-lists')
      .send({ campaignId: ctx.camp._id, offerDeadline: deadline() });
    await ctx.committee2.post(`/merit-lists/${gen.body.data._id}/approve`);
    await ctx.inst.as.post(`/merit-lists/${gen.body.data._id}/publish`);
    const offer = (await OfferModel.findOne({ applicationId: a.app._id }))!;
    await a.agent.post(`/me/offers/${offer._id}/accept`);
    await a.agent
      .post(`/me/applications/${a.app._id}/payments`)
      .field('method', 'ONLINE_TRANSFER')
      .field('reference', 'ADM-55120')
      .field('amount', '50000')
      .field('paidOn', new Date().toISOString())
      .attach('file', PDF, { filename: 'slip.pdf', contentType: 'application/pdf' });
    const pay = (await ctx.inst.as.get('/payments?status=PENDING')).body.data[0];
    await ctx.inst.as.post(`/payments/${pay._id}/decision`).send({ decision: 'VERIFIED' });
    const e = (await EnrollmentModel.findOne({ applicationId: a.app._id }))!;
    expect(e.status).toBe('PENDING_ORIGINALS');
    expect(e.registrationNumber).toBeNull();
    const done = await ctx.inst.as.post(`/offers/enrollments/${e._id}/originals`);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('ENROLLED');
    expect(done.body.data.registrationNumber).toMatch(/-BSCS-001$/);
  });
});
