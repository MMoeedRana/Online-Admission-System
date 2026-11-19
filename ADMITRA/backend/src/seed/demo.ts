/**
 * Demonstration data for Phase 2 screens. Every person and result here is fictional.
 * Applicants are taken through the real services so that numbers, challans and checks are genuine.
 */
import type { Request } from 'express';
import PDFDocument from 'pdfkit';
import { Types } from 'mongoose';
import { hashPassword } from '../lib/crypto';
import { nextSeq, pad } from '../lib/counter';
import { saveUpload } from '../lib/storage';
import { ApplicationModel } from '../modules/applications/application.model';
import { pushHistory, submitApplication, type AppDoc } from '../modules/applications/application.service';
import { CampaignModel } from '../modules/campaigns/campaign.model';
import { ApplicantDocumentModel, DocumentTypeModel } from '../modules/documents/document.models';
import { PaymentModel, VoucherModel } from '../modules/fees/fee.models';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { ProfileModel } from '../modules/profile/profile.model';
import { ProgramModel } from '../modules/programs/program.model';
import { RecordModel } from '../modules/records/record.models';
import {
  attachResultCard,
  runRegistryCheck,
  saveRecord,
  type RecordInput,
} from '../modules/records/record.service';
import { RegistryBatchModel, RegistryRowModel } from '../modules/registry/registry.models';
import { UserModel } from '../modules/users/user.model';
import { SAMPLE_PASSWORD } from './data';

function pdfBuffer(title: string, lines: string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.rect(0, 0, doc.page.width, 56).fill('#0B1B3A');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13).text(title, 36, 20);
    doc.fillColor('#B91C1C').fontSize(9).text('SAMPLE DOCUMENT - FOR DEMONSTRATION ONLY', 36, 70);
    doc.moveDown(1.5).fillColor('#0F172A').font('Helvetica').fontSize(10);
    for (const l of lines) doc.text(l).moveDown(0.3);
    doc.end();
  });
}

const asFile = (buffer: Buffer, name: string) =>
  ({ buffer, size: buffer.length, originalname: name }) as Express.Multer.File;

const fakeReq = (userId: string, name: string, tenant?: Request['tenant']) =>
  ({
    auth: { userId, accountType: 'APPLICANT', platformRole: null, name },
    ip: '127.0.0.1',
    tenant,
  }) as unknown as Request;

interface Person {
  name: string;
  father: string;
  email: string;
  cnic: string;
  gender: 'MALE' | 'FEMALE';
  matric: { roll: string; marks: number[] };
  inter: { roll: string; marks: number[]; group: string };
}

const MATRIC_SUBJECTS = [
  'English',
  'Urdu',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Islamic Studies',
  'Pakistan Studies',
];
const MATRIC_TOTALS = [150, 150, 150, 150, 150, 150, 100, 100];
const INTER_SUBJECTS = ['English', 'Urdu', 'Mathematics', 'Physics', 'Computer Science', 'Islamic Studies'];
const INTER_TOTALS = [200, 200, 200, 200, 200, 200];

function recordOf(p: Person, level: 'MATRIC' | 'INTERMEDIATE'): RecordInput {
  const m = level === 'MATRIC' ? p.matric : p.inter;
  const names = level === 'MATRIC' ? MATRIC_SUBJECTS : INTER_SUBJECTS;
  const totals = level === 'MATRIC' ? MATRIC_TOTALS : INTER_TOTALS;
  const subjects = names.map((name, i) => ({ name, obtained: m.marks[i]!, total: totals[i]! }));
  return {
    level,
    board: 'BISE Faisalabad',
    examType: 'ANNUAL',
    group: level === 'MATRIC' ? 'Science' : p.inter.group,
    year: level === 'MATRIC' ? 2022 : 2024,
    rollNo: m.roll,
    studentName: p.name,
    fatherName: p.father,
    subjects,
    obtained: subjects.reduce((a, s) => a + s.obtained, 0),
    total: subjects.reduce((a, s) => a + s.total, 0),
  };
}

const people: Person[] = [
  {
    name: 'Ayesha Noor',
    father: 'Noor Ahmad',
    email: 'ayesha.noor@example.com',
    cnic: '3310012345672',
    gender: 'FEMALE',
    matric: { roll: '412345', marks: [120, 135, 140, 130, 125, 120, 90, 90] },
    inter: { roll: '523456', marks: [160, 170, 180, 165, 175, 124], group: 'ICS' },
  },
  {
    name: 'Bilal Ahmed',
    father: 'Ahmed Khan',
    email: 'bilal.ahmed@example.com',
    cnic: '3310023456781',
    gender: 'MALE',
    matric: {
      roll: '412360',
      marks: [118, 130, 142, 128, 126, 0, 85, 88].map((x, i) => (i === 5 ? 120 : x)),
    },
    inter: { roll: '523470', marks: [150, 160, 170, 160, 168, 130], group: 'Pre-Engineering' },
  },
  {
    name: 'Sara Khan',
    father: 'Imran Khan',
    email: 'sara.khan@example.com',
    cnic: '3310034567892',
    gender: 'FEMALE',
    matric: { roll: '412380', marks: [125, 128, 135, 126, 122, 124, 88, 86] },
    inter: { roll: '523490', marks: [170, 165, 175, 168, 172, 112], group: 'ICS' },
  },
  {
    name: 'Hamza Ali',
    father: 'Ali Hassan',
    email: 'hamza.ali@example.com',
    cnic: '3310045678903',
    gender: 'MALE',
    matric: { roll: '412399', marks: [110, 120, 130, 120, 115, 118, 80, 82] },
    inter: { roll: '523501', marks: [140, 150, 160, 150, 158, 132], group: 'ICS' },
  },
];

export async function seedDemo() {
  const admin = await UserModel.findOne({ platformRole: 'SUPER_ADMIN' });
  const passwordHash = await hashPassword(SAMPLE_PASSWORD);

  // 1. A fictional result gazette in the board result registry (REG-1).
  const batch = await RegistryBatchModel.create({
    source: 'SAMPLE gazette: BISE Faisalabad Matric 2022 and Intermediate 2024 (fictional data)',
    fileName: 'sample-gazette.csv',
    fileHash: 'sample',
    uploadedBy: admin!._id,
    boards: ['BISE Faisalabad'],
    years: [2022, 2024],
  });
  const rows = [];
  for (const p of people) {
    if (p.name === 'Hamza Ali') continue; // Hamza's board result is not imported: officer verification needed
    for (const level of ['MATRIC', 'INTERMEDIATE'] as const) {
      // Sara's Intermediate row is imported after she applies (see step 3).
      if (p.name === 'Sara Khan' && level === 'INTERMEDIATE') continue;
      const r = recordOf(p, level);
      rows.push({
        batchId: batch._id,
        board: r.board,
        level,
        year: r.year,
        rollNo: r.rollNo,
        studentName: p.name.toUpperCase(),
        fatherName: p.father.toUpperCase(),
        obtained: r.obtained,
        total: r.total,
        subjects: [],
      });
    }
  }
  for (let i = 0; i < 24; i++) {
    const obtained = 700 + ((i * 37) % 420);
    rows.push({
      batchId: batch._id,
      board: 'BISE Faisalabad',
      level: 'INTERMEDIATE' as const,
      year: 2024,
      rollNo: String(530000 + i),
      studentName: `SAMPLE STUDENT ${i + 1}`,
      fatherName: `SAMPLE FATHER ${i + 1}`,
      obtained,
      total: 1100,
      subjects: [],
    });
  }
  await RegistryRowModel.insertMany(rows);
  batch.rowCount = rows.length;
  await batch.save();
  console.log(`  Sample registry batch: ${rows.length} rows`);

  const cvu = await InstitutionModel.findOne({ shortName: 'CVU' }).lean();
  const rit = await InstitutionModel.findOne({ shortName: 'RIT' }).lean();
  const cvuCampaign = await CampaignModel.findOne({ institutionId: cvu!._id }).lean();
  const ritCampaign = await CampaignModel.findOne({ institutionId: rit!._id }).lean();
  const program = async (instId: unknown, code: string) =>
    (await ProgramModel.findOne({ institutionId: instId as Types.ObjectId, code }).lean())!;

  // 2. Applicants with profiles and records (checked by the real verification service).
  const users: Record<string, { id: string; person: Person }> = {};
  for (const p of people) {
    let user = await UserModel.findOne({ email: p.email });
    if (!user)
      user = await UserModel.create({
        fullName: p.name,
        email: p.email,
        passwordHash,
        accountType: 'APPLICANT',
        emailVerified: true,
      });
    const id = String(user._id);
    users[p.name] = { id, person: p };
    await ProfileModel.create({
      userId: id,
      cnic: p.cnic,
      fullName: p.name,
      fatherName: p.father,
      dateOfBirth: new Date(2006, 3, 12),
      gender: p.gender,
      phone: '0301-2345678',
      domicile: 'Faisalabad',
      guardian: { name: p.father, relation: 'Father', phone: '0300-1234567' },
      permanentAddress: {
        line: 'House 12, Street 4, Peoples Colony',
        city: 'Faisalabad',
        province: 'Punjab',
      },
      currentAddress: { line: 'House 12, Street 4, Peoples Colony', city: 'Faisalabad', province: 'Punjab' },
    });
    const req = fakeReq(id, p.name);
    for (const level of ['MATRIC', 'INTERMEDIATE'] as const) {
      const input = recordOf(p, level);
      const rec = await saveRecord(req, id, input);
      if (rec.trustLevel < 2) {
        const card = await saveUpload(
          asFile(
            await pdfBuffer(`${level === 'MATRIC' ? 'Matric' : 'Intermediate'} result card (DMC)`, [
              `Name: ${p.name}`,
              `Father: ${p.father}`,
              `Board: ${input.board}  Year: ${input.year}`,
              `Roll number: ${input.rollNo}`,
              ...input.subjects.map((s) => `${s.name}: ${s.obtained} / ${s.total}`),
              `Total: ${input.obtained} / ${input.total}`,
            ]),
            'result-card.pdf',
          ),
          { ownerId: id, purpose: 'RESULT_CARD', formats: ['PDF'], maxSizeMB: 2 },
        );
        await attachResultCard(rec, card);
      }
    }
  }

  // 3. Applications at different stages.
  async function apply(name: string, campaign: typeof cvuCampaign, codes: string[]) {
    const { id, person } = users[name]!;
    const inst = await InstitutionModel.findById(campaign!.institutionId).lean();
    const progs = await Promise.all(codes.map((c) => program(inst!._id, c)));
    const app = (await ApplicationModel.create({
      institutionId: inst!._id,
      campaignId: campaign!._id,
      applicantId: id,
      preferences: progs.map((p, i) => ({ programId: p._id, shift: p.shifts[0]!.name, order: i + 1 })),
    })) as AppDoc;
    const types = await DocumentTypeModel.find({ institutionId: inst!._id, active: true }).lean();
    for (const t of types.filter(
      (t) => t.required && (!t.degreeLevels?.length || t.degreeLevels.includes('BS')),
    )) {
      const buf = await pdfBuffer(t.name, [`Applicant: ${person.name}`, `CNIC: ${person.cnic}`]);
      const f = await saveUpload(asFile(buf, `${t.code.toLowerCase()}.pdf`), {
        ownerId: id,
        purpose: 'DOCUMENT',
        formats: ['PDF'],
        maxSizeMB: 2,
      });
      await ApplicantDocumentModel.create({
        applicationId: app._id,
        institutionId: inst!._id,
        documentTypeId: t._id,
        fileId: f._id,
      });
    }
    await submitApplication(fakeReq(id, person.name), app);
    return { app, inst: inst!, id, person };
  }

  async function pay(ctx: Awaited<ReturnType<typeof apply>>, reference: string, verify: boolean) {
    const voucher = await VoucherModel.findOne({ applicationId: ctx.app._id });
    const slip = await saveUpload(
      asFile(
        await pdfBuffer('Bank deposit slip', [
          `Challan: ${voucher!.voucherNumber}`,
          `Amount: Rs. ${voucher!.amount}`,
          `Reference: ${reference}`,
        ]),
        'slip.pdf',
      ),
      { ownerId: ctx.id, purpose: 'PAYMENT_PROOF', formats: ['PDF'], maxSizeMB: 2 },
    );
    const payment = await PaymentModel.create({
      institutionId: ctx.inst._id,
      voucherId: voucher!._id,
      applicationId: ctx.app._id,
      applicantId: ctx.id,
      method: 'BANK_DEPOSIT',
      reference,
      amount: voucher!.amount,
      paidOn: new Date(Date.now() - 864e5),
      proofFileId: slip._id,
    });
    voucher!.status = 'AWAITING_VERIFICATION';
    if (verify) {
      const year = new Date().getFullYear();
      payment.status = 'VERIFIED';
      payment.receiptNumber = `RCPT-${ctx.inst.shortName}-${year}-${pad(await nextSeq(`receipt:${ctx.inst._id}:${year}`), 6)}`;
      payment.decidedByName = 'Kamran Shah';
      payment.decidedAt = new Date();
      voucher!.status = 'PAID';
      pushHistory(
        ctx.app,
        'UNDER_REVIEW',
        'SYSTEM',
        undefined,
        `Fee verified, receipt ${payment.receiptNumber}`,
      );
      await ctx.app.save();
    }
    await payment.save();
    await voucher!.save();
  }

  const officer = await UserModel.findOne({ email: 'officer@cvu.example.edu.pk' }).lean();
  const by = { id: String(officer!._id), name: officer!.fullName };
  async function approveDocs(ctx: Awaited<ReturnType<typeof apply>>) {
    const docs = await ApplicantDocumentModel.find({ applicationId: ctx.app._id, current: true });
    for (const d of docs) {
      d.status = 'APPROVED';
      d.reviewTrail.push({
        decision: 'APPROVED',
        reason: '',
        reviewer: officer!._id,
        reviewerName: by.name,
        at: new Date(),
      });
      await d.save();
    }
  }

  const ayeshaCvu = await apply('Ayesha Noor', cvuCampaign, ['BSCS', 'BSSE', 'BSAI']);
  await pay(ayeshaCvu, 'HBL-FSD-778812', true);
  const ayeshaRit = await apply('Ayesha Noor', ritCampaign, ['BSIT']);
  void ayeshaRit;

  const bilal = await apply('Bilal Ahmed', cvuCampaign, ['BSIT', 'BSCS']);
  await pay(bilal, 'MCB-FSD-220145', true);
  pushHistory(bilal.app, 'DOCUMENT_VERIFICATION', 'STAFF', by);
  await approveDocs(bilal);
  pushHistory(bilal.app, 'ELIGIBILITY_CHECK', 'STAFF', by);
  pushHistory(bilal.app, 'VERIFIED', 'STAFF', by);
  await bilal.app.save();

  const hamza = await apply('Hamza Ali', cvuCampaign, ['BSSE']);
  await pay(hamza, 'EP-30019922', false);

  const sara = await apply('Sara Khan', cvuCampaign, ['BSCS']);
  await pay(sara, 'UBL-FSD-551030', true);
  pushHistory(sara.app, 'DOCUMENT_VERIFICATION', 'STAFF', by);
  await sara.app.save();
  // The gazette row of Sara's Intermediate arrives after she applied and shows 60 marks fewer:
  // the automatic re-check flags a MISMATCH for the officer.
  const saraInter = recordOf(sara.person, 'INTERMEDIATE');
  await RegistryRowModel.create({
    batchId: batch._id,
    board: saraInter.board,
    level: 'INTERMEDIATE',
    year: saraInter.year,
    rollNo: saraInter.rollNo,
    studentName: sara.person.name.toUpperCase(),
    fatherName: sara.person.father.toUpperCase(),
    obtained: saraInter.obtained - 60,
    total: saraInter.total,
    subjects: [],
  });
  const saraRecord = await RecordModel.findOne({ userId: sara.id, level: 'INTERMEDIATE', current: true });
  await runRegistryCheck(saraRecord!);

  console.log('  Sample applicants: Ayesha Noor, Bilal Ahmed, Sara Khan, Hamza Ali (password Admitra@123)');
}
