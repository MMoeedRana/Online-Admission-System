import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { FileModel, type FILE_PURPOSES } from '../modules/files/file.model';
import { MIME_BY_FORMAT, type DOCUMENT_FORMATS } from '../constants/applications';
import { ApiError } from './http';
import type { Id } from './types';

export const STORAGE_ROOT = path.resolve(env.STORAGE_DIR);

/** Uploads are kept in memory first so their content can be checked before saving (DOC-2). */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

type Format = (typeof DOCUMENT_FORMATS)[number];
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Detects the real type from the file content (magic bytes), never from the file name. */
export async function detectMime(buffer: Buffer): Promise<string | null> {
  const { fileTypeFromBuffer } = await import('file-type');
  const t = await fileTypeFromBuffer(buffer);
  return t?.mime ?? null;
}

export async function saveUpload(
  file: Express.Multer.File | undefined,
  opts: {
    ownerId: Id;
    purpose: (typeof FILE_PURPOSES)[number];
    formats: readonly Format[];
    maxSizeMB: number;
  },
) {
  if (!file) throw ApiError.validation('Choose a file to upload.', { fields: { file: 'Choose a file.' } });
  const allowed = opts.formats.map((f) => MIME_BY_FORMAT[f]);
  const mime = await detectMime(file.buffer);
  if (!mime || !allowed.includes(mime)) {
    throw ApiError.validation(`This file is not a valid ${opts.formats.join(', ')} file.`, {
      fields: { file: 'File type not allowed.' },
    });
  }
  if (file.size > opts.maxSizeMB * 1024 * 1024) {
    throw ApiError.validation(`The file is larger than ${opts.maxSizeMB} MB.`, {
      fields: { file: 'File too large.' },
    });
  }
  const now = new Date();
  const dir = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  const storageKey = path.join(dir, `${crypto.randomUUID()}.${EXT[mime]}`);
  await fs.promises.mkdir(path.join(STORAGE_ROOT, dir), { recursive: true });
  await fs.promises.writeFile(path.join(STORAGE_ROOT, storageKey), file.buffer);
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  return FileModel.create({
    ownerId: opts.ownerId,
    purpose: opts.purpose,
    storageKey,
    originalName: file.originalname.slice(0, 150),
    mimeType: mime,
    size: file.size,
    sha256,
  });
}

/** Streams a stored file to an authorised user (DOC-3). */
export function streamFile(
  res: Response,
  f: { storageKey: string; mimeType: string; originalName?: string | null },
) {
  const full = path.join(STORAGE_ROOT, f.storageKey);
  if (!full.startsWith(STORAGE_ROOT) || !fs.existsSync(full)) throw ApiError.notFound('File');
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${(f.originalName || 'document').replace(/[^\w.\- ]/g, '_')}"`,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(full).pipe(res);
}
