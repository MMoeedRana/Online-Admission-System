import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../lib/http';

export interface AccessPayload {
  sub: string;
  typ: string;
  role: string | null;
  name: string;
}

export function signAccessToken(p: AccessPayload): string {
  return jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`, issuer: 'admitra' });
}

function readToken(req: Request): AccessPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { issuer: 'admitra' }) as AccessPayload;
  } catch {
    throw new ApiError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
  }
}

function setAuth(req: Request, p: AccessPayload) {
  req.auth = { userId: p.sub, accountType: p.typ, platformRole: p.role, name: p.name };
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const p = readToken(req);
  if (!p) throw ApiError.unauthorized();
  setAuth(req, p);
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const p = readToken(req);
    if (p) setAuth(req, p);
  } catch {
    /* public endpoint: ignore invalid tokens */
  }
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.platformRole !== 'SUPER_ADMIN') throw ApiError.forbidden();
  next();
}

export function requireApplicant(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.accountType !== 'APPLICANT') throw ApiError.forbidden('This area is only for applicants.');
  next();
}
