import { Router } from 'express';
import { z } from 'zod';
import { BOARDS, EXAM_TYPES, RECORD_LEVELS, TRUST } from '../../constants/academics';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { saveUpload, upload } from '../../lib/storage';
import { idParams, parse } from '../../lib/validate';
import { ApplicationModel } from '../applications/application.model';
import { RecordModel, VerificationModel } from './record.models';
import { attachResultCard, saveRecord } from './record.service';

export const recordRouter = Router();

const num = z.coerce.number().finite();
export const recordBody = z
  .object({
    level: z.enum(RECORD_LEVELS),
    board: z.string().trim().min(2, 'Select the board or university.').max(120),
    examType: z.enum(EXAM_TYPES).default('ANNUAL'),
    testName: z.string().trim().max(80).default(''),
    group: z.string().trim().max(60).default(''),
    year: z.coerce
      .number()
      .int()
      .min(1980)
      .max(new Date().getFullYear() + 1),
    rollNo: z.string().trim().min(1, 'Enter the roll number.').max(30),
    registrationNo: z.string().trim().max(40).default(''),
    studentName: z.string().trim().min(3, 'Enter your name as on the result card.').max(120),
    fatherName: z.string().trim().min(3, "Enter your father's name as on the result card.").max(120),
    subjects: z
      .array(
        z.object({ name: z.string().trim().min(1).max(60), obtained: num.min(0), total: num.positive() }),
      )
      .max(15)
      .default([]),
    obtained: num.min(0),
    total: num.positive('Total marks must be greater than zero.'),
  })
  .refine((v) => v.level !== 'ENTRY_TEST' || v.testName.length > 1, {
    message: 'Enter the name of the entry test.',
    path: ['testName'],
  })
  .refine((v) => v.level === 'ENTRY_TEST' || v.subjects.length > 0, {
    message: 'Add your subject-wise marks.',
    path: ['subjects'],
  });

const TRUST_LABEL = ['Declared', 'Document attached', 'Registry verified', 'Officer verified'];

recordRouter.get('/options', (_req, res) =>
  ok(res, { boards: BOARDS, levels: RECORD_LEVELS, examTypes: EXAM_TYPES }),
);

recordRouter.get('/', async (req, res) => {
  const records = await RecordModel.find({ userId: req.auth!.userId, current: true })
    .sort({ level: 1 })
    .lean();
  ok(
    res,
    records.map((r) => ({ ...r, trustLabel: TRUST_LABEL[r.trustLevel] })),
  );
});

recordRouter.post('/', async (req, res) => {
  const body = parse(recordBody, req.body);
  created(res, await saveRecord(req, req.auth!.userId, body));
});

recordRouter.put('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(recordBody, req.body);
  const rec = await RecordModel.findOne({ _id: id, userId: req.auth!.userId, current: true });
  if (!rec) throw ApiError.notFound('Record');
  if (body.level !== rec.level)
    throw ApiError.validation('The qualification of a record cannot be changed.', {
      fields: { level: 'Cannot change.' },
    });
  ok(res, await saveRecord(req, req.auth!.userId, body, rec));
});

recordRouter.delete('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const rec = await RecordModel.findOne({ _id: id, userId: req.auth!.userId, current: true });
  if (!rec) throw ApiError.notFound('Record');
  const used = await ApplicationModel.exists({
    applicantId: req.auth!.userId,
    status: { $nin: ['DRAFT', 'WITHDRAWN'] },
  });
  if (rec.locked || rec.trustLevel >= TRUST.REGISTRY || used) {
    throw ApiError.conflict(
      'Verified records and records used in a submitted application cannot be deleted. Edit the record to create a new version.',
    );
  }
  await rec.deleteOne();
  await audit(req, 'RECORD_DELETED', 'AcademicRecord', id);
  ok(res, { deleted: true });
});

recordRouter.post('/:id/result-card', upload.single('file'), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const rec = await RecordModel.findOne({ _id: id, userId: req.auth!.userId, current: true });
  if (!rec) throw ApiError.notFound('Record');
  if (rec.locked) throw ApiError.conflict('This record is verified and locked.');
  const file = await saveUpload(req.file, {
    ownerId: req.auth!.userId,
    purpose: 'RESULT_CARD',
    formats: ['PDF', 'JPG', 'PNG'],
    maxSizeMB: 2,
  });
  await attachResultCard(rec, file);
  await audit(req, 'RESULT_CARD_UPLOADED', 'AcademicRecord', id, { sha256: file.sha256 });
  ok(res, rec);
});

recordRouter.get('/:id/history', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const rec = await RecordModel.findOne({ _id: id, userId: req.auth!.userId }).lean();
  if (!rec) throw ApiError.notFound('Record');
  const versions = [rec];
  let prev = rec.previousVersionId;
  while (prev) {
    const p = await RecordModel.findOne({ _id: prev, userId: req.auth!.userId }).lean();
    if (!p) break;
    versions.push(p);
    prev = p.previousVersionId;
  }
  const checks = await VerificationModel.find({ recordId: { $in: versions.map((v) => v._id) } })
    .select('-registryRowId -decidedBy')
    .sort({ createdAt: -1 })
    .lean();
  ok(res, { versions, checks });
});
