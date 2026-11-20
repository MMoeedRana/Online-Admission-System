import mongoose from 'mongoose';
import { logger } from './logger';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName) {
    await mongoose.disconnect();
    throw new Error(
      [
        'MongoDB is running as a single server, but ADMITRA needs a replica set for transactions (one node is enough).',
        '  1. In mongod.cfg add:  replication:  replSetName: rs0   and restart the MongoDB service.',
        "  2. In mongosh run once:  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })",
        '  3. In backend/.env use:  MONGODB_URI=mongodb://127.0.0.1:27017/admitra?replicaSet=rs0',
        '  See section 2 of ADMITRA/README.md.',
      ].join('\n'),
    );
  }
  logger.info({ db: mongoose.connection.name, replicaSet: hello.setName }, 'MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

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
