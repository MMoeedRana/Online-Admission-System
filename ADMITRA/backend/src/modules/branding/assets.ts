import crypto from 'node:crypto';
import type { Response } from 'express';
import { ApiError } from '../../lib/http';
import { fileStore } from '../../lib/file-store';
import { detectMime } from '../../lib/storage';
import type { Id } from '../../lib/types';
import { ASSET_KINDS, PublicAssetModel } from './branding.models';

const RULES: Record<(typeof ASSET_KINDS)[number], { mimes: string[]; maxMB: number; label: string }> = {
  PLATFORM_LOGO: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxMB: 2, label: 'PNG, JPG or WebP' },
  INSTITUTION_LOGO: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxMB: 2, label: 'PNG, JPG or WebP' },
  AVATAR: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxMB: 2, label: 'PNG, JPG or WebP' },
  FAVICON: {
    mimes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
    maxMB: 0.5,
    label: 'PNG or ICO',
  },
};
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

export async function savePublicImage(
  file: Express.Multer.File | undefined,
  kind: (typeof ASSET_KINDS)[number],
  ownerId: Id | null,
) {
  if (!file)
    throw ApiError.validation('Choose an image to upload.', { fields: { file: 'Choose an image.' } });
  const rule = RULES[kind];
  const mime = await detectMime(file.buffer);
  if (!mime || !rule.mimes.includes(mime))
    throw ApiError.validation(`Upload a ${rule.label} image.`, {
      fields: { file: 'Image type not allowed.' },
    });
  if (file.size > rule.maxMB * 1024 * 1024)
    throw ApiError.validation(
      `The image is larger than ${rule.maxMB * 1000 >= 1000 ? `${rule.maxMB} MB` : `${rule.maxMB * 1000} KB`}.`,
      {
        fields: { file: 'Image too large.' },
      },
    );
  const key = crypto.randomBytes(16).toString('hex');
  const storageKey = `public/${key}.${EXT[mime]}`;
  await fileStore().put(storageKey, file.buffer, mime);
  return PublicAssetModel.create({ key, kind, ownerId, storageKey, mimeType: mime, size: file.size });
}

export async function removePublicImage(key?: string | null) {
  if (!key) return;
  const a = await PublicAssetModel.findOneAndDelete({ key });
  if (a) await fileStore().remove(a.storageKey);
}

export async function streamPublicImage(res: Response, key: string) {
  if (!/^[a-f0-9]{32}$/.test(key)) throw ApiError.notFound('Image');
  const a = await PublicAssetModel.findOne({ key }).lean();
  if (!a) throw ApiError.notFound('Image');
  const body = await fileStore().get(a.storageKey);
  if (!body) throw ApiError.notFound('Image');
  res.setHeader('Content-Type', a.mimeType);
  res.setHeader('Content-Length', String(a.size));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  body.pipe(res);
}
