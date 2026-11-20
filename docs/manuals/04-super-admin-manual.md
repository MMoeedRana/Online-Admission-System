# ADMITRA – Super Admin Manual

For the ADMITRA platform team. The first Super Admin is created by the protected seed command
(`npm run seed`) with the e-mail and password from `.env`.

## 1. Dashboard

Active, pending and suspended institutions, programs, open campaigns, applicants and staff, onboarding
requests waiting for approval, subscriptions ending soon, institutions per plan and recent activity from
the audit log.

## 2. Institutions and plans

- **Institutions** – requests from the public form **Register your institution** arrive as *Pending*.
  Open one to **Approve** it with a plan and trial days (an invitation is e-mailed to the contact person,
  who becomes the Institution Admin) or **Reject** it with a reason. Active institutions can be suspended
  (staff are blocked at once and the institution disappears from public pages) and re-activated, and their
  subscription renewed. An expired subscription gives a 7-day grace period, then the workspace becomes
  read-only; nothing is deleted.
- **Add institution** creates an institution directly.
- **Plans** – price, trial days, limits (campuses, programs, staff, applications per cycle) and features.

## 3. Registry Import

Upload the official board results (CSV or Excel, **Download template** for the columns). **Check file**
shows a preview with every row error; only valid rows are imported. Waiting academic records are checked
again automatically. A batch can be rolled back within 7 days (**Roll back**); records verified by it
return to their previous state. Registry rows are never visible to applicants or institution staff.

## 4. Reference Directory

The verification queue of merit history entered by institutions or imported, institutions and programs
of the directory (also those not on ADMITRA), imports, the data-gap report (programs without data for
the current year), claims by institutions and the Admission Advisor usage.

## 5. Analytics

**Analytics** (14, 30 or 90 days):

- Admission Advisor runs per day, share of signed-in users, fields searched and **usage by program**
  (how often a program appeared in advisor results and how the chance was rated);
- **registry match rates**: matched, mismatch and not in the registry, overall and per board;
- applications submitted per institution and the share of support tickets answered within their target.

![Platform analytics](../screenshots/desktop/76-platform-analytics.jpg)

## 6. Support Tickets

Tickets of every institution with counts per status and the number with an overdue first response
(filter **Only tickets with an overdue first response**). Open a ticket to read the conversation, **Assign
to me**, change the priority (the response target moves with it) or the status, and reply. A reply can
set the status at the same time (In progress, Waiting on institution, Resolved, Closed); an open ticket
moves to *In progress* with the first reply. The institution admins are notified in the app and by e-mail.

![Support tickets](../screenshots/desktop/77-support-tickets.jpg)

## 7. Audit Log

Every recorded action on the platform with the person, institution, record, time and IP address. Search,
filter by action, record type and dates, open an entry for the recorded details or **Export CSV**.

## 8. API documentation and backups

See the Installation and Operation Manual: Swagger UI at `/api/v1/docs`, daily backups with
`npm run backup` (kept 14 days) and `npm run restore`.
