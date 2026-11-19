import request from 'supertest';
import { createApp } from '../src/app';
import { hashPassword } from '../src/lib/crypto';
import { sentMails } from '../src/lib/mailer';
import { InstitutionModel } from '../src/modules/institutions/institution.model';
import { PlanModel } from '../src/modules/plans/plan.model';
import { MemberModel } from '../src/modules/staff/member.model';
import {
  AcademicSessionModel,
  CampusModel,
  DepartmentModel,
  FacultyModel,
} from '../src/modules/structure/structure.models';
import { UserModel } from '../src/modules/users/user.model';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Strong@123';

export function lastLinkToken(): string {
  const url = sentMails.at(-1)?.action?.url ?? '';
  return new URL(url).searchParams.get('token') ?? '';
}

export async function login(email: string, password = PASSWORD) {
  const res = await api().post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken as string;
}

export async function createUser(
  email: string,
  accountType: 'APPLICANT' | 'STAFF' | 'PLATFORM' = 'STAFF',
  extra: object = {},
) {
  return UserModel.create({
    fullName: 'Test User',
    email,
    passwordHash: await hashPassword(PASSWORD),
    accountType,
    emailVerified: true,
    ...extra,
  });
}

export async function superAdminToken() {
  await createUser('root@admitra.test', 'PLATFORM', { platformRole: 'SUPER_ADMIN' });
  return login('root@admitra.test');
}

export async function createPlan(
  limits: Partial<{ campuses: number; programs: number; staff: number }> = {},
  features: object = {},
) {
  return PlanModel.create({
    code: `P${Math.random().toString(36).slice(2, 7)}`,
    name: 'Test Plan',
    priceMonthly: 1000,
    limits: { campuses: 3, programs: 10, staff: 10, applicationsPerCycle: 1000, ...limits },
    features: { multipleCampuses: true, customBranding: true, ...features },
  });
}

/** Creates an active institution with one admin, a campus, a faculty, a department and a session. */
export async function createInstitution(
  slug: string,
  opts: { roles?: string[]; plan?: Awaited<ReturnType<typeof createPlan>>; endsAt?: Date } = {},
) {
  const plan = opts.plan ?? (await createPlan());
  const inst = await InstitutionModel.create({
    name: `Institution ${slug}`,
    shortName: slug.slice(0, 4).toUpperCase(),
    slug,
    type: 'UNIVERSITY',
    city: 'Faisalabad',
    province: 'Punjab',
    contact: { name: 'Contact Person', email: `contact@${slug}.test` },
    status: 'ACTIVE',
    planId: plan._id,
    subscription: {
      startsAt: new Date(),
      endsAt: opts.endsAt ?? new Date(Date.now() + 30 * 864e5),
      isTrial: false,
    },
  });
  const email = `admin@${slug}.test`;
  const user = await createUser(email);
  await MemberModel.create({
    institutionId: inst._id,
    userId: user._id,
    email,
    roles: (opts.roles ?? ['INSTITUTION_ADMIN']) as never,
    status: 'ACTIVE',
  });
  const campus = await CampusModel.create({
    institutionId: inst._id,
    name: 'Main',
    code: 'MAIN',
    city: 'Faisalabad',
    isMain: true,
  });
  const faculty = await FacultyModel.create({ institutionId: inst._id, name: 'Computing', code: 'FOC' });
  const department = await DepartmentModel.create({
    institutionId: inst._id,
    facultyId: faculty._id,
    campusIds: [campus._id],
    name: 'Computer Science',
    code: 'CS',
  });
  const session = await AcademicSessionModel.create({
    institutionId: inst._id,
    name: '2026-2027',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-08-31'),
    isCurrent: true,
  });
  const token = await login(email);
  const id = String(inst._id);
  const as = {
    get: (url: string) =>
      api().get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).set('X-Institution-Id', id),
    post: (url: string) =>
      api().post(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).set('X-Institution-Id', id),
    patch: (url: string) =>
      api().patch(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).set('X-Institution-Id', id),
    delete: (url: string) =>
      api().delete(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).set('X-Institution-Id', id),
  };
  return { inst, id, token, as, campus, department, session, plan };
}

export function programPayload(
  ctx: { campus: { _id: unknown }; department: { _id: unknown } },
  code = 'BSCS',
) {
  return {
    title: 'BS Computer Science',
    code,
    degreeLevel: 'BS',
    fieldGroup: 'Computing',
    durationYears: 4,
    departmentId: String(ctx.department._id),
    campusId: String(ctx.campus._id),
    shifts: [{ name: 'MORNING', seats: 100 }],
    eligibility: [{ level: 'INTERMEDIATE', minPercentage: 50, groups: ['ICS'], subjects: [] }],
    testRequired: true,
    testName: 'Entry Test',
    applicationFee: 2000,
    admissionFee: 50000,
  };
}
