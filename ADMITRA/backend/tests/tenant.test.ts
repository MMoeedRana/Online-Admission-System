import { describe, expect, it } from 'vitest';
import { api, createInstitution, programPayload } from './helpers';

describe('Tenant isolation and permissions (SEC-1, SEC-2)', () => {
  it('a staff member of institution A cannot read or change institution B records', async () => {
    const a = await createInstitution('inst-a');
    const b = await createInstitution('inst-b');
    const created = await b.as.post('/programs').send(programPayload(b));
    expect(created.status).toBe(201);
    const pid = created.body.data._id;

    expect((await a.as.get(`/programs/${pid}`)).status).toBe(404);
    expect((await a.as.patch(`/programs/${pid}`).send(programPayload(a))).status).toBe(404);
    expect((await a.as.delete(`/programs/${pid}`)).status).toBe(404);
    // Switching the header to another institution without membership is refused.
    const forged = await api()
      .get('/api/v1/programs')
      .set('Authorization', `Bearer ${a.token}`)
      .set('X-Institution-Id', b.id);
    expect(forged.status).toBe(404);
  });

  it('a finance officer cannot manage programs or staff', async () => {
    const f = await createInstitution('fin', { roles: ['FINANCE_OFFICER'] });
    expect((await f.as.get('/programs')).status).toBe(200);
    expect((await f.as.post('/programs').send(programPayload(f))).status).toBe(403);
    expect((await f.as.get('/staff')).status).toBe(403);
  });

  it('HOD officers must have at least one department; the last admin cannot be removed', async () => {
    const a = await createInstitution('roles');
    const noDept = await a.as
      .post('/staff/invite')
      .send({ email: 'hod@roles.test', fullName: 'Dr Hod', roles: ['HOD_OFFICER'] });
    expect(noDept.status).toBe(422);
    const ok = await a.as.post('/staff/invite').send({
      email: 'hod@roles.test',
      fullName: 'Dr Hod',
      roles: ['HOD_OFFICER'],
      departmentIds: [String(a.department._id)],
    });
    expect(ok.status).toBe(201);
    const staff = (await a.as.get('/staff')).body.data as { _id: string; roles: string[] }[];
    const me = staff.find((s) => s.roles.includes('INSTITUTION_ADMIN'))!;
    const demote = await a.as.patch(`/staff/${me._id}`).send({ roles: ['ADMISSION_OFFICER'] });
    expect(demote.status).toBe(409);
  });
});
