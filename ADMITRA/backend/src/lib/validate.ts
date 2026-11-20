import { z, type ZodType } from 'zod';
import { Types } from 'mongoose';
import { ApiError } from './http';

export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw ApiError.validation('Please correct the highlighted fields.', { fields });
  }
  return result.data;
}

export const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');
export const idParams = z.object({ id: objectId });

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .regex(/[A-Z]/, 'Password must contain an upper-case letter.')
  .regex(/[a-z]/, 'Password must contain a lower-case letter.')
  .regex(/[0-9]/, 'Password must contain a digit.');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid e-mail address.').max(160);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+92|0)?3\d{2}-?\d{7}$|^(\+92|0)\d{2,3}-?\d{6,8}$/, 'Enter a valid Pakistani phone number.')
  .or(z.literal(''));
