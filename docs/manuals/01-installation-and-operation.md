# ADMITRA – Installation and Operation Manual

For the person who installs, runs and looks after ADMITRA. The folder layout is `ADMITRA/backend`
(Express API) and `ADMITRA/frontend` (Next.js web application).

## 1. Requirements

| Software | Version |
| --- | --- |
| Node.js | 22 or newer (26 LTS recommended) |
| MongoDB Community Server | 8, running as a single-node replica set (transactions need it) |
| MongoDB Compass | any recent version, to look at the data |
| A modern browser | Chrome, Edge, Firefox or Safari |

## 2. First installation

1. **MongoDB as a replica set** – follow Section 2 of `ADMITRA/README.md` (Windows service or
   `mongod --replSet rs0`, then `rs.initiate(...)` once).
2. **Backend**
   ```bash
   cd ADMITRA/backend
   ```
   ```bash
   npm install
   ```
   Copy `.env.example` to `.env`. For a demonstration, load the sample data (this clears the database):
   ```bash
   npm run seed:demo
   ```
   For a clean installation use `npm run seed` instead; it creates only the Super Admin and the plans.
   ```bash
   npm run dev
   ```
3. **Frontend** (second terminal)
   ```bash
   cd ADMITRA/frontend
   ```
   ```bash
   npm install
   ```
   Copy `.env.example` to `.env.local`, then:
   ```bash
   npm run dev
   ```
4. Open <http://localhost:3000> and sign in. The sample accounts are listed in Section 5 of
   `ADMITRA/README.md`; they all use the password `Admitra@123` (the Super Admin uses the password in `.env`).

## 3. Production build

```bash
cd ADMITRA/backend && npm run build && npm start
```

```bash
cd ADMITRA/frontend && npm run build && npm start
```

In production (`NODE_ENV=production`) the API refuses to start when `JWT_ACCESS_SECRET` is weak,
`COOKIE_SECURE` is not `true` or `WEB_URL` does not use `https://` (SEC-8). The seed commands with
sample data are refused in production.

## 4. API documentation

The API is described in OpenAPI 3.1. With the backend running:

- Swagger UI: <http://localhost:5000/api/v1/docs>
- The document itself: <http://localhost:5000/api/v1/openapi.json>

The document is generated from the routers that are actually mounted, so it always lists every
endpoint. After adding or changing a route run `npm run docs:api` in `ADMITRA/backend`; a test fails if
the document is out of date.

## 5. Backups and restore (SAFE-4)

A backup contains every MongoDB collection (one compressed Extended JSON file per collection, so ids and
dates keep their types), a copy of the uploaded files (`backend/storage`) and a `manifest.json` with
the counts. Backups older than 14 days are removed automatically; the newest one is always kept.

```bash
cd ADMITRA/backend && npm run backup
```

The folder is `ADMITRA/backend/backups` unless `BACKUP_DIR` is set. To restore (this replaces every
collection of the configured database, so the command asks for `--yes`):

```bash
npm run restore -- backups/backup-2026-11-20T04-34-11 --yes
```

The restore checks every collection against the counts of the manifest and stops with an error if one differs.

**Daily schedule**

- *Windows*: Task Scheduler → Create Basic Task → Daily, 02:00 → Start a program: `cmd.exe` with the
  arguments `/c cd /d C:\path\to\ADMITRA\backend && npm run backup`.
- *Linux*: `crontab -e` and add `0 2 * * * cd /path/to/ADMITRA/backend && npm run backup >> backups/backup.log 2>&1`.
- On a production server built with `npm run build`, `npm run backup:prod` runs the compiled script.

The restore was practised on the demonstration data: 41 collections, 3,926 documents and 9,804 files
were backed up and restored, and the application worked normally afterwards.

## 6. Tests

| Command (folder) | What it checks |
| --- | --- |
| `npm test` (backend) | 90 API and unit tests with Vitest and Supertest on a real MongoDB replica set (downloaded the first time) |
| `npm run test:perf` (backend) | Performance targets PERF-2 to PERF-10 with 1,500 applicants, 500 programs, 50,000 registry rows and 2,000 My Results requests |
| `npm run test:e2e` (frontend) | Playwright on a phone (Pixel 7) and a desktop: every screen, the main flows, no horizontal scrolling and no serious or critical WCAG 2.2 AA problem (axe-core) |
| `E2E_PROD=1 E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/perf.spec.ts` (frontend) | PERF-1 on the production build with a 4G connection profile |

The browser tests need the backend and frontend running with the demonstration data (`npm run seed:demo`).
On a new computer install the browser once with `npx playwright install chromium`. The HTML report is
written to `frontend/e2e-report` (`npm run test:e2e:report`).

## 7. Day-to-day checks

- Health check: <http://localhost:5000/api/v1/health> shows the database state.
- E-mails: without `SMTP_HOST` they are printed in the backend terminal with their links.
- The audit log (Super Admin → Audit Log) shows every important action with the person, time and IP address.
- Support tickets with an overdue first response are counted on Super Admin → Support Tickets.
