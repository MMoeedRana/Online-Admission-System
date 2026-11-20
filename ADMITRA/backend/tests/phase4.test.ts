import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { collectRouters, openApiDocument } from '../src/docs/routers';
import { cached, MAX_CACHE_SECONDS } from '../src/lib/cache';
import { csvCell } from '../src/lib/csv';
import { sentMails } from '../src/lib/mailer';
import { ApplicationModel } from '../src/modules/applications/application.model';
import { AuditLogModel } from '../src/modules/audit/audit.model';
import { AdvisorLogModel } from '../src/modules/directory/directory.models';
import { ApplicantDocumentModel } from '../src/modules/documents/document.models';
import { VoucherModel } from '../src/modules/fees/fee.models';
import { EnrollmentModel, OfferModel } from '../src/modules/merit/merit.models';
import { NotificationModel } from '../src/modules/notifications/notification.models';
import { RecordModel, VerificationModel } from '../src/modules/records/record.models';
import { MemberModel } from '../src/modules/staff/member.model';
import { SupportTicketModel } from '../src/modules/support/support.model';
import { api, createInstitution, createUser, login, programPayload, superAdminToken } from './helpers';

type Inst = Awaited<ReturnType<typeof createInstitution>>;
const oid = () => new Types.ObjectId();

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
  return (url: string, method: 'get' | 'post' = 'get') =>
    api()[method](`/api/v1${url}`).set('Authorization', `Bearer ${token}`).set('X-Institution-Id', inst.id);
}

/** A campaign with one program (40 seats) and applications at each step of the funnel. */
async function funnelData(inst: Inst) {
  const prog = (
    await inst.as
      .post('/programs')
      .send({ ...programPayload(inst), shifts: [{ name: 'MORNING', seats: 40 }] })
  ).body.data;
  const campRes = await inst.as.post('/campaigns').send({
    title: 'Fall 2026',
    code: 'F26',
    sessionId: String(inst.session._id),
    opensAt: new Date(Date.now() - 864e5).toISOString(),
    closesAt: new Date(Date.now() + 10 * 864e5).toISOString(),
    programs: [{ programId: prog._id, seatCap: null }],
    settings: { maxPreferences: 3, feePolicy: 'HIGHEST', minTrustLevel: 2 },
  });
  if (campRes.status !== 201) throw new Error(JSON.stringify(campRes.body));
  const camp = campRes.body.data;
  // status, fee paid, offered, accepted, enrolled
  const steps: [string, boolean, boolean, boolean, boolean][] = [
    ['SUBMITTED', false, false, false, false],
    ['UNDER_REVIEW', true, false, false, false],
    ['VERIFIED', true, false, false, false],
    ['NOT_SELECTED', true, false, false, false],
    ['OFFER_ISSUED', true, true, false, false],
    ['OFFER_ISSUED', true, true, true, false],
    ['ENROLLED', true, true, true, true],
    ['DRAFT', false, false, false, false],
  ];
  let i = 0;
  for (const [status, paid, offered, accepted, enrolled] of steps) {
    i++;
    const applicantId = oid();
    const app = await ApplicationModel.create({
      institutionId: inst.inst._id,
      campaignId: camp._id,
      applicantId,
      applicationNumber: status === 'DRAFT' ? null : `T-F26-${String(i).padStart(5, '0')}`,
      status,
      preferences: [{ programId: prog._id, shift: 'MORNING', order: 1 }],
      snapshot: {
        profile: { fullName: i === 1 ? '=HYPERLINK("x")' : `Applicant ${i}`, fatherName: 'Father' },
        records: [],
        fee: 2000,
      },
      submittedAt: status === 'DRAFT' ? undefined : new Date(Date.now() - i * 864e5),
      history:
        status === 'NOT_SELECTED' ? [{ from: 'ELIGIBILITY_CHECK', to: 'VERIFIED', actor: 'STAFF' }] : [],
    } as never);
    await RecordModel.create({
      userId: applicantId,
      level: 'MATRIC',
      board: 'BISE Faisalabad',
      examType: 'ANNUAL',
      year: 2024,
      rollNo: `R${i}`,
      studentName: `Applicant ${i}`,
      fatherName: 'Father',
      obtained: 900,
      total: 1100,
      percentage: 81.8,
      trustLevel: i % 2 ? 2 : 0,
      verificationStatus: i % 2 ? 'AUTO_VERIFIED' : 'DECLARED',
    } as never);
    if (status !== 'DRAFT')
      await VoucherModel.create({
        institutionId: inst.inst._id,
        applicationId: app._id,
        applicantId,
        voucherNumber: `CH-${inst.id.slice(-4)}-${i}`,
        type: 'APPLICATION',
        amount: 2000,
        dueDate: new Date(),
        status: paid ? 'PAID' : 'ISSUED',
      });
    if (offered) {
      const offer = await OfferModel.create({
        institutionId: inst.inst._id,
        campaignId: camp._id,
        meritListId: oid(),
        entryId: oid(),
        applicationId: app._id,
        applicantId,
        programId: prog._id,
        shift: 'MORNING',
        deadline: new Date(Date.now() + 864e5),
        status: enrolled ? 'ENROLLED' : accepted ? 'ACCEPTED' : 'OFFERED',
      });
      if (enrolled)
        await EnrollmentModel.create({
          institutionId: inst.inst._id,
          campaignId: camp._id,
          offerId: offer._id,
          applicationId: app._id,
          applicantId,
          programId: prog._id,
          shift: 'MORNING',
          registrationNumber: `REG-${i}`,
          status: 'ENROLLED',
        });
    }
    if (i <= 4)
      await ApplicantDocumentModel.create({
        applicationId: app._id,
        institutionId: inst.inst._id,
        documentTypeId: oid(),
        fileId: oid(),
        status: i === 1 ? 'REJECTED' : 'APPROVED',
        reviewTrail: [{ decision: i === 1 ? 'REJECTED' : 'APPROVED', reason: '', at: new Date() }],
      });
  }
  return { prog, camp };
}

describe('institution analytics (RPT-1)', () => {
  it('returns the funnel, daily submissions, per-seat figures, fees, rejection rate and verified share', async () => {
    const inst = await createInstitution(`a${Math.random().toString(36).slice(2, 7)}`);
    const { camp } = await funnelData(inst);
    const r = await inst.as.get(`/analytics?campaignId=${camp._id}&days=14`);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.funnel.map((s: { value: number }) => s.value)).toEqual([7, 6, 5, 3, 2, 1]);
    expect(d.dailySubmissions).toHaveLength(14);
    expect(d.dailySubmissions.reduce((s: number, x: { count: number }) => s + x.count, 0)).toBe(7);
    expect(d.programs[0]).toMatchObject({
      seats: 40,
      applications: 7,
      applicants: 7,
      applicationsPerSeat: 0.18,
    });
    expect(d.fees.application.collected).toBe(12000);
    expect(d.fees.application.outstanding).toBe(2000);
    expect(d.documents).toMatchObject({ reviewed: 4, rejected: 1, rejectionRate: 25 });
    expect(d.marks.verifiedShare).toBeCloseTo(57.1, 1); // 4 of 7 records at trust level 2
    expect((await inst.as.get('/analytics?days=30')).body.data.dailySubmissions).toHaveLength(30);
    expect((await inst.as.get('/analytics?days=7')).status).toBe(422);
  });

  it('is limited to roles with analytics.view and to the own institution', async () => {
    const inst = await createInstitution(`b${Math.random().toString(36).slice(2, 7)}`);
    const other = await createInstitution(`c${Math.random().toString(36).slice(2, 7)}`);
    const { camp } = await funnelData(other);
    const officer = await staff(inst, `officer.${inst.id}@x.test`, ['ADMISSION_OFFICER']);
    const finance = await staff(inst, `finance.${inst.id}@x.test`, ['FINANCE_OFFICER']);
    expect((await officer('/analytics')).status).toBe(403);
    expect((await finance('/analytics')).status).toBe(200);
    expect((await inst.as.get(`/analytics?campaignId=${camp._id}`)).status).toBe(404);
    expect((await inst.as.get('/analytics')).body.data.funnel[0].value).toBe(0);
  });
});

describe('reports (RPT-2)', () => {
  it('exports applications, payments and merit lists as CSV and PDF', async () => {
    const inst = await createInstitution(`r${Math.random().toString(36).slice(2, 7)}`);
    const { camp } = await funnelData(inst);
    const csv = await inst.as.get(`/reports/applications.csv?campaignId=${camp._id}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.trim().split('\r\n');
    expect(lines).toHaveLength(8); // header + 7 submitted
    expect(lines[0]).toContain('"Application"');
    expect(csv.text).toContain(`"'=HYPERLINK(""x"")"`); // formula neutralised
    const pdf = await inst.as.get('/reports/applications.pdf').buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(String(pdf.body.slice(0, 4))).toBe('%PDF');
    expect((await inst.as.get('/reports/payments.csv')).status).toBe(200);
    expect((await inst.as.get('/reports/payments.pdf')).headers['content-type']).toBe('application/pdf');
    expect((await inst.as.get(`/reports/merit-lists/${oid()}.csv`)).status).toBe(404);
    const officer = await staff(inst, `o.${inst.id}@x.test`, ['ADMISSION_OFFICER']);
    expect((await officer('/reports/applications.csv')).status).toBe(200);
    expect((await officer('/reports/payments.csv')).status).toBe(403);
  });

  it('neutralises spreadsheet formulas in CSV cells', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('-5')).toBe(`"'-5"`);
    expect(csvCell('Ali "Khan"')).toBe('"Ali ""Khan"""');
  });
});

describe('support tickets (SUP-1, SUP-2, SUP-3)', () => {
  it('opens a ticket with a response target, notifies the platform team and threads replies', async () => {
    const root = await superAdminToken();
    const asRoot = (url: string, method: 'get' | 'post' | 'patch' = 'get') =>
      api()[method](`/api/v1${url}`).set('Authorization', `Bearer ${root}`);
    const inst = await createInstitution(`s${Math.random().toString(36).slice(2, 7)}`);
    const other = await createInstitution(`t${Math.random().toString(36).slice(2, 7)}`);

    expect(
      (await inst.as.post('/support/tickets').send({ subject: 'Hi', category: 'TECHNICAL', message: 'x' }))
        .status,
    ).toBe(422);
    const opened = await inst.as.post('/support/tickets').send({
      subject: 'Challan PDF does not open',
      category: 'TECHNICAL',
      priority: 'URGENT',
      message: 'Applicants report that the challan PDF shows a blank page.',
    });
    expect(opened.status).toBe(201);
    const t = opened.body.data;
    expect(t.ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/);
    expect(t.status).toBe('OPEN');
    const hours = (new Date(t.responseDueAt).getTime() - new Date(t.createdAt).getTime()) / 3600_000;
    expect(Math.round(hours)).toBe(2); // URGENT: 2 hours
    expect(
      await NotificationModel.countDocuments({ type: 'SUPPORT', link: `/platform/support/${t._id}` }),
    ).toBe(1);
    expect(sentMails.some((m) => m.to === 'root@admitra.test' && m.subject.includes(t.ticketNumber))).toBe(
      true,
    );
    // SEC-4: text written by users is escaped in the HTML e-mail
    await inst.as
      .post(`/support/tickets/${t._id}/replies`)
      .send({ message: '<img src=x onerror=alert(1)> please check' });
    expect(sentMails.at(-1)!.html).toContain('&lt;img src=x');
    expect(sentMails.at(-1)!.html).not.toContain('<img src=x');

    // SUP-2: another institution neither lists nor opens it
    expect((await other.as.get(`/support/tickets/${t._id}`)).status).toBe(404);
    expect((await other.as.get('/support/tickets')).body.data).toHaveLength(0);
    expect((await inst.as.get('/support/tickets')).body.data).toHaveLength(1);
    const officer = await staff(inst, `off.${inst.id}@x.test`, ['ADMISSION_OFFICER']);
    expect((await officer('/support/tickets')).status).toBe(403);

    // SUP-3: platform reply moves it on and notifies the institution
    const list = await asRoot('/platform/support?status=ACTIVE');
    expect(list.body.data[0].institution.name).toBe(inst.inst.name);
    const rep = await asRoot(`/platform/support/${t._id}/replies`, 'post').send({
      message: 'Please send one challan number so we can check it.',
      status: 'WAITING_ON_INSTITUTION',
    });
    expect(rep.status).toBe(200);
    expect(rep.body.data.status).toBe('WAITING_ON_INSTITUTION');
    expect(rep.body.data.responseState).toBe('MET');
    expect(
      await NotificationModel.countDocuments({ type: 'SUPPORT', link: `/institution/support/${t._id}` }),
    ).toBe(1);

    // The institution's reply reopens the ticket
    const back = await inst.as
      .post(`/support/tickets/${t._id}/replies`)
      .send({ message: 'Challan CH-2026-000123 is affected.' });
    expect(back.body.data.status).toBe('OPEN');
    expect(back.body.data.messages).toHaveLength(4);
    expect(
      (await asRoot(`/platform/support/${t._id}`, 'patch').send({ status: 'RESOLVED' })).body.data.status,
    ).toBe('RESOLVED');
    expect((await inst.as.post(`/support/tickets/${t._id}/close`)).body.data.status).toBe('CLOSED');
    expect(await AuditLogModel.countDocuments({ entity: 'SupportTicket' })).toBeGreaterThanOrEqual(4);
  });

  it('flags tickets whose first response is overdue', async () => {
    const root = await superAdminToken();
    const inst = await createInstitution(`u${Math.random().toString(36).slice(2, 7)}`);
    await SupportTicketModel.create({
      ticketNumber: 'TKT-2026-99999',
      institutionId: inst.inst._id,
      openedBy: oid(),
      openedByName: 'Admin',
      subject: 'Old ticket',
      category: 'BILLING',
      priority: 'HIGH',
      responseDueAt: new Date(Date.now() - 3600_000),
      messages: [{ authorId: oid(), authorName: 'Admin', side: 'INSTITUTION', body: 'Help' }],
    });
    const r = await api().get('/api/v1/platform/support?overdue=true').set('Authorization', `Bearer ${root}`);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0].responseState).toBe('OVERDUE');
    expect(r.body.meta.counts.overdue).toBe(1);
  });
});

describe('audit log and platform analytics (SEC-7, RPT-3)', () => {
  it('shows an institution only its own audit entries and the platform all of them', async () => {
    const root = await superAdminToken();
    const a = await createInstitution(`v${Math.random().toString(36).slice(2, 7)}`);
    const b = await createInstitution(`w${Math.random().toString(36).slice(2, 7)}`);
    await AuditLogModel.create([
      { institutionId: a.inst._id, action: 'PROGRAM_CREATED', entity: 'Program', actorName: 'A admin' },
      { institutionId: a.inst._id, action: 'STAFF_INVITED', entity: 'Member', actorName: 'A admin' },
      { institutionId: b.inst._id, action: 'PROGRAM_CREATED', entity: 'Program', actorName: 'B admin' },
    ]);
    const own = await a.as.get('/audit-logs');
    expect(own.body.data).toHaveLength(2);
    expect(own.body.meta.actions).toEqual(['PROGRAM_CREATED', 'STAFF_INVITED']);
    expect((await a.as.get('/audit-logs?action=STAFF_INVITED')).body.data).toHaveLength(1);
    expect((await a.as.get('/audit-logs/export.csv')).text).toContain('STAFF_INVITED');
    const officer = await staff(a, `aud.${a.id}@x.test`, ['ADMISSION_OFFICER']);
    expect((await officer('/audit-logs')).status).toBe(403);
    const all = await api()
      .get('/api/v1/platform/audit-logs?q=program')
      .set('Authorization', `Bearer ${root}`);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data[0].institution).not.toBeNull();
  });

  it('reports advisor usage by program and registry match rates', async () => {
    const root = await superAdminToken();
    const p1 = oid();
    await AdvisorLogModel.create([
      {
        inputs: { matric: 80, inter: 75, fieldGroup: 'Computing' },
        resultCount: 2,
        programs: [
          { directoryProgramId: p1, band: 'SAFE' },
          { directoryProgramId: oid(), band: 'REACH' },
        ],
        signedIn: true,
      },
      {
        inputs: { matric: 70, inter: 65, fieldGroup: 'Computing' },
        resultCount: 1,
        programs: [{ directoryProgramId: p1, band: 'TARGET' }],
        signedIn: false,
      },
    ]);
    const rec = await RecordModel.create({
      userId: oid(),
      level: 'MATRIC',
      board: 'BISE Lahore',
      examType: 'ANNUAL',
      year: 2024,
      rollNo: '1',
      studentName: 'X',
      fatherName: 'Y',
      obtained: 900,
      total: 1100,
      percentage: 81.8,
    } as never);
    await VerificationModel.create([
      { recordId: rec._id, userId: rec.userId, method: 'REGISTRY', status: 'MATCH' },
      { recordId: rec._id, userId: rec.userId, method: 'REGISTRY', status: 'MATCH' },
      { recordId: rec._id, userId: rec.userId, method: 'REGISTRY', status: 'MISMATCH' },
      { recordId: rec._id, userId: rec.userId, method: 'REGISTRY', status: 'NOT_FOUND' },
    ]);
    const r = await api().get('/api/v1/platform/analytics?days=14').set('Authorization', `Bearer ${root}`);
    expect(r.status).toBe(200);
    expect(r.body.data.advisor.runs).toBe(2);
    expect(r.body.data.advisor.signedInShare).toBe(50);
    expect(r.body.data.advisor.topPrograms[0]).toMatchObject({
      id: String(p1),
      appearances: 2,
      safe: 1,
      target: 1,
    });
    expect(r.body.data.registry).toMatchObject({
      checks: 4,
      matched: 2,
      matchRate: 50,
      mismatchRate: 25,
      notFoundRate: 25,
    });
    expect(r.body.data.registry.boards[0]).toMatchObject({ board: 'BISE Lahore', matchRate: 50 });
    const inst = await createInstitution(`x${Math.random().toString(36).slice(2, 7)}`);
    expect(
      (await api().get('/api/v1/platform/analytics').set('Authorization', `Bearer ${inst.token}`)).status,
    ).toBe(403);
  });
});

describe('OpenAPI and caching (PERF-9)', () => {
  it('serves an OpenAPI 3.1 document that lists every mounted endpoint', async () => {
    const committed = JSON.parse(readFileSync(join(__dirname, '../src/docs/openapi.json'), 'utf8'));
    const fresh = openApiDocument(await collectRouters());
    expect(Object.keys(committed.paths).sort()).toEqual(Object.keys(fresh.paths).sort()); // run `npm run docs:api` if this fails
    const r = await api().get('/api/v1/openapi.json');
    expect(r.body.openapi).toBe('3.1.0');
    expect(r.body.paths['/api/v1/support/tickets'].post).toBeDefined();
    const ui = await api().get('/api/v1/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger');
  });

  it('caches for at most 30 seconds', async () => {
    let calls = 0;
    const load = async () => ++calls;
    expect(await cached('t:1', load, 120)).toBe(1);
    expect(await cached('t:1', load, 120)).toBe(1);
    expect(MAX_CACHE_SECONDS).toBe(30);
  });
});
