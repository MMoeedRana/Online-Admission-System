# ADMITRA – Requirements traceability

Every requirement of the proposal (Sections 3 and 5) and of the Phase 5 addendum (`docs/proposal/Phase5_Addendum.md`) with the code that implements it and the automated test that checks it.
Paths are relative to `ADMITRA/` (`backend/` = `backend/src/`, `frontend/` = `frontend/src/`). Backend tests run with `npm test` (Vitest + Supertest on a real MongoDB replica set),
performance checks with `npm run test:perf`, browser tests with `npm run test:e2e` (Playwright on a phone and a desktop, with axe-core WCAG 2.2 AA checks on every screen).

Test results on 20 November 2026 (after Phase 5): backend 103 tests passed, performance 4 tests (8 checks) passed, browser 56 tests passed on phone and desktop, PERF-1 7 pages passed on the production build.

## Authentication and account security (AUTH)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| AUTH-1 | The system shall allow applicants to register with full name, e-mail and a password of at least 8 characters containing an upper-case letter, a lower-case letter and a digit. | `backend/lib/validate.ts`<br>`frontend/features/auth/schemas.ts` | backend/tests/auth.test.ts |
| AUTH-2 | The system shall store passwords only as Argon2id hashes. | `backend/lib/crypto.ts` | backend/tests/auth.test.ts |
| AUTH-3 | The system shall issue access tokens valid for 15 minutes and rotating, single-use refresh tokens; reuse of an old refresh token shall revoke all sessions of that login. | `backend/modules/auth/token.models.ts`<br>`backend/modules/auth/auth.service.ts` | backend/tests/auth.test.ts |
| AUTH-4 | The system shall lock an account for 15 minutes after 5 consecutive failed logins and rate- limit sign-in attempts per IP address. | `backend/middleware/rateLimit.ts` | backend/tests/auth.test.ts |
| AUTH-5 | The system shall send e-mail verification, password reset (30 minutes) and staff invitation (7 days) links that can be used only once. | `backend/modules/platform/platform.service.ts`<br>`backend/modules/auth/token.models.ts`<br>`backend/modules/auth/auth.service.ts` | backend/tests/auth.test.ts |
| AUTH-6 | The system shall redirect each user after login to the dashboard of the user's role. | `frontend/features/auth/auth-context.tsx` | backend/tests/auth.test.ts |
| AUTH-7 | Staff accounts shall be created only through invitation by an institution admin; the first super admin shall be created by a protected seed command. | `backend/modules/platform/platform.service.ts`<br>`backend/modules/auth/auth.service.ts`<br>`backend/seed/seed.ts`<br>`frontend/features/institution/staff.tsx` | backend/tests/requirements.test.ts › self-registration always creates an applicant; staff only come through invitations<br>backend/tests/platform.test.ts › INST-1/INST-2: request -> approve with plan -> admin invitation -> accept |

## Institutions, plans and subscriptions (INST)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| INST-1 | The system shall allow institutions to request onboarding with name, type, city, province and contact details. | `backend/modules/platform/platform.routes.ts`<br>`backend/modules/public/public.routes.ts` | backend/tests/platform.test.ts |
| INST-2 | The super admin shall be able to approve (with a plan), reject (with a reason), suspend and re- activate institutions. | `backend/modules/platform/platform.service.ts`<br>`backend/modules/platform/platform.routes.ts`<br>`frontend/features/platform/institution-detail.tsx` | backend/tests/platform.test.ts |
| INST-3 | The system shall enforce plan limits (campuses, programs, staff, applications per cycle) and plan features (for example multiple campuses, custom branding). | `backend/modules/institutions/limits.ts`<br>`frontend/features/platform/plans.tsx` | backend/tests/platform.test.ts |
| INST-4 | After the subscription end date the workspace shall remain usable for a 7-day grace period and then become read-only without deleting data. | `backend/modules/institutions/institution.model.ts`<br>`backend/middleware/tenant.ts`<br>`frontend/features/institution/subscription-banner.tsx` | backend/tests/platform.test.ts |
| INST-5 | A suspended institution's staff shall lose access immediately and the institution shall disappear from public pages. | `backend/middleware/tenant.ts` | backend/tests/platform.test.ts |

## Academic structure and programs (PROG)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| PROG-1 | The system shall manage campuses (one main campus), faculties, departments (linked to a faculty and campuses) and academic sessions (one current session). | `frontend/features/institution/structure.tsx` | backend/tests/programs-campaigns.test.ts |
| PROG-2 | Each program shall have title, code, degree level (Intermediate, Diploma, Associate, BS, MS, MPhil, PhD), duration, department, campus, shifts with seats, eligibility per qualification (minimum percentage and… | `frontend/features/institution/program-form.tsx` | backend/tests/programs-campaigns.test.ts |
| PROG-3 | Program codes shall be unique within an institution. | `backend/modules/programs/program.model.ts` | backend/tests/programs-campaigns.test.ts |
| PROG-4 | Records that are referenced by other records shall not be deleted; programs shall be archived instead. | `backend/modules/programs/program.routes.ts`<br>`frontend/features/institution/program-form.tsx`<br>`frontend/features/institution/structure.tsx` | backend/tests/programs-campaigns.test.ts |

## Admission campaigns (CAMP)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| CAMP-1 | Campaign status shall follow DRAFT, OPEN, CLOSED, then OPEN again or ARCHIVED; other changes shall be rejected. | `backend/modules/campaigns/campaign.routes.ts`<br>`backend/jobs/campaigns.job.ts`<br>`backend/constants/enums.ts`<br>`frontend/features/institution/campaign-form.tsx` | backend/tests/programs-campaigns.test.ts |
| CAMP-2 | A campaign shall define opening and closing time, programs with optional seat caps, maximum program preferences, duplicate-application policy, late-application policy, fee policy and the minimum marks trust level… | `frontend/features/institution/campaign-form.tsx` | backend/tests/programs-campaigns.test.ts |
| CAMP-3 | Open campaigns shall be visible on the public website and in the directory with their closing dates. | `backend/modules/public/public.routes.ts` | backend/tests/public.test.ts<br>backend/tests/programs-campaigns.test.ts |

## Applicant profile (PROF)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| PROF-1 | The profile shall store full name, father's name, CNIC / B-Form (13 digits, unique across the platform), date of birth, gender, phone, nationality, domicile, guardian and addresses. | `backend/modules/profile/profile.routes.ts`<br>`backend/modules/profile/profile.model.ts`<br>`frontend/features/applicant/profile-form.tsx` | backend/tests/applications.test.ts |
| PROF-2 | Academic records shall support Matric, Intermediate, Bachelor's (14 and 16 years), Master's and named entry tests with board / university, roll number, year, group, subjects, obtained marks and total marks. | `backend/modules/records/record.models.ts`<br>`backend/constants/academics.ts`<br>`frontend/features/applicant/record-modal.tsx` | backend/tests/records.test.ts › one current record per qualification<br>backend/tests/applications.test.ts |
| PROF-3 | Obtained marks shall never exceed total marks; the percentage shall be computed by the system and never typed by the user. | `backend/modules/records/record.service.ts`<br>`frontend/features/applicant/record-modal.tsx` | backend/tests/records.test.ts › MARK-2: the percentage is calculated by the system<br>backend/tests/applications.test.ts |
| PROF-4 | The system shall validate and format the CNIC / B-Form number and reject numbers already used by another account. | `backend/modules/profile/profile.routes.ts`<br>`backend/modules/profile/profile.model.ts` | backend/tests/applications.test.ts |
| PROF-5 | Applicants shall be able to export their data and delete their account while nothing is submitted. | `backend/modules/profile/profile.routes.ts`<br>`frontend/features/applicant/profile-form.tsx`<br>`frontend/features/auth/account-settings.tsx` | backend/tests/applications.test.ts |

## Academic records and marks verification (MARK)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| MARK-1 | The system shall capture academic records subject-wise: board / university, exam type, roll number, registration number (optional), year, group, subjects with obtained and total marks, grand obtained and grand total. | `backend/modules/records/record.models.ts` | backend/tests/records.test.ts |
| MARK-2 | The system shall apply integrity rules: each obtained mark is not above its total; subject marks sum to the grand obtained marks; the grand total equals the standard total configured for the exam type and year… | `backend/modules/records/record.service.ts`<br>`backend/seed/phase3.ts`<br>`backend/constants/academics.ts`<br>`frontend/features/staff/verification-panel.tsx` | backend/tests/records.test.ts |
| MARK-3 | Every academic record shall have a trust level: 0 Declared, 1 Document attached, 2 Registry verified, 3 Officer verified; the level shall be shown as a badge to the applicant and staff. | `backend/modules/records/record.models.ts`<br>`backend/constants/academics.ts`<br>`frontend/components/ui/badge.tsx` | backend/tests/records.test.ts |
| MARK-4 | On save the system shall look up the registry by board, exam type, year and roll number and compare student name (similarity of at least 90%), father's name, grand marks and subject marks. | `backend/modules/records/record.service.ts`<br>`backend/modules/analytics/platform-analytics.ts`<br>`backend/constants/academics.ts`<br>`backend/lib/similarity.ts` | backend/tests/records.test.ts |
| MARK-5 | The outcome of the registry check shall be MATCH (auto-verified), NOT_FOUND (under verification) or MISMATCH (flagged); the differing fields shall be stored. | `backend/modules/records/record.service.ts` | backend/tests/records.test.ts |
| MARK-6 | A result card (DMC) shall be uploaded for every record that was not auto-verified before an application using it can be submitted; the SHA-256 hash of the file shall be stored. | `backend/modules/records/record.service.ts`<br>`backend/modules/records/record.routes.ts`<br>`backend/modules/applications/application.service.ts` | backend/tests/records.test.ts |
| MARK-7 | Officers shall have a verification panel showing entered marks, the result card and the registry row side by side, and shall decide VERIFIED or MISMATCH with a written note; MISMATCH shall generate a deficiency notice. | `backend/modules/records/record.models.ts`<br>`backend/modules/records/record.service.ts`<br>`backend/modules/records/verification.routes.ts`<br>`frontend/features/staff/verification-panel.tsx` | backend/tests/records.test.ts |
| MARK-8 | Verified records shall be locked; an edit shall create a new version that returns to level 0 and must be verified again; all versions shall be kept. | `backend/modules/records/record.models.ts`<br>`backend/modules/records/record.service.ts`<br>`backend/modules/records/record.routes.ts`<br>`frontend/features/applicant/records.tsx` | backend/tests/records.test.ts |
| MARK-9 | The system shall raise fraud flags when the same roll number is claimed by different CNICs, the same file hash is used by different applicants, or repeated mismatches occur; flags shall be visible only to staff. | `backend/modules/records/record.service.ts`<br>`backend/modules/records/record.models.ts`<br>`frontend/features/staff/verification-panel.tsx` | backend/tests/records.test.ts |
| MARK-10 | The merit engine shall use only records at or above the campaign's minimum trust level (default level 2); applications with lower-level records shall be listed as excluded with the reason "marks not verified". | `backend/modules/merit/merit.service.ts`<br>`backend/lib/merit.ts`<br>`backend/seed/phase3.ts`<br>`frontend/features/institution/campaign-form.tsx` | backend/tests/merit.test.ts<br>backend/tests/merit-engine.test.ts |
| MARK-11 | If false marks are confirmed, the application shall be rejected; if an offer or enrollment already exists, the admission shall be REVOKED with a written reason, the seat released to the next list and the CNIC… | `backend/modules/merit/offer.routes.ts`<br>`backend/modules/merit/offer.service.ts`<br>`backend/modules/merit/merit.models.ts`<br>`backend/modules/merit/merit.service.ts` | backend/tests/merit.test.ts |
| MARK-12 | Institutions shall be able to require physical verification of original documents on the reporting day; enrollment shall then complete only after the officer sets the originals-verified flag. | `backend/modules/merit/offer.service.ts`<br>`backend/modules/institutions/institution.model.ts`<br>`backend/modules/merit/offer.routes.ts`<br>`backend/modules/merit/merit.models.ts` | backend/tests/merit.test.ts |
| MARK-13 | Every verification decision, edit and revocation shall be written to the audit trail with actor, time and IP address. | `backend/modules/records/record.models.ts`<br>`backend/lib/audit.ts` | backend/tests/requirements.test.ts › records the officer, time, IP address and the decision |

## Board result registry (REG)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| REG-1 | The super admin shall be able to import result data from CSV or Excel files with the columns board, exam type, year, roll number, student name, father's name, obtained marks, total marks and subject marks. | `backend/modules/registry/registry.models.ts`<br>`backend/modules/registry/registry.routes.ts`<br>`backend/seed/demo.ts`<br>`frontend/features/registry/registry-import.tsx` | backend/tests/registry.test.ts |
| REG-2 | Before committing an import the system shall validate required columns, duplicates and marks rules and show a row-level error report; only valid rows can be committed. | `backend/modules/registry/registry.service.ts`<br>`frontend/features/registry/registry-import.tsx` | backend/tests/registry.test.ts |
| REG-3 | Each import shall be stored as a batch (source description, uploader, file hash, row count, date) and a batch shall be reversible within 7 days. | `backend/modules/registry/registry.models.ts`<br>`backend/modules/registry/registry.service.ts`<br>`frontend/features/registry/registry-import.tsx` | backend/tests/registry.test.ts |
| REG-4 | Registry rows shall never be listed or searched by applicants or institution staff; they shall be readable only by the matching service. | `backend/modules/registry/registry.models.ts` | backend/tests/registry.test.ts |
| REG-5 | Institutions shall be able to import their own entry-test results as a private registry visible only to that institution. | `backend/modules/registry/result-source.ts`<br>`backend/modules/registry/registry.routes.ts`<br>`backend/seed/phase3.ts`<br>`frontend/features/institution/settings.tsx` | backend/tests/registry.test.ts |
| REG-6 | The matching service shall use an adapter interface so that an official board API can replace file import in the future without changing the rest of the system. | `backend/modules/registry/result-source.ts` | backend/tests/registry.test.ts |

## Applications (APP)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| APP-1 | The system shall show, before applying, whether the applicant meets each program's requirements and why. | `backend/modules/applications/application.service.ts`<br>`frontend/features/applicant/applications-list.tsx` | backend/tests/applications.test.ts |
| APP-2 | An applicant shall not have more than one active application in a campaign unless the campaign allows it. | `backend/modules/applications/applicant.routes.ts`<br>`backend/constants/applications.ts`<br>`frontend/features/applicant/apply-start.tsx` | backend/tests/applications.test.ts |
| APP-3 | Submission shall be refused, listing every missing item, until the profile, results, required documents and eligibility for every chosen program are complete. | `backend/modules/applications/application.service.ts`<br>`frontend/features/applicant/wizard.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (TC-21: missing items are listed and submission is refused)<br>backend/tests/applications.test.ts › APP-1: shows why a program is not eligible and refuses submission |
| APP-4 | On submission the system shall assign a unique application number (for example CVU-F26- MAIN-00001), store a snapshot of the profile and results, and issue the fee challan in one transaction. | `backend/modules/applications/application.model.ts`<br>`backend/modules/applications/application.service.ts`<br>`frontend/features/applicant/application-view.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (application number, snapshot and challan on submission) |
| APP-5 | After submission the applicant shall not change programs, details or documents unless asked to correct documents. | `backend/modules/applications/applicant.routes.ts`<br>`backend/modules/profile/profile.routes.ts`<br>`frontend/features/applicant/wizard.tsx` | backend/tests/applications.test.ts |
| APP-6 | Applicants shall be able to withdraw a draft or submitted application before an offer is issued. | `frontend/features/applicant/application-view.tsx`<br>`frontend/features/staff/applications.tsx`<br>`frontend/features/staff/application-review.tsx` | backend/tests/applications.test.ts › withdrawal cancels the challan |

## Documents (DOC)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| DOC-1 | Institutions shall define document types with accepted formats (PDF, JPG, PNG), maximum size, required or optional and applicable degree levels. | `backend/modules/applications/application.service.ts`<br>`backend/modules/documents/document.models.ts`<br>`backend/modules/documents/document-type.routes.ts`<br>`frontend/features/staff/document-requirements.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (required document types CNIC and PHOTO)<br>frontend/e2e/workspaces.spec.ts › every admin screen (Document Requirements) |
| DOC-2 | The system shall identify files by their content (not by file name) and reject files that do not match the accepted formats. | `backend/modules/applications/applicant.routes.ts`<br>`backend/lib/storage.ts` | backend/tests/helpers.ts |
| DOC-3 | Documents shall never be reachable through public URLs; they shall be streamed only to the owner or authorized staff. | `backend/modules/files/file.routes.ts`<br>`backend/modules/files/file.model.ts`<br>`backend/lib/storage.ts`<br>`frontend/lib/files.ts` | backend/tests/applications.test.ts › files are private: another applicant cannot download them |
| DOC-4 | Every upload version and every decision (with reviewer and time) shall be kept in a review trail. | `backend/modules/applications/staff.routes.ts`<br>`backend/modules/documents/document.models.ts`<br>`frontend/features/staff/application-review.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (review trail with reviewer and time) |

## Fees and payments (FEE)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| FEE-1 | The fee shall follow the campaign policy (highest program fee or sum of program fees). | `backend/modules/applications/application.service.ts`<br>`frontend/features/applicant/payment.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (challan amount follows the HIGHEST policy) |
| FEE-2 | The challan shall be a three-copy PDF (bank, institution, applicant) with the amount in words; proof of payment shall include method, transaction or slip reference, amount, date and an image or PDF, and the amount… | `backend/modules/applications/applicant.routes.ts`<br>`backend/modules/fees/fee.models.ts`<br>`backend/lib/words.ts`<br>`backend/lib/pdf.ts` | backend/tests/templates-pdf.test.ts |
| FEE-3 | The same transaction reference shall not be accepted twice within an institution. | `backend/modules/applications/applicant.routes.ts`<br>`backend/modules/fees/fee.models.ts`<br>`frontend/lib/constants.ts`<br>`frontend/features/applicant/payment.tsx` | backend/tests/requirements.test.ts › never stores the same transaction reference twice within an institution |
| FEE-4 | A payment shall be counted only after a finance officer verifies it; each payment can be decided only once. | `backend/modules/fees/payment.routes.ts`<br>`backend/modules/fees/fee.models.ts`<br>`backend/modules/applications/applicant.routes.ts`<br>`frontend/features/applicant/payment.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (TC-25: verified once, receipt issued) |
| FEE-5 | The system shall provide receipts (PDF) and a payments CSV for reconciliation. | `backend/modules/fees/payment.routes.ts`<br>`backend/modules/applications/applicant.routes.ts`<br>`backend/lib/pdf.ts`<br>`frontend/features/staff/payments.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (receipt number)<br>backend/tests/phase4.test.ts › exports applications, payments and merit lists as CSV and PDF |

## Application workflow (FLOW)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| FLOW-1 | Applications shall move through DRAFT, SUBMITTED, PAYMENT_PENDING, UNDER_REVIEW, DOCUMENT_VERIFICATION, DEFICIENT, ELIGIBILITY_CHECK, VERIFIED or REJECTED, and later OFFER_ISSUED, WAITLISTED, NOT_SELECTED,… | `backend/constants/applications.ts`<br>`frontend/components/ui/badge.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (status history)<br>backend/tests/merit.test.ts › runs the whole cycle |
| FLOW-2 | Each transition shall be checked against the transition table, the actor, the actor's permission and its preconditions; rejection and deficiency require a written note. | `backend/modules/applications/application.service.ts`<br>`backend/constants/applications.ts`<br>`frontend/features/staff/application-review.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (refused transitions return 409)<br>backend/tests/applications.test.ts › FLOW-4: deficiency needs a note |
| FLOW-3 | Document verification can start only after the fee is verified; documents can be marked verified only when every required document is approved. | `backend/modules/applications/staff.routes.ts`<br>`backend/modules/applications/application.service.ts`<br>`frontend/features/staff/application-review.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (TC-26: no document verification before the fee is verified) |
| FLOW-4 | An application can become VERIFIED only when all academic records it depends on are at or above the minimum trust level. | `backend/modules/applications/application.service.ts`<br>`frontend/features/staff/application-review.tsx` | backend/tests/applications.test.ts |
| FLOW-5 | Institutions shall be able to choose whether eligibility is a separate review step; every change shall be recorded in the application history and internal notes shall not be visible to applicants. | `backend/modules/applications/application.model.ts`<br>`backend/modules/applications/application.service.ts`<br>`frontend/features/applicant/application-view.tsx` | backend/tests/applications.test.ts |

## Notifications (NOTIF)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| NOTIF-1 | The system shall store notifications, push them live and show unread counts. | `backend/modules/notifications/notification.models.ts`<br>`backend/modules/notifications/notify.ts`<br>`backend/lib/socket.ts`<br>`frontend/components/layout/notification-bell.tsx` | backend/tests/applications.test.ts › UC-05 to UC-07 (notification stored)<br>backend/tests/merit.test.ts › runs the whole cycle (OFFER_ISSUED notifications) |
| NOTIF-2 | E-mails shall be sent for submission, deficiency notices, marks verification results, payment decisions, verification, offers, waiting list, merit results and enrollment. | `backend/modules/notifications/templates.ts`<br>`backend/modules/notifications/notify.ts` | backend/tests/applications.test.ts › UC-05 to UC-07 (submission e-mail)<br>backend/tests/phase4.test.ts › opens a ticket … notifies the platform team |
| NOTIF-3 | Institutions shall be able to customize subject and body of these e-mails using variables such as {{applicantName}} and {{programName}}. | `backend/modules/notifications/templates.ts`<br>`backend/modules/notifications/notification.models.ts`<br>`backend/modules/notifications/notify.ts`<br>`backend/modules/notifications/notification.routes.ts` | backend/tests/templates-pdf.test.ts |

## Merit formulas and engine (MERIT)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| MERIT-1 | A formula shall consist of components (Matric, Intermediate, Bachelor's, Master's or a named entry test), each with a weight, optional minimum percentage and required flag; weights shall total 100. | `backend/lib/merit.ts`<br>`backend/modules/merit/formula.routes.ts`<br>`backend/modules/merit/merit.models.ts`<br>`backend/modules/merit/merit.service.ts` | backend/tests/merit.test.ts<br>backend/tests/merit-engine.test.ts |
| MERIT-2 | Formulas shall be versioned: active versions are locked and edits create a new version; each merit list shall record the versions it used. | `backend/modules/merit/formula.routes.ts`<br>`backend/modules/merit/merit.models.ts`<br>`backend/modules/merit/merit.service.ts`<br>`frontend/features/merit/formulas.tsx` | backend/tests/merit.test.ts |
| MERIT-3 | The aggregate shall be the sum of (percentage x weight / 100) with a line-by-line breakdown visible to staff and to the applicant. | `backend/modules/merit/merit.service.ts`<br>`backend/lib/merit.ts` | backend/tests/merit-engine.test.ts |
| MERIT-4 | Ties shall be broken by the configured tie-breakers in order (for example higher entry test, higher Intermediate, younger applicant) and finally by application number. | `backend/modules/merit/merit.service.ts`<br>`backend/lib/merit.ts`<br>`frontend/features/merit/formulas.tsx` | backend/tests/merit-engine.test.ts |
| MERIT-5 | Seats shall be allocated by applicant-proposing deferred acceptance (stable matching) across program and shift pools, so that every applicant receives the highest preference that merit earns and no seat exceeds… | `backend/modules/merit/merit.service.ts`<br>`backend/lib/merit.ts` | backend/tests/merit-engine.test.ts |
| MERIT-6 | Only applications whose marks satisfy MARK-10 shall enter the ranking; excluded applications and reasons shall be shown to the committee. | `backend/modules/merit/merit.service.ts`<br>`frontend/features/merit/merit-list-detail.tsx` | backend/tests/merit.test.ts |

## Merit lists, offers and enrollment (OFFER)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| OFFER-1 | The member who generated a list shall not be able to approve it (four-eyes rule). | `backend/modules/merit/merit.models.ts`<br>`backend/modules/merit/merit.service.ts`<br>`backend/seed/phase3.ts`<br>`frontend/features/merit/merit-list-detail.tsx` | backend/tests/merit.test.ts |
| OFFER-2 | Published lists shall never be edited; corrections shall be new revisions that supersede the old list and are allowed only before any offer has been accepted. | `backend/modules/merit/merit.models.ts`<br>`backend/modules/merit/merit.service.ts`<br>`frontend/features/merit/merit-list-detail.tsx` | backend/tests/merit.test.ts |
| OFFER-3 | Offers shall expire automatically after the deadline unless payment proof is awaiting verification; declined and expired seats shall be offered in the next list. | `backend/modules/merit/offer.service.ts`<br>`backend/modules/merit/merit.models.ts` | backend/tests/merit.test.ts |
| OFFER-4 | Enrollment shall generate a unique registration number (for example CVU-F26-BSCS- 001) and an admission letter PDF. | `backend/modules/merit/offer.service.ts`<br>`backend/modules/merit/merit.models.ts`<br>`backend/lib/pdf.ts` | backend/tests/merit.test.ts |
| OFFER-5 | Published merit lists shall be public with shortened names; CNICs shall never be published. | `backend/lib/pdf.ts`<br>`backend/modules/results/public-results.routes.ts`<br>`backend/modules/analytics/analytics.routes.ts`<br>`backend/lib/merit.ts` | backend/tests/merit-engine.test.ts |

## Reference directory and merit history (DIR)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| DIR-1 | The directory shall store institutions (name, type, sector, city, province, website, campuses) and programs (title, degree level, field group, duration, fee, shifts, seats, eligibility, merit formula weights and… | `backend/modules/directory/directory.models.ts`<br>`backend/modules/directory/directory-admin.routes.ts`<br>`frontend/features/directory/institution-detail.tsx`<br>`frontend/features/directory/platform-directory.tsx` | backend/tests/directory.test.ts |
| DIR-2 | For every program the directory shall store merit history per year, round, shift and quota: opening merit, closing merit, number of seats, source URL or document reference and entered-by. | `backend/modules/directory/directory-admin.routes.ts`<br>`backend/modules/directory/directory.models.ts`<br>`frontend/features/directory/program-detail.tsx`<br>`frontend/features/directory/history-form.tsx` | backend/tests/directory.test.ts |
| DIR-3 | Data shall be entered through forms and through CSV import of published merit lists; a source reference is mandatory. | `backend/modules/directory/directory-admin.routes.ts`<br>`backend/modules/directory/directory.models.ts`<br>`frontend/features/directory/history-import.tsx`<br>`frontend/features/directory/platform-directory.tsx` | backend/tests/directory.test.ts |
| DIR-4 | Entered records shall stay in DRAFT until the super admin verifies them; only VERIFIED history shall be used by the predictor and shown as verified. | `backend/modules/directory/directory-admin.routes.ts`<br>`backend/modules/directory/advisor.service.ts`<br>`backend/modules/directory/directory.models.ts`<br>`frontend/features/directory/platform-directory.tsx` | backend/tests/directory.test.ts |
| DIR-5 | For institutions on ADMITRA, merit history shall be created automatically when a merit list is published (closing aggregate per program and shift) and marked "Official (ADMITRA)". | `backend/modules/directory/directory.service.ts`<br>`backend/modules/directory/directory.models.ts`<br>`backend/modules/directory/directory-admin.routes.ts`<br>`backend/seed/phase3.ts` | backend/tests/merit.test.ts<br>backend/tests/directory.test.ts |
| DIR-6 | The public directory shall provide search, filters (province, city, sector, degree, field group, fee, deadline) and comparison of up to four programs. | `backend/modules/directory/public-directory.routes.ts`<br>`backend/modules/directory/directory-admin.routes.ts`<br>`frontend/features/directory/platform-directory.tsx`<br>`frontend/features/directory/directory-page.tsx` | backend/tests/directory.test.ts |
| DIR-7 | Every directory page shall show the data year, the source link and a notice that figures are indicative; institutions shall be able to claim and correct their profile. | `backend/modules/directory/directory-admin.routes.ts`<br>`backend/modules/directory/directory.models.ts`<br>`backend/modules/directory/public-directory.routes.ts`<br>`backend/seed/phase3.ts` | backend/tests/directory.test.ts |
| DIR-8 | The super admin dashboard shall list programs without current-year data so that the directory can be refreshed every admission season. | `backend/modules/directory/directory-admin.routes.ts`<br>`frontend/features/directory/platform-directory.tsx` | backend/tests/directory.test.ts |

## Admission Advisor (PRED)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| PRED-1 | The advisor shall accept Matric %, Intermediate / A-level %, entry test %, field group, preferred degree level and optional filters (city, province, sector, maximum fee, shift). | `backend/modules/directory/advisor.service.ts`<br>`backend/constants/advisor.ts` | backend/tests/directory.test.ts |
| PRED-2 | The advisor shall work for visitors without an account (guest mode) and shall use the saved academic record for signed-in applicants. | `backend/modules/directory/advisor.service.ts`<br>`backend/modules/directory/public-directory.routes.ts`<br>`frontend/features/advisor/advisor-page.tsx` | backend/tests/directory.test.ts |
| PRED-3 | For each program the advisor shall check eligibility (minimum percentage, required group and subjects) and show why a program is not eligible. | `backend/modules/directory/advisor.service.ts` | backend/tests/directory.test.ts |
| PRED-4 | The advisor shall calculate the aggregate A = sum of (percentage x weight / 100) using the weights of that program; if the weights are unknown a standard formula shall be used and labelled. | `backend/modules/directory/advisor.service.ts`<br>`backend/constants/advisor.ts` | backend/tests/directory.test.ts |
| PRED-5 | The advisor shall estimate the chance as Phi((A - mu) / sigma), where mu and sigma are the weighted mean and spread of the closing merit of the last three years (weights 0.5, 0.3, 0.2; minimum sigma 1.0). | `backend/modules/directory/advisor.service.ts`<br>`backend/lib/merit.ts` | backend/tests/directory.test.ts<br>backend/tests/merit-engine.test.ts |
| PRED-6 | Programs shall be classified as Safe (chance of 85% or more), Target (50% to 85%), Reach (20% to 50%) or Unlikely (below 20%); displayed chances shall be limited to 1%-99%. | `backend/modules/directory/advisor.service.ts`<br>`backend/lib/merit.ts`<br>`frontend/features/advisor/band.tsx` | backend/tests/directory.test.ts<br>backend/tests/merit-engine.test.ts |
| PRED-7 | Results shall be sortable and filterable and shall show the aggregate, the last closing merit, the gap, the fee, the deadline and the data years. | `backend/modules/directory/advisor.service.ts` | backend/tests/directory.test.ts |
| PRED-8 | Every result shall explain how it was calculated (formula line by line, years used, source) and shall carry the notice that it is an estimate and not a guarantee. | `backend/modules/directory/public-directory.routes.ts`<br>`backend/constants/advisor.ts`<br>`frontend/features/advisor/explain-page.tsx` | backend/tests/directory.test.ts |
| PRED-9 | Results based on marks below trust level 2 shall be labelled "based on self-declared marks"; verified marks shall be labelled "based on verified marks". | `backend/modules/directory/advisor.service.ts` | backend/tests/directory.test.ts |
| PRED-10 | The advisor shall provide a what-if simulation, a shortlist (save, compare up to four programs) and PDF export. | `backend/modules/directory/shortlist.routes.ts`<br>`backend/modules/directory/directory.models.ts`<br>`backend/lib/pdf.ts`<br>`frontend/features/advisor/advisor-page.tsx` | backend/tests/directory.test.ts |
| PRED-11 | For open campaigns on ADMITRA the advisor shall show the applicant's indicative standing (top 10%, 25%, 50%, lower) among applicants with verified marks, without revealing other applicants' identities. | `backend/modules/directory/advisor.service.ts` | backend/tests/directory.test.ts |
| PRED-12 | Each advisor run shall be logged anonymously (inputs rounded, no identity) for analytics on demand by program. | `backend/modules/directory/directory.models.ts`<br>`backend/modules/directory/directory-admin.routes.ts`<br>`backend/modules/directory/public-directory.routes.ts`<br>`backend/modules/analytics/platform-analytics.ts` | backend/tests/directory.test.ts |

## Result Finder (FIND)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| FIND-1 | The My Results page shall show, for every application of the signed-in applicant in every institution, the outcome of the latest published list: Selected, Waitlisted, Not selected or Pending. | `backend/modules/results/my-results.routes.ts`<br>`frontend/features/results/my-results.tsx` | frontend/e2e/results.spec.ts › a selected applicant sees position, aggregate, deadline, accept / decline and the breakdown |
| FIND-2 | A Selected card shall show list number, merit position, aggregate, program, shift, offer deadline and a button to accept or decline. | `backend/modules/results/my-results.routes.ts`<br>`frontend/features/results/my-results.tsx` | frontend/e2e/results.spec.ts › a selected applicant sees position, aggregate, deadline, accept / decline and the breakdown |
| FIND-3 | A Waitlisted card shall show the waiting position and the estimated chance of an offer in the next list: expected vacancies V = seats x historical decline rate (default 10%); High if position is at most V, Medium if… | `backend/modules/results/my-results.routes.ts`<br>`backend/lib/merit.ts`<br>`frontend/features/results/my-results.tsx` | backend/tests/merit-engine.test.ts |
| FIND-4 | A Not selected card shall show the applicant's aggregate, the last selected aggregate and the gap, and suggest alternative programs using the Admission Advisor. | `backend/modules/results/my-results.routes.ts`<br>`frontend/features/results/my-results.tsx` | frontend/e2e/results.spec.ts › a not selected applicant sees the gap to the last selected aggregate and other programs |
| FIND-5 | On publication every affected applicant shall receive a live notification and an e-mail. | `backend/modules/merit/merit.service.ts` | backend/tests/merit.test.ts |
| FIND-6 | Published merit lists shall have public pages with search by application number or shortened name and a PDF download; CNICs shall never be shown. | `backend/modules/results/public-results.routes.ts`<br>`backend/lib/pdf.ts`<br>`frontend/features/results/public-lists.tsx` | backend/tests/directory.test.ts |
| FIND-7 | A public status lookup shall require the application number, the last four CNIC digits and a CAPTCHA, shall be rate-limited and shall return only the status. | `backend/modules/results/public-results.routes.ts`<br>`backend/middleware/rateLimit.ts`<br>`backend/lib/captcha.ts`<br>`frontend/features/results/status-lookup.tsx` | backend/tests/directory.test.ts |
| FIND-8 | The breakdown of the aggregate (component, percentage, weight, contribution) shall be visible to the applicant for every list entry. Example of the next-list chance: with S = 180 seats and a decline rate of 10%, V =… | `backend/modules/results/my-results.routes.ts`<br>`backend/modules/merit/merit.models.ts`<br>`frontend/features/results/my-results.tsx` | frontend/e2e/results.spec.ts › a selected applicant sees … the breakdown<br>backend/tests/merit.test.ts › runs the whole cycle (breakdown of three components) |

## Analytics and reports (RPT)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| RPT-1 | The system shall show the funnel (submitted, fee paid, verified, offered, accepted, enrolled), daily submissions for 14 and 30 days, applications and applicants per seat per program, fee totals, document rejection… | `backend/modules/analytics/analytics.service.ts`<br>`backend/modules/analytics/analytics.routes.ts`<br>`frontend/features/analytics/institution-analytics.tsx` | backend/tests/phase4.test.ts<br>frontend/e2e/workspaces.spec.ts |
| RPT-2 | The system shall export applications, payments and merit lists (CSV and PDF). | `backend/modules/analytics/analytics.routes.ts`<br>`backend/lib/pdf.ts`<br>`backend/lib/csv.ts`<br>`frontend/features/analytics/institution-analytics.tsx` | backend/tests/phase4.test.ts |
| RPT-3 | The super admin shall see advisor usage by program and registry match rates to improve the directory. | `backend/modules/analytics/platform-analytics.ts`<br>`frontend/features/analytics/platform-analytics.tsx` | backend/tests/phase4.test.ts |

## Support (SUP)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| SUP-1 | Tickets shall have category, priority (response targets of 2, 8, 24 and 72 hours) and status (Open, In progress, Waiting on institution, Resolved, Closed). | `backend/modules/support/support.model.ts`<br>`frontend/features/support/types.ts`<br>`frontend/features/support/badges.tsx`<br>`frontend/features/support/ticket-list.tsx` | backend/tests/phase4.test.ts<br>frontend/e2e/workspaces.spec.ts |
| SUP-2 | An institution shall see only its own tickets. | `backend/modules/support/support.routes.ts`<br>`frontend/features/support/ticket-list.tsx` | backend/tests/phase4.test.ts<br>frontend/e2e/workspaces.spec.ts |
| SUP-3 | Replies shall be threaded and shall notify the other party. | `backend/modules/support/support.service.ts`<br>`backend/seed/phase4.ts`<br>`frontend/features/support/ticket-detail.tsx` | backend/tests/phase4.test.ts<br>frontend/e2e/workspaces.spec.ts |

## Security (SEC)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| SEC-1 | Tenant isolation: institution data shall be isolated on the server; users of one institution shall not read, change or even detect another institution's records (requests for another institution's record return "not… | `backend/routes.ts`<br>`backend/middleware/tenant.ts` | backend/tests/tenant.test.ts |
| SEC-2 | Authorization: every protected endpoint shall check authentication and the specific permission required; the front end hides buttons the user may not use, but the server always decides. | `backend/constants/permissions.ts`<br>`frontend/features/auth/require-auth.tsx` | backend/tests/tenant.test.ts |
| SEC-3 | Credentials: passwords shall be hashed with Argon2id; refresh tokens and e-mail links shall be stored only as hashes. | `backend/lib/crypto.ts` | backend/tests/requirements.test.ts › stores passwords as Argon2id hashes and refresh tokens and e-mail links only as hashes |
| SEC-4 | Input validation: all inputs shall be validated on the server with Zod; MongoDB operator injection shall be prevented; output is escaped by React. | `backend/modules/support/support.service.ts`<br>`backend/lib/validate.ts`<br>`backend/lib/db.ts` | backend/tests/phase4.test.ts<br>backend/tests/public.test.ts |
| SEC-5 | Uploads: files shall be validated by content and size, stored outside the public folder with random names and served only to authorized users. | `backend/lib/csv.ts` | backend/tests/applications.test.ts › UC-05 to UC-07 (TC-22: executable renamed to .pdf is rejected)<br>backend/tests/applications.test.ts › files are private |
| SEC-6 | Registry and fraud data: the board result registry and fraud flags shall be accessible only to the matching service and authorized staff. | `backend/modules/registry/registry.routes.ts`<br>`backend/modules/records/verification.routes.ts` | backend/tests/registry.test.ts › REG-4: applicants and staff cannot read registry rows |
| SEC-7 | Audit: sensitive actions (approvals, verifications, publications, revocations, role changes) shall be recorded in an audit log with actor, time, IP address and changes. | `backend/modules/audit/audit.routes.ts`<br>`backend/lib/audit.ts`<br>`frontend/features/audit/audit-log.tsx` | backend/tests/phase4.test.ts |
| SEC-8 | Configuration: in production the system shall refuse to start with weak secrets, insecure cookies or non-HTTPS URLs; security headers are set with Helmet; CORS allows only the web application's origin. | `backend/config/env.ts` | backend/tests/requirements.test.ts › refuses to start in production with a weak secret, insecure cookies or plain http<br>backend/tests/requirements.test.ts › sends security headers and allows only the web application origin |
| SEC-9 | Public lookups: public endpoints shall expose the minimum data (status only), be rate-limited and use a CAPTCHA where they return personal status. | `backend/middleware/rateLimit.ts`<br>`backend/lib/captcha.ts`<br>`backend/modules/results/public-results.routes.ts` | backend/tests/directory.test.ts › returns only the status after a correct CAPTCHA and CNIC digits |
| SEC-10 | Privacy: CNICs are never shown on public pages; names on public merit lists are shortened; applicants can export and delete their data as allowed by PROF-5. | `backend/lib/merit.ts`<br>`backend/modules/results/public-results.routes.ts`<br>`backend/modules/profile/profile.routes.ts` | backend/tests/directory.test.ts › publishes lists with shortened names only and a PDF<br>backend/tests/applications.test.ts › PROF-5: exports data and deletes the account |

## Safety (SAFE)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| SAFE-1 | No data shall be lost because of a failed operation. Payment verification, merit publication and enrollment shall be atomic (all or nothing) using MongoDB transactions. | `backend/lib/db.ts`<br>`backend/modules/merit/merit.service.ts`<br>`backend/modules/fees/payment.routes.ts`<br>`backend/modules/merit/offer.service.ts` | backend/tests/merit.test.ts › runs the whole cycle (publication, payment decision and enrollment in transactions)<br>backend/tests/perf/performance.test.ts › PERF-4 (publication of 1,500 applicants in one transaction) |
| SAFE-2 | Published merit lists shall never change silently; corrections shall be auditable revisions. | `backend/modules/merit/merit.service.ts`<br>`frontend/features/merit/merit-list-detail.tsx` | backend/tests/merit.test.ts › runs the whole cycle (revision of a list) |
| SAFE-3 | Seat allocation shall never exceed the configured capacity of any program and shift. | `backend/lib/merit.ts`<br>`backend/modules/merit/merit.service.ts` | backend/tests/merit-engine.test.ts › gives everyone the best preference merit earns without exceeding seats |
| SAFE-4 | Daily backups of the database and uploaded files shall be kept for at least 14 days, and restoring them shall be practiced before the final demonstration. | `backend/ops/backup.ts`<br>`backend/ops/cli.ts` | backend/tests/backup.test.ts |
| SAFE-5 | Expired subscriptions shall make a workspace read-only and never delete it. | `backend/modules/institutions/institution.model.ts`<br>`backend/middleware/tenant.ts`<br>`frontend/features/institution/subscription-banner.tsx` | backend/tests/platform.test.ts › INST-4: workspace stays usable in the 7-day grace period, then becomes read-only |
| SAFE-6 | Registry imports shall be reversible so that a wrong file can be removed without damaging other data. | `backend/modules/registry/registry.service.ts`<br>`frontend/features/registry/registry-import.tsx` | backend/tests/registry.test.ts › import re-checks waiting records; rollback resets auto-verified records |
| SAFE-7 | Confirmation dialogs shall be shown before destructive or irreversible actions (publish, reject, revoke, delete). | `frontend/components/ui/confirm-dialog.tsx`<br>`frontend/features/merit/merit-list-detail.tsx`<br>`frontend/features/merit/offers.tsx` | frontend/e2e/results.spec.ts › declining an offer asks for confirmation (cancel changes nothing) |

## Branding (BRAND, Phase 5)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| BRAND-1 | Super Admin changes platform name, tagline, assistant name, logo, favicon and colours; applied to every page, e-mail and PDF. | `backend/modules/branding/branding.routes.ts`<br>`backend/lib/brand.ts`<br>`frontend/features/branding/platform-branding.tsx`<br>`frontend/app/layout.tsx` | backend/tests/branding.test.ts › lets the Super Admin rename the platform and the assistant and change the colours<br>frontend/e2e/phase5.spec.ts › the Super Admin previews colours before saving them |
| BRAND-2 | Institutions with custom branding use their own logo and colours. | `backend/modules/branding/branding.routes.ts`<br>`backend/modules/auth/auth.service.ts`<br>`frontend/features/institution/settings.tsx`<br>`frontend/features/institution/institution-shell.tsx` | backend/tests/branding.test.ts › needs a plan with custom branding and then colours the workspace<br>frontend/e2e/phase5.spec.ts › the institution workspace uses its own colours and logo |
| BRAND-3 | Images validated by content, never SVG, size-limited, served by an unguessable key, old image removed. | `backend/modules/branding/assets.ts`<br>`backend/modules/branding/branding.models.ts` | backend/tests/branding.test.ts › (SVG refused, long cache, replaced logo removed) |
| BRAND-4 | Profile pictures; initials on the chosen colour. | `backend/modules/branding/branding.routes.ts`<br>`frontend/components/layout/user-menu.tsx`<br>`frontend/features/auth/account-settings.tsx` | backend/tests/branding.test.ts › lets every user add and remove a profile picture |
| BRAND-5 | Colours adjusted to keep 4.5:1 contrast in both themes; preview before saving. | `frontend/lib/brand.ts`<br>`frontend/features/branding/brand-fields.tsx` | frontend/e2e/workspaces.spec.ts › every admin screen (axe WCAG 2.2 AA with the RIT colours)<br>frontend/e2e/phase5.spec.ts |

## Mitra admission copilot (AGENT, Phase 5)

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| AGENT-1 | Provider chosen by environment values (Gemini, OpenAI, Claude, OpenAI-compatible); works without a key. | `backend/modules/agent/providers/index.ts`<br>`backend/modules/agent/providers/openai.ts`<br>`backend/modules/agent/providers/anthropic.ts`<br>`backend/modules/agent/providers/mock.ts` | backend/tests/agent.test.ts › speaks the OpenAI tool-calling format…; speaks the Anthropic Messages format…; works without a key…; runs the real tools … without an API key |
| AGENT-2 | Chat in English, Urdu or Roman Urdu with visible steps and saved conversations. | `backend/modules/agent/agent.service.ts`<br>`backend/modules/agent/agent.routes.ts`<br>`frontend/features/mitra/chat.tsx`<br>`frontend/features/mitra/launcher.tsx` | backend/tests/agent.test.ts › answers a platform question with tools…<br>frontend/e2e/phase5.spec.ts › a question is answered with the platform data… |
| AGENT-3 | Answers only from live data through tools limited by workspace, permission and plan; CNIC masked. | `backend/modules/agent/tools/read.ts`<br>`backend/modules/agent/tools/index.ts`<br>`backend/modules/agent/agent.service.ts` | backend/tests/agent.test.ts › gives an institution only its own tools and data, and only on a plan with the copilot<br>frontend/e2e/phase5.spec.ts › an institution on a plan without the copilot sees why |
| AGENT-4 | Actions prepared, run only after Confirm, audited. | `backend/modules/agent/tools/actions.ts`<br>`backend/modules/agent/agent.service.ts`<br>`frontend/features/mitra/chat.tsx` | backend/tests/agent.test.ts › prepares an action, does nothing until it is confirmed, then runs it |
| AGENT-5 | Platform fee recorded on renewal. | `backend/modules/platform/billing.model.ts`<br>`backend/modules/platform/platform.service.ts`<br>`frontend/features/platform/institution-detail.tsx` | backend/tests/agent.test.ts › records platform fees on renewal and sends the daily briefings |
| AGENT-6 | Integrity rules with evidence; review or dismiss with a note. | `backend/modules/agent/integrity.rules.ts`<br>`frontend/features/mitra/mitra-page.tsx` | backend/tests/agent.test.ts › flags payments below the challan and marks confirmed despite registry differences, once each<br>frontend/e2e/phase5.spec.ts › the briefing and the integrity alerts are shown |
| AGENT-7 | Daily briefing from database figures, AI summary when connected, notification and e-mail. | `backend/modules/agent/briefing.service.ts`<br>`frontend/features/mitra/mitra-page.tsx` | backend/tests/agent.test.ts › records platform fees on renewal and sends the daily briefings |
| AGENT-8 | Daily message limit and token usage. | `backend/modules/agent/agent.service.ts`<br>`backend/modules/agent/agent.models.ts` | backend/tests/agent.test.ts › stops at the daily message limit |

## Performance (PERF)

| ID | Requirement | Implementation | Verified by (measured on the development machine) |
|---|---|---|---|
| PERF-1 | First meaningful content of public pages on 4G within 2 seconds | `frontend (Next.js server rendering, small bundles)` | frontend/e2e/perf.spec.ts (production build, 4G throttling): about 0.3-0.4 s |
| PERF-2 | Lists paginated, default 20 rows, maximum 100 | `backend/src/lib/pagination.ts` | backend/tests/perf/performance.test.ts › PERF-2 |
| PERF-3 | Merit list for 1,500 applicants with three preferences below 5 s | `backend/src/modules/merit/merit.service.ts, backend/src/lib/merit.ts` | backend/tests/perf/performance.test.ts: about 2.8 s |
| PERF-4 | Publication for 1,500 applicants (one transaction) below 30 s | `backend/src/modules/merit/merit.service.ts` | backend/tests/perf/performance.test.ts: about 7.6 s |
| PERF-5 | Admission Advisor over 500 programs below 2 s | `backend/src/modules/directory/advisor.service.ts` | backend/tests/perf/performance.test.ts: about 0.33 s |
| PERF-6 | Registry check of one record below 1 s | `backend/src/modules/records/record.service.ts` | backend/tests/perf/performance.test.ts: about 8 ms |
| PERF-7 | Import of 50,000 registry rows below 60 s | `backend/src/modules/registry/registry.service.ts` | backend/tests/perf/performance.test.ts (parse, validate, store): about 13.7 s |
| PERF-8 | My Results for 2,000 applicants within 5 minutes, 95% below 2 s, no errors | `backend/src/modules/results/my-results.routes.ts` | backend/tests/perf/performance.test.ts: 2,000 requests in about 7.9 s, 95th percentile about 0.26 s, 0 errors |
| PERF-9 | Dashboard figures cached for at most 30 s | `backend/src/lib/cache.ts, backend/src/modules/analytics/` | backend/tests/phase4.test.ts › caches for at most 30 seconds; perf test PERF-9 |
| PERF-10 | At least 2,000 applications per cycle per institution on the entry plan | `backend/src/seed/data.ts (Starter: 2,000), backend/src/modules/institutions/limits.ts` | backend/tests/platform.test.ts › INST-3 limits; perf test with 1,500 applications in one campaign |

151 requirements (138 of the proposal and 13 of the Phase 5 addendum), each with an implementation and an automated check. Manual checks that complement them are listed in the user manuals (`docs/manuals`).
