import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;
type Db = mongoose.mongo.Db;

/**
 * SAFE-4: daily backups of the database and the uploaded files, kept for at least 14 days.
 * A backup is a folder `backup-YYYY-MM-DDTHH-mm-ss` with one gzip file per collection
 * (one Extended JSON document per line, so types such as ObjectId and Date survive),
 * a copy of the uploads folder and a manifest with counts used to check the restore.
 */
export const KEEP_DAYS = 14;

export interface Manifest {
  createdAt: string;
  database: string;
  collections: Record<string, number>;
  files: number;
}

async function copyDir(from: string, to: string): Promise<number> {
  let n = 0;
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true }).catch(() => [])) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) n += await copyDir(a, b);
    else if (entry.isFile() && entry.name !== '.gitkeep') {
      await fs.copyFile(a, b);
      n++;
    }
  }
  return n;
}

export async function createBackup(db: Db, opts: { backupDir: string; storageDir: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const name = `backup-${now.toISOString().slice(0, 19).replace(/:/g, '-')}`;
  const dir = path.join(opts.backupDir, name);
  await fs.mkdir(path.join(dir, 'db'), { recursive: true });
  const manifest: Manifest = {
    createdAt: now.toISOString(),
    database: db.databaseName,
    collections: {},
    files: 0,
  };
  for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (c.name.startsWith('system.')) continue;
    let count = 0;
    const gzip = createGzip();
    const out = pipeline(gzip, createWriteStream(path.join(dir, 'db', `${c.name}.jsonl.gz`)));
    for await (const doc of db.collection(c.name).find()) {
      if (!gzip.write(EJSON.stringify(doc, { relaxed: false }) + '\n'))
        await new Promise((r) => gzip.once('drain', r));
      count++;
    }
    gzip.end();
    await out;
    manifest.collections[c.name] = count;
  }
  manifest.files = await copyDir(opts.storageDir, path.join(dir, 'files'));
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

/** Removes backups older than KEEP_DAYS days (never the newest one). */
export async function pruneBackups(backupDir: string, now = new Date(), keepDays = KEEP_DAYS) {
  const names = (await fs.readdir(backupDir).catch(() => [] as string[]))
    .filter((n) => n.startsWith('backup-'))
    .sort();
  const removed: string[] = [];
  for (const n of names.slice(0, -1)) {
    const stamp = n.slice('backup-'.length).replace(/T(\d\d)-(\d\d)-(\d\d)$/, 'T$1:$2:$3Z');
    const at = new Date(stamp);
    if (!Number.isNaN(at.getTime()) && now.getTime() - at.getTime() > keepDays * 24 * 3600_000) {
      await fs.rm(path.join(backupDir, n), { recursive: true, force: true });
      removed.push(n);
    }
  }
  return removed;
}

/** Restores a backup: every collection is replaced by its copy and the uploads folder is restored. */
export async function restoreBackup(db: Db, opts: { dir: string; storageDir: string }) {
  const manifest = JSON.parse(await fs.readFile(path.join(opts.dir, 'manifest.json'), 'utf8')) as Manifest;
  const restored: Record<string, number> = {};
  for (const name of Object.keys(manifest.collections)) {
    const col = db.collection(name);
    await col.deleteMany({});
    const lines = createInterface({
      input: createReadStream(path.join(opts.dir, 'db', `${name}.jsonl.gz`)).pipe(createGunzip()),
    });
    let batch: Record<string, unknown>[] = [];
    let n = 0;
    for await (const line of lines) {
      if (!line.trim()) continue;
      batch.push(EJSON.parse(line, { relaxed: false }) as Record<string, unknown>);
      if (batch.length === 1000) {
        await col.insertMany(batch, { ordered: false });
        n += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await col.insertMany(batch, { ordered: false });
      n += batch.length;
    }
    restored[name] = n;
    if (n !== manifest.collections[name])
      throw new Error(`Restore of ${name}: expected ${manifest.collections[name]}, got ${n}`);
  }
  const files = await copyDir(path.join(opts.dir, 'files'), opts.storageDir);
  return { manifest, restored, files };
}
