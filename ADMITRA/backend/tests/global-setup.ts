import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/** Starts a real single-node MongoDB 8 replica set so that transactions work in tests. */
export default async function setup(project: TestProject) {
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: '8.0.4' },
  });
  project.provide('mongoUri', rs.getUri());
  return async () => {
    await rs.stop();
  };
}
