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
    put: (url: string) =>
      api().put(`/api/v1${url}`).set('Authorization', `Bearer ${token}`).set('X-Institution-Id', id),
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

// ---------------- Phase 2 helpers ----------------
/** Smallest valid PDF and PNG files, detected by their content (DOC-2). */
export const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);

export async function applicantAgent(email: string) {
  await createUser(email, 'APPLICANT');
  const token = await login(email);
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    token,
    get: (url: string) => auth(api().get(`/api/v1${url}`)),
    post: (url: string) => auth(api().post(`/api/v1${url}`)),
    put: (url: string) => auth(api().put(`/api/v1${url}`)),
    delete: (url: string) => auth(api().delete(`/api/v1${url}`)),
  };
}

export const profilePayload = (cnic = '3520212345671') => ({
  cnic,
  fullName: 'Ayesha Noor',
  fatherName: 'Noor Ahmad',
  dateOfBirth: '2006-04-12',
  gender: 'FEMALE',
  phone: '0301-2345678',
  domicile: 'Faisalabad',
  guardian: { name: 'Noor Ahmad', relation: 'Father', phone: '0300-1234567' },
  permanentAddress: { line: 'House 12, Street 4, Peoples Colony', city: 'Faisalabad', province: 'Punjab' },
  currentAddress: { line: 'House 12, Street 4, Peoples Colony', city: 'Faisalabad', province: 'Punjab' },
});

export const interRecord = (over: object = {}) => ({
  level: 'INTERMEDIATE',
  board: 'BISE Faisalabad',
  examType: 'ANNUAL',
  group: 'ICS',
  year: 2024,
  rollNo: '523456',
  studentName: 'Ayesha Noor',
  fatherName: 'Noor Ahmad',
  subjects: [
    { name: 'English', obtained: 160, total: 200 },
    { name: 'Urdu', obtained: 170, total: 200 },
    { name: 'Mathematics', obtained: 180, total: 200 },
    { name: 'Physics', obtained: 165, total: 200 },
    { name: 'Computer Science', obtained: 175, total: 200 },
    { name: 'Islamic Studies', obtained: 124, total: 200 },
  ],
  obtained: 974,
  total: 1200,
  ...over,
});

export const matricRecord = (over: object = {}) => ({
  level: 'MATRIC',
  board: 'BISE Faisalabad',
  examType: 'ANNUAL',
  group: 'Science',
  year: 2022,
  rollNo: '412345',
  studentName: 'Ayesha Noor',
  fatherName: 'Noor Ahmad',
  subjects: [
    { name: 'English', obtained: 120, total: 150 },
    { name: 'Mathematics', obtained: 140, total: 150 },
    { name: 'Physics', obtained: 130, total: 150 },
    { name: 'Chemistry', obtained: 125, total: 150 },
    { name: 'Biology', obtained: 120, total: 150 },
    { name: 'Urdu', obtained: 135, total: 150 },
    { name: 'Islamic Studies', obtained: 90, total: 100 },
    { name: 'Pakistan Studies', obtained: 90, total: 100 },
  ],
  obtained: 950,
  total: 1100,
  ...over,
});

export function registryCsv(
  rows: {
    board?: string;
    type?: string;
    year?: number;
    roll: string;
    name: string;
    father?: string;
    obtained: number;
    total: number;
  }[],
) {
  const head = 'board,exam_type,year,roll_no,student_name,father_name,obtained,total';
  return Buffer.from(
    [
      head,
      ...rows.map((r) =>
        [
          r.board ?? 'BISE Faisalabad',
          r.type ?? 'INTERMEDIATE',
          r.year ?? 2024,
          r.roll,
          r.name,
          r.father ?? 'Noor Ahmad',
          r.obtained,
          r.total,
        ].join(','),
      ),
    ].join('\n'),
  );
}
