import { Router } from 'express';
import { z } from 'zod';
import { ApiError, created, ok } from '../../lib/http';
import { shortlistPdf } from '../../lib/pdf';
import type { Id } from '../../lib/types';
import { idParams, objectId, parse } from '../../lib/validate';
import { adviseProgram, savedMarks } from './advisor.service';
import { DirInstitutionModel, DirProgramModel, MeritHistoryModel, ShortlistModel } from './directory.models';

export const shortlistRouter = Router();
const MAX = 30;

async function shortlistWithChances(userId: Id) {
  const items = await ShortlistModel.find({ userId }).sort({ createdAt: -1 }).lean();
  const programs = await DirProgramModel.find({
    _id: { $in: items.map((i) => i.directoryProgramId) },
  }).lean();
  const insts = await DirInstitutionModel.find({
    _id: { $in: programs.map((p) => p.directoryInstitutionId) },
  }).lean();
  const history = await MeritHistoryModel.find({
    directoryProgramId: { $in: programs.map((p) => p._id) },
    status: 'VERIFIED',
  }).lean();
  const marks = await savedMarks(userId);
  const out = [];
  for (const i of items) {
    const p = programs.find((x) => String(x._id) === String(i.directoryProgramId));
    if (!p) continue;
    const inst = insts.find((x) => String(x._id) === String(p.directoryInstitutionId))!;
    const advice =
      marks.matric != null && marks.inter != null
        ? await adviseProgram(
            p,
            inst as never,
            history.filter((h) => String(h.directoryProgramId) === String(p._id)) as never,
            { matric: marks.matric, inter: marks.inter, test: marks.test, fieldGroup: marks.fieldGroup },
          )
        : null;
    out.push({ _id: i._id, note: i.note, savedAt: i.createdAt, program: p, institution: inst, advice });
  }
  return { items: out, basis: marks.basis, hasMarks: marks.matric != null && marks.inter != null };
}

shortlistRouter.get('/', async (req, res) => {
  const r = await shortlistWithChances(req.auth!.userId);
  ok(res, r.items, { basis: r.basis, hasMarks: r.hasMarks });
});

shortlistRouter.post('/', async (req, res) => {
  const b = parse(
    z.object({ directoryProgramId: objectId, note: z.string().trim().max(200).default('') }),
    req.body,
  );
  if (!(await DirProgramModel.exists({ _id: b.directoryProgramId }))) throw ApiError.notFound('Program');
  if ((await ShortlistModel.countDocuments({ userId: req.auth!.userId })) >= MAX)
    throw ApiError.conflict(`A shortlist can hold up to ${MAX} programs.`);
  const doc = await ShortlistModel.findOneAndUpdate(
    { userId: req.auth!.userId, directoryProgramId: b.directoryProgramId },
    { $set: { note: b.note } },
    { upsert: true, returnDocument: 'after' },
  );
  created(res, doc);
});

shortlistRouter.delete('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const r = await ShortlistModel.deleteOne({ _id: id, userId: req.auth!.userId });
  if (!r.deletedCount) throw ApiError.notFound('Shortlist item');
  ok(res, { deleted: true });
});

shortlistRouter.get('/pdf', async (req, res) => {
  const r = await shortlistWithChances(req.auth!.userId);
  shortlistPdf(res, {
    name: req.auth!.name,
    basis: r.basis,
    rows: r.items.map((i) => ({
      program: i.program.title,
      institution: `${i.institution.name}, ${i.institution.city}`,
      fee: i.program.feePerSemester ?? 0,
      lastClosing: i.advice?.lastClosing ?? null,
      aggregate: i.advice?.aggregate ?? null,
      chance: i.advice?.prediction?.chance ?? null,
      band: i.advice?.band ?? '-',
      years: i.advice?.history.map((h) => h.year).join(', ') ?? '',
    })),
  });
});
