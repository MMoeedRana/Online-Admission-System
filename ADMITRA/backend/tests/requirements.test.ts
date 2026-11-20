import { spawnSync } from 'node:child_process';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { sentMails } from '../src/lib/mailer';
import { AuditLogModel } from '../src/modules/audit/audit.model';
import { ActionTokenModel, RefreshTokenModel } from '../src/modules/auth/token.models';
import { PaymentModel } from '../src/modules/fees/fee.models';
import { RecordModel } from '../src/modules/records/record.models';
import { officerDecision } from '../src/modules/records/record.service';
import { UserModel } from '../src/modules/users/user.model';
import { api, PASSWORD } from './helpers';

/** Checks for requirements that are not already named in another test file (see docs/TRACEABILITY.md). */
describe('account and credential rules (AUTH-7, SEC-3)', () => {
  it('self-registration always creates an applicant; staff only come through invitations', async () => {
    const r = await api().post('/api/v1/auth/register').send({
      fullName: 'Sneaky User',
      email: 'sneaky@example.com',
      password: PASSWORD,
      accountType: 'PLATFORM',
      platformRole: 'SUPER_ADMIN',
    });
    expect(r.status).toBe(201);
    const u = await UserModel.findOne({ email: 'sneaky@example.com' }).lean();
    expect(u!.accountType).toBe('APPLICANT');
    expect(u!.platformRole).toBeNull();
  });

  it('stores passwords as Argon2id hashes and refresh tokens and e-mail links only as hashes', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ fullName: 'Hash Check', email: 'hash@example.com', password: PASSWORD });
    const u = await UserModel.findOne({ email: 'hash@example.com' }).select('+passwordHash').lean();
    expect(u!.passwordHash.startsWith('$argon2id$')).toBe(true);
    const linkToken = new URL(sentMails.at(-1)!.action!.url).searchParams.get('token')!;
    const action = await ActionTokenModel.findOne({ userId: u!._id }).lean();
    expect(action!.tokenHash).not.toBe(linkToken);
    expect(await ActionTokenModel.exists({ tokenHash: linkToken })).toBeNull();
    await UserModel.updateOne({ _id: u!._id }, { emailVerified: true });
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'hash@example.com', password: PASSWORD });
    const cookie = String(login.headers['set-cookie']).match(/=([^;]+);/)![1]!;
    const stored = await RefreshTokenModel.findOne({ userId: u!._id }).lean();
    expect(stored!.tokenHash).not.toBe(decodeURIComponent(cookie));
    expect(await RefreshTokenModel.exists({ tokenHash: decodeURIComponent(cookie) })).toBeNull();
  });
});

describe('configuration (SEC-8)', () => {
  it('refuses to start in production with a weak secret, insecure cookies or plain http', () => {
    const run = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '-e',
        "require('./src/config/env').assertProductionSafety(); console.log('started')",
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'change-me-development-secret-0000000',
          COOKIE_SECURE: 'false',
          WEB_URL: 'http://admitra.example',
        },
      },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Refusing to start in production');
    expect(run.stdout).not.toContain('started');
  });

  it('sends security headers and allows only the web application origin', async () => {
    const r = await api().get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toBeDefined();
    // The only allowed origin is the web application, so the browser blocks every other site.
    expect(r.headers['access-control-allow-origin']).toBe(env.WEB_URL);
    expect(r.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('audit trail of marks decisions (MARK-13)', () => {
  it('records the officer, time, IP address and the decision', async () => {
    const officer = new Types.ObjectId();
    const rec = await RecordModel.create({
      userId: new Types.ObjectId(),
      level: 'MATRIC',
      board: 'BISE Faisalabad',
      examType: 'ANNUAL',
      year: 2024,
      rollNo: '778899',
      studentName: 'Test',
      fatherName: 'Father',
      obtained: 900,
      total: 1100,
      percentage: 81.82,
      verificationStatus: 'UNDER_VERIFICATION',
    } as never);
    const req = {
      auth: { userId: String(officer), name: 'Officer Khan' },
      tenant: { institutionId: String(new Types.ObjectId()) },
      ip: '10.1.2.3',
    } as unknown as Request;
    await officerDecision(req, rec as never, 'VERIFIED', 'Checked against the original result card.');
    const log = await AuditLogModel.findOne({ entity: 'AcademicRecord', entityId: String(rec._id) }).lean();
    expect(log).toMatchObject({ action: 'MARKS_VERIFIED', actorName: 'Officer Khan', ip: '10.1.2.3' });
    expect(String(log!.actorId)).toBe(String(officer));
    expect(log!.createdAt).toBeInstanceOf(Date);
    expect((await RecordModel.findById(rec._id).lean())!.trustLevel).toBe(3);
  });
});

describe('payments (FEE-3)', () => {
  it('never stores the same transaction reference twice within an institution', async () => {
    const institutionId = new Types.ObjectId();
    const base = {
      voucherId: new Types.ObjectId(),
      applicationId: new Types.ObjectId(),
      applicantId: new Types.ObjectId(),
      method: 'BANK_DEPOSIT' as const,
      amount: 2000,
      paidOn: new Date(),
      proofFileId: new Types.ObjectId(),
    };
    await PaymentModel.create({ ...base, institutionId, reference: 'trx-555' });
    await expect(PaymentModel.create({ ...base, institutionId, reference: 'TRX-555' })).rejects.toThrow(
      /duplicate key/,
    );
    await expect(
      PaymentModel.create({ ...base, institutionId: new Types.ObjectId(), reference: 'TRX-555' }),
    ).resolves.toBeTruthy();
  });
});
