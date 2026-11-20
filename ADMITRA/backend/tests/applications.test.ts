import { ApplicantDocumentModel } from '../src/modules/documents/document.models';
import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { ApplicationModel } from '../src/modules/applications/application.model';
import { DocumentTypeModel, ensureDefaultDocumentTypes } from '../src/modules/documents/document.models';
import { NotificationModel } from '../src/modules/notifications/notification.models';
import { RegistryBatchModel, RegistryRowModel } from '../src/modules/registry/registry.models';
import { sentMails } from '../src/lib/mailer';
import {
  EXE,
  PDF,
  PNG,
  applicantAgent,
  createInstitution,
  interRecord,
  matricRecord,
  profilePayload,
  programPayload,
} from './helpers';

async function official(
  level: 'MATRIC' | 'INTERMEDIATE',
  rollNo: string,
  obtained: number,
  total: number,
  year: number,
) {
  const batch = await RegistryBatchModel.create({
    source: 'test',
    fileHash: 'x',
    uploadedBy: new Types.ObjectId(),
  });
  await RegistryRowModel.create({
    batchId: batch._id,
    board: 'BISE Faisalabad',
    level,
    year,
    rollNo,
    studentName: 'AYESHA NOOR',
    fatherName: 'NOOR AHMAD',
    obtained,
    total,
    subjects: [],
  });
}

/** An open campaign with one BS program and the default document requirements. */
async function setup(opts: { separateEligibility?: boolean } = {}) {
  const inst = await createInstitution(`ins-${Math.random().toString(36).slice(2, 7)}`);
  await ensureDefaultDocumentTypes(inst.inst._id);
  if (opts.separateEligibility === false)
    await inst.as.patch('/institution/profile').send({ settings: { eligibilityAsSeparateStep: false } });
  const prog = (
    await inst.as.post('/programs').send({
      ...programPayload(inst),
      eligibility: [
        { level: 'MATRIC', minPercentage: 45, groups: [], subjects: [] },
        { level: 'INTERMEDIATE', minPercentage: 50, groups: ['ICS', 'Pre-Engineering'], subjects: [] },
      ],
    })
  ).body.data;
  const camp = (
    await inst.as.post('/campaigns').send({
      title: 'Fall 2026',
      code: 'F26',
      sessionId: String(inst.session._id),
      opensAt: new Date(Date.now() - 864e5).toISOString(),
      closesAt: new Date(Date.now() + 10 * 864e5).toISOString(),
      programs: [{ programId: prog._id, seatCap: null }],
      settings: { maxPreferences: 2, feePolicy: 'HIGHEST', minTrustLevel: 2 },
    })
  ).body.data;
  await inst.as.post(`/campaigns/${camp._id}/status`).send({ to: 'OPEN' });
  const types = await DocumentTypeModel.find({ institutionId: inst.inst._id }).lean();
  return { inst, prog, camp, types };
}

/** Applicant with profile and both records verified by the registry. */
async function readyApplicant(email: string, cnic: string) {
  const a = await applicantAgent(email);
  await a.put('/me/profile').send(profilePayload(cnic));
  await a.post('/me/records').send(matricRecord());
  await a.post('/me/records').send(interRecord());
  return a;
}

async function uploadRequired(
  a: Awaited<ReturnType<typeof applicantAgent>>,
  appId: string,
  types: { _id: unknown; code: string; required: boolean }[],
) {
  for (const t of types.filter((t) => t.required)) {
    const r = await a
      .post(`/me/applications/${appId}/documents`)
      .field('documentTypeId', String(t._id))
      .attach('file', t.code === 'PHOTO' ? PNG : PDF, `${t.code}.${t.code === 'PHOTO' ? 'png' : 'pdf'}`);
    expect(r.status).toBe(201);
  }
}

describe('Applicant profile (PROF-1 to PROF-5)', () => {
  it('PROF-4: formats the CNIC and rejects a CNIC used by another account', async () => {
    const a = await applicantAgent('p1@example.com');
    const r = await a.put('/me/profile').send(profilePayload('35202-1234567-1'));
    expect(r.status).toBe(200);
    expect(r.body.data.cnic).toBe('3520212345671');
    expect(r.body.data.cnicFormatted).toBe('35202-1234567-1');
    const b = await applicantAgent('p2@example.com');
    expect((await b.put('/me/profile').send(profilePayload('3520212345671'))).status).toBe(409);
    expect((await b.put('/me/profile').send(profilePayload('12345'))).status).toBe(422);
  });

  it('PROF-5: exports data and deletes the account while nothing is submitted', async () => {
    const a = await applicantAgent('p3@example.com');
    await a.put('/me/profile').send(profilePayload('3520299999991'));
    const exp = await a.get('/me/profile/export');
    expect(exp.body.profile.cnic).toBe('3520299999991');
    expect((await a.delete('/me/profile/account')).status).toBe(200);
  });
});

describe('Application journey (APP, DOC, FEE, FLOW)', () => {
  it('UC-05 to UC-07: draft -> documents -> submit -> pay -> verify -> review -> verified', async () => {
    const { inst, prog, camp, types } = await setup();
    await official('MATRIC', '412345', 950, 1100, 2022);
    await official('INTERMEDIATE', '523456', 974, 1200, 2024);
    const a = await readyApplicant('flow@example.com', '3520211111111');

    const draft = await a.post('/me/applications').send({ campaignId: camp._id, programId: prog._id });
    expect(draft.status).toBe(201);
    const appId = draft.body.data._id;
    // TC-21: missing documents are listed and submission is refused.
    const early = await a.post(`/me/applications/${appId}/submit`);
    expect(early.status).toBe(422);
    expect(early.body.error.details.missing.map((m: { key: string }) => m.key)).toEqual(
      expect.arrayContaining(['document:CNIC', 'document:PHOTO']),
    );

    // TC-22: an executable renamed to .pdf is rejected by its content.
    const exe = await a
      .post(`/me/applications/${appId}/documents`)
      .field('documentTypeId', String(types[0]!._id))
      .attach('file', EXE, 'cnic.pdf');
    expect(exe.status).toBe(422);
    await uploadRequired(a, appId, types);

    const sub = await a.post(`/me/applications/${appId}/submit`);
    expect(sub.status).toBe(200);
    expect(sub.body.data.application.applicationNumber).toMatch(/-F26-MAIN-00001$/);
    expect(sub.body.data.application.status).toBe('PAYMENT_PENDING');
    expect(sub.body.data.voucher.amount).toBe(2000);
    expect(sub.body.data.application.snapshot.profile.cnic).toBe('3520211111111');
    expect(sentMails.some((m) => m.subject.includes('received'))).toBe(true);

    // APP-2: a second application in the same campaign is refused.
    expect((await a.post('/me/applications').send({ campaignId: camp._id })).status).toBe(409);
    // APP-5: documents cannot be changed after submission.
    expect(
      (
        await a
          .post(`/me/applications/${appId}/documents`)
          .field('documentTypeId', String(types[0]!._id))
          .attach('file', PDF, 'x.pdf')
      ).status,
    ).toBe(409);
    // TC-26: document verification cannot start before the fee is verified.
    expect(
      (await inst.as.post(`/applications/${appId}/transition`).send({ to: 'DOCUMENT_VERIFICATION' })).status,
    ).toBe(409);

    // TC-23: wrong amount is rejected.
    const pay = (amount: number, reference: string) =>
      a
        .post(`/me/applications/${appId}/payments`)
        .field('method', 'BANK_DEPOSIT')
        .field('reference', reference)
        .field('amount', String(amount))
        .field('paidOn', new Date().toISOString())
        .attach('file', PNG, 'slip.png');
    expect((await pay(1500, 'TRX1001')).status).toBe(422);
    const proof = await pay(2000, 'TRX1001');
    expect(proof.status).toBe(201);
    expect((await pay(2000, 'TRX1002')).status).toBe(409); // already waiting

    // TC-25: finance verifies -> receipt, voucher paid, application under review.
    const dec = await inst.as
      .post(`/payments/${proof.body.data._id}/decision`)
      .send({ decision: 'VERIFIED' });
    expect(dec.status).toBe(200);
    expect(dec.body.data.receiptNumber).toMatch(/^RCPT-/);
    expect(
      (
        await inst.as
          .post(`/payments/${proof.body.data._id}/decision`)
          .send({ decision: 'REJECTED', reason: 'second time' })
      ).status,
    ).toBe(409);
    expect((await ApplicationModel.findById(appId))!.status).toBe('UNDER_REVIEW');

    // Officer: document verification, approve every document, eligibility, verified.
    expect(
      (await inst.as.post(`/applications/${appId}/transition`).send({ to: 'DOCUMENT_VERIFICATION' })).status,
    ).toBe(200);
    expect(
      (await inst.as.post(`/applications/${appId}/transition`).send({ to: 'ELIGIBILITY_CHECK' })).status,
    ).toBe(409); // docs not approved
    const detail = await inst.as.get(`/applications/${appId}`);
    expect(detail.body.data.preferences[0]).toMatchObject({ order: 1, shift: expect.any(String) });
    for (const d of detail.body.data.documents.filter((d: { current: boolean }) => d.current)) {
      expect(
        (
          await inst.as
            .post(`/applications/${appId}/documents/${d._id}/review`)
            .send({ decision: 'APPROVED' })
        ).status,
      ).toBe(200);
    }
    // DOC-4: every decision is kept with the reviewer and the time.
    const reviewed = await ApplicantDocumentModel.find({ applicationId: appId, current: true }).lean();
    expect(
      reviewed.every(
        (d) => d.reviewTrail.length === 1 && d.reviewTrail[0]!.reviewerName && d.reviewTrail[0]!.at,
      ),
    ).toBe(true);
    expect(
      (await inst.as.post(`/applications/${appId}/transition`).send({ to: 'ELIGIBILITY_CHECK' })).status,
    ).toBe(200);
    expect((await inst.as.post(`/applications/${appId}/transition`).send({ to: 'VERIFIED' })).status).toBe(
      200,
    );
    expect(await NotificationModel.countDocuments({ type: 'APPLICATION_VERIFIED' })).toBe(1);

    // FLOW-5: internal notes are hidden from the applicant.
    await inst.as.post(`/applications/${appId}/notes`).send({ text: 'Checked originals at the counter' });
    const mine = await a.get(`/me/applications/${appId}`);
    expect(mine.body.data.application.notes).toBeUndefined();
    expect(mine.body.data.application.history.map((h: { to: string }) => h.to)).toEqual([
      'SUBMITTED',
      'PAYMENT_PENDING',
      'UNDER_REVIEW',
      'DOCUMENT_VERIFICATION',
      'ELIGIBILITY_CHECK',
      'VERIFIED',
    ]);
  });

  it('FLOW-4: an application with unverified marks cannot become VERIFIED; deficiency and resubmission', async () => {
    const { inst, prog, camp, types } = await setup({ separateEligibility: false });
    const a = await readyApplicant('flow2@example.com', '3520222222222'); // no registry rows -> under verification
    const recs = (await a.get('/me/records')).body.data;
    for (const r of recs) await a.post(`/me/records/${r._id}/result-card`).attach('file', PDF, 'dmc.pdf');
    const appId = (await a.post('/me/applications').send({ campaignId: camp._id, programId: prog._id })).body
      .data._id;
    await uploadRequired(a, appId, types);
    expect((await a.post(`/me/applications/${appId}/submit`)).status).toBe(200);
    const proof = await a
      .post(`/me/applications/${appId}/payments`)
      .field('method', 'EASYPAISA')
      .field('reference', 'EP-555')
      .field('amount', '2000')
      .field('paidOn', new Date().toISOString())
      .attach('file', PNG, 's.png');
    await inst.as.post(`/payments/${proof.body.data._id}/decision`).send({ decision: 'VERIFIED' });
    await inst.as.post(`/applications/${appId}/transition`).send({ to: 'DOCUMENT_VERIFICATION' });

    const detail = (await inst.as.get(`/applications/${appId}`)).body.data;
    const docs = detail.documents.filter((d: { current: boolean }) => d.current);
    // Reject the CNIC copy, send a deficiency notice (note required).
    await inst.as
      .post(`/applications/${appId}/documents/${docs[0]._id}/review`)
      .send({ decision: 'REJECTED', reason: 'The copy is not readable' });
    expect((await inst.as.post(`/applications/${appId}/transition`).send({ to: 'DEFICIENT' })).status).toBe(
      422,
    );
    expect(
      (
        await inst.as
          .post(`/applications/${appId}/transition`)
          .send({ to: 'DEFICIENT', note: 'Upload a clear CNIC copy' })
      ).status,
    ).toBe(200);
    expect((await a.post(`/me/applications/${appId}/resubmit`)).status).toBe(409);
    const t = types.find((x) => String(x._id) === String(docs[0].documentTypeId))!;
    await a
      .post(`/me/applications/${appId}/documents`)
      .field('documentTypeId', String(t._id))
      .attach('file', t.code === 'PHOTO' ? PNG : PDF, 'new');
    expect((await a.post(`/me/applications/${appId}/resubmit`)).status).toBe(200);

    const again = (await inst.as.get(`/applications/${appId}`)).body.data.documents.filter(
      (d: { current: boolean; status: string }) => d.current && d.status !== 'APPROVED',
    );
    for (const d of again)
      await inst.as.post(`/applications/${appId}/documents/${d._id}/review`).send({ decision: 'APPROVED' });
    for (const d of docs.slice(1))
      await inst.as.post(`/applications/${appId}/documents/${d._id}/review`).send({ decision: 'APPROVED' });
    const blocked = await inst.as.post(`/applications/${appId}/transition`).send({ to: 'VERIFIED' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/trust level 2/);

    // Officer verifies both records in the panel (trust level 3), then the application can be verified.
    for (const r of recs)
      expect(
        (
          await inst.as
            .post(`/verifications/${r._id}/decision`)
            .send({ decision: 'VERIFIED', note: 'Compared with original DMC' })
        ).status,
      ).toBe(200);
    expect((await inst.as.post(`/applications/${appId}/transition`).send({ to: 'VERIFIED' })).status).toBe(
      200,
    );
  });

  it('APP-1: shows why a program is not eligible and refuses submission', async () => {
    const { prog, camp } = await setup();
    const a = await applicantAgent('weak@example.com');
    await a.put('/me/profile').send(profilePayload('3520233333333'));
    await a.post('/me/records').send(matricRecord());
    await a.post('/me/records').send(interRecord({ group: 'Pre-Medical' }));
    const appId = (await a.post('/me/applications').send({ campaignId: camp._id, programId: prog._id })).body
      .data._id;
    const d = await a.get(`/me/applications/${appId}`);
    expect(d.body.data.programs[0].eligibility.eligible).toBe(false);
    expect(d.body.data.missing.map((m: { message: string }) => m.message).join(' ')).toMatch(
      /group must be ICS or Pre-Engineering/,
    );
  });

  it('files are private: another applicant cannot download them', async () => {
    const a = await applicantAgent('own1@example.com');
    const b = await applicantAgent('own2@example.com');
    const r = await a.post('/me/records').send(matricRecord());
    const up = await a.post(`/me/records/${r.body.data._id}/result-card`).attach('file', PDF, 'dmc.pdf');
    const fileId = up.body.data.resultCardFileId;
    expect((await a.get(`/files/${fileId}`)).status).toBe(200);
    expect((await b.get(`/files/${fileId}`)).status).toBe(404);
  });

  it('withdrawal cancels the challan', async () => {
    const { prog, camp, types } = await setup();
    await official('MATRIC', '412345', 950, 1100, 2022);
    await official('INTERMEDIATE', '523456', 974, 1200, 2024);
    const a = await readyApplicant('wd@example.com', '3520244444444');
    const appId = (await a.post('/me/applications').send({ campaignId: camp._id, programId: prog._id })).body
      .data._id;
    await uploadRequired(a, appId, types);
    await a.post(`/me/applications/${appId}/submit`);
    const w = await a.post(`/me/applications/${appId}/withdraw`);
    expect(w.body.data.status).toBe('WITHDRAWN');
    expect((await a.get(`/me/applications/${appId}`)).body.data.vouchers[0].status).toBe('CANCELLED');
  });
});
