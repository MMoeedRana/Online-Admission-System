/**
 * Protected seed command (AUTH-7).
 *   npm run seed                    -> creates the first Super Admin (from .env) and the plans
 *   npm run seed -- --sample        -> also adds the sample institutions used for the demonstration
 *   npm run seed -- --reset --sample-> clears the database first (development only)
 */
import mongoose from 'mongoose';
import { env, isProd } from '../config/env';
import { hashPassword } from '../lib/crypto';
import { connectDatabase, disconnectDatabase } from '../lib/db';
import { slugify } from '../lib/slug';
import { CampaignModel } from '../modules/campaigns/campaign.model';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { PlanModel } from '../modules/plans/plan.model';
import { ProgramModel } from '../modules/programs/program.model';
import { MemberModel } from '../modules/staff/member.model';
import {
  AcademicSessionModel,
  CampusModel,
  DepartmentModel,
  FacultyModel,
} from '../modules/structure/structure.models';
import { UserModel } from '../modules/users/user.model';
import { SAMPLE_PASSWORD, institutions, pendingRequests, plans, sampleApplicant } from './data';

const args = new Set(process.argv.slice(2));
const DAY = 24 * 60 * 60 * 1000;

function log(msg: string) {
  console.log(`  ${msg}`);
}

async function seedSuperAdmin() {
  const name = process.env.SEED_SUPERADMIN_NAME || 'Platform Administrator';
  const email = (process.env.SEED_SUPERADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD || '';
  if (!email || password.length < 8) {
    throw new Error(
      'Set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD (at least 8 characters) in the .env file.',
    );
  }
  if (await UserModel.exists({ platformRole: 'SUPER_ADMIN' })) {
    log('Super Admin already exists - skipped');
    return;
  }
  await UserModel.create({
    fullName: name,
    email,
    passwordHash: await hashPassword(password),
    accountType: 'PLATFORM',
    platformRole: 'SUPER_ADMIN',
    emailVerified: true,
  });
  log(`Super Admin created: ${email}`);
}

async function seedPlans() {
  for (const p of plans) {
    await PlanModel.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
  }
  log(`Plans ready: ${plans.map((p) => p.name).join(', ')}`);
}

async function seedSample() {
  const passwordHash = await hashPassword(SAMPLE_PASSWORD);
  const superAdmin = await UserModel.findOne({ platformRole: 'SUPER_ADMIN' });
  const now = Date.now();

  for (const s of institutions) {
    if (await InstitutionModel.exists({ name: s.name })) {
      log(`${s.name} already exists - skipped`);
      continue;
    }
    const plan = await PlanModel.findOne({ code: s.plan });
    const inst = await InstitutionModel.create({
      name: s.name,
      shortName: s.shortName,
      slug: slugify(s.name),
      type: s.type,
      sector: s.sector,
      city: s.city,
      province: s.province,
      website: s.website,
      about: s.about,
      email: s.admin.email,
      phone: '041-1234567',
      address: s.campuses[0].address,
      contact: {
        name: s.admin.name,
        designation: 'Director Admissions',
        email: s.admin.email,
        phone: '0300-0000000',
      },
      status: 'ACTIVE',
      planId: plan!._id,
      subscription: { startsAt: new Date(now - 30 * DAY), endsAt: new Date(now + 335 * DAY), isTrial: false },
      bankAccount: {
        bankName: 'Sample Bank Limited',
        accountTitle: `${s.name} Admissions`,
        accountNumber: '0123-4567890-01',
        iban: 'PK36SCBL0000001123456702',
      },
      approvedAt: new Date(now - 30 * DAY),
      approvedBy: superAdmin?._id,
    });

    const people = [
      { ...s.admin, roles: ['INSTITUTION_ADMIN'], designation: 'Director Admissions', depts: [] as string[] },
      ...s.staff,
    ];
    const campuses = await CampusModel.insertMany(
      s.campuses.map((c, i) => ({ ...c, institutionId: inst._id, isMain: i === 0 })),
    );
    const deptByCode = new Map<string, mongoose.Types.ObjectId>();
    for (const f of s.faculties) {
      const faculty = await FacultyModel.create({ name: f.name, code: f.code, institutionId: inst._id });
      for (const d of f.departments) {
        const dep = await DepartmentModel.create({
          ...d,
          facultyId: faculty._id,
          campusIds: campuses.map((c) => c._id),
          institutionId: inst._id,
        });
        deptByCode.set(d.code, dep._id);
      }
    }

    for (const p of people) {
      let user = await UserModel.findOne({ email: p.email });
      if (!user)
        user = await UserModel.create({
          fullName: p.name,
          email: p.email,
          passwordHash,
          accountType: 'STAFF',
          emailVerified: true,
        });
      await MemberModel.create({
        institutionId: inst._id,
        userId: user._id,
        email: p.email,
        fullName: p.name,
        designation: p.designation,
        roles: p.roles as never,
        departmentIds: (p.depts ?? [])
          .map((d) => deptByCode.get(d))
          .filter((d): d is mongoose.Types.ObjectId => Boolean(d)),
        status: 'ACTIVE',
        joinedAt: new Date(),
      });
    }

    const year = new Date().getFullYear();
    const session = await AcademicSessionModel.create({
      institutionId: inst._id,
      name: `${year}-${year + 1}`,
      startDate: new Date(year, 8, 1),
      endDate: new Date(year + 1, 7, 31),
      isCurrent: true,
    });

    const programs = await ProgramModel.insertMany(
      s.programs.map((p) => ({
        institutionId: inst._id,
        departmentId: deptByCode.get(p.dept),
        campusId: campuses[0]._id,
        title: p.title,
        code: p.code,
        degreeLevel: p.degreeLevel,
        fieldGroup: p.fieldGroup,
        durationYears: p.years,
        description: `${p.title} at ${s.name}. A ${p.years}-year program with ${p.shifts.map((x) => x.name.toLowerCase()).join(' and ')} shift(s).`,
        shifts: p.shifts,
        eligibility:
          p.degreeLevel === 'MS'
            ? [{ level: 'BACHELOR_16', minPercentage: 60, groups: ['Computing'], subjects: [] }]
            : p.degreeLevel === 'INTERMEDIATE'
              ? [{ level: 'MATRIC', minPercentage: 60, groups: ['Science'], subjects: [] }]
              : [
                  { level: 'MATRIC', minPercentage: 45, groups: [], subjects: [] },
                  { level: 'INTERMEDIATE', minPercentage: p.minInter, groups: p.groups, subjects: [] },
                ],
        testRequired: Boolean(p.test),
        testName: p.test ?? '',
        applicationFee: p.appFee,
        admissionFee: p.admFee,
      })),
    );

    const c = s.campaign;
    await CampaignModel.create({
      institutionId: inst._id,
      sessionId: session._id,
      title: c.title,
      code: c.code,
      opensAt: new Date(now - c.daysOpen * DAY),
      closesAt: new Date(now + (c.daysLeft || 30) * DAY),
      programs: programs.map((p) => ({ programId: p._id, seatCap: null })),
      settings: {
        maxPreferences: 3,
        duplicatePolicy: 'ONE_ACTIVE',
        latePolicy: 'REFUSE',
        feePolicy: 'HIGHEST',
        minTrustLevel: 2,
      },
      status: c.status,
      history:
        c.status === 'OPEN'
          ? [{ from: 'DRAFT', to: 'OPEN', by: superAdmin?._id, at: new Date(now - c.daysOpen * DAY) }]
          : [],
    });
    log(`${s.name}: ${programs.length} programs, ${people.length} staff, campaign ${c.title} (${c.status})`);
  }

  for (const r of pendingRequests) {
    if (await InstitutionModel.exists({ name: r.name })) continue;
    await InstitutionModel.create({
      ...r,
      slug: slugify(r.name),
      email: r.contact.email,
      phone: r.contact.phone,
      status: 'PENDING',
    });
    log(`Pending onboarding request: ${r.name}`);
  }

  if (!(await UserModel.exists({ email: sampleApplicant.email }))) {
    await UserModel.create({
      fullName: sampleApplicant.name,
      email: sampleApplicant.email,
      passwordHash,
      accountType: 'APPLICANT',
      emailVerified: true,
    });
    log(`Sample applicant: ${sampleApplicant.email}`);
  }
  log(`All sample accounts use the password: ${SAMPLE_PASSWORD}`);
}

async function main() {
  if (isProd && (args.has('--reset') || args.has('--sample'))) {
    throw new Error('--reset and --sample are not allowed in production.');
  }
  await connectDatabase(env.MONGODB_URI);
  console.log('ADMITRA seed');
  if (args.has('--reset')) {
    await mongoose.connection.dropDatabase();
    log('Database cleared');
  }
  await seedSuperAdmin();
  await seedPlans();
  if (args.has('--sample')) await seedSample();
  await disconnectDatabase();
  console.log('Done.');
}

main().catch(async (err) => {
  console.error(`Seed failed: ${err.message}`);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
