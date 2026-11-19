import { describe, expect, it } from 'vitest';
import { RefreshTokenModel } from '../src/modules/auth/token.models';
import { UserModel } from '../src/modules/users/user.model';
import { PASSWORD, api, createUser, lastLinkToken, login } from './helpers';

const cookieOf = (res: { headers: Record<string, unknown> }) =>
  ((res.headers['set-cookie'] as string[]) ?? []).find((c) => c.startsWith('admitra_rt='))!.split(';')[0];

describe('Authentication (AUTH-1 to AUTH-6)', () => {
  it('TC-01: registers an applicant, hashes the password with Argon2id and sends a verification e-mail', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ fullName: 'Ayesha Noor', email: 'ayesha@example.com', password: 'Abcd1234' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.accountType).toBe('APPLICANT');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(cookieOf(res)).toContain('admitra_rt=');
    const user = await UserModel.findOne({ email: 'ayesha@example.com' }).select('+passwordHash');
    expect(user!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(lastLinkToken()).toHaveLength(43);
  });

  it('TC-02: rejects a weak password and a duplicate e-mail', async () => {
    const weak = await api()
      .post('/api/v1/auth/register')
      .send({ fullName: 'Test User', email: 'a@example.com', password: 'abcdefgh' });
    expect(weak.status).toBe(422);
    expect(weak.body.error.details.fields.password).toBeTruthy();
    await createUser('taken@example.com', 'APPLICANT');
    const dup = await api()
      .post('/api/v1/auth/register')
      .send({ fullName: 'Test User', email: 'taken@example.com', password: 'Abcd1234' });
    expect(dup.status).toBe(409);
  });

  it('TC-03: logs in and returns the user with memberships', async () => {
    await createUser('staff@example.com');
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'staff@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.memberships).toEqual([]);
  });

  it('TC-04: locks the account after five wrong passwords (boundary 4 / 5)', async () => {
    await createUser('lock@example.com');
    for (let i = 1; i <= 4; i++) {
      const r = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'lock@example.com', password: 'Wrong1234' });
      expect(r.status).toBe(401);
    }
    const fifth = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'lock@example.com', password: 'Wrong1234' });
    expect(fifth.status).toBe(423);
    const correct = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'lock@example.com', password: PASSWORD });
    expect(correct.status).toBe(423);
  });

  it('AUTH-3: rotates refresh tokens and revokes the family when an old token is reused', async () => {
    await createUser('rt@example.com');
    const first = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'rt@example.com', password: PASSWORD });
    const c1 = cookieOf(first);
    const second = await api().post('/api/v1/auth/refresh').set('Cookie', c1);
    expect(second.status).toBe(200);
    const c2 = cookieOf(second);
    expect(c2).not.toBe(c1);
    const reuse = await api().post('/api/v1/auth/refresh').set('Cookie', c1);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSED');
    const afterReuse = await api().post('/api/v1/auth/refresh').set('Cookie', c2);
    expect(afterReuse.status).toBe(401);
    expect(await RefreshTokenModel.countDocuments({ revokedAt: null, usedAt: null })).toBe(0);
  });

  it('AUTH-5: verification link works once only', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ fullName: 'Hamza Ali', email: 'hamza@example.com', password: 'Abcd1234' });
    const token = lastLinkToken();
    expect((await api().post('/api/v1/auth/verify-email').send({ token })).status).toBe(200);
    expect((await UserModel.findOne({ email: 'hamza@example.com' }))!.emailVerified).toBe(true);
    const again = await api().post('/api/v1/auth/verify-email').send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_LINK');
  });

  it('TC-05: password reset link resets the password and cannot be used twice', async () => {
    await createUser('reset@example.com');
    await api().post('/api/v1/auth/forgot-password').send({ email: 'reset@example.com' });
    const token = lastLinkToken();
    expect(
      (await api().post('/api/v1/auth/reset-password').send({ token, password: 'NewPass123' })).status,
    ).toBe(200);
    expect(
      (await api().post('/api/v1/auth/reset-password').send({ token, password: 'Other1234' })).status,
    ).toBe(400);
    expect(await login('reset@example.com', 'NewPass123')).toBeTruthy();
  });

  it('does not reveal whether an e-mail exists on forgot password', async () => {
    const res = await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
  });

  it('rejects protected routes without a token', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/platform/dashboard')).status).toBe(401);
  });
});
