import { Router } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '../../lib/http';
import { streamFile } from '../../lib/storage';
import { idParams, parse } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { ApplicationModel } from '../applications/application.model';
import { ApplicantDocumentModel } from '../documents/document.models';
import { PaymentModel } from '../fees/fee.models';
import { RecordModel } from '../records/record.models';
import { MemberModel } from '../staff/member.model';
import { FileModel } from './file.model';

export const fileRouter = Router();
fileRouter.use(authenticate);

fileRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const file = await FileModel.findById(id).lean();
  if (!file) throw ApiError.notFound('File');
  if (String(file.ownerId) === req.auth!.userId) return streamFile(res, file);

  const institutionId = String(req.headers['x-institution-id'] ?? '');
  if (!Types.ObjectId.isValid(institutionId)) throw ApiError.notFound('File');
  const member = await MemberModel.exists({ institutionId, userId: req.auth!.userId, status: 'ACTIVE' });
  if (!member) throw ApiError.notFound('File');

  const linked =
    (await ApplicantDocumentModel.exists({ fileId: file._id, institutionId })) ||
    (await PaymentModel.exists({ proofFileId: file._id, institutionId })) ||
    ((await RecordModel.exists({ resultCardFileId: file._id })) &&
      (await ApplicationModel.exists({
        institutionId,
        applicantId: file.ownerId,
        status: { $ne: 'DRAFT' },
      })));
  if (!linked) throw ApiError.notFound('File');
  await streamFile(res, file);
});
