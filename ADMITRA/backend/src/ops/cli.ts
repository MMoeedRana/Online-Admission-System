import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../lib/db';
import { STORAGE_ROOT } from '../lib/storage';
import { createBackup, KEEP_DAYS, pruneBackups, restoreBackup } from './backup';

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const backupDir = path.resolve(process.env.BACKUP_DIR ?? './backups');
  await connectDatabase(env.MONGODB_URI);
  const db = mongoose.connection.db!;
  try {
    if (cmd === 'backup') {
      const { dir, manifest } = await createBackup(db, { backupDir, storageDir: STORAGE_ROOT });
      if (env.STORAGE_DRIVER !== 'local')
        console.log(
          `  Uploaded files are kept in the ${env.STORAGE_DRIVER.toUpperCase()} bucket "${env.STORAGE_BUCKET}"; turn on its versioning or backups.`,
        );
      const docs = Object.values(manifest.collections).reduce((s, n) => s + n, 0);
      console.log(`Backup written to ${dir}`);
      console.log(
        `  ${Object.keys(manifest.collections).length} collections, ${docs} documents, ${manifest.files} uploaded files`,
      );
      const removed = await pruneBackups(backupDir);
      console.log(`  Kept for ${KEEP_DAYS} days; removed ${removed.length} older backup(s).`);
    } else if (cmd === 'restore') {
      if (!arg) throw new Error('Give the backup folder: npm run restore -- backups/backup-... --yes');
      if (!process.argv.includes('--yes'))
        throw new Error(
          `Restoring replaces every collection of "${db.databaseName}". Run again with --yes to confirm.`,
        );
      const { restored, files } = await restoreBackup(db, {
        dir: path.resolve(arg),
        storageDir: STORAGE_ROOT,
      });
      const docs = Object.values(restored).reduce((s, n) => s + n, 0);
      console.log(
        `Restored ${Object.keys(restored).length} collections (${docs} documents) and ${files} files from ${arg}.`,
      );
    } else {
      throw new Error('Usage: backup | restore <folder> --yes');
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
