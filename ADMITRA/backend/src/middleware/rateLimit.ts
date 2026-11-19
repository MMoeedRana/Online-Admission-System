import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const message = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' },
};

/** AUTH-4: sign-in attempts are limited per IP address. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
});

/** Public endpoints (directory, programs, onboarding). */
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10000 : 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
});
