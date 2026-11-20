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
  STORAGE_DRIVER: z.enum(['local', 's3', 'r2']).default('local'),
  STORAGE_DIR: z.string().default('./storage'),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_REGION: z.string().optional().default(''),
  STORAGE_ACCESS_KEY_ID: z.string().optional().default(''),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_ENDPOINT: z.string().optional().default(''),
  R2_ACCOUNT_ID: z.string().optional().default(''),
  AI_PROVIDER: z
    .enum(['gemini', 'openai', 'anthropic', 'openai-compatible', 'mock', 'none'])
    .default('gemini'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default(''),
  AI_BASE_URL: z.string().optional().default(''),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).default(200),
  AI_BRIEFING_HOUR: z.coerce.number().int().min(0).max(23).default(8),
});

const parsed = schema
  .superRefine((v, ctx) => {
    if (v.STORAGE_DRIVER === 'local') return;
    const need = (key: keyof typeof v, why: string) => {
      if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: why });
    };
    need('STORAGE_BUCKET', `required when STORAGE_DRIVER=${v.STORAGE_DRIVER}`);
    need('STORAGE_ACCESS_KEY_ID', `required when STORAGE_DRIVER=${v.STORAGE_DRIVER}`);
    need('STORAGE_SECRET_ACCESS_KEY', `required when STORAGE_DRIVER=${v.STORAGE_DRIVER}`);
    if (v.STORAGE_DRIVER === 's3') need('STORAGE_REGION', 'required when STORAGE_DRIVER=s3, e.g. ap-south-1');
    if (v.STORAGE_DRIVER === 'r2' && !v.STORAGE_ENDPOINT)
      need('R2_ACCOUNT_ID', 'required when STORAGE_DRIVER=r2 (or set STORAGE_ENDPOINT)');
  })
  .safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export function assertProductionSafety(): void {
  if (!isProd) return;
  const problems: string[] = [];
  if (env.JWT_ACCESS_SECRET.length < 32 || /change|secret|development/i.test(env.JWT_ACCESS_SECRET)) {
    problems.push('JWT_ACCESS_SECRET must be a random value of at least 32 characters');
  }
  if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true');
  if (!env.WEB_URL.startsWith('https://')) problems.push('WEB_URL must use https');
  if (env.AI_PROVIDER === 'mock') problems.push('AI_PROVIDER=mock is only for development and tests');
  if (problems.length) {
    console.error('Refusing to start in production:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}
