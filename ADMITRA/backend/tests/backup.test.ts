import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose, { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createBackup, KEEP_DAYS, pruneBackups, restoreBackup } from '../src/ops/backup';
import { AuditLogModel } from '../src/modules/audit/audit.model';
import { UserModel } from '../src/modules/users/user.model';

describe('backup and restore (SAFE-4)', () => {
  it('backs up the database and uploads, restores them exactly and keeps 14 days of backups', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'admitra-backup-'));
    const storage = path.join(tmp, 'storage');
    await fs.mkdir(path.join(storage, 'documents'), { recursive: true });
    await fs.writeFile(path.join(storage, 'documents', 'a.pdf'), '%PDF-1.4 test');
    const id = new Types.ObjectId();
    const at = new Date('2026-09-01T10:00:00Z');
    await UserModel.create({
      _id: id,
      fullName: 'Backup User',
      email: 'backup@admitra.test',
      passwordHash: 'x',
      accountType: 'APPLICANT',
    });
    await AuditLogModel.create({ action: 'TEST', entity: 'User', entityId: String(id), createdAt: at });
    const db = mongoose.connection.db!;

    const { dir, manifest } = await createBackup(db, {
      backupDir: path.join(tmp, 'backups'),
      storageDir: storage,
    });
    expect(manifest.collections.users).toBe(1);
    expect(manifest.files).toBe(1);

    // Data is lost ...
    await UserModel.deleteMany({});
    await AuditLogModel.deleteMany({});
    await fs.rm(storage, { recursive: true });
    // ... and restored with the same ids, types and files.
    const r = await restoreBackup(db, { dir, storageDir: storage });
    expect(r.restored.users).toBe(1);
    const user = await UserModel.findById(id).lean();
    expect(user?.email).toBe('backup@admitra.test');
    const log = await AuditLogModel.findOne({ action: 'TEST' }).lean();
    expect(log!.createdAt).toBeInstanceOf(Date);
    expect(log!.createdAt.toISOString()).toBe(at.toISOString());
    expect(await fs.readFile(path.join(storage, 'documents', 'a.pdf'), 'utf8')).toBe('%PDF-1.4 test');

    // Retention: backups older than 14 days are removed, newer ones are kept.
    const backups = path.join(tmp, 'backups');
    for (const d of ['2026-08-01T02-00-00', '2026-08-20T02-00-00', '2026-08-30T02-00-00'])
      await fs.mkdir(path.join(backups, `backup-${d}`));
    const removed = await pruneBackups(backups, new Date('2026-09-01T03:00:00Z'));
    expect(KEEP_DAYS).toBe(14);
    expect(removed).toEqual(['backup-2026-08-01T02-00-00']);
    await fs.rm(tmp, { recursive: true, force: true });
  });
});
