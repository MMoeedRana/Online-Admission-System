/**
 * Phase 3 sample data: reference directory, merit formulas and a complete admission cycle at
 * Riverside Institute of Technology (applications, three merit lists, offers, enrollment, expiry,
 * revocation and a list waiting for the second committee member). All people are fictional.
 */
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { permissionsFor } from '../constants/permissions';
import type { StaffRole } from '../constants/roles';
import { nextSeq, pad } from '../lib/counter';
import { withTransaction } from '../lib/db';
import { logger } from '../lib/logger';
import { saveUpload } from '../lib/storage';
import { slugify } from '../lib/slug';
import { ApplicationModel } from '../modules/applications/application.model';
import { pushHistory, submitApplication, type AppDoc } from '../modules/applications/application.service';
import { CampaignModel } from '../modules/campaigns/campaign.model';
import { advise } from '../modules/directory/advisor.service';
import {
  AdvisorLogModel,
  DirInstitutionModel,
  DirProgramModel,
  MeritHistoryModel,
  ShortlistModel,
} from '../modules/directory/directory.models';
import { ensureDirectoryProgram } from '../modules/directory/directory.service';
import { ApplicantDocumentModel, DocumentTypeModel } from '../modules/documents/document.models';
import { PaymentModel, VoucherModel } from '../modules/fees/fee.models';
import { InstitutionModel } from '../modules/institutions/institution.model';
import {
  MeritEntryModel,
  MeritFormulaModel,
  MeritListModel,
  OfferModel,
} from '../modules/merit/merit.models';
import { approveList, generateList, publishList } from '../modules/merit/merit.service';
import {
  acceptOffer,
  declineOffer,
  enrollAfterPayment,
  expireOffers,
  notifyEnrollment,
  revokeAdmission,
  verifyOriginals,
} from '../modules/merit/offer.service';
import { ProfileModel } from '../modules/profile/profile.model';
import { ProgramModel } from '../modules/programs/program.model';
import { RecordModel } from '../modules/records/record.models';
import { saveRecord } from '../modules/records/record.service';
import { RegistryBatchModel, RegistryRowModel } from '../modules/registry/registry.models';
import { MemberModel } from '../modules/staff/member.model';
import { AcademicSessionModel } from '../modules/structure/structure.models';
import { UserModel } from '../modules/users/user.model';
import { DAY, HOUR, installClock, realNow, setClock, uninstallClock } from './clock';
import { directoryInstitutions, rng } from './directory-data';

const random = rng(20261119);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]!;
const between = (a: number, b: number) => a + random() * (b - a);
const gauss = (mean: number, sd: number) => {
  const u = Math.max(1e-9, random());
  const v = random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (n: number) => Math.round(n * 100) / 100;

const log = (m: string) => console.log(`  ${m}`);

const MALE = [
  'Muhammad Ahmed',
  'Ali',
  'Usman',
  'Hassan',
  'Saad',
  'Fahad',
  'Zain',
  'Talha',
  'Danish',
  'Shoaib',
  'Abdullah',
  'Haris',
  'Taimoor',
  'Faizan',
  'Waqas',
  'Junaid',
  'Arslan',
  'Shahzaib',
  'Raheel',
  'Owais',
  'Moiz',
  'Ibrahim',
  'Hamid',
  'Umer',
];
const FEMALE = [
  'Fatima',
  'Zainab',
  'Maryam',
  'Hira',
  'Iqra',
  'Mahnoor',
  'Areeba',
  'Laiba',
  'Noor',
  'Amna',
  'Kinza',
  'Rimsha',
  'Anum',
  'Sidra',
  'Eman',
  'Hafsa',
  'Aleena',
  'Mehwish',
  'Javeria',
  'Momina',
];
const SURNAMES = [
  'Khan',
  'Ahmed',
  'Raza',
  'Iqbal',
  'Hussain',
  'Malik',
  'Butt',
  'Chaudhry',
  'Qureshi',
  'Sheikh',
  'Javed',
  'Aslam',
  'Akhtar',
  'Rashid',
  'Siddiqui',
  'Farooq',
  'Mirza',
  'Bashir',
  'Anwar',
  'Nawaz',
  'Saleem',
  'Shah',
  'Abbasi',
  'Gondal',
];
const FATHERS = [
  'Muhammad Akram',
  'Abdul Rehman',
  'Tariq Mehmood',
  'Khalid Hussain',
  'Javed Iqbal',
  'Shahid Mahmood',
  'Nadeem Akhtar',
  'Zafar Iqbal',
  'Rashid Ali',
  'Amjad Pervaiz',
  'Asif Nawaz',
  'Imtiaz Ahmed',
  'Naveed Anjum',
  'Sajid Mehmood',
  'Arshad Mehmood',
  'Liaquat Ali',
];
const AREAS = [
  'Johar Town',
  'Model Town',
  'Gulberg III',
  'Samanabad',
  'Shadman',
  'Iqbal Town',
  'Wapda Town',
  'Township',
  'Garden Town',
  'Faisal Town',
  'DHA Phase 5',
  'Valencia Town',
];
const BOARDS = [
  'BISE Lahore',
  'BISE Lahore',
  'BISE Lahore',
  'BISE Gujranwala',
  'BISE Faisalabad',
  'BISE Sahiwal',
];

const MATRIC_SUBJECTS = [
  'English',
  'Urdu',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Computer Science',
  'Islamic Studies',
  'Pakistan Studies',
];
const MATRIC_TOTALS = [150, 150, 150, 150, 150, 150, 100, 100];
const INTER_SUBJECTS: Record<string, string[]> = {
  'Pre-Engineering': ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Islamic Studies'],
  ICS: ['English', 'Urdu', 'Mathematics', 'Physics', 'Computer Science', 'Islamic Studies'],
  'Pre-Medical (with Mathematics)': ['English', 'Urdu', 'Biology', 'Physics', 'Chemistry', 'Mathematics'],
};

/** Subject marks that add up exactly to the percentage (integrity rule MARK-2). */
function subjectMarks(names: string[], totals: number[], pct: number) {
  const total = totals.reduce((s, x) => s + x, 0);
  const target = Math.round((total * pct) / 100);
  const marks = totals.map((t) =>
    clamp(Math.round((t * pct) / 100 + gauss(0, t * 0.04)), Math.round(t * 0.33), t),
  );
  let diff = target - marks.reduce((s, x) => s + x, 0);
  for (let i = 0; diff !== 0 && i < 400; i++) {
    const j = i % marks.length;
    const step = diff > 0 ? 1 : -1;
    if (marks[j]! + step <= totals[j]! && marks[j]! + step >= 0) {
      marks[j]! += step;
      diff -= step;
    }
  }
  return names.map((name, i) => ({ name, obtained: marks[i]!, total: totals[i]! }));
}

type Inst = NonNullable<Awaited<ReturnType<typeof InstitutionModel.findOne>>>;

function applicantReq(id: string, name: string): Request {
  return {
    auth: { userId: id, accountType: 'APPLICANT', platformRole: null, name },
    ip: '127.0.0.1',
  } as unknown as Request;
}

async function staffReq(email: string, inst: Inst): Promise<Request> {
  const user = (await UserModel.findOne({ email }).lean())!;
  const member = (await MemberModel.findOne({ institutionId: inst._id, userId: user._id }).lean())!;
  const roles = member.roles as StaffRole[];
  return {
    auth: { userId: String(user._id), accountType: 'STAFF', platformRole: null, name: user.fullName },
    ip: '127.0.0.1',
    tenant: {
      institutionId: String(inst._id),
      institution: inst.toObject(),
      memberId: String(member._id),
      roles,
      departmentIds: [],
      permissions: permissionsFor(roles),
      subscription: 'ACTIVE',
    },
  } as unknown as Request;
}

const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);
const asFile = (name: string) =>
  ({ buffer: TINY_PDF, size: TINY_PDF.length, originalname: name }) as Express.Multer.File;

// ===================================================================== 1. Directory
async function seedDirectory(adminId: Types.ObjectId) {
  const year = realNow().getFullYear();
  // ADMITRA tenants: directory profiles from their programs (DIR-5) with three past years.
  const tenants = await InstitutionModel.find({ status: 'ACTIVE' }).lean();
  let tenantPrograms = 0;
  for (const t of tenants) {
    const programs = await ProgramModel.find({ institutionId: t._id, status: 'ACTIVE' }).lean();
    for (const p of programs) {
      const dp = await ensureDirectoryProgram(p._id);
      tenantPrograms++;
      const isEng = p.fieldGroup === 'Engineering';
      dp.set({
        feePerSemester: Math.round(p.admissionFee / 2 / 500) * 500,
        formula:
          p.degreeLevel === 'MS'
            ? [
                { component: 'BACHELOR_16', weight: 70 },
                { component: 'ENTRY_TEST', weight: 30 },
              ]
            : p.testRequired
              ? isEng
                ? [
                    { component: 'MATRIC', weight: 17 },
                    { component: 'INTERMEDIATE', weight: 50 },
                    { component: 'ENTRY_TEST', weight: 33 },
                  ]
                : [
                    { component: 'MATRIC', weight: 10 },
                    { component: 'INTERMEDIATE', weight: 40 },
                    { component: 'ENTRY_TEST', weight: 50 },
                  ]
              : [
                  { component: 'MATRIC', weight: 30 },
                  { component: 'INTERMEDIATE', weight: 70 },
                ],
        admissionMonths: [7, 8, 9],
        applyUrl: '',
      });
      await dp.save();
      const base =
        {
          BSCS: 80.4,
          BSSE: 79.1,
          BSAI: 82.6,
          BSIT: 76.2,
          BBA: 70.3,
          BSMATH: 68.4,
          MSCS: 70.5,
          BSDS: 78.5,
          BSEE: 77.4,
          ADCS: 60.2,
          FSCPE: 79.8,
        }[p.code] ?? 72;
      for (let k = 1; k <= 3; k++) {
        const y = year - k;
        const closing = round2(base - (k - 1) * between(0.2, 1.1) + gauss(0, 0.5));
        for (const shift of p.shifts.map((s) => s.name)) {
          const c = shift === 'EVENING' ? round2(closing - between(3, 6)) : closing;
          await MeritHistoryModel.updateOne(
            { directoryProgramId: dp._id, year: y, round: 2, shift, quota: 'OPEN' },
            {
              $setOnInsert: {
                openingMerit: round2(c + between(7, 11)),
                closingMerit: c,
                seats: p.shifts.find((s) => s.name === shift)?.seats ?? null,
                source: `SAMPLE: ${t.shortName} final merit list ${y} (fictional data)`,
                sourceUrl: t.website ? `${t.website}/admissions/merit-lists/${y}` : '',
                origin: 'IMPORT',
                status: 'VERIFIED',
                verifiedBy: adminId,
                verifiedAt: new Date(`${y}-10-15`),
              },
            },
            { upsert: true },
          );
        }
      }
    }
  }

  // Institutions that do not use ADMITRA (entered from their published merit lists).
  let programs = 0;
  let drafts = 0;
  for (const s of directoryInstitutions) {
    const inst = await DirInstitutionModel.create({
      name: s.name,
      shortName: s.shortName,
      slug: slugify(s.name),
      type: s.type,
      sector: s.sector,
      city: s.city,
      province: s.province as never,
      website: s.website,
      about: s.about,
      campuses: s.campuses,
    });
    for (const p of s.programs) {
      const dp = await DirProgramModel.create({
        directoryInstitutionId: inst._id,
        title: p.title,
        degreeLevel: p.degreeLevel,
        fieldGroup: p.fieldGroup,
        durationYears: p.years,
        feePerSemester: p.fee,
        shifts: p.shifts,
        seats: p.seats,
        eligibility:
          p.degreeLevel === 'INTERMEDIATE'
            ? [{ level: 'MATRIC', minPercentage: 60, groups: [] }]
            : p.degreeLevel === 'MS'
              ? [{ level: 'BACHELOR_16', minPercentage: 60, groups: [] }]
              : [
                  { level: 'MATRIC', minPercentage: 45, groups: [] },
                  { level: 'INTERMEDIATE', minPercentage: p.minInter, groups: p.groups },
                ],
        formula: p.formula ?? [],
        testName: p.test ?? '',
        admissionMonths: s.months,
        applyUrl: s.website ? `${s.website}/admissions` : '',
      });
      programs++;
      const n = p.years_of_data ?? 3;
      for (let k = 1; k <= n; k++) {
        const y = year - k;
        const closingY = round2(p.closing - (k - 1) * between(0.1, 1.3) + gauss(0, 0.6));
        const rounds = p.closing > 75 ? 3 : 2;
        for (const shift of p.shifts) {
          for (let r = 1; r <= rounds; r++) {
            const c = round2(
              closingY -
                (r - 1) * between(0.4, 1.2) -
                (shift === 'EVENING' ? between(3, 6) : 0) +
                (rounds - r) * 0,
            );
            const draft = Boolean(p.latestDraft && k === 1);
            if (draft) drafts++;
            await MeritHistoryModel.create({
              directoryProgramId: dp._id,
              year: y,
              round: r,
              shift,
              quota: 'OPEN',
              openingMerit: round2(c + between(6, 12)),
              closingMerit: c,
              seats: r === 1 ? p.seats : Math.round(p.seats * between(0.05, 0.15)),
              source: `SAMPLE: ${s.shortName} merit list ${r}, ${y} (fictional data)`,
              sourceUrl: s.website ? `${s.website}/merit-lists/${y}/list-${r}` : '',
              origin: 'IMPORT',
              status: draft ? 'DRAFT' : 'VERIFIED',
              enteredByName: 'Platform Administrator',
              verifiedBy: draft ? null : adminId,
              verifiedAt: draft ? undefined : new Date(`${y}-11-01`),
            });
          }
        }
      }
    }
  }

  // DIR-7: Northern Science College asks to take over its old listing.
  const nsc = await InstitutionModel.findOne({ shortName: 'NSC' }).lean();
  if (nsc) {
    await DirInstitutionModel.updateOne(
      { shortName: 'NSCR' },
      {
        claim: {
          institutionId: nsc._id,
          institutionName: nsc.name,
          note: 'This is our college; the listing uses our old name from the 2023 prospectus.',
          status: 'PENDING',
          at: new Date(),
        },
      },
    );
  }
  log(
    `Directory: ${tenants.length} ADMITRA institutions (${tenantPrograms} programs) and ${directoryInstitutions.length} other institutions (${programs} programs), ${drafts} history rows waiting for verification`,
  );
}

// ===================================================================== 2. Merit formulas
async function seedFormulas(campaignId: Types.ObjectId, inst: Inst, byEmail: string, draftFor?: string) {
  const campaign = (await CampaignModel.findById(campaignId).lean())!;
  const programs = await ProgramModel.find({
    _id: { $in: campaign.programs.map((p) => p.programId) },
  }).lean();
  const user = (await UserModel.findOne({ email: byEmail }).lean())!;
  for (const p of programs) {
    const components =
      p.degreeLevel === 'MS'
        ? [
            { type: 'BACHELOR_16', weight: 70, required: true },
            { type: 'ENTRY_TEST', weight: 30, required: true, testName: '' },
          ]
        : p.fieldGroup === 'Engineering'
          ? [
              { type: 'MATRIC', weight: 17, required: true },
              { type: 'INTERMEDIATE', weight: 50, required: true },
              { type: 'ENTRY_TEST', weight: 33, required: true, testName: '' },
            ]
          : p.testRequired
            ? [
                { type: 'MATRIC', weight: 10, required: true },
                { type: 'INTERMEDIATE', weight: 40, required: true },
                { type: 'ENTRY_TEST', weight: 50, required: true, testName: '' },
              ]
            : [
                { type: 'MATRIC', weight: 30, required: true },
                { type: 'INTERMEDIATE', weight: 70, required: true },
              ];
    await MeritFormulaModel.create({
      institutionId: inst._id,
      campaignId,
      programId: p._id,
      version: 1,
      components,
      tieBreakers: ['ENTRY_TEST', 'INTERMEDIATE', 'YOUNGER'],
      note: 'Approved by the academic council for this intake.',
      status: 'ACTIVE',
      createdBy: user._id,
      createdByName: user.fullName,
      activatedBy: user._id,
      activatedAt: new Date(),
    });
    if (draftFor === p.code) {
      await MeritFormulaModel.create({
        institutionId: inst._id,
        campaignId,
        programId: p._id,
        version: 2,
        components: [
          { type: 'MATRIC', weight: 10, required: true },
          { type: 'INTERMEDIATE', weight: 35, required: true },
          { type: 'ENTRY_TEST', weight: 55, required: true, testName: '' },
        ],
        tieBreakers: ['ENTRY_TEST', 'INTERMEDIATE', 'YOUNGER'],
        note: 'Proposed: more weight on the entry test (to be discussed in the committee).',
        status: 'DRAFT',
        createdBy: user._id,
        createdByName: user.fullName,
      });
    }
  }
}

// ===================================================================== 3. RIT admission cycle
interface Candidate {
  id: string;
  name: string;
  email: string;
  cnic: string;
  father: string;
  group: string;
  matric: number;
  inter: number;
  test: number;
  verifiedMarks: boolean;
  codes: string[];
  finalStatus: 'VERIFIED' | 'DOCUMENT_VERIFICATION' | 'PAYMENT_PENDING';
}

async function makeApplicant(
  c: Omit<Candidate, 'id'>,
  passwordHash: string,
  board: string,
  batchId: Types.ObjectId,
  testBatchId: Types.ObjectId,
  ritId: Types.ObjectId,
) {
  const user = await UserModel.create({
    fullName: c.name,
    email: c.email,
    passwordHash,
    accountType: 'APPLICANT',
    emailVerified: true,
  });
  const id = String(user._id);
  const male = Number(c.cnic.at(-1)) % 2 === 1;
  await ProfileModel.create({
    userId: id,
    cnic: c.cnic,
    fullName: c.name,
    fatherName: c.father,
    dateOfBirth: new Date(
      2005 + Math.floor(random() * 3),
      Math.floor(random() * 12),
      1 + Math.floor(random() * 27),
    ),
    gender: male ? 'MALE' : 'FEMALE',
    phone: `03${pick(['00', '01', '21', '33', '45', '12'])}-${String(1000000 + Math.floor(random() * 8999999))}`,
    domicile: 'Lahore',
    guardian: {
      name: c.father,
      relation: 'Father',
      phone: `0300-${String(1000000 + Math.floor(random() * 8999999))}`,
    },
    permanentAddress: {
      line: `House ${10 + Math.floor(random() * 300)}, ${pick(AREAS)}`,
      city: 'Lahore',
      province: 'Punjab',
    },
    currentAddress: {
      line: `House ${10 + Math.floor(random() * 300)}, ${pick(AREAS)}`,
      city: 'Lahore',
      province: 'Punjab',
    },
  });
  const req = applicantReq(id, c.name);
  const roll = () => String(400000 + Math.floor(random() * 99999));
  const mSubjects = subjectMarks(MATRIC_SUBJECTS, MATRIC_TOTALS, c.matric);
  const iNames = INTER_SUBJECTS[c.group] ?? INTER_SUBJECTS.ICS!;
  const iSubjects = subjectMarks(iNames, [200, 200, 200, 200, 200, 200], c.inter);
  const inputs = [
    { level: 'MATRIC' as const, year: 2022, subjects: mSubjects, group: 'Science' },
    { level: 'INTERMEDIATE' as const, year: 2024, subjects: iSubjects, group: c.group },
  ];
  for (const r of inputs) {
    const rollNo = roll();
    const obtained = r.subjects.reduce((s, x) => s + x.obtained, 0);
    const total = r.subjects.reduce((s, x) => s + x.total, 0);
    if (c.verifiedMarks)
      await RegistryRowModel.create({
        batchId,
        board,
        level: r.level,
        year: r.year,
        rollNo,
        studentName: c.name.toUpperCase(),
        fatherName: c.father.toUpperCase(),
        obtained,
        total,
        subjects: [],
      });
    const rec = await saveRecord(req, id, {
      level: r.level,
      board,
      examType: 'ANNUAL',
      group: r.group,
      year: r.year,
      rollNo,
      studentName: c.name,
      fatherName: c.father,
      subjects: r.subjects,
      obtained,
      total,
    });
    if (!c.verifiedMarks) {
      const card = await saveUpload(asFile('result-card.pdf'), {
        ownerId: id,
        purpose: 'RESULT_CARD',
        formats: ['PDF'],
        maxSizeMB: 2,
      });
      rec.set('resultCardFileId', card._id);
      rec.trustLevel = 1;
      rec.verificationStatus = 'UNDER_VERIFICATION';
      await rec.save();
    }
  }
  // REG-5: the entry-test result comes from RIT's own result import.
  const testRoll = `RIT-26-${pad(1000 + Math.floor(random() * 8999), 4)}`;
  const testObtained = Math.round(c.test);
  await RegistryRowModel.create({
    batchId: testBatchId,
    institutionId: ritId,
    board: 'RIT Entry Test',
    level: 'ENTRY_TEST',
    year: 2026,
    rollNo: testRoll,
    studentName: c.name.toUpperCase(),
    fatherName: c.father.toUpperCase(),
    obtained: testObtained,
    total: 100,
    subjects: [],
  });
  await saveRecord(req, id, {
    level: 'ENTRY_TEST',
    board: 'RIT Entry Test',
    examType: 'TEST',
    testName: 'RIT Entry Test',
    year: 2026,
    rollNo: testRoll,
    studentName: c.name,
    fatherName: c.father,
    subjects: [],
    obtained: testObtained,
    total: 100,
  });
  return id;
}

async function applyAndProcess(
  c: Candidate,
  campaign: { _id: Types.ObjectId },
  inst: Inst,
  officer: Request,
  submitAt: number,
) {
  const req = applicantReq(c.id, c.name);
  setClock(submitAt);
  const programs = await ProgramModel.find({ institutionId: inst._id, code: { $in: c.codes } }).lean();
  const prefs = c.codes.map((code) => programs.find((p) => p.code === code)!);
  const app = (await ApplicationModel.create({
    institutionId: inst._id,
    campaignId: campaign._id,
    applicantId: c.id,
    preferences: prefs.map((p, i) => ({ programId: p._id, shift: 'MORNING', order: i + 1 })),
  })) as AppDoc;
  const types = await DocumentTypeModel.find({ institutionId: inst._id, active: true }).lean();
  for (const t of types.filter(
    (t) => t.required && (!t.degreeLevels?.length || t.degreeLevels.includes('BS')),
  )) {
    const f = await saveUpload(asFile(`${t.code.toLowerCase()}.pdf`), {
      ownerId: c.id,
      purpose: 'DOCUMENT',
      formats: ['PDF'],
      maxSizeMB: 2,
    });
    await ApplicantDocumentModel.create({
      applicationId: app._id,
      institutionId: inst._id,
      documentTypeId: t._id,
      fileId: f._id,
    });
  }
  await submitApplication(req, app);
  if (c.finalStatus === 'PAYMENT_PENDING') return app;

  // Proof of payment the next day, verified by the officer the day after.
  setClock(submitAt + between(0.6, 1.4) * DAY);
  const voucher = (await VoucherModel.findOne({ applicationId: app._id, type: 'APPLICATION' }))!;
  const slip = await saveUpload(asFile('deposit-slip.pdf'), {
    ownerId: c.id,
    purpose: 'PAYMENT_PROOF',
    formats: ['PDF'],
    maxSizeMB: 2,
  });
  const pay = await PaymentModel.create({
    institutionId: inst._id,
    voucherId: voucher._id,
    applicationId: app._id,
    applicantId: c.id,
    method: pick(['BANK_DEPOSIT', 'ONLINE_TRANSFER', 'EASYPAISA', 'JAZZCASH'] as const),
    reference: `${pick(['HBL', 'MCB', 'UBL', 'ABL', 'EP', 'JC'])}-${String(100000 + Math.floor(random() * 899999))}`,
    amount: voucher.amount,
    paidOn: new Date(),
    proofFileId: slip._id,
  });
  setClock(submitAt + between(1.6, 2.6) * DAY);
  const yr = new Date().getFullYear();
  pay.status = 'VERIFIED';
  pay.receiptNumber = `RCPT-${inst.shortName}-${yr}-${pad(await nextSeq(`receipt:${inst._id}:${yr}`), 6)}`;
  pay.decidedByName = officer.auth!.name;
  pay.set('decidedBy', officer.auth!.userId);
  pay.decidedAt = new Date();
  await pay.save();
  voucher.status = 'PAID';
  await voucher.save();
  const fresh = (await ApplicationModel.findById(app._id)) as AppDoc;
  pushHistory(fresh, 'UNDER_REVIEW', 'SYSTEM', undefined, `Fee verified, receipt ${pay.receiptNumber}`);
  await fresh.save();

  // Document verification and eligibility by the admission officer.
  setClock(submitAt + between(3, 4.5) * DAY);
  const by = { id: officer.auth!.userId, name: officer.auth!.name };
  pushHistory(fresh, 'DOCUMENT_VERIFICATION', 'STAFF', by);
  await fresh.save();
  if (c.finalStatus === 'DOCUMENT_VERIFICATION') return fresh;
  const docs = await ApplicantDocumentModel.find({ applicationId: app._id, current: true });
  for (const d of docs) {
    d.status = 'APPROVED';
    d.reviewTrail.push({
      decision: 'APPROVED',
      reason: '',
      reviewer: by.id as never,
      reviewerName: by.name,
      at: new Date(),
    });
    await d.save();
  }
  setClock(submitAt + between(5, 6) * DAY);
  pushHistory(fresh, 'ELIGIBILITY_CHECK', 'STAFF', by);
  setClock(submitAt + between(6.2, 7) * DAY);
  pushHistory(fresh, 'VERIFIED', 'STAFF', by, 'Eligible for the chosen programs');
  await fresh.save();
  return fresh;
}

/** Applicant accepts, pays the admission fee and (optionally) the finance officer verifies it. */
async function acceptAndPay(offerId: unknown, c: Candidate, finance: Request, when: number, verify: boolean) {
  setClock(when);
  const { offer, voucher } = await acceptOffer(applicantReq(c.id, c.name), offerId as string);
  setClock(when + between(3, 20) * HOUR);
  const slip = await saveUpload(asFile('admission-fee-slip.pdf'), {
    ownerId: c.id,
    purpose: 'PAYMENT_PROOF',
    formats: ['PDF'],
    maxSizeMB: 2,
  });
  const pay = await PaymentModel.create({
    institutionId: offer.institutionId,
    voucherId: voucher._id,
    applicationId: offer.applicationId,
    applicantId: c.id,
    method: pick(['BANK_DEPOSIT', 'ONLINE_TRANSFER'] as const),
    reference: `ADM-${String(100000 + Math.floor(random() * 899999))}`,
    amount: voucher.amount,
    paidOn: new Date(),
    proofFileId: slip._id,
  });
  await VoucherModel.updateOne({ _id: voucher._id }, { status: 'AWAITING_VERIFICATION' });
  if (!verify) return null;
  setClock(when + between(24, 40) * HOUR);
  const enrollment = await withTransaction(async (session) => {
    const yr = new Date().getFullYear();
    pay.status = 'VERIFIED';
    pay.receiptNumber = `RCPT-${(finance.tenant!.institution as unknown as { shortName: string }).shortName}-${yr}-${pad(await nextSeq(`receipt:${offer.institutionId}:${yr}`, session), 6)}`;
    pay.decidedByName = finance.auth!.name;
    pay.set('decidedBy', finance.auth!.userId);
    pay.decidedAt = new Date();
    await pay.save({ session });
    await VoucherModel.updateOne({ _id: voucher._id }, { status: 'PAID' }, { session });
    return enrollAfterPayment(voucher._id, session);
  });
  if (enrollment) await notifyEnrollment(enrollment._id);
  return enrollment;
}

async function seedRitCycle(passwordHash: string, adminId: Types.ObjectId) {
  const rit = (await InstitutionModel.findOne({ shortName: 'RIT' }))!;
  const campaign = (await CampaignModel.findOne({ institutionId: rit._id }))!;
  const T = realNow().getTime();
  const opens = T - 52 * DAY;
  const closes = T - 24 * DAY;

  // The campaign ran earlier this year with a seat cap per program for this intake.
  const progs = await ProgramModel.find({ institutionId: rit._id }).lean();
  const cap: Record<string, number> = { BSIT: 10, BSDS: 6, BSEE: 6 };
  campaign.opensAt = new Date(opens);
  // While the sample data is being created the closing date stays in the future, so that a
  // running API (whose jobs close campaigns and expire offers) does not interfere.
  campaign.closesAt = new Date(T + 30 * DAY);
  campaign.set(
    'programs',
    campaign.programs.map((p) => ({
      programId: p.programId,
      seatCap: cap[progs.find((x) => String(x._id) === String(p.programId))!.code] ?? null,
    })),
  );
  campaign.set('history', [{ from: 'DRAFT', to: 'OPEN', at: new Date(opens), by: adminId }]);
  await campaign.save();
  rit.set('settings.requireOriginals', true);
  await rit.save();

  const officer = await staffReq('officer@rit.example.edu.pk', rit);
  const merit1 = await staffReq('merit1@rit.example.edu.pk', rit);
  const merit2 = await staffReq('merit2@rit.example.edu.pk', rit);
  const admin = await staffReq('admin@rit.example.edu.pk', rit);

  const batch = await RegistryBatchModel.create({
    source:
      'SAMPLE gazette: BISE Lahore, Gujranwala, Faisalabad and Sahiwal, Matric 2022 and Intermediate 2024 (fictional data)',
    fileName: 'sample-gazette-punjab.csv',
    fileHash: 'sample-punjab',
    uploadedBy: adminId,
    boards: BOARDS,
    years: [2022, 2024],
  });
  const testBatch = await RegistryBatchModel.create({
    institutionId: rit._id,
    source: 'RIT Entry Test 2026 result (sample)',
    fileName: 'rit-entry-test-2026.csv',
    fileHash: 'sample-rit-test',
    uploadedBy: (await UserModel.findOne({ email: 'admin@rit.example.edu.pk' }).lean())!._id,
    boards: ['RIT Entry Test'],
    years: [2026],
  });

  // ---- applicants
  const candidates: Candidate[] = [];
  const used = new Set<string>();
  const N = 74;
  // Fixed demonstration accounts: one stays on the waiting list, one is not selected.
  const fixed: Record<
    number,
    { name: string; email: string; matric: number; inter: number; test: number; group: string; male: boolean }
  > = {
    0: {
      name: 'Zainab Tariq',
      email: 'zainab.tariq@example.com',
      matric: 93.1,
      inter: 90.4,
      test: 88,
      group: 'ICS',
      male: false,
    },
    3: {
      name: 'Mahnoor Fatima',
      email: 'mahnoor.fatima@example.com',
      matric: 84.2,
      inter: 79.6,
      test: 66,
      group: 'ICS',
      male: false,
    },
    9: {
      name: 'Danish Iqbal',
      email: 'danish.iqbal@example.com',
      matric: 64.5,
      inter: 58.2,
      test: 41,
      group: 'ICS',
      male: true,
    },
  };
  for (let i = 0; i < N; i++) {
    const f = fixed[i];
    const male = f ? f.male : random() < 0.55;
    let name = f?.name ?? `${pick(male ? MALE : FEMALE)} ${pick(SURNAMES)}`;
    while (used.has(name)) name = `${pick(male ? MALE : FEMALE)} ${pick(SURNAMES)}`;
    used.add(name);
    const group =
      f?.group ??
      (random() < 0.48 ? 'Pre-Engineering' : random() < 0.85 ? 'ICS' : 'Pre-Medical (with Mathematics)');
    const matric = f?.matric ?? clamp(gauss(82, 7), 62, 97);
    const inter = f?.inter ?? clamp(matric - between(0, 7) + gauss(0, 2.5), 55, 95);
    const test = f?.test ?? clamp(inter - 6 + gauss(0, 9), 38, 97);
    const codes =
      group === 'Pre-Engineering'
        ? random() < 0.5
          ? ['BSEE', 'BSIT', 'BSDS']
          : ['BSIT', 'BSDS', 'BSEE']
        : random() < 0.6
          ? ['BSIT', 'BSDS']
          : ['BSDS', 'BSIT'];
    const eligible = codes.filter((c) => c !== 'BSEE' || inter >= 60);
    const digit = male ? pick([1, 3, 5, 7, 9]) : pick([2, 4, 6, 8]);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .split(' ');
    const c: Omit<Candidate, 'id'> = {
      name,
      email: f?.email ?? `${slug[0]}.${slug.at(-1)}${i}@example.com`,
      cnic: `35202${String(1000000 + Math.floor(random() * 8999999))}${digit}`,
      father: `${pick(FATHERS)}`,
      group,
      matric: round2(matric),
      inter: round2(inter),
      test: Math.round(test),
      verifiedMarks: f ? true : i % 13 !== 5, // a few applicants only have uploaded result cards (MARK-10)
      codes: f ? ['BSIT', 'BSDS'] : eligible,
      finalStatus:
        i === 7 || i === 23 || i === 38
          ? 'DOCUMENT_VERIFICATION'
          : i === 30 || i === 61
            ? 'PAYMENT_PENDING'
            : 'VERIFIED',
    };
    const id = await makeApplicant(
      c,
      passwordHash,
      pick(BOARDS),
      batch._id,
      testBatch._id,
      rit._id as Types.ObjectId,
    );
    candidates.push({ ...c, id });
  }

  // The named demonstration applicants also apply here.
  const ayesha = (await UserModel.findOne({ email: 'ayesha.noor@example.com' }).lean())!;
  const bilal = (await UserModel.findOne({ email: 'bilal.ahmed@example.com' }).lean())!;
  const named: { user: typeof ayesha; test: number; codes: string[]; father: string; group: string }[] = [
    { user: ayesha, test: 74, codes: ['BSIT', 'BSDS'], father: 'Noor Ahmad', group: 'ICS' },
    { user: bilal, test: 58, codes: ['BSIT', 'BSDS'], father: 'Ahmed Khan', group: 'Pre-Engineering' },
  ];
  for (const n of named) {
    const roll = `RIT-26-${pad(1000 + Math.floor(random() * 8999), 4)}`;
    await RegistryRowModel.create({
      batchId: testBatch._id,
      institutionId: rit._id,
      board: 'RIT Entry Test',
      level: 'ENTRY_TEST',
      year: 2026,
      rollNo: roll,
      studentName: n.user.fullName.toUpperCase(),
      fatherName: n.father.toUpperCase(),
      obtained: n.test,
      total: 100,
      subjects: [],
    });
    await saveRecord(applicantReq(String(n.user._id), n.user.fullName), String(n.user._id), {
      level: 'ENTRY_TEST',
      board: 'RIT Entry Test',
      examType: 'TEST',
      testName: 'RIT Entry Test',
      year: 2026,
      rollNo: roll,
      studentName: n.user.fullName,
      fatherName: n.father,
      subjects: [],
      obtained: n.test,
      total: 100,
    });
    const profile = (await ProfileModel.findOne({ userId: n.user._id }).lean())!;
    candidates.push({
      id: String(n.user._id),
      name: n.user.fullName,
      email: n.user.email,
      cnic: profile.cnic,
      father: n.father,
      group: n.group,
      matric: 0,
      inter: 0,
      test: n.test,
      verifiedMarks: true,
      codes: n.codes,
      finalStatus: 'VERIFIED',
    });
  }

  installClock();
  try {
    for (const [i, c] of candidates.entries()) {
      const submitAt =
        opens + DAY + (i / candidates.length) * (closes - opens - 9 * DAY) + between(0, 12) * HOUR;
      await applyAndProcess(c, campaign as never, rit, officer, submitAt);
    }
    setClock(closes + HOUR);
    campaign.status = 'CLOSED';
    campaign.closesAt = new Date(closes);
    campaign.history.push({ from: 'OPEN', to: 'CLOSED', at: new Date(), auto: true });
    await campaign.save();

    // ---- formulas by the committee
    setClock(closes + 2 * DAY);
    await seedFormulas(campaign._id as Types.ObjectId, rit, 'merit1@rit.example.edu.pk');

    // ---- merit list 1: generated, approved by the second member, published by the admin
    setClock(T - 20 * DAY);
    // For the demonstration Ayesha should be at the top of the BSIT waiting list in list 1, so
    // that list 2 selects her and her offer is still open today. Her test score is tuned once.
    await tuneWaitlist(merit1, campaign._id, String(ayesha._id));
    // The real deadline (T - 10 days) is set after the responses, for the same reason as above.
    const l1 = await generateList(merit1, campaign._id as never, new Date(T + 20 * DAY));
    setClock(T - 19 * DAY);
    await approveList(merit2, l1._id as never);
    setClock(T - 18 * DAY);
    await publishList(admin, l1._id as never);

    // ---- responses to list 1
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const offers1 = await OfferModel.find({ meritListId: l1._id }).sort({ meritPosition: 1 }).lean();
    const enrolled: unknown[] = [];
    let k = 0;
    for (const o of offers1) {
      const c = byId.get(String(o.applicantId))!;
      const when = T - 17 * DAY + between(0, 4) * DAY;
      if (c.email === 'zainab.tariq@example.com') {
        // The enrolled demonstration student: accepts, pays and reports first.
        const e = await acceptAndPay(o._id, c, admin, T - 17 * DAY, true);
        if (e) enrolled.unshift(e._id);
        continue;
      }
      const r = k++ % 10;
      if (r < 6) {
        const e = await acceptAndPay(o._id, c, admin, when, true);
        if (e) enrolled.push(e._id);
      } else if (r < 8) {
        setClock(when);
        await declineOffer(applicantReq(c.id, c.name), o._id as never);
      }
      // the others do not respond and their offers expire
    }
    await MeritListModel.updateOne({ _id: l1._id }, { offerDeadline: new Date(T - 10 * DAY) });
    await OfferModel.updateMany({ meritListId: l1._id }, { deadline: new Date(T - 10 * DAY) });
    await VoucherModel.updateMany(
      {
        _id: { $in: (await OfferModel.find({ meritListId: l1._id }).distinct('voucherId')).filter(Boolean) },
      },
      { dueDate: new Date(T - 10 * DAY) },
    );
    setClock(T - 10 * DAY + 2 * HOUR);
    await expireOffers(new Date());

    // MARK-12: originals checked on the reporting day (two students have not reported yet).
    for (const [i, e] of enrolled.entries()) {
      if (i >= enrolled.length - 2) break;
      setClock(T - 9 * DAY + i * 2 * HOUR);
      await verifyOriginals(officer, e as never);
    }

    // MARK-11: altered marks found on one result card.
    const revokeOffer = await OfferModel.findOne({ meritListId: l1._id, status: 'ENROLLED' })
      .sort({ meritPosition: -1 })
      .lean();
    if (revokeOffer) {
      setClock(T - 8 * DAY);
      await revokeAdmission(
        admin,
        revokeOffer._id as never,
        'The original Intermediate result card presented on the reporting day does not match the marks entered (altered card).',
        true,
      );
    }

    // ---- merit list 2 for the released seats
    setClock(T - 6 * DAY);
    const l2 = await generateList(merit2, campaign._id as never, new Date(T + 4 * DAY));
    setClock(T - 5 * DAY);
    await approveList(merit1, l2._id as never);
    setClock(T - 4 * DAY);
    await publishList(admin, l2._id as never);

    const offers2 = await OfferModel.find({ meritListId: l2._id }).sort({ meritPosition: 1 }).lean();
    let j = 0;
    for (const o of offers2) {
      const c = byId.get(String(o.applicantId))!;
      if (c.email === 'ayesha.noor@example.com') continue; // Ayesha decides herself in the demonstration
      const when = T - 3 * DAY + between(0, 2) * DAY;
      const r = j++ % 4;
      if (r === 0)
        await acceptAndPay(o._id, c, admin, when, false); // proof waiting for the finance officer
      else if (r === 1) {
        setClock(when);
        await declineOffer(applicantReq(c.id, c.name), o._id as never);
      } else if (r === 2) {
        setClock(when);
        await acceptOffer(applicantReq(c.id, c.name), o._id as never);
      }
    }

    // ---- merit list 3 generated by one member and waiting for the other (OFFER-1)
    setClock(T - 6 * HOUR);
    try {
      const l3 = await generateList(merit1, campaign._id as never, new Date(T + 12 * DAY));
      if (!l3.counts?.selected) {
        await MeritEntryModel.deleteMany({ meritListId: l3._id });
        await MeritListModel.deleteOne({ _id: l3._id });
      }
    } catch {
      /* no free seats: nothing to generate */
    }
  } finally {
    uninstallClock();
  }

  const l = await MeritListModel.find({ campaignId: campaign._id }).lean();
  const entries = await MeritEntryModel.find({ meritListId: { $in: l.map((x) => x._id) } }).lean();
  const show = async (email: string) => {
    const u = await UserModel.findOne({ email }).lean();
    return (
      entries
        .filter((e) => String(e.applicantId) === String(u?._id))
        .map((e) => e.outcome)
        .join(' > ') || '-'
    );
  };
  log(
    `  Zainab: ${await show('zainab.tariq@example.com')}; Mahnoor: ${await show('mahnoor.fatima@example.com')}; Danish: ${await show('danish.iqbal@example.com')}`,
  );
  const ay = entries.filter((e) => String(e.applicantId) === String(ayesha._id)).map((e) => `${e.outcome}`);
  const bi = entries.filter((e) => String(e.applicantId) === String(bilal._id)).map((e) => `${e.outcome}`);
  log(
    `RIT Fall 2026: ${candidates.length} applications, ${l.length} merit lists (${l.map((x) => x.status.toLowerCase()).join(', ')}); Ayesha: ${ay.join(' > ') || '-'}; Bilal: ${bi.join(' > ') || '-'}`,
  );
  return { campaign, rit };
}

async function setTestScore(userId: string, score: number) {
  const rec = (await RecordModel.findOne({ userId, level: 'ENTRY_TEST', current: true }))!;
  await RegistryRowModel.updateOne(
    { board: rec.board, level: 'ENTRY_TEST', rollNo: rec.rollNo },
    { obtained: score },
  );
  rec.obtained = score;
  rec.percentage = score;
  rec.set('subjects', []);
  await rec.save();
}

async function tuneWaitlist(req: Request, campaignId: unknown, userId: string) {
  let lo = 40;
  let hi = 99;
  let best: number | null = null;
  for (let i = 0; i < 8 && lo <= hi; i++) {
    const mid = Math.round((lo + hi) / 2);
    await setTestScore(userId, mid);
    const list = await generateList(req, campaignId as never, new Date(Date.now() + DAY));
    const entry = await MeritEntryModel.findOne({ meritListId: list._id, applicantId: userId }).lean();
    await MeritEntryModel.deleteMany({ meritListId: list._id });
    await MeritListModel.deleteOne({ _id: list._id });
    if (
      !entry ||
      entry.outcome === 'NOT_SELECTED' ||
      (entry.outcome === 'WAITLISTED' && (entry.waitingPosition ?? 99) > 2)
    )
      lo = mid + 1;
    else if (entry.outcome === 'SELECTED') hi = mid - 1;
    else {
      best = mid;
      break;
    }
  }
  await setTestScore(userId, best ?? Math.max(40, hi));
}

// ===================================================================== 4. Advisor usage and shortlist
async function seedAdvisorUsage() {
  const T = realNow().getTime();
  const runs = [];
  installClock();
  try {
    for (let i = 0; i < 36; i++) {
      const matric = Math.round(clamp(gauss(80, 8), 55, 97));
      const inter = Math.round(clamp(matric - between(0, 8), 50, 95));
      const test = random() < 0.6 ? Math.round(clamp(inter - 5 + gauss(0, 8), 40, 97)) : null;
      const group = pick(['Pre-Engineering', 'ICS', 'Pre-Medical', 'I.Com', 'FA']);
      const results = await advise({ matric, inter, test, fieldGroup: group, degreeLevel: 'BS' });
      const times = 2 + Math.floor(random() * 5);
      for (let t = 0; t < times; t++) {
        setClock(T - between(0, 30) * DAY);
        runs.push({
          inputs: {
            matric,
            inter,
            test,
            fieldGroup: group,
            degreeLevel: 'BS',
            city: '',
            province: '',
            sector: '',
          },
          resultCount: results.length,
          programs: results
            .filter((r) => r.eligible)
            .slice(0, 40)
            .map((r) => ({ directoryProgramId: r.directoryProgramId, band: r.band })),
          signedIn: random() < 0.3,
          createdAt: new Date(),
        });
      }
    }
  } finally {
    uninstallClock();
  }
  await AdvisorLogModel.insertMany(runs);
  log(`Admission Advisor: ${runs.length} anonymous runs over the last 30 days`);
}

async function seedShortlist() {
  const ayesha = await UserModel.findOne({ email: 'ayesha.noor@example.com' }).lean();
  if (!ayesha) return;
  const wanted = [
    {
      inst: 'Riverside Institute of Technology',
      title: 'BS Information Technology',
      note: 'Selected in merit list 2: accept before the deadline.',
    },
    {
      inst: 'Crescent Valley University',
      title: 'BS Computer Science',
      note: 'First choice. Application under review.',
    },
    {
      inst: 'Ravi Bank University of Sciences',
      title: 'BS Information Technology',
      note: 'Public sector, low fee.',
    },
    { inst: 'Indus Delta University', title: 'BS Data Science', note: 'Backup option in Karachi.' },
  ];
  for (const w of wanted) {
    const di = await DirInstitutionModel.findOne({ name: w.inst }).lean();
    const dp = di
      ? await DirProgramModel.findOne({ directoryInstitutionId: di._id, title: w.title }).lean()
      : null;
    if (dp) await ShortlistModel.create({ userId: ayesha._id, directoryProgramId: dp._id, note: w.note });
  }
}

export async function seedPhase3(passwordHash: string) {
  const level = logger.level;
  logger.level = 'warn'; // e-mails of the sample data are not printed one by one
  try {
    const admin = (await UserModel.findOne({ platformRole: 'SUPER_ADMIN' }).lean())!;
    // An earlier academic session for completeness of the structure.
    const year = realNow().getFullYear();
    const cvu = (await InstitutionModel.findOne({ shortName: 'CVU' }))!;
    await AcademicSessionModel.create({
      institutionId: cvu._id,
      name: `${year - 1}-${year}`,
      startDate: new Date(year - 1, 8, 1),
      endDate: new Date(year, 7, 31),
      isCurrent: false,
    });
    const cvuCampaign = (await CampaignModel.findOne({ institutionId: cvu._id }).lean())!;
    await seedFormulas(cvuCampaign._id as Types.ObjectId, cvu, 'merit1@cvu.example.edu.pk', 'BSCS');
    log('Merit formulas: CVU Fall 2026 (active versions and a proposed version 2 for BSCS)');
    await seedRitCycle(passwordHash, admin._id as Types.ObjectId);
    await seedDirectory(admin._id as Types.ObjectId);
    await seedAdvisorUsage();
    await seedShortlist();
  } finally {
    logger.level = level;
  }
}
