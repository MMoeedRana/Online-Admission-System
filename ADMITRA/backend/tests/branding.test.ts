import { afterAll, describe, expect, it } from 'vitest';
import { loadBrand } from '../src/lib/brand';
import { sentMails } from '../src/lib/mailer';
import { InstitutionModel } from '../src/modules/institutions/institution.model';
import { api, createInstitution, createPlan, PASSWORD, PNG, superAdminToken } from './helpers';

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

afterAll(async () => {
  await loadBrand();
});

describe('platform branding (BRAND-1, BRAND-3)', () => {
  it('lets the Super Admin rename the platform and the assistant and change the colours', async () => {
    const root = await superAdminToken();
    const as = (m: 'get' | 'patch' | 'post' | 'delete', url: string) =>
      api()[m](`/api/v1/platform/branding${url}`).set('Authorization', `Bearer ${root}`);
    const def = await api().get('/api/v1/public/branding');
    expect(def.body.data).toMatchObject({ platformName: 'ADMITRA', agentName: 'Mitra' });

    expect((await as('patch', '').send({ primaryColor: 'blue' })).status).toBe(422);
    const r = await as('patch', '').send({
      platformName: 'Daakhla',
      agentName: 'Saathi',
      primaryColor: '#0F766E',
      sidebarColor: '#102A43',
      avatarColor: '#7C3AED',
    });
    expect(r.status).toBe(200);
    const pub = await api().get('/api/v1/public/branding');
    expect(pub.body.data).toMatchObject({
      platformName: 'Daakhla',
      agentName: 'Saathi',
      primaryColor: '#0F766E',
      sidebarColor: '#102A43',
      avatarColor: '#7C3AED',
    });

    await api()
      .post('/api/v1/auth/register')
      .send({ fullName: 'Brand Check', email: 'brand@example.com', password: PASSWORD });
    expect(sentMails.at(-1)!.heading).toContain('Welcome to Daakhla');
    expect(sentMails.at(-1)!.html).toContain('Daakhla');

    expect((await as('post', '/logo').attach('file', SVG, 'logo.svg')).status).toBe(422);
    const up = await as('post', '/logo').attach('file', PNG, 'logo.png');
    expect(up.status).toBe(200);
    const url = up.body.data.logoUrl as string;
    expect(url).toMatch(/^\/api\/v1\/assets\/[a-f0-9]{32}$/);
    const img = await api().get(url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');
    const up2 = await as('post', '/logo').attach('file', PNG, 'logo2.png');
    expect((await api().get(url)).status).toBe(404);
    expect((await as('delete', '/logo')).body.data.logoUrl).toBe('');
    expect((await api().get(up2.body.data.logoUrl)).status).toBe(404);
    expect((await as('post', '/favicon').attach('file', PNG, 'icon.png')).body.data.faviconUrl).toMatch(
      /assets/,
    );
    expect((await as('post', '/reset-colors')).body.data.primaryColor).toBe('#1A62D6');

    const inst = await createInstitution(`b${Math.random().toString(36).slice(2, 7)}`);
    expect(
      (
        await api()
          .patch('/api/v1/platform/branding')
          .set('Authorization', `Bearer ${inst.token}`)
          .send({ platformName: 'X' })
      ).status,
    ).toBe(403);
  });
});

describe('institution branding and profile pictures (BRAND-2, BRAND-4)', () => {
  it('needs a plan with custom branding and then colours the workspace', async () => {
    const basic = await createInstitution(`c${Math.random().toString(36).slice(2, 7)}`, {
      plan: await createPlan({}, { customBranding: false }),
    });
    expect((await basic.as.post('/institution/branding/logo').attach('file', PNG, 'logo.png')).status).toBe(
      403,
    );
    expect(
      (await basic.as.patch('/institution/profile').send({ branding: { primaryColor: '#B91C1C' } })).status,
    ).toBe(403);

    const pro = await createInstitution(`d${Math.random().toString(36).slice(2, 7)}`);
    const logo = await pro.as.post('/institution/branding/logo').attach('file', PNG, 'logo.png');
    expect(logo.status).toBe(200);
    expect(
      (
        await pro.as
          .patch('/institution/profile')
          .send({ branding: { primaryColor: '#B91C1C', sidebarColor: '#1F1F1F' } })
      ).status,
    ).toBe(200);
    expect(
      (await pro.as.patch('/institution/profile').send({ branding: { primaryColor: 'red' } })).status,
    ).toBe(422);
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${pro.token}`);
    expect(me.body.data.memberships[0].branding).toMatchObject({
      active: true,
      primaryColor: '#B91C1C',
      sidebarColor: '#1F1F1F',
      logoUrl: logo.body.data.logoUrl,
    });
    expect((await InstitutionModel.findById(pro.inst._id).lean())!.branding!.logoUrl).toBe(
      logo.body.data.logoUrl,
    );
    const pub = await api().get(`/api/v1/public/institutions/${pro.inst.slug}`);
    expect(JSON.stringify(pub.body.data)).toContain(logo.body.data.logoUrl);
  });

  it('lets every user add and remove a profile picture', async () => {
    const inst = await createInstitution(`e${Math.random().toString(36).slice(2, 7)}`);
    const up = await api()
      .post('/api/v1/auth/me/avatar')
      .set('Authorization', `Bearer ${inst.token}`)
      .attach('file', PNG, 'me.png');
    expect(up.status).toBe(200);
    expect(up.body.data.user.avatarUrl).toMatch(/^\/api\/v1\/assets\//);
    expect((await api().get(up.body.data.user.avatarUrl)).status).toBe(200);
    const del = await api().delete('/api/v1/auth/me/avatar').set('Authorization', `Bearer ${inst.token}`);
    expect(del.body.data.user.avatarUrl).toBe('');
    expect((await api().post('/api/v1/auth/me/avatar').attach('file', PNG, 'me.png')).status).toBe(401);
  });
});
