# Online Admission System — ADMITRA

Enterprise University & College Admission Management System — Final Year Project,
Department of Computer Science, Government College University Faisalabad.

ADMITRA is a multi-institution online admission platform. Colleges and universities run their
admissions in private workspaces, while each student keeps one profile and one academic record and
applies to any institution.

- **Code:** [`ADMITRA/`](ADMITRA) — `backend` (Express.js + TypeScript + MongoDB) and `frontend`
  (Next.js + TypeScript + Tailwind CSS).
- **Setup and running:** [`ADMITRA/README.md`](ADMITRA/README.md).

## Technology

Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS 4, TanStack React Query 5 + Axios,
Framer Motion, Express 5 (TypeScript), Node.js, MongoDB 8 + Mongoose 9 (MongoDB Compass).
Tests: Vitest, Supertest, Playwright and axe-core.

## Development phases

The project was developed in five phases. Each phase ended with a working, tested product.
Requirement tags (AUTH, MARK, MERIT, …) refer to the system features of the project proposal.

| Phase | Scope | Requirements | Status |
|---|---|---|---|
| 1. Foundation, SaaS core and design system | Project structure (`ADMITRA/frontend`, `ADMITRA/backend`), MongoDB replica set, design system and responsive layouts (light and dark), authentication, roles and permissions, multi-tenancy, audit log, institution onboarding and plans, academic structure, programs, campaigns, public website | AUTH, INST, PROG, CAMP | Complete |
| 2. Applicant portal, verified marks and admission operations | Profile, subject-wise academic records, board result registry and matching, trust levels, officer verification panel, fraud flags, documents, application wizard, fee challans and payments, workflow, notifications and e-mail templates | PROF, MARK-1 to MARK-9 and MARK-13, REG, APP, DOC, FEE, FLOW, NOTIF | Complete |
| 3. Merit, enrollment, Admission Advisor and Result Finder | Merit formulas and merit engine (stable seat allocation), merit lists, offers, enrollment, revocation, reference directory and merit history, Admission Advisor, Result Finder, public merit lists, status lookup | MARK-10 to MARK-12, MERIT, OFFER, DIR, PRED, FIND | Complete |
| 4. Analytics, support, quality and delivery | Analytics and exports, support tickets, OpenAPI documentation, automated tests (API, browser, accessibility, performance), security hardening, production build, backups | RPT, SUP, non-functional requirements | Complete |
| 5. Branding and the Mitra admission copilot | Platform and institution branding, profile pictures, contrast-safe colors; Mitra: switchable AI providers (Gemini, OpenAI, Claude), friendly chat in English and Roman Urdu with live-data tools, actions that run only after confirmation, platform fee records, integrity alerts and daily briefings; file storage on the local disk, Amazon S3 or Cloudflare R2 | BRAND, AGENT | Complete |

### Phase deliverables

1. **Phase 1:** a Super Admin approves an institution; its admin sets up programs and opens a
   campaign that appears on the public website on desktop and mobile.
2. **Phase 2:** an applicant's marks are verified from the imported registry, an application is
   submitted and paid, and an officer moves it to verified; wrong marks are caught and flagged.
3. **Phase 3:** a merit list is generated from verified marks only, approved by a second committee
   member and published; selected applicants accept and are enrolled with an admission letter.
4. **Phase 4:** analytics, reports and support are available, every test passes and the complete
   system runs from a production build.
5. **Phase 5:** the platform and each institution carry their own brand, and Mitra answers admission
   questions from live data, prepares reminders, writes a daily briefing and raises integrity alerts.
   Uploaded files can move from the local disk to Amazon S3 or Cloudflare R2 by changing `.env` only.
