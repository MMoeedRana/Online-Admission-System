import { describe, expect, it } from 'vitest';
import { nameSimilarity } from '../src/lib/similarity';
import { FraudFlagModel, RecordModel } from '../src/modules/records/record.models';
import { RegistryRowModel } from '../src/modules/registry/registry.models';
import { RegistryBatchModel } from '../src/modules/registry/registry.models';
import { Types } from 'mongoose';
import { PDF, applicantAgent, interRecord, matricRecord } from './helpers';

async function addOfficial(
  over: Partial<{ obtained: number; studentName: string; rollNo: string; level: string; year: number }> = {},
) {
  const batch = await RegistryBatchModel.create({
    source: 'test',
    fileHash: 'x',
    uploadedBy: new Types.ObjectId(),
  });
  return RegistryRowModel.create({
    batchId: batch._id,
    board: 'BISE Faisalabad',
    level: 'INTERMEDIATE',
    year: 2024,
    rollNo: '523456',
    studentName: 'AYESHA NOOR',
    fatherName: 'NOOR AHMAD',
    obtained: 974,
    total: 1200,
    subjects: [],
    ...over,
  } as never);
}

describe('Academic records and marks verification (MARK-1 to MARK-9)', () => {
  it('TC-06 / MARK-2: rejects subject marks that do not add up and obtained above total', async () => {
    const a = await applicantAgent('r1@example.com');
    const bad = await a.post('/me/records').send(interRecord({ obtained: 980 }));
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.fields.obtained).toMatch(/add up/);
    const over = await a.post('/me/records').send(
      interRecord({
        subjects: [{ name: 'English', obtained: 210, total: 200 }],
        obtained: 210,
        total: 200,
      }),
    );
    expect(over.status).toBe(422);
  });

  it('MARK-2: the percentage is calculated by the system', async () => {
    const a = await applicantAgent('r2@example.com');
    const r = await a.post('/me/records').send({ ...interRecord(), percentage: 99 });
    expect(r.body.data.percentage).toBe(81.17);
  });

  it('TC-07: a record that matches the registry becomes AUTO_VERIFIED at trust level 2', async () => {
    await addOfficial();
    const a = await applicantAgent('r3@example.com');
    const r = await a.post('/me/records').send(interRecord({ studentName: 'Ayesha  Noor.' }));
    expect(r.body.data.verificationStatus).toBe('AUTO_VERIFIED');
    expect(r.body.data.trustLevel).toBe(2);
  });

  it('TC-08: a roll number that is not in the registry is UNDER_VERIFICATION; the result card raises trust to 1', async () => {
    const a = await applicantAgent('r4@example.com');
    const r = await a.post('/me/records').send(matricRecord());
    expect(r.body.data.verificationStatus).toBe('UNDER_VERIFICATION');
    expect(r.body.data.trustLevel).toBe(0);
    const up = await a.post(`/me/records/${r.body.data._id}/result-card`).attach('file', PDF, 'dmc.pdf');
    expect(up.status).toBe(200);
    expect(up.body.data.trustLevel).toBe(1);
  });

  it('TC-09: marks higher than the registry are a MISMATCH with the differing fields stored', async () => {
    await addOfficial({ obtained: 900 });
    const a = await applicantAgent('r5@example.com');
    const r = await a.post('/me/records').send(interRecord());
    expect(r.body.data.verificationStatus).toBe('MISMATCH');
    expect(r.body.data.registryDiff).toEqual([{ field: 'obtained', entered: 974, official: 900 }]);
  });

  it('TC-11 / MARK-8: editing a verified record creates a new version at level 0 and keeps the old one', async () => {
    await addOfficial();
    const a = await applicantAgent('r6@example.com');
    const r = await a.post('/me/records').send(interRecord());
    const edit = await a
      .put(`/me/records/${r.body.data._id}`)
      .send(interRecord({ registrationNo: 'X1', rollNo: '999999' }));
    expect(edit.body.data.version).toBe(2);
    expect(edit.body.data.trustLevel).toBe(0);
    const old = await RecordModel.findById(r.body.data._id);
    expect(old!.current).toBe(false);
    expect(old!.verificationStatus).toBe('SUPERSEDED');
    const hist = await a.get(`/me/records/${edit.body.data._id}/history`);
    expect(hist.body.data.versions).toHaveLength(2);
  });

  it('TC-12 / MARK-9: the same roll number claimed by two applicants raises a fraud flag', async () => {
    const a = await applicantAgent('r7@example.com');
    const b = await applicantAgent('r8@example.com');
    await a.post('/me/records').send(interRecord());
    await b.post('/me/records').send(interRecord({ studentName: 'Someone Else' }));
    const flag = await FraudFlagModel.findOne({ type: 'ROLL_NUMBER_CLAIMED_TWICE' });
    expect(flag!.userIds).toHaveLength(2);
  });

  it('MARK-9: the same result card file used by two applicants raises a fraud flag', async () => {
    const a = await applicantAgent('r9@example.com');
    const b = await applicantAgent('r10@example.com');
    const ra = await a.post('/me/records').send(matricRecord());
    const rb = await b.post('/me/records').send(matricRecord({ rollNo: '777777' }));
    await a.post(`/me/records/${ra.body.data._id}/result-card`).attach('file', PDF, 'a.pdf');
    await b.post(`/me/records/${rb.body.data._id}/result-card`).attach('file', PDF, 'b.pdf');
    expect(await FraudFlagModel.exists({ type: 'RESULT_CARD_REUSED' })).toBeTruthy();
  });

  it('boundary values of the name similarity (0.89 / 0.90)', () => {
    expect(nameSimilarity('Muhammad Ali Khan', 'Mohammad Ali Khan')).toBe(1);
    expect(nameSimilarity('ABCDEFGHIJ', 'ABCDEFGHIX')).toBeCloseTo(0.9, 5);
    expect(nameSimilarity('ABCDEFGHIJ', 'ABCDEFGHXX')).toBeLessThan(0.9);
  });

  it('one current record per qualification', async () => {
    const a = await applicantAgent('r11@example.com');
    await a.post('/me/records').send(interRecord());
    expect((await a.post('/me/records').send(interRecord())).status).toBe(409);
  });
});
