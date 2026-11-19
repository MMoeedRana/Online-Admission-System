import { Router } from 'express';
import { z } from 'zod';
import { DOCUMENT_FORMATS } from '../../constants/applications';
import { DEGREE_LEVELS } from '../../constants/enums';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { idParams, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ApplicantDocumentModel, DocumentTypeModel } from './document.models';

/** DOC-1: document requirements of the institution. */
export const documentTypeRouter = Router();

const body = z.object({
  name: z.string().trim().min(3).max(80),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - or _'),
  description: z.string().trim().max(300).default(''),
  formats: z.array(z.enum(DOCUMENT_FORMATS)).min(1, 'Choose at least one format.'),
  maxSizeMB: z.coerce.number().min(0.1).max(10),
  required: z.boolean(),
  degreeLevels: z.array(z.enum(DEGREE_LEVELS)).default([]),
  active: z.boolean().default(true),
  order: z.coerce.number().int().min(0).max(99).default(0),
});

documentTypeRouter.get('/', requirePermission(PERMISSIONS.STRUCTURE_VIEW), async (req, res) => {
  ok(
    res,
    await DocumentTypeModel.find({ institutionId: req.tenant!.institutionId })
      .sort({ order: 1, name: 1 })
      .lean(),
  );
});

documentTypeRouter.post('/', requirePermission(PERMISSIONS.INSTITUTION_SETTINGS), async (req, res) => {
  const b = parse(body, req.body);
  const t = await DocumentTypeModel.create({ ...b, institutionId: req.tenant!.institutionId });
  await audit(req, 'DOCUMENT_TYPE_CREATED', 'DocumentType', t._id, b);
  created(res, t);
});

documentTypeRouter.patch('/:id', requirePermission(PERMISSIONS.INSTITUTION_SETTINGS), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = parse(body.partial(), req.body);
  const t = await DocumentTypeModel.findOneAndUpdate(
    { _id: id, institutionId: req.tenant!.institutionId },
    b,
    { returnDocument: 'after', runValidators: true },
  );
  if (!t) throw ApiError.notFound('Document type');
  await audit(req, 'DOCUMENT_TYPE_UPDATED', 'DocumentType', id, b);
  ok(res, t);
});

documentTypeRouter.delete('/:id', requirePermission(PERMISSIONS.INSTITUTION_SETTINGS), async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (await ApplicantDocumentModel.exists({ documentTypeId: id })) {
    throw ApiError.conflict(
      'Applicants have uploaded this document. Mark it inactive instead of deleting it.',
    );
  }
  const r = await DocumentTypeModel.deleteOne({ _id: id, institutionId: req.tenant!.institutionId });
  if (!r.deletedCount) throw ApiError.notFound('Document type');
  await audit(req, 'DOCUMENT_TYPE_DELETED', 'DocumentType', id);
  ok(res, { deleted: true });
});
