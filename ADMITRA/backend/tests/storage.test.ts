import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalFileStore, S3FileStore, setFileStore } from '../src/lib/file-store';
import { PDF, PNG, api, applicantAgent, matricRecord, superAdminToken } from './helpers';

class FakeBucket {
  objects = new Map<string, { body: Buffer; type: string }>();
  calls: string[] = [];
  async send(cmd: { constructor: { name: string }; input: Record<string, unknown> }) {
    const { Bucket, Key } = cmd.input as { Bucket: string; Key: string };
    this.calls.push(`${cmd.constructor.name} ${Bucket}/${Key}`);
    if (cmd.constructor.name === 'PutObjectCommand') {
      const { Body, ContentType } = cmd.input as { Body: Buffer; ContentType: string };
      this.objects.set(Key, { body: Body, type: ContentType });
      return {};
    }
    if (cmd.constructor.name === 'GetObjectCommand') {
      const o = this.objects.get(Key);
      if (!o) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: Readable.from(o.body) };
    }
    this.objects.delete(Key);
    return {};
  }
}

const read = async (s: Readable) => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(Buffer.from(c));
  return Buffer.concat(parts);
};

afterEach(() => setFileStore(null));

describe('file storage drivers', () => {
  it('keeps files in a private local folder and refuses keys outside it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admitra-store-'));
    const store = new LocalFileStore(root);
    await store.put('2026/11/a.pdf', PDF, 'application/pdf');
    expect(fs.existsSync(path.join(root, '2026', '11', 'a.pdf'))).toBe(true);
    expect(await read((await store.get('2026\\11\\a.pdf'))!)).toEqual(PDF);
    expect(await store.get('../outside.txt')).toBeNull();
    await expect(store.put('../outside.txt', PDF, 'text/plain')).rejects.toThrow();
    await store.remove('2026/11/a.pdf');
    expect(await store.get('2026/11/a.pdf')).toBeNull();
  });

  it('stores, reads and deletes objects in an S3 or R2 bucket', async () => {
    const bucket = new FakeBucket();
    const store = new S3FileStore('r2', bucket as never, 'admitra-files');
    await store.put('public\\logo.png', PNG, 'image/png');
    expect(bucket.objects.get('public/logo.png')?.type).toBe('image/png');
    expect(await read((await store.get('public/logo.png'))!)).toEqual(PNG);
    expect(await store.get('public/none.png')).toBeNull();
    await store.remove('public/logo.png');
    expect(bucket.calls).toEqual([
      'PutObjectCommand admitra-files/public/logo.png',
      'GetObjectCommand admitra-files/public/logo.png',
      'GetObjectCommand admitra-files/public/none.png',
      'DeleteObjectCommand admitra-files/public/logo.png',
    ]);
  });

  it('serves uploaded documents and public images from the bucket after the usual checks', async () => {
    const bucket = new FakeBucket();
    setFileStore(new S3FileStore('s3', bucket as never, 'admitra-files'));

    const a = await applicantAgent('store1@example.com');
    const r = await a.post('/me/records').send(matricRecord());
    const up = await a.post(`/me/records/${r.body.data._id}/result-card`).attach('file', PDF, 'dmc.pdf');
    expect(up.status).toBe(200);
    expect([...bucket.objects.keys()].some((k) => /^\d{4}\/\d{2}\/[\w-]+\.pdf$/.test(k))).toBe(true);
    const fileId = up.body.data.resultCardFileId as string;
    const own = await a.get(`/files/${fileId}`).buffer(true);
    expect(own.status).toBe(200);
    expect(Buffer.from(own.body)).toEqual(PDF);
    const other = await applicantAgent('store2@example.com');
    expect((await other.get(`/files/${fileId}`)).status).toBe(404);

    const root = await superAdminToken();
    const logo = await api()
      .post('/api/v1/platform/branding/logo')
      .set('Authorization', `Bearer ${root}`)
      .attach('file', PNG, 'logo.png');
    expect(logo.status).toBe(200);
    const img = await api().get(logo.body.data.logoUrl).buffer(true);
    expect(img.status).toBe(200);
    expect(Buffer.from(img.body)).toEqual(PNG);
    await api().delete('/api/v1/platform/branding/logo').set('Authorization', `Bearer ${root}`);
    expect([...bucket.objects.keys()].some((k) => k.startsWith('public/'))).toBe(false);
  });

  it('builds the R2 endpoint from the account id and needs a region for S3', async () => {
    const keys = { STORAGE_BUCKET: 'b', STORAGE_ACCESS_KEY_ID: 'k', STORAGE_SECRET_ACCESS_KEY: 's' };
    vi.resetModules();
    vi.stubEnv('STORAGE_DRIVER', 'r2');
    for (const [k, v] of Object.entries({ ...keys, R2_ACCOUNT_ID: 'acc123' })) vi.stubEnv(k, v);
    const r2 = await import('../src/lib/file-store.js');
    expect(r2.s3Config()).toMatchObject({
      region: 'auto',
      endpoint: 'https://acc123.r2.cloudflarestorage.com',
    });
    vi.resetModules();
    vi.stubEnv('STORAGE_DRIVER', 's3');
    vi.stubEnv('STORAGE_REGION', 'ap-south-1');
    const s3 = await import('../src/lib/file-store.js');
    expect(s3.s3Config()).toMatchObject({ region: 'ap-south-1' });
    expect(s3.s3Config().endpoint).toBeUndefined();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
