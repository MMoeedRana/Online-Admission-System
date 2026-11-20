import crypto from 'node:crypto';
import type { Request } from 'express';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { RECORD_LEVELS, type RecordLevel } from '../../constants/academics';
import { audit } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import type { Id } from '../../lib/types';
import { RecordModel, VerificationModel } from '../records/record.models';
import { runRegistryCheck } from '../records/record.service';
import { RegistryBatchModel, RegistryRowModel } from './registry.models';

export const REQUIRED_COLUMNS = [
  'board',
  'exam_type',
  'year',
  'roll_no',
  'student_name',
  'father_name',
  'obtained',
  'total',
] as const;
export const ROLLBACK_DAYS = 7;

export interface ParsedRow {
  line: number;
  board: string;
  level: RecordLevel;
  year: number;
  rollNo: string;
  studentName: string;
  fatherName: string;
  obtained: number;
  total: number;
  subjects: { name: string; obtained: number; total: number }[];
}

const LEVEL_ALIASES: Record<string, RecordLevel> = {
  MATRIC: 'MATRIC',
  SSC: 'MATRIC',
  INTERMEDIATE: 'INTERMEDIATE',
  INTER: 'INTERMEDIATE',
  HSSC: 'INTERMEDIATE',
  BACHELOR_14: 'BACHELOR_14',
  BACHELOR_16: 'BACHELOR_16',
  MASTER: 'MASTER',
  ENTRY_TEST: 'ENTRY_TEST',
  TEST: 'ENTRY_TEST',
};

const normHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export async function readTable(file: Express.Multer.File): Promise<Record<string, string>[]> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, i) => (headers[i] = normHeader(String(c.value ?? ''))));
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const o: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (c, i) => {
        if (headers[i])
          o[headers[i]!] =
            c.value === null || c.value === undefined
              ? ''
              : String(typeof c.value === 'object' && 'result' in c.value ? c.value.result : c.value);
      });
      rows.push(o);
    });
    return rows;
  }
  if (name.endsWith('.csv')) {
    const parsed = Papa.parse<Record<string, string>>(file.buffer.toString('utf8').replace(/^\uFEFF/, ''), {
      header: true,
      skipEmptyLines: true,
      transformHeader: normHeader,
    });
    return parsed.data;
  }
  throw ApiError.validation('Upload a .csv or .xlsx file.', {
    fields: { file: 'Only CSV or Excel (.xlsx) files.' },
  });
}

export async function parseRegistryFile(
  file: Express.Multer.File | undefined,
  opts: { onlyLevel?: RecordLevel; institutionId?: Id | null },
) {
  if (!file) throw ApiError.validation('Choose a file to import.', { fields: { file: 'Choose a file.' } });
  const table = await readTable(file);
  if (!table.length)
    throw ApiError.validation('The file has no data rows.', { fields: { file: 'Empty file.' } });
  const missing = REQUIRED_COLUMNS.filter((c) => !(c in table[0]!));
  if (missing.length) {
    throw ApiError.validation(`Missing column(s): ${missing.join(', ')}`, {
      fields: { file: `Missing column(s): ${missing.join(', ')}` },
      missing,
    });
  }

  const valid: ParsedRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  table.forEach((raw, i) => {
    const line = i + 2;
    const fail = (message: string) => errors.push({ line, message });
    const level =
      LEVEL_ALIASES[
        String(raw.exam_type ?? '')
          .trim()
          .toUpperCase()
      ];
    const year = Number(raw.year);
    const obtained = Number(raw.obtained);
    const total = Number(raw.total);
    const rollNo = String(raw.roll_no ?? '')
      .trim()
      .toUpperCase();
    const board = String(raw.board ?? '').trim();
    if (!board) return fail('Board is empty.');
    if (!level || !RECORD_LEVELS.includes(level)) return fail(`Unknown exam type "${raw.exam_type}".`);
    if (opts.onlyLevel && level !== opts.onlyLevel)
      return fail(`Only ${opts.onlyLevel} results can be imported here.`);
    if (!Number.isInteger(year) || year < 1980 || year > 2100) return fail('Year is not valid.');
    if (!rollNo) return fail('Roll number is empty.');
    if (!String(raw.student_name ?? '').trim()) return fail('Student name is empty.');
    if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0)
      return fail('Obtained and total marks must be numbers.');
    if (obtained < 0 || obtained > total) return fail('Obtained marks cannot be more than total marks.');
    const subjects: ParsedRow['subjects'] = [];
    for (let s = 1; s <= 15; s++) {
      const name = String(raw[`subject_${s}_name`] ?? '').trim();
      if (!name) continue;
      const so = Number(raw[`subject_${s}_obtained`]);
      const st = Number(raw[`subject_${s}_total`]);
      if (!Number.isFinite(so) || !Number.isFinite(st) || so > st || so < 0)
        return fail(`Subject ${s} (${name}) has invalid marks.`);
      subjects.push({ name, obtained: so, total: st });
    }
    if (subjects.length && subjects.reduce((a, x) => a + x.obtained, 0) !== obtained)
      return fail('Subject marks do not add up to the obtained marks.');
    const key = `${board}|${level}|${year}|${rollNo}`;
    if (seen.has(key)) return fail(`Duplicate roll number ${rollNo} in this file.`);
    seen.add(key);
    valid.push({
      line,
      board,
      level,
      year,
      rollNo,
      studentName: String(raw.student_name).trim(),
      fatherName: String(raw.father_name ?? '').trim(),
      obtained,
      total,
      subjects,
    });
  });

  if (valid.length) {
    const existing = await RegistryRowModel.find({
      institutionId: opts.institutionId ?? null,
      $or: valid.map((r) => ({ board: r.board, level: r.level, year: r.year, rollNo: r.rollNo })),
    })
      .select('board level year rollNo')
      .lean();
    const exists = new Set(existing.map((e) => `${e.board}|${e.level}|${e.year}|${e.rollNo}`));
    for (let i = valid.length - 1; i >= 0; i--) {
      const r = valid[i]!;
      if (exists.has(`${r.board}|${r.level}|${r.year}|${r.rollNo}`)) {
        errors.push({ line: r.line, message: `Roll number ${r.rollNo} is already in the registry.` });
        valid.splice(i, 1);
      }
    }
  }
  errors.sort((a, b) => a.line - b.line);
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  return {
    valid,
    errors,
    hash,
    summary: {
      rows: table.length,
      valid: valid.length,
      errors: errors.length,
      boards: [...new Set(valid.map((r) => r.board))],
      years: [...new Set(valid.map((r) => r.year))].sort(),
      levels: [...new Set(valid.map((r) => r.level))],
    },
  };
}

async function recheckWaiting(rows: { board: string; level: string; year: number; rollNo: string }[]) {
  if (!rows.length) return 0;
  const filter: Record<string, unknown> = {
    current: true,
    locked: false,
    verificationStatus: { $in: ['DECLARED', 'UNDER_VERIFICATION', 'MISMATCH'] },
    $or: rows.map((r) => ({ board: r.board, level: r.level, year: r.year, rollNo: r.rollNo })),
  };
  const waiting = await RecordModel.find(filter);
  for (const rec of waiting) await runRegistryCheck(rec);
  return waiting.length;
}

export async function commitImport(
  req: Request,
  file: Express.Multer.File | undefined,
  source: string,
  opts: { onlyLevel?: RecordLevel; institutionId?: Id | null },
) {
  const parsed = await parseRegistryFile(file, opts);
  if (!parsed.valid.length)
    throw ApiError.validation('There are no valid rows to import.', { report: parsed.errors.slice(0, 200) });
  const batch = await RegistryBatchModel.create({
    institutionId: opts.institutionId ?? null,
    source,
    fileName: file!.originalname,
    fileHash: parsed.hash,
    uploadedBy: req.auth!.userId,
    rowCount: parsed.valid.length,
    errorCount: parsed.errors.length,
    boards: parsed.summary.boards,
    years: parsed.summary.years,
  });
  await RegistryRowModel.insertMany(
    parsed.valid.map(({ line: _line, ...r }) => ({
      ...r,
      batchId: batch._id,
      institutionId: opts.institutionId ?? null,
    })),
    { ordered: false },
  );
  const rechecked = await recheckWaiting(parsed.valid);
  await audit(
    req,
    'REGISTRY_IMPORTED',
    'RegistryImportBatch',
    batch._id,
    { source, rows: parsed.valid.length, errors: parsed.errors.length },
    { institutionId: opts.institutionId ?? null },
  );
  return { batch, summary: parsed.summary, rechecked, errors: parsed.errors.slice(0, 200) };
}

export async function rollbackBatch(req: Request, id: string, institutionId: Id | null) {
  const batch = await RegistryBatchModel.findOne({ _id: id, institutionId });
  if (!batch) throw ApiError.notFound('Import batch');
  if (batch.status !== 'ACTIVE') throw ApiError.conflict('This batch has already been rolled back.');
  if (Date.now() - batch.createdAt!.getTime() > ROLLBACK_DAYS * 864e5)
    throw ApiError.conflict(`Batches can be rolled back only within ${ROLLBACK_DAYS} days.`);
  const rows = await RegistryRowModel.find({ batchId: batch._id }).select('_id').lean();
  const rowIds = rows.map((r) => r._id);
  const matched = await VerificationModel.find({ registryRowId: { $in: rowIds }, status: 'MATCH' }).distinct(
    'recordId',
  );
  await RegistryRowModel.deleteMany({ batchId: batch._id });
  batch.status = 'ROLLED_BACK';
  batch.rolledBackAt = new Date();
  await batch.save();
  const affected = await RecordModel.find({
    _id: { $in: matched },
    current: true,
    locked: false,
    verificationStatus: 'AUTO_VERIFIED',
  });
  for (const rec of affected) await runRegistryCheck(rec);
  await audit(
    req,
    'REGISTRY_ROLLED_BACK',
    'RegistryImportBatch',
    batch._id,
    { rows: rowIds.length, rechecked: affected.length },
    { institutionId },
  );
  return { batch, removed: rowIds.length, rechecked: affected.length };
}
