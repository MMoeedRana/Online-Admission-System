import { z } from 'zod';

/** AUTH-1: the same password rules as the API. */
export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Password must contain an upper-case letter.')
  .regex(/[a-z]/, 'Password must contain a lower-case letter.')
  .regex(/\d/, 'Password must contain a digit.');

export const email = z.string().trim().email('Enter a valid e-mail address.');
export const fullName = z.string().trim().min(3, 'Enter your full name.').max(120);
