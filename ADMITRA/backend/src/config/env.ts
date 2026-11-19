import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/admitra?replicaSet=rs0'),
  JWT_ACCESS_SECRET: z.string().min(16).default('development-only-secret-change-me'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool,
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_SECURE: bool,
  MAIL_FROM: z.string().default('ADMITRA <no-reply@admitra.local>'),
  STORAGE_DIR: z.string().default('./storage'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** SEC-8: refuse to start in production with weak or insecure settings. */
export function assertProductionSafety(): void {
  if (!isProd) return;
  const problems: string[] = [];
  if (env.JWT_ACCESS_SECRET.length < 32 || /change|secret|development/i.test(env.JWT_ACCESS_SECRET)) {
    problems.push('JWT_ACCESS_SECRET must be a random value of at least 32 characters');
  }
  if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true');
  if (!env.WEB_URL.startsWith('https://')) problems.push('WEB_URL must use https');
  if (problems.length) {
    console.error('Refusing to start in production:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}
