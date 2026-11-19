import { describe, expect, it } from 'vitest';
import { RecordModel } from '../src/modules/records/record.models';
import { RegistryRowModel } from '../src/modules/registry/registry.models';
import { api, applicantAgent, interRecord, registryCsv, superAdminToken } from './helpers';

describe('Board result registry (REG-1 to REG-6, UC-13)', () => {
  it('REG-2: preview reports missing columns and row errors; only valid rows are imported', async () => {
    const root = await superAdminToken();
    const missing = await api()
      .post('/api/v1/platform/registry/preview')
      .set('Authorization', `Bearer ${root}`)
      .attach('file', Buffer.from('board,year\nX,2024'), 'r.csv');
    expect(missing.status).toBe(422);
    const csv = registryCsv([
      { roll: '100001', name: 'Ali Raza', obtained: 900, total: 1200 },
      { roll: '100002', name: 'Bad Row', obtained: 1300, total: 1200 },
      { roll: '100001', name: 'Duplicate', obtained: 800, total: 1200 },
    ]);
    const prev = await api()
      .post('/api/v1/platform/registry/preview')
      .set('Authorization', `Bearer ${root}`)
      .attach('file', csv, 'r.csv');
    expect(prev.body.data.summary).toMatchObject({ rows: 3, valid: 1, errors: 2 });
    const imp = await api()
      .post('/api/v1/platform/registry/import')
      .set('Authorization', `Bearer ${root}`)
      .field('source', 'BISE Faisalabad result gazette 2024')
      .attach('file', csv, 'r.csv');
    expect(imp.status).toBe(201);
    expect(await RegistryRowModel.countDocuments()).toBe(1);
  });

  it('import re-checks waiting records; rollback resets auto-verified records', async () => {
    const root = await superAdminToken();
    const a = await applicantAgent('reg1@example.com');
    const rec = await a.post('/me/records').send(interRecord());
    expect(rec.body.data.verificationStatus).toBe('UNDER_VERIFICATION');
    const csv = registryCsv([{ roll: '523456', name: 'Ayesha Noor', obtained: 974, total: 1200 }]);
    const imp = await api()
      .post('/api/v1/platform/registry/import')
      .set('Authorization', `Bearer ${root}`)
      .field('source', 'BISE Faisalabad gazette 2024')
      .attach('file', csv, 'r.csv');
    expect(imp.body.data.rechecked).toBe(1);
    expect((await RecordModel.findById(rec.body.data._id))!.verificationStatus).toBe('AUTO_VERIFIED');
    const rb = await api()
      .post(`/api/v1/platform/registry/batches/${imp.body.data.batch._id}/rollback`)
      .set('Authorization', `Bearer ${root}`);
    expect(rb.body.data.rechecked).toBe(1);
    const after = await RecordModel.findById(rec.body.data._id);
    expect(after!.verificationStatus).toBe('UNDER_VERIFICATION');
    expect(after!.trustLevel).toBe(0);
  });

  it('REG-4: applicants and staff cannot read registry rows', async () => {
    const a = await applicantAgent('reg2@example.com');
    expect((await a.get('/platform/registry/batches')).status).toBe(403);
  });
});
