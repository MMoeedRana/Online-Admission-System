import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { apiRouter } from '../routes';
import { buildSpec, listRoutes } from './openapi';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../package.json') as { version: string };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? files(p)
      : /\.(routes|analytics)\.ts$|platform-analytics\.ts$/.test(f)
        ? [p]
        : [];
  });
}

/** Every exported Express router of the modules, by its variable name. */
export async function collectRouters(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { apiRouter };
  for (const f of files(join(__dirname, '..', 'modules'))) {
    const mod = (await import(f)) as Record<string, unknown>;
    for (const [name, v] of Object.entries(mod))
      if (typeof v === 'function' && Array.isArray((v as { stack?: unknown }).stack)) out[name] = v;
  }
  return out;
}

export function openApiDocument(routers: Record<string, unknown>) {
  return buildSpec(listRoutes(apiRouter, routers), pkg.version);
}
