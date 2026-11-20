import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { env } from '../config/env';

export type StorageDriver = 'local' | 's3' | 'r2';

export interface FileStore {
  readonly driver: StorageDriver;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Readable | null>;
  remove(key: string): Promise<void>;
}

const objectKey = (key: string) => key.replace(/\\/g, '/').replace(/^\/+/, '');

export class LocalFileStore implements FileStore {
  readonly driver = 'local' as const;
  constructor(readonly root: string) {}

  private full(key: string) {
    const full = path.resolve(this.root, objectKey(key));
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer, _contentType?: string) {
    const full = this.full(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, body);
  }

  async get(key: string) {
    let full: string;
    try {
      full = this.full(key);
    } catch {
      return null;
    }
    if (!fs.existsSync(full)) return null;
    return fs.createReadStream(full);
  }

  async remove(key: string) {
    await fs.promises.rm(this.full(key), { force: true });
  }
}

export class S3FileStore implements FileStore {
  constructor(
    readonly driver: 's3' | 'r2',
    private readonly client: Pick<S3Client, 'send'>,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(key) }));
      if (!r.Body) return null;
      return r.Body instanceof Readable ? r.Body : Readable.fromWeb(r.Body as never);
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey(key) }));
  }
}

export function s3Config(): S3ClientConfig {
  const credentials = {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  };
  if (env.STORAGE_DRIVER === 'r2')
    return {
      region: 'auto',
      endpoint: env.STORAGE_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials,
    };
  return {
    region: env.STORAGE_REGION,
    ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT, forcePathStyle: true } : {}),
    credentials,
  };
}

let store: FileStore | null = null;

export function fileStore(): FileStore {
  if (!store)
    store =
      env.STORAGE_DRIVER === 'local'
        ? new LocalFileStore(path.resolve(env.STORAGE_DIR))
        : new S3FileStore(env.STORAGE_DRIVER, new S3Client(s3Config()), env.STORAGE_BUCKET);
  return store;
}

export function setFileStore(next: FileStore | null) {
  store = next;
}
