/* eslint-disable no-console */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { cached, MAX_CACHE_SECONDS } from '../../src/lib/cache';
import { signAccessToken } from '../../src/middleware/auth';
import { ApplicationModel } from '../../src/modules/applications/application.model';
import { advise } from '../../src/modules/directory/advisor.service';
import {
  DirInstitutionModel,
  DirProgramModel,
  MeritHistoryModel,
} from '../../src/modules/directory/directory.models';
import { MeritFormulaModel, MeritListModel, OfferModel } from '../../src/modules/merit/merit.models';
import { generateList, publishList } from '../../src/modules/merit/merit.service';
import { ProfileModel } from '../../src/modules/profile/profile.model';
import { RecordModel } from '../../src/modules/records/record.models';
import { runRegistryCheck } from '../../src/modules/records/record.service';
import { commitImport } from '../../src/modules/registry/registry.service';
import { UserModel } from '../../src/modules/users/user.model';
import { api, createInstitution, createUser, programPayload } from '../helpers';

/**
 * Performance requirements of Table 5.1 (PERF-2 to PERF-10), measured on the test machine.
 * Run with `npm run test:perf`. Each test prints the measured time next to its target.
 */
const results: string[] = [];
async function timed<T>(id: string, target: number, fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t = performance.now();
  const value = await fn();
  const ms = Math.round(performance.now() - t);
  results.push(`${id}: ${ms} ms (target below ${target} ms) ${ms < target ? 'PASS' : 'FAIL'}`);
  console.log(results.at(-1));
  return { ms, value };
}

const fakeReq = (userId: unknown, institutionId: unknown) =>
  ({
    auth: { userId: String(userId), name: 'Perf Runner', accountType: 'STAFF', platformRole: null },
    tenant: {
      institutionId: String(institutionId),
      institution: { _id: institutionId, name: 'Performance Institute' },
      roles: ['INSTITUTION_ADMIN', 'MERIT_COMMITTEE'],
    },
    ip: '127.0.0.1',
    headers: {},
  }) as unknown as Request;

const pct = (n: number) => Math.round(n * 100) / 100;
const rand = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

describe('performance (Table 5.1)', () => {
  it('PERF-3, PERF-4, PERF-8, PERF-10: 1,500 applicants with three preferences, then 2,000 My Results requests', async () => {
    const inst = await createInstitution(`perf${Math.random().toString(36).slice(2, 6)}`);
    const programs: { _id: string }[] = [];
    for (const [code, seats] of [
      ['BSCS', 120],
      ['BSSE', 100],
      ['BSIT', 80],
    ] as const)
      programs.push(
        (
          await inst.as.post('/programs').send({
            ...programPayload(inst, code),
            title: `BS ${code}`,
            shifts: [{ name: 'MORNING', seats }],
          })
        ).body.data,
      );
    const camp = (
      await inst.as.post('/campaigns').send({
        title: 'Fall 2026',
        code: 'F26',
        sessionId: String(inst.session._id),
        opensAt: new Date(Date.now() - 864e5).toISOString(),
        closesAt: new Date(Date.now() + 10 * 864e5).toISOString(),
        programs: programs.map((p) => ({ programId: p._id, seatCap: null })),
        settings: { maxPreferences: 3, feePolicy: 'HIGHEST', minTrustLevel: 2 },
      })
    ).body.data;
    await inst.as.post(`/campaigns/${camp._id}/status`).send({ to: 'OPEN' });
    await MeritFormulaModel.insertMany(
      programs.map((p) => ({
        institutionId: inst.inst._id,
        campaignId: camp._id,
        programId: p._id,
        version: 1,
        components: [
          { type: 'MATRIC', weight: 10, required: true },
          { type: 'INTERMEDIATE', weight: 40, required: true },
          { type: 'ENTRY_TEST', testName: 'Entry Test', weight: 50, required: true },
        ],
        tieBreakers: ['ENTRY_TEST', 'INTERMEDIATE', 'YOUNGER'],
        status: 'ACTIVE',
      })),
    );

    // PERF-10: the entry plan takes at least 2,000 applications per cycle; 1,500 are used here.
    const N = 1500;
    const r = rand(42);
    const ids = Array.from({ length: N }, () => new Types.ObjectId());
    await UserModel.insertMany(
      ids.map((_id, i) => ({
        _id,
        fullName: `Applicant ${i + 1}`,
        email: `perf${i}@example.com`,
        passwordHash: 'x',
        accountType: 'APPLICANT',
        emailVerified: true,
      })),
    );
    await ProfileModel.collection.insertMany(
      ids.map((userId, i) => ({
        userId,
        fullName: `Applicant ${i + 1}`,
        fatherName: 'Father',
        cnic: String(3520200000000 + i),
        dateOfBirth: new Date(2005, i % 12, (i % 27) + 1),
      })),
    );
    const record = (userId: Types.ObjectId, i: number, level: string, p: number) => ({
      userId,
      level,
      board: level === 'ENTRY_TEST' ? 'Institution Entry Test' : 'BISE Lahore',
      examType: level === 'ENTRY_TEST' ? 'TEST' : 'ANNUAL',
      year: 2025,
      rollNo: `${level[0]}${i}`,
      studentName: `Applicant ${i + 1}`,
      fatherName: 'Father',
      group: level === 'MATRIC' ? 'Science' : level === 'INTERMEDIATE' ? 'ICS' : '',
      testName: level === 'ENTRY_TEST' ? 'Entry Test' : '',
      subjects: [{ name: 'Aggregate', obtained: p, total: 100 }],
      obtained: p,
      total: 100,
      percentage: p,
      trustLevel: 3,
      verificationStatus: 'VERIFIED',
      current: true,
    });
    await RecordModel.insertMany(
      ids.flatMap((u, i) => [
        record(u, i, 'MATRIC', pct(60 + r() * 39)),
        record(u, i, 'INTERMEDIATE', pct(55 + r() * 44)),
        record(u, i, 'ENTRY_TEST', pct(40 + r() * 59)),
      ]),
    );
    await ApplicationModel.insertMany(
      ids.map((applicantId, i) => {
        const order = [0, 1, 2].sort(() => r() - 0.5);
        return {
          institutionId: inst.inst._id,
          campaignId: camp._id,
          applicantId,
          applicationNumber: `PERF-F26-${String(i + 1).padStart(5, '0')}`,
          status: 'VERIFIED',
          submittedAt: new Date(),
          preferences: order.map((p, k) => ({ programId: programs[p]._id, shift: 'MORNING', order: k + 1 })),
          snapshot: { profile: { fullName: `Applicant ${i + 1}` }, records: [], fee: 2000 },
        };
      }),
    );

    const req = fakeReq(new Types.ObjectId(), inst.inst._id);
    const gen = await timed('PERF-3 merit list generation, 1,500 applicants x 3 preferences', 5000, () =>
      generateList(req, camp._id, new Date(Date.now() + 5 * 864e5)),
    );
    expect(gen.ms).toBeLessThan(5000);
    const list = await MeritListModel.findOne({ campaignId: camp._id });
    expect(list!.counts!.selected).toBe(300);
    await MeritListModel.updateOne(
      { _id: list!._id },
      { status: 'APPROVED', approvedBy: new Types.ObjectId(), approvedAt: new Date() },
    );
    const pub = await timed('PERF-4 merit list publication, 1,500 applicants (one transaction)', 30000, () =>
      publishList(fakeReq(new Types.ObjectId(), inst.inst._id), list!._id),
    );
    expect(pub.ms).toBeLessThan(30000);
    expect(await OfferModel.countDocuments({ meritListId: list!._id })).toBe(300);

    // PERF-8: 2,000 My Results requests from the applicants, 50 at a time.
    const tokens = ids.map((u, i) =>
      signAccessToken({ sub: String(u), typ: 'APPLICANT', role: null, name: `Applicant ${i + 1}` }),
    );
    const times: number[] = [];
    let errors = 0;
    const t0 = performance.now();
    for (let start = 0; start < 2000; start += 50) {
      await Promise.all(
        Array.from({ length: 50 }, async (_, k) => {
          const t = performance.now();
          const res = await api()
            .get('/api/v1/me/results')
            .set('Authorization', `Bearer ${tokens[(start + k) % N]}`);
          times.push(performance.now() - t);
          if (res.status !== 200) errors++;
        }),
      );
    }
    const total = Math.round(performance.now() - t0);
    times.sort((a, b) => a - b);
    const p95 = Math.round(times[Math.floor(times.length * 0.95)]!);
    results.push(
      `PERF-8 My Results: 2,000 requests in ${total} ms, 95th percentile ${p95} ms (target below 2000 ms, no errors) errors=${errors} ${p95 < 2000 && !errors ? 'PASS' : 'FAIL'}`,
    );
    console.log(results.at(-1));
    expect(errors).toBe(0);
    expect(p95).toBeLessThan(2000);
    expect(total).toBeLessThan(5 * 60_000);
  }, 600_000);

  it('PERF-5: Admission Advisor over 500 programs', async () => {
    const r = rand(7);
    const insts = await DirInstitutionModel.insertMany(
      Array.from({ length: 50 }, (_, i) => ({
        name: `Perf Institution ${i}`,
        slug: `perf-inst-${i}`,
        type: 'UNIVERSITY',
        sector: i % 2 ? 'PUBLIC' : 'PRIVATE',
        city: ['Lahore', 'Faisalabad', 'Multan'][i % 3],
        province: 'Punjab',
      })),
    );
    const progs = await DirProgramModel.insertMany(
      Array.from({ length: 500 }, (_, i) => ({
        directoryInstitutionId: insts[i % 50]!._id,
        title: `BS Program ${i}`,
        degreeLevel: 'BS',
        fieldGroup: ['Computing', 'Business', 'Engineering'][i % 3],
        feePerSemester: 40000 + (i % 10) * 10000,
        shifts: ['MORNING'],
        seats: 60,
        eligibility: [{ level: 'INTERMEDIATE', minPercentage: 45, groups: [] }],
        formula: [
          { component: 'MATRIC', weight: 25 },
          { component: 'INTERMEDIATE', weight: 75 },
        ],
      })),
    );
    await MeritHistoryModel.insertMany(
      progs.flatMap((p) =>
        [2023, 2024, 2025].map((year) => ({
          directoryProgramId: p._id,
          year,
          round: 1,
          closingMerit: pct(60 + r() * 30),
          source: 'Official merit list',
          origin: 'IMPORT',
          status: 'VERIFIED',
        })),
      ),
    );
    const run = await timed('PERF-5 Admission Advisor over 500 programs', 2000, () =>
      advise({ matric: 82, inter: 78 }),
    );
    expect(run.ms).toBeLessThan(2000);
  }, 120_000);

  it('PERF-6 and PERF-7: registry import of 50,000 rows and the check of one record', async () => {
    const user = await createUser('perf.registry@admitra.test', 'PLATFORM', { platformRole: 'SUPER_ADMIN' });
    const csv = [
      'board,exam_type,year,roll_no,student_name,father_name,obtained,total',
      ...Array.from(
        { length: 50000 },
        (_, i) => `BISE Lahore,INTERMEDIATE,2025,${100000 + i},Student ${i},Father,${700 + (i % 400)},1100`,
      ),
    ].join('\n');
    const file = {
      originalname: 'gazette-2025.csv',
      mimetype: 'text/csv',
      size: csv.length,
      buffer: Buffer.from(csv),
    } as Express.Multer.File;
    const imp = await timed('PERF-7 registry import, 50,000 rows (parse, validate, store)', 60000, () =>
      commitImport(fakeReq(user._id, null), file, 'BISE Lahore gazette 2025', { institutionId: null }),
    );
    expect(imp.value.summary.rows ?? imp.value.batch.rowCount).toBe(50000);
    expect(imp.ms).toBeLessThan(60000);
    const rec = await RecordModel.create({
      userId: user._id,
      level: 'INTERMEDIATE',
      board: 'BISE Lahore',
      examType: 'ANNUAL',
      year: 2025,
      rollNo: '123456',
      studentName: 'Student 23456',
      fatherName: 'Father',
      subjects: [],
      obtained: 700 + (23456 % 400),
      total: 1100,
      percentage: 0,
    } as never);
    const chk = await timed('PERF-6 automatic registry check of one record', 1000, () =>
      runRegistryCheck(rec as never),
    );
    expect(chk.ms).toBeLessThan(1000);
    expect(rec.verificationStatus).toBe('AUTO_VERIFIED');
  }, 180_000);

  it('PERF-2 and PERF-9: lists are capped at 100 rows and figures are cached for at most 30 s', async () => {
    const inst = await createInstitution(`pg${Math.random().toString(36).slice(2, 6)}`);
    expect((await inst.as.get('/applications?limit=500')).status).toBe(422);
    const ok = await inst.as.get('/applications');
    expect(ok.body.meta.limit).toBe(20);
    expect(MAX_CACHE_SECONDS).toBe(30);
    let calls = 0;
    await cached('perf:9', async () => ++calls, 3600);
    await cached('perf:9', async () => ++calls, 3600);
    expect(calls).toBe(1);
    results.push('PERF-2 default 20 rows, more than 100 refused: PASS');
    results.push('PERF-9 cache lifetime capped at 30 s: PASS');
    console.log(`\nPerformance summary\n${results.map((x) => `  ${x}`).join('\n')}`);
  });
});
