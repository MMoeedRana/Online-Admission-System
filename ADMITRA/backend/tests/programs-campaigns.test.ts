import { describe, expect, it } from 'vitest';
import { closeExpiredCampaigns } from '../src/jobs/campaigns.job';
import { CampaignModel } from '../src/modules/campaigns/campaign.model';
import { AuditLogModel } from '../src/modules/audit/audit.model';
import { createInstitution, programPayload } from './helpers';

const day = 864e5;

function campaignPayload(ctx: { session: { _id: unknown } }, programId: string, extra: object = {}) {
  return {
    title: 'Fall 2026',
    code: 'F26',
    sessionId: String(ctx.session._id),
    opensAt: new Date(Date.now() - day).toISOString(),
    closesAt: new Date(Date.now() + 10 * day).toISOString(),
    programs: [{ programId, seatCap: null }],
    settings: {
      maxPreferences: 3,
      duplicatePolicy: 'ONE_ACTIVE',
      latePolicy: 'REFUSE',
      feePolicy: 'HIGHEST',
      minTrustLevel: 2,
    },
    ...extra,
  };
}

describe('Academic structure and programs (PROG-1 to PROG-4)', () => {
  it('PROG-3: program codes are unique within an institution but may repeat across institutions', async () => {
    const a = await createInstitution('pa');
    const b = await createInstitution('pb');
    expect((await a.as.post('/programs').send(programPayload(a))).status).toBe(201);
    const dup = await a.as.post('/programs').send(programPayload(a));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.fields.code).toBeTruthy();
    expect((await b.as.post('/programs').send(programPayload(b))).status).toBe(201);
  });

  it('PROG-2: validates shifts, seats and entry test name', async () => {
    const a = await createInstitution('pv');
    const bad = await a.as
      .post('/programs')
      .send({ ...programPayload(a), shifts: [{ name: 'MORNING', seats: 0 }], testName: '' });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.details.fields)).toEqual(
      expect.arrayContaining(['shifts.0.seats', 'testName']),
    );
  });

  it('PROG-4: a program used by a campaign cannot be deleted, it is archived instead', async () => {
    const a = await createInstitution('pd');
    const pid = (await a.as.post('/programs').send(programPayload(a))).body.data._id;
    expect((await a.as.post('/campaigns').send(campaignPayload(a, pid))).status).toBe(201);
    expect((await a.as.delete(`/programs/${pid}`)).status).toBe(409);
    expect((await a.as.post(`/programs/${pid}/status`).send({ status: 'ARCHIVED' })).status).toBe(200);
    expect((await a.as.delete(`/structure/departments/${a.department._id}`)).status).toBe(409);
  });

  it('writes an audit entry for configuration changes', async () => {
    const a = await createInstitution('pl');
    await a.as.post('/programs').send(programPayload(a));
    expect(await AuditLogModel.countDocuments({ action: 'PROGRAM_CREATED', institutionId: a.id })).toBe(1);
  });
});

describe('Admission campaigns (CAMP-1 to CAMP-3)', () => {
  it('CAMP-1: follows DRAFT -> OPEN -> CLOSED -> OPEN / ARCHIVED and rejects other changes', async () => {
    const a = await createInstitution('ca');
    const pid = (await a.as.post('/programs').send(programPayload(a))).body.data._id;
    const cid = (await a.as.post('/campaigns').send(campaignPayload(a, pid))).body.data._id;
    const move = (to: string) => a.as.post(`/campaigns/${cid}/status`).send({ to });
    expect((await move('CLOSED')).status).toBe(409);
    expect((await move('OPEN')).status).toBe(200);
    expect((await move('ARCHIVED')).status).toBe(409);
    expect((await move('CLOSED')).status).toBe(200);
    expect((await move('OPEN')).status).toBe(200);
    expect((await move('CLOSED')).status).toBe(200);
    expect((await move('ARCHIVED')).status).toBe(200);
    expect((await move('OPEN')).status).toBe(409);
  });

  it('validates dates and seat caps', async () => {
    const a = await createInstitution('cv');
    const pid = (await a.as.post('/programs').send(programPayload(a))).body.data._id;
    const badDates = await a.as
      .post('/campaigns')
      .send(campaignPayload(a, pid, { closesAt: new Date(Date.now() - 2 * day).toISOString() }));
    expect(badDates.status).toBe(422);
    const badCap = await a.as
      .post('/campaigns')
      .send(campaignPayload(a, pid, { programs: [{ programId: pid, seatCap: 500 }] }));
    expect(badCap.status).toBe(422);
  });

  it('closes open campaigns automatically when the closing time passes', async () => {
    const a = await createInstitution('cj');
    const pid = (await a.as.post('/programs').send(programPayload(a))).body.data._id;
    const cid = (await a.as.post('/campaigns').send(campaignPayload(a, pid))).body.data._id;
    await a.as.post(`/campaigns/${cid}/status`).send({ to: 'OPEN' });
    await CampaignModel.updateOne({ _id: cid }, { closesAt: new Date(Date.now() - 1000) });
    expect(await closeExpiredCampaigns()).toBe(1);
    const c = await CampaignModel.findById(cid);
    expect(c!.status).toBe('CLOSED');
    expect(c!.history.at(-1)!.auto).toBe(true);
  });
});
