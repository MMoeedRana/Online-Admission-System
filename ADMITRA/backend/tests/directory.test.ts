import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { ApplicationModel } from '../src/modules/applications/application.model';
import {
  AdvisorLogModel,
  DirInstitutionModel,
  DirProgramModel,
  MeritHistoryModel,
} from '../src/modules/directory/directory.models';
import { MeritEntryModel, MeritListModel } from '../src/modules/merit/merit.models';
import { RecordModel } from '../src/modules/records/record.models';
import { api, applicantAgent, createInstitution, profilePayload, superAdminToken } from './helpers';

const root = async () => {
  const token = await superAdminToken();
  const as = (r: ReturnType<ReturnType<typeof api>['get']>) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (u: string) => as(api().get(`/api/v1${u}`)),
    post: (u: string) => as(api().post(`/api/v1${u}`)),
    patch: (u: string) => as(api().patch(`/api/v1${u}`)),
  };
};

/** A directory institution with one BS program and three years of closing merit. */
async function seedProgram(
  sa: Awaited<ReturnType<typeof root>>,
  name = 'Riverbend University',
  closings = [80.6, 80.0, 81.2],
) {
  const inst = await sa.post('/platform/directory/institutions').send({
    name,
    shortName: 'RBU',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Lahore',
    province: 'Punjab',
    website: 'https://rbu.example.edu.pk',
  });
  expect(inst.status).toBe(201);
  const prog = await sa.post('/platform/directory/programs').send({
    directoryInstitutionId: inst.body.data._id,
    title: 'BS Computer Science',
    degreeLevel: 'BS',
    fieldGroup: 'Computing',
    feePerSemester: 45000,
    shifts: ['MORNING'],
    seats: 120,
    eligibility: [
      { level: 'MATRIC', minPercentage: 60, groups: [] },
      { level: 'INTERMEDIATE', minPercentage: 60, groups: ['Pre-Engineering', 'ICS'] },
    ],
    formula: [
      { component: 'MATRIC', weight: 10 },
      { component: 'INTERMEDIATE', weight: 40 },
      { component: 'ENTRY_TEST', weight: 50 },
    ],
  });
  expect(prog.status).toBe(201);
  const ids: string[] = [];
  for (const [i, c] of closings.entries()) {
    const h = await sa.post('/platform/directory/history').send({
      directoryProgramId: prog.body.data._id,
      year: 2025 - i,
      closingMerit: c,
      openingMerit: c + 8,
      seats: 120,
      source: `Merit list ${2025 - i}, published on the university website`,
      sourceUrl: 'https://rbu.example.edu.pk/merit',
    });
    expect(h.status).toBe(201);
    ids.push(h.body.data._id);
  }
  return { inst: inst.body.data, prog: prog.body.data, historyIds: ids };
}

describe('reference directory (DIR-1 to DIR-8)', () => {
  it('keeps entered history as draft until verified and reports data gaps', async () => {
    const sa = await root();
    const { prog, historyIds } = await seedProgram(sa);
    const before = await api().post('/api/v1/public/advisor').send({ matric: 86.4, inter: 81.2, test: 84 });
    expect(before.body.data[0].band).toBe('INSUFFICIENT_DATA'); // drafts are not used (DIR-4)
    const gaps = await sa.get('/platform/directory/data-gaps?year=2026');
    expect(gaps.body.data.some((g: { _id: string }) => g._id === prog._id)).toBe(true);
    const bad = await sa
      .post('/platform/directory/history/decision')
      .send({ ids: historyIds, decision: 'REJECTED' });
    expect(bad.status).toBe(422); // reason needed
    expect(
      (await sa.post('/platform/directory/history/decision').send({ ids: historyIds, decision: 'VERIFIED' }))
        .body.data.updated,
    ).toBe(3);
    const detail = await api().get(`/api/v1/public/directory/programs?q=Riverbend`);
    expect(detail.body.data[0]).toMatchObject({ dataStatus: 'VERIFIED', dataYear: 2025, lastClosing: 80.6 });
  });

  it('imports merit history from CSV with a mandatory source', async () => {
    const sa = await root();
    await seedProgram(sa, 'Lakeview Institute');
    const csv = [
      'institution,program,year,round,shift,quota,opening_merit,closing_merit,seats,source_url',
      'Lakeview Institute,BS Computer Science,2022,1,MORNING,OPEN,90,79.5,120,https://example.org/2022',
      'Lakeview Institute,BS Physics,2022,1,MORNING,OPEN,80,70,40,',
      'Unknown College,BS Computer Science,2022,1,MORNING,OPEN,80,70,40,',
    ].join('\n');
    const preview = await sa
      .post('/platform/directory/import/preview')
      .attach('file', Buffer.from(csv), 'history.csv');
    expect(preview.body.data.valid).toBe(1);
    expect(preview.body.data.errors).toHaveLength(2);
    const noSource = await sa
      .post('/platform/directory/import')
      .attach('file', Buffer.from(csv), 'history.csv');
    expect(noSource.status).toBe(422);
    const ok = await sa
      .post('/platform/directory/import')
      .field('source', 'Published merit lists 2022')
      .attach('file', Buffer.from(csv), 'history.csv');
    expect(ok.status).toBe(201);
    expect(ok.body.data.saved).toBe(1);
    expect(await MeritHistoryModel.countDocuments({ origin: 'IMPORT', status: 'DRAFT' })).toBe(1);
  });

  it('lets an institution claim an entry and the super admin approve it (DIR-7)', async () => {
    const sa = await root();
    const { inst } = await seedProgram(sa, 'Old Name College');
    const ins = await createInstitution(`cl${Math.random().toString(36).slice(2, 6)}`);
    const claimable = await ins.as.get('/directory/claimable?q=Old');
    expect(claimable.body.data[0]._id).toBe(inst._id);
    expect(
      (
        await ins.as
          .post('/directory/claim')
          .send({ directoryInstitutionId: inst._id, note: 'This is our college under its old name.' })
      ).status,
    ).toBe(200);
    expect(
      (await sa.post(`/platform/directory/institutions/${inst._id}/claim`).send({ decision: 'APPROVED' }))
        .status,
    ).toBe(200);
    expect(String((await DirInstitutionModel.findById(inst._id))!.institutionId)).toBe(ins.id);
  });
});

describe('Admission Advisor (PRED-1 to PRED-12)', () => {
  it('predicts the chance, explains it, checks eligibility and logs anonymously', async () => {
    const sa = await root();
    const { prog, historyIds } = await seedProgram(sa);
    await sa.post('/platform/directory/history/decision').send({ ids: historyIds, decision: 'VERIFIED' });
    const r = await api()
      .post('/api/v1/public/advisor')
      .send({ matric: 86.4, inter: 81.2, test: 84, fieldGroup: 'ICS' });
    expect(r.status).toBe(200);
    const res = r.body.data[0];
    expect(res.aggregate).toBeCloseTo(83.12, 2);
    expect(res.history.map((h: { year: number }) => h.year)).toEqual([2025, 2024, 2023]);
    expect(['SAFE', 'TARGET']).toContain(res.band);
    expect(r.body.meta.basis).toBe('ENTERED');
    expect(r.body.meta.notice).toMatch(/not a guarantee/);
    // PRED-3: group requirement
    const fa = await api()
      .post('/api/v1/public/advisor')
      .send({ matric: 86.4, inter: 81.2, test: 84, fieldGroup: 'FA' });
    expect(fa.body.data[0].band).toBe('NOT_ELIGIBLE');
    expect(fa.body.data[0].reasons[0]).toMatch(/group must be/);
    // PRED-10: what-if (lower test marks give a lower chance)
    const low = await api()
      .post(`/api/v1/public/advisor/programs/${prog._id}`)
      .send({ matric: 86.4, inter: 81.2, test: 60, fieldGroup: 'ICS' });
    expect(low.body.data.prediction.chance).toBeLessThan(res.prediction.chance);
    expect(low.body.data.allHistory).toHaveLength(3);
    // PRED-12: inputs are rounded and no identity is stored
    const log = await AdvisorLogModel.findOne().sort({ createdAt: -1 }).lean();
    expect(log!.inputs!.matric).toBe(86);
    expect(log).not.toHaveProperty('userId');
    // PRED-2: saved marks need an applicant account
    expect((await api().post('/api/v1/public/advisor').send({ useSaved: true })).status).toBe(401);
  });

  it('uses saved marks for applicants and labels them (PRED-2, PRED-9) and keeps a shortlist (PRED-10)', async () => {
    const sa = await root();
    const { prog, historyIds } = await seedProgram(sa);
    await sa.post('/platform/directory/history/decision').send({ ids: historyIds, decision: 'VERIFIED' });
    const a = await applicantAgent(`adv${Math.random().toString(36).slice(2, 6)}@example.com`);
    await a.put('/me/profile').send(profilePayload(`35202${Math.floor(1e7 + Math.random() * 8e7)}`));
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${a.token}`);
    const userId = me.body.data.user.id;
    for (const [level, pct, trust] of [
      ['MATRIC', 86.4, 3],
      ['INTERMEDIATE', 81.2, 1],
    ] as const) {
      await RecordModel.create({
        userId,
        level,
        board: 'BISE Lahore',
        examType: 'ANNUAL',
        year: 2024,
        rollNo: `${level}1`,
        studentName: 'Ayesha Noor',
        fatherName: 'Noor Ahmad',
        group: 'ICS',
        subjects: [{ name: 'Aggregate', obtained: pct, total: 100 }],
        obtained: pct,
        total: 100,
        percentage: pct,
        trustLevel: trust,
      } as never);
    }
    const r = await api()
      .post('/api/v1/public/advisor')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ useSaved: true, test: 84 });
    expect(r.status).toBe(200);
    expect(r.body.meta.basis).toBe('SELF_DECLARED');
    expect((await a.post('/me/shortlist').send({ directoryProgramId: prog._id })).status).toBe(201);
    const list = await a.get('/me/shortlist');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].advice.aggregate).toBeGreaterThan(0);
    const pdf = await a.get('/me/shortlist/pdf');
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const compare = await api().get(`/api/v1/public/directory/compare?ids=${prog._id}`);
    expect(compare.body.data).toHaveLength(1);
  });
});

describe('Result Finder public pages (FIND-6, FIND-7)', () => {
  async function publishedList() {
    const ins = await createInstitution(`rf${Math.random().toString(36).slice(2, 6)}`);
    const a = await applicantAgent(`rf${Math.random().toString(36).slice(2, 6)}@example.com`);
    const cnic = `35202${Math.floor(1e7 + Math.random() * 8e7)}`;
    await a.put('/me/profile').send(profilePayload(cnic));
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${a.token}`);
    const programId = new Types.ObjectId();
    const app = await ApplicationModel.create({
      institutionId: ins.inst._id,
      campaignId: new Types.ObjectId(),
      applicantId: me.body.data.user.id,
      applicationNumber: 'RF-F26-MAIN-00042',
      status: 'OFFER_ISSUED',
      preferences: [{ programId, shift: 'MORNING', order: 1 }],
      snapshot: { profile: { fullName: 'Ayesha Noor', cnic }, records: [], fee: 0 },
    } as never);
    const list = await MeritListModel.create({
      institutionId: ins.inst._id,
      campaignId: app.campaignId,
      listNumber: 1,
      status: 'PUBLISHED',
      offerDeadline: new Date(Date.now() + 864e5),
      pools: [
        {
          programId,
          programTitle: 'BS Computer Science',
          shift: 'MORNING',
          capacity: 1,
          seats: 1,
          selected: 1,
          closingAggregate: 83.12,
        },
      ],
      generatedBy: new Types.ObjectId(),
      publishedAt: new Date(),
    } as never);
    await MeritEntryModel.create({
      meritListId: list._id,
      institutionId: ins.inst._id,
      campaignId: app.campaignId,
      applicationId: app._id,
      applicantId: app.applicantId,
      applicationNumber: 'RF-F26-MAIN-00042',
      shortName: 'Ayesha N.',
      programId,
      shift: 'MORNING',
      aggregate: 83.12,
      meritPosition: 1,
      outcome: 'SELECTED',
    } as never);
    return { list, cnic };
  }

  it('publishes lists with shortened names only and a PDF', async () => {
    const { list } = await publishedList();
    const lists = await api().get('/api/v1/public/merit-lists');
    expect(lists.body.data.some((l: { _id: string }) => l._id === String(list._id))).toBe(true);
    const page = await api().get(`/api/v1/public/merit-lists/${list._id}?q=ayesha`);
    expect(page.body.data.entries).toHaveLength(1);
    expect(JSON.stringify(page.body)).not.toMatch(/cnic|Noor/i);
    const pdf = await api().get(`/api/v1/public/merit-lists/${list._id}/pdf`);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('returns only the status after a correct CAPTCHA and CNIC digits', async () => {
    const { cnic } = await publishedList();
    const answer = async () => {
      const c = await api().get('/api/v1/public/status/captcha');
      const digits = [...c.body.data.svg.matchAll(/>(\d)</g)].map((m: RegExpMatchArray) => Number(m[1]));
      return { captchaId: c.body.data.captchaId, captchaAnswer: String(digits[0]! + digits[1]!) };
    };
    const wrong = await api()
      .post('/api/v1/public/status')
      .send({
        applicationNumber: 'RF-F26-MAIN-00042',
        cnicLast4: cnic.slice(-4),
        captchaId: (await answer()).captchaId,
        captchaAnswer: '999',
      });
    expect(wrong.status).toBe(422);
    const badCnic = await api()
      .post('/api/v1/public/status')
      .send({ applicationNumber: 'RF-F26-MAIN-00042', cnicLast4: '0000', ...(await answer()) });
    expect(badCnic.status).toBe(404);
    const good = await api()
      .post('/api/v1/public/status')
      .send({ applicationNumber: 'rf-f26-main-00042', cnicLast4: cnic.slice(-4), ...(await answer()) });
    expect(good.status).toBe(200);
    expect(Object.keys(good.body.data).sort()).toEqual(['label', 'status', 'updatedAt']);
    expect(good.body.data.status).toBe('OFFER_ISSUED');
  });
});

void DirProgramModel;
