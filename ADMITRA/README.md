# ADMITRA — Online Admission System

Final Year Project, Department of Computer Science, Government College University Faisalabad.

ADMITRA is a multi-institution online admission platform: many colleges and universities run their
admissions in private workspaces, while each student keeps one profile and applies everywhere.
The development phases are described in the [main README](../README.md).

```
ADMITRA/
├── backend/    Express.js 5 REST API in TypeScript (MongoDB + Mongoose)
└── frontend/   Next.js 16 (App Router) web application in TypeScript + Tailwind CSS
```

## Technology

| Layer    | Technology                                                                 |
| -------- | -------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack React Query 5, Axios, React Hook Form + Zod, Recharts, Framer Motion, Lucide icons |
| Backend  | Node.js, Express.js 5, TypeScript, Mongoose 9, Zod, JWT + Argon2id, Helmet, Pino, Nodemailer, Socket.IO, PDFKit, Multer, Papa Parse, ExcelJS |
| Database | MongoDB 8 Community Server (single-node replica set), MongoDB Compass       |
| Testing  | Vitest + Supertest on a real MongoDB replica set; Playwright (phone and desktop) with axe-core for WCAG 2.2 AA |
| API docs | OpenAPI 3.1 generated from the routers, Swagger UI at `/api/v1/docs`           |

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
Super Admin, the plans and the complete sample data (institutions, applicants, merit lists,
directory). This clears the database first and takes about half a minute:

```bash
npm run seed:demo
```

`npm run seed` alone only creates the Super Admin and the plans (for a clean installation); the
dashboards then show zeros until real data is entered.

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

## 5. Mitra, the AI copilot (Phase 5)

Mitra uses the AI provider set in `ADMITRA/backend/.env`. Only these values change when you move to
another provider:

```
AI_PROVIDER=gemini
AI_API_KEY=your-key
AI_MODEL=gemini-2.5-flash
```

| AI_PROVIDER | Key from | Notes |
| ----------- | -------- | ----- |
| `gemini` (default) | Google AI Studio (free tier available) | default model `gemini-2.5-flash` |
| `openai` | platform.openai.com | set `AI_MODEL` to the model you bought |
| `anthropic` | console.anthropic.com (Claude) | set `AI_MODEL`, e.g. `claude-sonnet-5-5` |
| `openai-compatible` | Groq, OpenRouter, a local Ollama… | also set `AI_BASE_URL` |
| `mock` | no key | offline demonstration for development and tests (refused in production) |

Restart the API after changing `.env`. Without a key everything else keeps working; the daily briefings
and integrity alerts are built from the database, and Mitra explains how to connect a provider.
`AI_DAILY_LIMIT` (messages per person and day, default 200) and `AI_BRIEFING_HOUR` (Pakistan time,
default 8) are optional. The free Gemini tier may use requests to improve Google's products, so use a
paid key for real student data.

## 6. File storage (local folder, Amazon S3 or Cloudflare R2)

Uploaded documents (result cards, fee slips, payment proofs), logos, favicons and profile pictures are
kept by a storage driver chosen in `ADMITRA/backend/.env`. The application works the same with every
driver: files are always served through the API after the permission check, so the bucket stays private.

| STORAGE_DRIVER | Where files are kept | What is needed |
| -------------- | -------------------- | -------------- |
| `local` (default) | the private folder `STORAGE_DIR` (default `./storage`) on the server | nothing; back it up with `npm run backup` |
| `s3` | an Amazon S3 bucket | AWS account (a payment card is required), bucket, region, access key |
| `r2` | a Cloudflare R2 bucket (S3-compatible, 10 GB free each month, no download fees) | Cloudflare account (a payment card is required to enable R2), bucket, account id, access key |

The local folder is right for one server with a permanent disk. A bucket is needed when the API runs
on several servers or on a host whose disk is erased on every deploy.

Cloudflare R2:

```
STORAGE_DRIVER=r2
STORAGE_BUCKET=admitra-files
R2_ACCOUNT_ID=your-account-id
STORAGE_ACCESS_KEY_ID=your-access-key-id
STORAGE_SECRET_ACCESS_KEY=your-secret-access-key
```

Amazon S3:

```
STORAGE_DRIVER=s3
STORAGE_BUCKET=admitra-files
STORAGE_REGION=ap-south-1
STORAGE_ACCESS_KEY_ID=your-access-key-id
STORAGE_SECRET_ACCESS_KEY=your-secret-access-key
```

Create the bucket as private (no public access) and give the access key permission to read, write and
delete objects in that bucket only. `STORAGE_ENDPOINT` can point to any other S3-compatible service.
The API refuses to start if a value it needs is missing. Restart the API after changing `.env`; files
uploaded before the change stay in the old place, so choose the driver before going live. With a bucket,
turn on its versioning or backups, because `npm run backup` then saves the database only.

## 7. Sample accounts (after `npm run seed:demo`)

All sample accounts use the password `Admitra@123` (the Super Admin uses the one in `.env`).

| Role | E-mail | What to look at |
| ---- | ------ | --------------- |
| Super Admin | admin@admitra.local | Mitra (chat, briefing, integrity alerts), Branding, institutions, plans, registry import, Reference Directory, Analytics, Support Tickets, Audit Log |
| Institution Admin (Crescent Valley University) | admin@cvu.example.edu.pk | Standard plan: daily Mitra briefing (no chat), own logo; open Fall 2026 campaign, applications, directory data |
| Admission Officer (CVU) | officer@cvu.example.edu.pk | Application review, marks verification |
| HOD Officer, Computer Science (CVU) | hod.cs@cvu.example.edu.pk | Applications of the CS department only |
| Finance Officer (CVU) | finance@cvu.example.edu.pk | Payment verification |
| Merit Committee (CVU) | merit1@cvu.example.edu.pk | Active formulas and a proposed version 2 for BSCS |
| Institution Admin (Riverside Institute of Technology) | admin@rit.example.edu.pk | Enterprise plan: Mitra chat and actions, own teal colors and logo; merit lists, offers and enrollment; Analytics & Reports; Support; Audit Log |
| Admissions and Accounts (RIT) | officer@rit.example.edu.pk | Admission-fee proofs, originals check on the reporting day |
| Merit Committee (RIT) | merit1@rit.example.edu.pk | Generated merit list 3, waiting for the second member |
| Merit Committee (RIT) | merit2@rit.example.edu.pk | Can approve list 3 (four-eyes rule) |
| Applicant | ayesha.noor@example.com | Profile picture; CVU application under review; selected in RIT merit list 2 with an open offer |
| Applicant | zainab.tariq@example.com | Enrolled at RIT: registration number and admission letter |
| Applicant | mahnoor.fatima@example.com | On the RIT waiting list |
| Applicant | danish.iqbal@example.com | Not selected at RIT, with programs suggested by the Admission Advisor |
| Applicant | bilal.ahmed@example.com | CVU application verified |
| Applicant | sara.khan@example.com | Marks mismatch during document verification |
| Applicant | hamza.ali@example.com | Proof of payment waiting for verification |

The sample data covers a complete admission cycle at Riverside Institute of Technology (76
applications, three merit lists, offers, acceptances, admission fees, enrollment, expired and
declined offers and one revocation) and a reference directory of 18 institutions with three
years of closing merit. Every institution, person and figure in it is fictional and exists only
for development and demonstration. The seed command is refused in production.

## 8. Scripts

| Folder   | Command             | Purpose                                   |
| -------- | ------------------- | ----------------------------------------- |
| backend  | `npm run dev`       | API with automatic restart                |
| backend  | `npm test`          | API tests (downloads a MongoDB test server the first time) |
| backend  | `npm run seed:demo` | Clear the database and load the complete sample data |
| backend  | `npm run build` / `npm start` | Production build and start      |
| backend  | `npm run lint` / `npm run typecheck` | Code checks                |
| backend  | `npm run test:perf` | Performance checks PERF-2 to PERF-10      |
| backend  | `npm run docs:api`  | Regenerate the OpenAPI document           |
| backend  | `npm run backup` / `npm run restore -- <folder> --yes` | Backup (kept 14 days) and restore of the database and uploads |
| frontend | `npm run dev`       | Web application in development mode       |
| frontend | `npm run test:e2e`  | Playwright + axe tests on a phone and a desktop (app running with `seed:demo` data) |
| frontend | `npm run build` / `npm start` | Production build and start      |
| frontend | `npm run lint` / `npm run typecheck` | Code checks                |

## 9. Development status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Foundation, SaaS core and design system | Complete |
| 2 | Applicant portal, verified marks and admission operations | Complete |
| 3 | Merit, enrollment, Admission Advisor and Result Finder | Complete |
| 4 | Analytics, support, quality and delivery | Complete |
| 5 | Branding and the Mitra admission copilot | Complete |

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
[`frontend/public/templates`](frontend/public/templates) and can be downloaded from the import screens.

### Phase 3 requirements

MARK-10 to MARK-12, MERIT-1 to MERIT-6, OFFER-1 to OFFER-5, DIR-1 to DIR-8, PRED-1 to PRED-12
and FIND-1 to FIND-8: versioned merit formulas with a test mode; the merit engine (aggregate
with a line-by-line breakdown, tie-breakers and stable seat allocation by deferred acceptance,
using only verified marks); merit lists with four-eyes approval, a publication transaction,
revisions and waiting lists; offers with deadlines and automatic expiry, admission-fee challans,
enrollment with registration numbers and admission letters, the originals check and revocation
with an optional CNIC block; the reference directory with merit history from forms and CSV
imports, verification, claims and a data-gap report, filled automatically when a list is
published; the Admission Advisor (chance from three years of closing merit, Safe / Target /
Reach / Unlikely, explanation, what-if, shortlist with comparison and PDF, indicative standing,
anonymous usage log); My Results, public merit lists with search and PDF, and the status lookup
with a CAPTCHA.

All pages use the full width of the screen with responsive padding and are checked on phones,
tablets, laptops and large monitors; cards, figures and pages are animated with Framer Motion
(the animations follow the system's "reduce motion" setting).

### Phase 4 requirements

RPT-1 to RPT-3, SUP-1 to SUP-3 and Section 5 (performance, safety, security and quality): the
analytics screen of an institution (admission funnel, daily submissions for 14 and 30 days,
applications and applicants per seat, fee totals, document rejection rate, share of verified marks,
cached for at most 30 seconds); CSV and PDF reports of applications, payments and merit lists; platform
analytics with Admission Advisor usage by program and registry match rates; support tickets with
categories, priorities and first-response targets of 2, 8, 24 and 72 hours, the five statuses, threaded
replies that notify the other side, and tickets that only their institution can see; the audit log for
institutions and the platform with filters and CSV export; the OpenAPI 3.1 document with Swagger UI;
backup and restore of the database and uploads with 14-day retention; and the quality work: 90 API
tests, performance checks for PERF-1 to PERF-10, Playwright tests on a phone and a desktop with axe-core
(no serious or critical WCAG 2.2 AA problem on any screen), security review (escaping of user text in
e-mails, CSV formula injection, dependency audit) and a production build. Every clickable element shows
the pointer cursor and every form field has a placeholder.

### Phase 5 requirements

BRAND-1 to BRAND-5 and AGENT-1 to AGENT-8: platform branding
by the Super Admin (name, tagline, assistant name, logo, favicon, primary, sidebar and initials colors,
used in every page, e-mail and PDF), institution branding on plans with custom branding, profile pictures,
and colors that are adjusted automatically to keep WCAG AA contrast; and **Mitra**, the admission copilot:
switchable AI providers (Gemini by default, OpenAI, Claude or any OpenAI-compatible service), a chat for the
Super Admin and for institution admins that answers from live data through permission-checked tools,
actions that run only after Confirm (fee, offer and application reminders, renewal reminders, ticket
replies, alerts), platform fee records on renewal, integrity rules with evidence, daily briefings by
notification and e-mail, and a daily message limit.

Uploaded files can be kept in the local storage folder (default), an Amazon S3 bucket or a Cloudflare R2
bucket, chosen with `STORAGE_DRIVER` in `.env` (Section 6).
