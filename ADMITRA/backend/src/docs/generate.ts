/* eslint-disable no-console */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectRouters, openApiDocument } from './routers';

/** `npm run docs:api`: writes src/docs/openapi.json from the mounted routers. */
async function main() {
  const routers = await collectRouters();
  const spec = openApiDocument(routers);
  const out = join(__dirname, 'openapi.json');
  writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');
  const ops = Object.values(spec.paths).reduce((s, p) => s + Object.keys(p).length, 0);
  console.log(`OpenAPI 3.1: ${ops} operations on ${Object.keys(spec.paths).length} paths -> ${out}`);
  process.exit(0);
}
void main();
