import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { isProd } from '../config/env';
import { ApiError } from '../lib/http';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} does not exist.`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let e: ApiError;
  if (err instanceof ApiError) e = err;
  else if ((err as { code?: number })?.code === 11000) {
    const fields = Object.keys((err as { keyValue?: object }).keyValue ?? {});
    e = ApiError.conflict('A record with the same value already exists.', { fields });
  } else if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    e = ApiError.validation('Please correct the highlighted fields.', { fields });
  } else if (err instanceof mongoose.Error.CastError) {
    e = ApiError.notFound();
  } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
    e = ApiError.badRequest('The request body is not valid JSON.');
  } else {
    logger.error({ err, path: req.path }, 'Unhandled error');
    e = new ApiError(
      500,
      'INTERNAL_ERROR',
      isProd ? 'Something went wrong. Please try again.' : String((err as Error)?.message),
    );
  }
  res
    .status(e.status)
    .json({ success: false, error: { code: e.code, message: e.message, details: e.details } });
}
