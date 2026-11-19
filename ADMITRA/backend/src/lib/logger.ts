import pino from 'pino';
import { isProd, isTest } from '../config/env';

export const logger = pino({
  level: isTest ? 'silent' : isProd ? 'info' : 'debug',
  transport:
    !isProd && !isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
});
