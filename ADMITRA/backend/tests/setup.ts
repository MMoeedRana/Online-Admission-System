import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import '../src/lib/db'; // same Mongoose settings as the server
import { sentMails } from '../src/lib/mailer';

beforeAll(async () => {
  const uri = inject('mongoUri');
  const db = `admitra_test_${Math.random().toString(36).slice(2, 8)}`;
  await mongoose.connect(uri, { dbName: db });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  sentMails.length = 0;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
