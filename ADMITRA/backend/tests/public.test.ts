import { describe, expect, it } from 'vitest';
import { InstitutionModel } from '../src/modules/institutions/institution.model';
import { api, createInstitution, programPayload } from './helpers';

describe('Public website API (CAMP-3)', () => {
  it('shows open campaigns of active institutions only', async () => {
    const a = await createInstitution('pub-a');
    const pid = (await a.as.post('/programs').send(programPayload(a))).body.data._id;
    const cid = (
      await a.as.post('/campaigns').send({
        title: 'Fall 2026',
        code: 'F26',
        sessionId: String(a.session._id),
        opensAt: new Date().toISOString(),
        closesAt: new Date(Date.now() + 5 * 864e5).toISOString(),
        programs: [{ programId: pid, seatCap: null }],
        settings: {},
      })
    ).body.data._id;

    let rows = (await api().get('/api/v1/public/open-admissions')).body.data;
    expect(rows).toHaveLength(0);
    await a.as.post(`/campaigns/${cid}/status`).send({ to: 'OPEN' });
    rows = (await api().get('/api/v1/public/open-admissions')).body.data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      program: 'BS Computer Science',
      campaign: 'Fall 2026',
      institutionSlug: 'pub-a',
    });

    const search = await api().get('/api/v1/public/programs?q=computer&openOnly=true');
    expect(search.body.data[0].openCampaign.title).toBe('Fall 2026');
    expect(search.body.meta.total).toBe(1);

    const stats = (await api().get('/api/v1/public/stats')).body.data;
    expect(stats).toMatchObject({ institutions: 1, programs: 1, openCampaigns: 1 });

    await InstitutionModel.updateOne({ _id: a.id }, { status: 'SUSPENDED' });
    expect((await api().get('/api/v1/public/open-admissions')).body.data).toHaveLength(0);
    expect((await api().get(`/api/v1/public/programs/${pid}`)).status).toBe(404);
  });

  it('rejects duplicate onboarding requests and validates input', async () => {
    const body = {
      name: 'Hill View College',
      shortName: 'HVC',
      type: 'COLLEGE',
      sector: 'PUBLIC',
      city: 'Murree',
      province: 'Punjab',
      contact: { name: 'Sajid Ali', designation: 'Principal', email: 'p@hvc.test', phone: '0301-7654321' },
    };
    expect(
      (
        await api()
          .post('/api/v1/public/onboarding-requests')
          .send({ ...body, contact: { ...body.contact, email: 'bad' } })
      ).status,
    ).toBe(422);
    expect((await api().post('/api/v1/public/onboarding-requests').send(body)).status).toBe(201);
    expect((await api().post('/api/v1/public/onboarding-requests').send(body)).status).toBe(409);
  });

  it('removes MongoDB operators from user input (SEC-4)', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(422);
  });
});
