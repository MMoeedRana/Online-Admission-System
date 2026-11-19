import type { Request } from 'express';
import { NAME_SIMILARITY, standardTotalsFor, TRUST, type RecordLevel } from '../../constants/academics';
import { audit } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { nameSimilarity } from '../../lib/similarity';
import type { Id } from '../../lib/types';
import { registryResultSource, type ResultSource } from '../registry/result-source';
import type { HydratedDocument } from 'mongoose';
import { FraudFlagModel, RecordModel, VerificationModel, type AcademicRecord } from './record.models';

export interface RecordInput {
  level: RecordLevel;
  board: string;
  examType: 'ANNUAL' | 'SUPPLEMENTARY' | 'SEMESTER' | 'TEST';
  testName?: string;
  group?: string;
  year: number;
  rollNo: string;
  registrationNo?: string;
  studentName: string;
  fatherName: string;
  subjects: { name: string; obtained: number; total: number }[];
  obtained: number;
  total: number;
}

export type RecordDoc = HydratedDocument<AcademicRecord>;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * MARK-2 integrity rules. Errors reject the input; flags are kept on the record for the officer.
 */
export function checkIntegrity(r: RecordInput): { errors: Record<string, string>; flags: string[] } {
  const errors: Record<string, string> = {};
  const flags: string[] = [];
  if (r.obtained < 0 || r.total <= 0) errors.total = 'Total marks must be greater than zero.';
  if (r.obtained > r.total) errors.obtained = 'Obtained marks cannot be more than total marks.';
  r.subjects.forEach((s, i) => {
    if (s.obtained > s.total)
      errors[`subjects.${i}.obtained`] = `${s.name}: obtained marks cannot be more than total marks.`;
  });
  if (r.subjects.length) {
    const sumObtained = r.subjects.reduce((a, s) => a + s.obtained, 0);
    const sumTotal = r.subjects.reduce((a, s) => a + s.total, 0);
    if (round2(sumObtained) !== round2(r.obtained))
      errors.obtained = `Subject marks add up to ${sumObtained}, not ${r.obtained}.`;
    if (round2(sumTotal) !== round2(r.total))
      errors.total = `Subject totals add up to ${sumTotal}, not ${r.total}.`;
  }
  const standard = standardTotalsFor(r.level, r.year);
  if (standard && !standard.includes(r.total))
    flags.push(`NON_STANDARD_TOTAL: expected ${standard.join(' or ')}`);
  return { errors, flags };
}

function subjectKey(name: string) {
  return name.toUpperCase().replace(/[^A-Z]/g, '');
}

/** MARK-4: compares the entered record with the official row and returns every difference. */
export function compareWithOfficial(
  r: RecordInput,
  o: {
    studentName: string;
    fatherName: string;
    obtained: number;
    total: number;
    subjects: { name?: string | null; obtained?: number | null; total?: number | null }[];
  },
) {
  const diff: { field: string; entered: unknown; official: unknown }[] = [];
  if (nameSimilarity(r.studentName, o.studentName) < NAME_SIMILARITY)
    diff.push({ field: 'studentName', entered: r.studentName, official: o.studentName });
  if (o.fatherName && nameSimilarity(r.fatherName, o.fatherName) < NAME_SIMILARITY)
    diff.push({ field: 'fatherName', entered: r.fatherName, official: o.fatherName });
  if (r.obtained !== o.obtained) diff.push({ field: 'obtained', entered: r.obtained, official: o.obtained });
  if (r.total !== o.total) diff.push({ field: 'total', entered: r.total, official: o.total });
  for (const os of o.subjects ?? []) {
    const es = r.subjects.find((s) => subjectKey(s.name) === subjectKey(os.name ?? ''));
    if (!es) diff.push({ field: `subject:${os.name}`, entered: null, official: os.obtained });
    else if (es.obtained !== os.obtained || es.total !== os.total)
      diff.push({ field: `subject:${os.name}`, entered: es.obtained, official: os.obtained });
  }
  return diff;
}

/** Trust level when no registry match exists: 1 if a result card is attached, else 0. */
const baseTrust = (rec: { resultCardFileId?: unknown }) =>
  rec.resultCardFileId ? TRUST.DOCUMENT : TRUST.DECLARED;

async function raiseRepeatedMismatch(userId: Id) {
  const n = await VerificationModel.countDocuments({ userId, status: 'MISMATCH' });
  if (n >= 3) {
    await FraudFlagModel.updateOne(
      { key: `mismatch:${userId}` },
      {
        $set: { type: 'REPEATED_MISMATCH', details: `${n} mismatches recorded`, status: 'OPEN' },
        $addToSet: { userIds: userId },
      },
      { upsert: true },
    );
  }
}

/** MARK-9: the same roll number claimed by different applicants. */
export async function checkRollNumberClaims(rec: RecordDoc) {
  const others = await RecordModel.find({
    _id: { $ne: rec._id },
    userId: { $ne: rec.userId },
    current: true,
    board: rec.board,
    level: rec.level,
    year: rec.year,
    rollNo: rec.rollNo,
  }).lean();
  if (!others.length) return;
  await FraudFlagModel.updateOne(
    { key: `roll:${rec.board}:${rec.level}:${rec.year}:${rec.rollNo}` },
    {
      $set: {
        type: 'ROLL_NUMBER_CLAIMED_TWICE',
        details: `Roll number ${rec.rollNo} (${rec.board}, ${rec.year}) is claimed by more than one applicant`,
        status: 'OPEN',
      },
      $addToSet: {
        userIds: { $each: [rec.userId, ...others.map((o) => o.userId)] },
        recordIds: { $each: [rec._id, ...others.map((o) => o._id)] },
      },
    },
    { upsert: true },
  );
}

/** MARK-4/MARK-5: automatic registry check. Locked (officer-verified) records are never changed. */
export async function runRegistryCheck(rec: RecordDoc, source: ResultSource = registryResultSource) {
  if (rec.locked) return rec;
  const official = await source.lookup({
    board: rec.board,
    level: rec.level as RecordLevel,
    year: rec.year,
    rollNo: rec.rollNo,
  });
  if (!official) {
    rec.verificationStatus = 'UNDER_VERIFICATION';
    rec.trustLevel = baseTrust(rec);
    rec.set('registryDiff', []);
    await rec.save();
    await VerificationModel.create({
      recordId: rec._id,
      userId: rec.userId,
      method: 'REGISTRY',
      status: 'NOT_FOUND',
    });
    return rec;
  }
  const diff = compareWithOfficial(rec.toObject() as unknown as RecordInput, official);
  if (diff.length === 0) {
    rec.verificationStatus = 'AUTO_VERIFIED';
    rec.trustLevel = TRUST.REGISTRY;
    rec.set('registryDiff', []);
  } else {
    rec.verificationStatus = 'MISMATCH';
    rec.trustLevel = baseTrust(rec);
    rec.set('registryDiff', diff);
  }
  await rec.save();
  await VerificationModel.create({
    recordId: rec._id,
    userId: rec.userId,
    method: 'REGISTRY',
    status: diff.length ? 'MISMATCH' : 'MATCH',
    diff,
    registryRowId: official._id as Id,
  });
  if (diff.length) await raiseRepeatedMismatch(rec.userId);
  return rec;
}

/** Creates or updates a record. Verified or locked records get a new version (MARK-8). */
export async function saveRecord(req: Request, userId: Id, input: RecordInput, existing?: RecordDoc) {
  const { errors, flags } = checkIntegrity(input);
  if (Object.keys(errors).length) throw ApiError.validation('Please correct the marks.', { fields: errors });

  const data = {
    ...input,
    rollNo: input.rollNo.trim().toUpperCase(),
    testName: input.level === 'ENTRY_TEST' ? (input.testName ?? '').trim() : '',
    percentage: round2((input.obtained / input.total) * 100),
    flags,
  };

  const sameLevel = {
    userId,
    level: input.level,
    current: true,
    ...(input.level === 'ENTRY_TEST' ? { testName: data.testName } : {}),
  };
  let rec: RecordDoc;
  if (!existing) {
    if (await RecordModel.exists(sameLevel)) {
      throw ApiError.conflict('You already have a record for this qualification. Edit it instead.', {
        fields: { level: 'Already added.' },
      });
    }
    rec = await RecordModel.create({ ...data, userId });
    await audit(req, 'RECORD_CREATED', 'AcademicRecord', rec._id, { level: input.level });
  } else if (existing.locked || existing.trustLevel >= TRUST.REGISTRY) {
    existing.current = false;
    existing.verificationStatus = 'SUPERSEDED';
    await existing.save();
    rec = await RecordModel.create({
      ...data,
      userId,
      version: existing.version + 1,
      previousVersionId: existing._id,
    });
    await audit(req, 'RECORD_NEW_VERSION', 'AcademicRecord', rec._id, {
      previous: String(existing._id),
      level: input.level,
    });
  } else {
    existing.set({ ...data, verificationStatus: 'DECLARED', registryDiff: [] });
    existing.trustLevel = baseTrust(existing);
    rec = await existing.save();
    await audit(req, 'RECORD_UPDATED', 'AcademicRecord', rec._id, { level: input.level });
  }
  await runRegistryCheck(rec);
  await checkRollNumberClaims(rec);
  return rec;
}

/** MARK-6: attaching a result card raises the trust level to 1 when not registry verified. */
export async function attachResultCard(
  rec: RecordDoc,
  file: { _id: unknown; sha256: string; ownerId: unknown },
) {
  rec.set('resultCardFileId', file._id);
  rec.resultCardHash = file.sha256;
  if (rec.trustLevel < TRUST.DOCUMENT) rec.trustLevel = TRUST.DOCUMENT;
  if (rec.verificationStatus === 'DECLARED') rec.verificationStatus = 'UNDER_VERIFICATION';
  await rec.save();
  // MARK-9: the same result card used by another applicant.
  const reused = await RecordModel.find({ resultCardHash: file.sha256, userId: { $ne: rec.userId } }).lean();
  if (reused.length) {
    await FraudFlagModel.updateOne(
      { key: `hash:${file.sha256}` },
      {
        $set: {
          type: 'RESULT_CARD_REUSED',
          details: 'The same result card file was uploaded by more than one applicant',
          status: 'OPEN',
        },
        $addToSet: {
          userIds: { $each: [rec.userId, ...reused.map((r) => r.userId)] },
          recordIds: { $each: [rec._id, ...reused.map((r) => r._id)] },
        },
      },
      { upsert: true },
    );
  }
  return rec;
}

/** MARK-7: officer decision. VERIFIED locks the record at trust level 3. */
export async function officerDecision(
  req: Request,
  rec: RecordDoc,
  decision: 'VERIFIED' | 'MISMATCH',
  note: string,
) {
  if (!rec.current) throw ApiError.conflict('This is an old version of the record.');
  if (rec.locked) throw ApiError.conflict('This record is already verified and locked.');
  if (decision === 'VERIFIED') {
    rec.verificationStatus = 'VERIFIED';
    rec.trustLevel = TRUST.OFFICER;
    rec.locked = true;
    rec.set('verifiedBy', req.auth!.userId);
    rec.verifiedAt = new Date();
  } else {
    rec.verificationStatus = 'MISMATCH';
    rec.trustLevel = baseTrust(rec);
  }
  await rec.save();
  await VerificationModel.create({
    recordId: rec._id,
    userId: rec.userId,
    institutionId: req.tenant?.institutionId,
    method: 'OFFICER',
    status: decision === 'VERIFIED' ? 'VERIFIED' : 'MISMATCH',
    diff: rec.registryDiff,
    note,
    decidedBy: req.auth!.userId,
  });
  if (decision === 'MISMATCH') await raiseRepeatedMismatch(rec.userId);
  await audit(req, decision === 'VERIFIED' ? 'MARKS_VERIFIED' : 'MARKS_MISMATCH', 'AcademicRecord', rec._id, {
    note,
  });
  return rec;
}
