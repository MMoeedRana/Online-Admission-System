import type { Request } from 'express';
import type { ClientSession } from 'mongoose';
import { AuditLogModel } from '../modules/audit/audit.model';
import { logger } from './logger';
import type { Id } from './types';

export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId: unknown,
  changes?: unknown,
  opts: { institutionId?: Id | null; session?: ClientSession } = {},
): Promise<void> {
  try {
    await AuditLogModel.create(
      [
        {
          actorId: req.auth?.userId ?? null,
          actorName: req.auth?.name ?? '',
          institutionId: (opts.institutionId ?? req.tenant?.institutionId ?? null) as Id | null,
          action,
          entity,
          entityId: entityId ? String(entityId) : '',
          changes: (changes ?? null) as object | null,
          ip: req.ip ?? '',
        },
      ],
      opts.session ? { session: opts.session } : undefined,
    );
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
}
