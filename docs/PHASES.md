# ADMITRA – Development Phases

The full plan is in `docs/proposal/ADMITRA_FYP_Proposal.docx` (Section 6.2). Requirement tags (AUTH-1, MARK-4, …) refer to Section 3 of the proposal.

| Phase | Scope | Requirements | Status |
|---|---|---|---|
| 1. Foundation, SaaS core & design system | Project structure (ADMITRA/frontend, ADMITRA/backend), MongoDB replica set + Compass, design system & responsive layouts (light/dark), auth, RBAC, tenancy, audit log, onboarding & plans, academic structure, programs, campaigns, public website | AUTH, INST, PROG, CAMP | Complete |
| 2. Applicant portal, verified marks & operations | Profile, subject-wise records, board result registry & matching, trust levels, officer panel, fraud flags, documents, application wizard, challans & payments, workflow, notifications & e-mail templates | PROF, MARK-1..9, 13, REG, APP, DOC, FEE, FLOW, NOTIF | Complete |
| 3. Merit, enrollment, advisor & result finder | Merit formulas & engine (stable allocation), merit lists, offers, enrollment, revocation, reference directory & merit history, Admission Advisor, Result Finder, public merit lists, status lookup | MARK-10..12, MERIT, OFFER, DIR, PRED, FIND | Complete |
| 4. Analytics, support, quality & delivery | Analytics & exports, support tickets, OpenAPI docs, tests (Vitest, Supertest, Playwright, axe), hardening, production build, manuals, final report with real screenshots | RPT, SUP, Section 5 | Complete |
| 5. Branding & Mitra AI copilot | Platform and institution branding, profile pictures, contrast-safe colours; Mitra: switchable AI providers, chat with live-data tools, confirm-before-act actions, platform fee records, integrity alerts, daily briefings | BRAND, AGENT (`docs/proposal/Phase5_Addendum.md`) | Complete |

Stack: Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS 4, TanStack React Query 5 + Axios, Express 5 (TypeScript), Node.js 26 LTS, MongoDB 8 + Mongoose 9 (MongoDB Compass).

Folder structure: `ADMITRA/frontend` (Next.js) and `ADMITRA/backend` (Express). No Docker or deployment configuration files.

Phase 4 deliverables: final report (`docs/report`), user manuals (`docs/manuals`), requirement traceability (`docs/TRACEABILITY.md`), screenshots of every screen (`docs/screenshots`), OpenAPI 3.1 (`/api/v1/docs`), and the test suites (`npm test`, `npm run test:perf`, `npm run test:e2e`).
