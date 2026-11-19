import mongoose from 'mongoose';
import { logger } from './logger';

// Filters only use fields defined in the schemas. Operator injection (SEC-4) is prevented because every
// request value is parsed by a strict Zod schema into plain strings, numbers or dates before it reaches a query.
mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/** Runs the callback inside a MongoDB transaction (all or nothing). */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
