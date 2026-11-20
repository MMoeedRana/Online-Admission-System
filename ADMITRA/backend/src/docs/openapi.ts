import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Router } from 'express';

/**
 * Builds the OpenAPI 3.1 description of the API from the routers that are really mounted,
 * so the document can never list an endpoint that does not exist (or miss one that does).
 * Summaries come from the JSDoc comment written above each route in the source.
 */

interface Layer {
  rawPath?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] } & ((...a: unknown[]) => unknown);
}

export interface RouteInfo {
  method: string;
  path: string;
  router: string;
  comment: string;
}

const SRC = join(__dirname, '..');

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walkFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Router variable name -> its routes' JSDoc comments, read from the module sources. */
function sourceComments() {
  const out = new Map<string, string>();
  const names = new Map<string, string>();
  for (const file of walkFiles(join(SRC, 'modules'))) {
    const src = readFileSync(file, 'utf8');
    const rx =
      /(?:\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*)?(\w+Router|\bme|\btenant)\.(get|post|put|patch|delete)\(\s*'([^']*)'/g;
    for (const m of src.matchAll(rx)) {
      const comment = (m[1] ?? '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
        .join(' ');
      out.set(`${m[2]}|${m[3]}|${m[4]}`, comment);
    }
    for (const m of src.matchAll(/export const (\w+Router) = Router\(\)/g))
      names.set(m[1]!, relative(SRC, file));
  }
  return { comments: out, files: names };
}

/** Walks the mounted routers and lists every endpoint with its full path. */
export function listRoutes(api: Router, routers: Record<string, unknown>): RouteInfo[] {
  const nameOf = new Map<unknown, string>();
  for (const [name, r] of Object.entries(routers)) nameOf.set(r, name);
  const { comments } = sourceComments();
  const routes: RouteInfo[] = [];
  const walk = (stack: Layer[], prefix: string, routerName: string) => {
    for (const l of stack) {
      if (l.route) {
        for (const method of Object.keys(l.route.methods)) {
          const path = (prefix + l.route.path).replace(/\/+$/, '') || '/';
          routes.push({
            method,
            path,
            router: routerName,
            comment: comments.get(`${routerName}|${method}|${l.route.path}`) ?? '',
          });
        }
      } else if (l.handle?.stack) {
        const name = nameOf.get(l.handle) ?? routerName;
        walk(l.handle.stack, prefix + (l.rawPath && l.rawPath !== '/' ? l.rawPath : ''), name);
      }
    }
  };
  walk((api as unknown as { stack: Layer[] }).stack, '/api/v1', 'apiRouter');
  return routes;
}

const TAGS: [RegExp, string, string][] = [
  [/^\/api\/v1\/health/, 'System', 'Health check'],
  [/^\/api\/v1\/auth/, 'Authentication', 'Sign-up, sign-in, tokens, password reset and invitations'],
  [
    /^\/api\/v1\/public\/(directory|advisor|compare)/,
    'Directory and advisor',
    'Public directory, merit history and Admission Advisor',
  ],
  [
    /^\/api\/v1\/public\/(merit-lists|status|results)/,
    'Public results',
    'Published merit lists and status lookup',
  ],
  [/^\/api\/v1\/public/, 'Public site', 'Programs, institutions, onboarding requests'],
  [/^\/api\/v1\/platform\/support/, 'Support (platform)', 'Support tickets for the Super Admin'],
  [/^\/api\/v1\/platform\/audit-logs/, 'Audit log', 'Audit log'],
  [/^\/api\/v1\/platform\/analytics/, 'Analytics', 'Analytics and reports'],
  [
    /^\/api\/v1\/platform\/(registry|directory)/,
    'Platform data',
    'Board result registry and directory curation',
  ],
  [/^\/api\/v1\/platform/, 'Platform', 'Institutions, plans and subscriptions (Super Admin)'],
  [/^\/api\/v1\/(notifications|files)/, 'Notifications and files', 'In-app notifications and file downloads'],
  [/^\/api\/v1\/me/, 'Applicant portal', 'Profile, records, applications, results and shortlist'],
  [/^\/api\/v1\/(analytics|reports)/, 'Analytics', 'Analytics and reports'],
  [/^\/api\/v1\/support/, 'Support (institution)', 'Support tickets of an institution'],
  [/^\/api\/v1\/audit-logs/, 'Audit log', 'Audit log'],
  [
    /^\/api\/v1\/(merit-formulas|merit-lists|offers)/,
    'Merit and offers',
    'Merit formulas, merit lists, offers and enrollment',
  ],
  [
    /^\/api\/v1\/(applications|verifications|payments|document-types|email-templates|registry)/,
    'Admissions office',
    'Application review, marks verification, payments',
  ],
  [/^\/api\/v1\//, 'Institution workspace', 'Settings, structure, programs, campaigns, staff and directory'],
];

const PUBLIC =
  /^\/api\/v1\/(health|public|auth\/(register|login|refresh|logout|verify-email|resend-verification|forgot-password|reset-password|invitation|accept-invitation))/;
const TENANT =
  /^\/api\/v1\/(institution|staff|structure|programs|campaigns|applications|verifications|payments|document-types|email-templates|registry|merit-formulas|merit-lists|offers|directory|analytics|reports|support|audit-logs)/;

const singular = (w: string) =>
  w.endsWith('ies')
    ? `${w.slice(0, -3)}y`
    : w.endsWith('ses')
      ? w.slice(0, -2)
      : w.endsWith('s') && !w.endsWith('ss')
        ? w.slice(0, -1)
        : w;
const words = (w: string) =>
  w
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Readable summary for a route without a JSDoc comment, e.g. POST /merit-lists/:id/publish -> Publish merit list. */
export function humanize(method: string, path: string) {
  const segs = path.replace('/api/v1/', '').split('/').filter(Boolean);
  const last = segs.at(-1) ?? '';
  const file = last.match(/^(.*?)\.?(csv|pdf)$/);
  if (file) {
    const base = file[1] || segs.filter((x) => !x.startsWith(':')).at(-2) || 'file';
    return `Download ${words(base.startsWith(':') ? segs.filter((x) => !x.startsWith(':')).at(-1)! : base)} (${file[2]!.toUpperCase()})`;
  }
  const endsWithParam = last.startsWith(':');
  const nouns = segs.filter((x) => !x.startsWith(':'));
  const resource = nouns.at(-1) ?? '';
  const parentParam = segs.length >= 2 && segs.at(-2)!.startsWith(':');
  const parent = nouns.at(-2) ?? '';
  if (method === 'get') {
    if (endsWithParam) return `Get ${words(singular(resource))}`;
    if (parentParam) return `Get ${words(singular(parent))} ${words(resource)}`;
    return resource.endsWith('s') && !resource.endsWith('ics')
      ? `List ${words(resource)}`
      : `Get ${words(resource)}`;
  }
  if (method === 'delete') return `Delete ${words(singular(endsWithParam ? resource : resource))}`;
  if (method === 'patch' || method === 'put') return `Update ${words(singular(resource))}`;
  // POST
  if (parentParam) {
    if (resource.endsWith('s') && !resource.endsWith('ss'))
      return `Add ${words(singular(resource))} to ${words(singular(parent))}`;
    return `${cap(words(resource))} ${words(singular(parent))}`;
  }
  if (resource.endsWith('s') && !resource.endsWith('ss') && nouns.length)
    return `Create ${words(singular(resource))}`;
  return cap(words(resource));
}

export function buildSpec(routes: RouteInfo[], version: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const oaPath = r.path.replace(/:(\w+)/g, '{$1}');
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: {
        type: 'string',
        ...(m[1] === 'id' || m[1]!.endsWith('Id') ? { pattern: '^[a-f0-9]{24}$' } : {}),
      },
    }));
    const tag = TAGS.find(([rx]) => rx.test(r.path))!;
    const isPublic = PUBLIC.test(r.path);
    const isTenant = TENANT.test(r.path);
    const file = /\.(csv|pdf)$/.test(r.path) || /\/(pdf|letter\.pdf|receipt\.pdf)$/.test(r.path);
    const op: Record<string, unknown> = {
      tags: [tag[1]],
      operationId: `${r.method}_${r.path.replace('/api/v1/', '').replace(/[^a-zA-Z0-9]+/g, '_')}`,
      summary: r.comment ? r.comment.split(/(?<=\.)\s/)[0]!.slice(0, 120) : humanize(r.method, r.path),
      ...(r.comment ? { description: r.comment } : {}),
      parameters: [
        ...params,
        ...(isTenant
          ? [
              {
                name: 'X-Institution-Id',
                in: 'header',
                required: false,
                description: 'Institution workspace to act in when the user belongs to more than one.',
                schema: { type: 'string' },
              },
            ]
          : []),
        ...(r.method === 'get' && !file && !params.length
          ? [
              {
                name: 'page',
                in: 'query',
                required: false,
                schema: { type: 'integer', minimum: 1, default: 1 },
              },
              {
                name: 'limit',
                in: 'query',
                required: false,
                schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
              },
            ]
          : []),
      ],
      ...(['post', 'put', 'patch'].includes(r.method)
        ? {
            requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' } } } },
          }
        : {}),
      responses: {
        '200': file
          ? {
              description: 'File download',
              content: r.path.endsWith('.csv')
                ? { 'text/csv': { schema: { type: 'string' } } }
                : { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
            }
          : {
              description: 'Success',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } },
            },
        '400': { $ref: '#/components/responses/Error' },
        ...(isPublic
          ? {}
          : {
              '401': { $ref: '#/components/responses/Error' },
              '403': { $ref: '#/components/responses/Error' },
            }),
        '404': { $ref: '#/components/responses/Error' },
        '429': { $ref: '#/components/responses/Error' },
      },
      ...(isPublic ? { security: [] } : {}),
      'x-router': r.router,
    };
    if (!(op.parameters as unknown[]).length) delete op.parameters;
    (paths[oaPath] ??= {})[r.method] = op;
  }
  const tagList = [...new Map(TAGS.map(([, name, d]) => [name, d])).entries()].map(([name, description]) => ({
    name,
    description,
  }));
  return {
    openapi: '3.1.0',
    info: {
      title: 'ADMITRA API',
      version,
      summary: 'Multi-tenant online admission platform with merit prediction and marks verification.',
      description:
        'REST API of ADMITRA. Every response uses the envelope `{ success, data, meta }`; errors use `{ success: false, error: { code, message, details } }`. ' +
        'Send the access token as `Authorization: Bearer <token>`. Lists are paginated with `page` and `limit` (default 20, maximum 100, PERF-2). ' +
        'This document is generated from the mounted routers (`npm run docs:api`).',
    },
    servers: [{ url: '/', description: 'This server' }],
    tags: tagList,
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Envelope: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', const: true },
            data: {},
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                pages: { type: 'integer' },
              },
            },
          },
        },
        Error: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: { type: 'boolean', const: false },
            error: {
              type: 'object',
              properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
            },
          },
        },
      },
      responses: {
        Error: {
          description: 'Error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  };
}
