# ADMITRA — Online Admission System

Final Year Project, Department of Computer Science, Government College University Faisalabad.

ADMITRA is a multi-institution online admission platform: many colleges and universities run their
admissions in private workspaces, while each student keeps one profile and applies everywhere.
The complete requirements are in [`docs/proposal`](../docs/proposal) and the phase plan in
[`docs/PHASES.md`](../docs/PHASES.md).

```
ADMITRA/
├── backend/    Express.js 5 REST API in TypeScript (MongoDB + Mongoose)
└── frontend/   Next.js 16 (App Router) web application in TypeScript + Tailwind CSS
```

## Technology

| Layer    | Technology                                                                 |
| -------- | -------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack React Query 5, Axios, React Hook Form + Zod, Recharts, Lucide icons |
| Backend  | Node.js, Express.js 5, TypeScript, Mongoose 9, Zod, JWT + Argon2id, Helmet, Pino, Nodemailer, Socket.IO, PDFKit, Multer, Papa Parse, ExcelJS |
| Database | MongoDB 8 Community Server (single-node replica set), MongoDB Compass       |
| Testing  | Vitest + Supertest on a real MongoDB replica set                            |

## 1. Prerequisites

- Node.js 22 or newer (Node.js 26 LTS recommended)
- MongoDB 8 Community Server and MongoDB Compass

## 2. Run MongoDB as a replica set

ADMITRA uses MongoDB transactions, which need a replica set. One node is enough.

**Windows (MongoDB installed as a service)**

1. Open `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg` as administrator and add:
   ```yaml
   replication:
     replSetName: rs0
   ```
2. Restart the service: open *Services*, select **MongoDB Server**, click *Restart*.
3. Open MongoDB Compass, connect to `mongodb://127.0.0.1:27017/?directConnection=true`,
   open the shell (**>_ MONGOSH** at the bottom) and run once:
   ```js
   rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })
   ```

**Linux / macOS**

```bash
mongod --replSet rs0 --dbpath ~/mongo-data --bind_ip 127.0.0.1
```

```bash
mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })"
```

After this, connect Compass with `mongodb://127.0.0.1:27017/admitra?replicaSet=rs0` to view the data.

## 3. Backend

```bash
cd ADMITRA/backend
```

```bash
npm install
```

Copy `.env.example` to `.env` (the defaults work for local development), then create the
Super Admin, the subscription plans and the sample institutions:

```bash
npm run seed -- --sample
```

```bash
npm run dev
```

The API runs on <http://localhost:5000/api/v1> (health check: `/api/v1/health`).
In development, e-mails (verification, invitations, password reset) are printed in this terminal
with their links. To receive them in an inbox, set `SMTP_HOST` in `.env` (for example Mailpit on
`127.0.0.1:1025`).

## 4. Frontend

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

Open <http://localhost:3000>. Requests to `/api/v1` are forwarded to the backend.

## 5. Sample accounts (after `npm run seed -- --sample`)

| Role                              | E-mail                          | Password      |
| --------------------------------- | ------------------------------- | ------------- |
| Super Admin                       | admin@admitra.local             | Admin@12345 (from `.env`) |
| Institution Admin (Crescent Valley University) | admin@cvu.example.edu.pk | Admitra@123 |
| Admission Officer                 | officer@cvu.example.edu.pk      | Admitra@123   |
| HOD Officer (Computer Science)    | hod.cs@cvu.example.edu.pk       | Admitra@123   |
| Finance Officer                   | finance@cvu.example.edu.pk      | Admitra@123   |
| Merit Committee                   | merit1@cvu.example.edu.pk       | Admitra@123   |
| Applicant (fee verified, under review) | ayesha.noor@example.com    | Admitra@123   |
| Applicant (application verified)  | bilal.ahmed@example.com         | Admitra@123   |
| Applicant (marks mismatch in document verification) | sara.khan@example.com | Admitra@123 |
| Applicant (proof of payment awaiting verification) | hamza.ali@example.com | Admitra@123 |

The sample institutions are fictional and exist only for development and demonstration.
`npm run seed -- --reset --sample` clears the database and creates the sample data again
(development only; refused in production).

## 6. Scripts

| Folder   | Command             | Purpose                                   |
| -------- | ------------------- | ----------------------------------------- |
| backend  | `npm run dev`       | API with automatic restart                |
| backend  | `npm test`          | API tests (downloads a MongoDB test server the first time) |
| backend  | `npm run build` / `npm start` | Production build and start      |
| backend  | `npm run lint` / `npm run typecheck` | Code checks                |
| frontend | `npm run dev`       | Web application in development mode       |
| frontend | `npm run build` / `npm start` | Production build and start      |
| frontend | `npm run lint` / `npm run typecheck` | Code checks                |

## 7. Development status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Foundation, SaaS core and design system | Complete |
| 2 | Applicant portal, verified marks and admission operations | Complete |
| 3 | Merit, enrollment, Admission Advisor and Result Finder | Planned |
| 4 | Analytics, support, quality and delivery | Planned |

### Phase 1 requirements

AUTH-1 to AUTH-7, INST-1 to INST-5, PROG-1 to PROG-4 and CAMP-1 to CAMP-3 (see Section 3 of
the proposal): registration and login with e-mail verification, rotating refresh tokens,
lockout and password reset; staff invitations and roles; institution onboarding, plans,
limits, grace period and suspension; campuses, faculties, departments, sessions and programs;
admission campaigns with their status rules; the public website; and the responsive design
system with light and dark themes.

### Phase 2 requirements

PROF, MARK-1 to MARK-9 and MARK-13, REG, APP, DOC, FEE, FLOW and NOTIF: the applicant profile
(with data export and account deletion); subject-wise academic records with integrity checks,
versions and trust levels 0-3; the board result registry (CSV/Excel import with preview, error
report and 7-day rollback by the Super Admin, entry-test results by the institution) and automatic
matching; the officer verification panel and fraud flags; document requirements, uploads and
review; the four-step application wizard; fee challans (PDF), proof of payment, verification
and receipts (PDF) with a CSV export; the application workflow with preconditions, deficiency
notices and withdrawal; in-app notifications in real time (Socket.IO) and editable e-mail
templates.

Uploaded files are stored in `backend/storage` (outside the web root) and are only served to the
owner and the staff of the institution. Templates for the registry files are in
[`docs/templates`](../docs/templates).
