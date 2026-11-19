import { describe, expect, it } from 'vitest';
import { InstitutionModel } from '../src/modules/institutions/institution.model';
import { MemberModel } from '../src/modules/staff/member.model';
import { api, createInstitution, createPlan, lastLinkToken, superAdminToken } from './helpers';

const request = {
  name: 'Lakeside College',
  shortName: 'LCC',
  type: 'COLLEGE',
  sector: 'PRIVATE',
  city: 'Sargodha',
  province: 'Punjab',
  website: '',
  contact: {
    name: 'Imran Khalid',
    designation: 'Principal',
    email: 'principal@lcc.test',
    phone: '0300-1234567',
  },
};

describe('Institution onboarding and subscriptions (INST-1 to INST-5, UC-12)', () => {
  it('INST-1/INST-2: request -> approve with plan -> admin invitation -> accept -> workspace access', async () => {
    const root = await superAdminToken();
    const r = await api().post('/api/v1/public/onboarding-requests').send(request);
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('PENDING');

    const plan = await createPlan();
    const approve = await api()
      .post(`/api/v1/platform/institutions/${r.body.data.id}/approve`)
      .set('Authorization', `Bearer ${root}`)
      .send({ planId: String(plan._id), trialDays: 14 });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('ACTIVE');
    expect(approve.body.data.subscription.isTrial).toBe(true);

    const token = lastLinkToken();
    const preview = await api().get(`/api/v1/auth/invitation?token=${token}`);
    expect(preview.body.data.roles).toEqual(['INSTITUTION_ADMIN']);
    const accept = await api()
      .post('/api/v1/auth/accept-invitation')
      .send({ token, fullName: 'Imran Khalid', password: 'Admin1234' });
    expect(accept.status).toBe(200);
    expect(accept.body.data.memberships[0].roles).toEqual(['INSTITUTION_ADMIN']);
    const reuse = await api()
      .post('/api/v1/auth/accept-invitation')
      .send({ token, fullName: 'X Y Z', password: 'Admin1234' });
    expect(reuse.status).toBe(400);
  });

  it('INST-2: rejection needs a reason and only pending requests can be rejected', async () => {
    const root = await superAdminToken();
    const r = await api().post('/api/v1/public/onboarding-requests').send(request);
    const url = `/api/v1/platform/institutions/${r.body.data.id}/reject`;
    expect((await api().post(url).set('Authorization', `Bearer ${root}`).send({ reason: '' })).status).toBe(
      422,
    );
    expect(
      (await api().post(url).set('Authorization', `Bearer ${root}`).send({ reason: 'Incomplete documents' }))
        .status,
    ).toBe(200);
    expect(
      (await api().post(url).set('Authorization', `Bearer ${root}`).send({ reason: 'Again rejected' }))
        .status,
    ).toBe(409);
  });

  it('INST-5: suspension blocks staff immediately and hides the institution from public pages', async () => {
    const root = await superAdminToken();
    const a = await createInstitution('alpha');
    expect((await a.as.get('/institution/profile')).status).toBe(200);
    expect((await api().get('/api/v1/public/institutions/alpha')).status).toBe(200);
    const s = await api()
      .post(`/api/v1/platform/institutions/${a.id}/suspend`)
      .set('Authorization', `Bearer ${root}`)
      .send({ reason: 'Unpaid invoice' });
    expect(s.status).toBe(200);
    const blocked = await a.as.get('/institution/profile');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('INSTITUTION_SUSPENDED');
    expect((await api().get('/api/v1/public/institutions/alpha')).status).toBe(404);
    await api()
      .post(`/api/v1/platform/institutions/${a.id}/reactivate`)
      .set('Authorization', `Bearer ${root}`);
    expect((await a.as.get('/institution/profile')).status).toBe(200);
  });

  it('INST-4: workspace stays usable in the 7-day grace period, then becomes read-only', async () => {
    const grace = await createInstitution('grace', { endsAt: new Date(Date.now() - 3 * 864e5) });
    expect((await grace.as.patch('/institution/profile').send({ about: 'Updated' })).status).toBe(200);
    const ro = await createInstitution('readonly', { endsAt: new Date(Date.now() - 8 * 864e5) });
    expect((await ro.as.get('/institution/profile')).status).toBe(200);
    const write = await ro.as.patch('/institution/profile').send({ about: 'Updated' });
    expect(write.status).toBe(403);
    expect(write.body.error.code).toBe('SUBSCRIPTION_EXPIRED');
    expect(await InstitutionModel.countDocuments()).toBe(2); // data is never deleted
  });

  it('renewal extends the subscription from its end date', async () => {
    const root = await superAdminToken();
    const a = await createInstitution('renew');
    const before = (await InstitutionModel.findById(a.id))!.subscription!.endsAt!;
    const r = await api()
      .post(`/api/v1/platform/institutions/${a.id}/renew`)
      .set('Authorization', `Bearer ${root}`)
      .send({ months: 12 });
    expect(r.status).toBe(200);
    expect(new Date(r.body.data.subscription.endsAt).getTime()).toBeGreaterThan(
      before.getTime() + 360 * 864e5,
    );
  });

  it('only the super admin can use platform routes', async () => {
    const a = await createInstitution('beta');
    const res = await api().get('/api/v1/platform/institutions').set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(403);
  });

  it('INST-3: plan limits are enforced (staff and campuses)', async () => {
    const plan = await createPlan({ staff: 2, campuses: 1 }, { multipleCampuses: false });
    const a = await createInstitution('limited', { plan });
    const invite = (email: string) =>
      a.as.post('/staff/invite').send({ email, fullName: 'Staff Member', roles: ['ADMISSION_OFFICER'] });
    expect((await invite('one@limited.test')).status).toBe(201);
    const over = await invite('two@limited.test');
    expect(over.status).toBe(403);
    expect(over.body.error.code).toBe('PLAN_LIMIT_REACHED');
    const campus = await a.as
      .post('/structure/campuses')
      .send({ name: 'Second', code: 'SEC', city: 'Lahore' });
    expect(campus.status).toBe(403);
    expect(await MemberModel.countDocuments({ institutionId: a.id })).toBe(2);
  });
});
