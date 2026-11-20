# ADMITRA – Proposal Addendum: Phase 5 (Branding and the Mitra Admission Copilot)

This addendum extends the proposal (`ADMITRA_FYP_Proposal.docx`) with a fifth phase that was agreed after
Phase 4. It follows the same conventions: every requirement has a tag, is implemented in the code and is
checked by an automated test (see `docs/TRACEABILITY.md`).

## 1. Purpose

Phase 4 completed the admission platform. Phase 5 makes it ready to be offered to many institutions as
a product: the platform and each institution can carry their own brand, and an AI copilot called
**Mitra** helps the platform team and institution admins run admissions: it answers questions from live
data, prepares routine actions, writes a daily briefing and points out activity that needs a review.

## 2. Branding (BRAND)

Priority: Medium (Benefit 7, Penalty 3, Cost 3, Risk 2)

- **BRAND-1:** The Super Admin shall be able to change the platform name, tagline, assistant name, logo,
  favicon, primary colour, sidebar colour and the colour of initials; the changes shall apply to every
  page, e-mail and PDF without a new deployment.
- **BRAND-2:** An institution whose plan includes custom branding shall be able to upload its logo and
  choose its primary and sidebar colours; they shall be used in its workspace and its logo on its public
  pages. Without the plan feature the platform branding is used.
- **BRAND-3:** Logos, favicons and profile pictures shall be validated by their content (PNG, JPG, WebP;
  PNG or ICO for favicons; never SVG), limited in size, stored outside the public folder and served under
  an unguessable key; a replaced image shall be deleted.
- **BRAND-4:** Every user shall be able to add and remove a profile picture; people without one are shown
  with their initials on the chosen colour (or a colour per name).
- **BRAND-5:** Chosen colours shall be adjusted automatically so that text keeps the WCAG 2.2 AA contrast
  of 4.5:1 in the light and the dark theme, and a preview shall show the result before saving.

## 3. Mitra admission copilot (AGENT)

Priority: High (Benefit 8, Penalty 4, Cost 6, Risk 5)

- **AGENT-1:** The AI provider shall be chosen with environment values only (`AI_PROVIDER`, `AI_API_KEY`,
  `AI_MODEL`, `AI_BASE_URL`): Google Gemini (default, `gemini-2.5-flash`), OpenAI, Anthropic Claude or
  any OpenAI-compatible service. Without a key the platform keeps working and explains how to connect one.
- **AGENT-2:** The Super Admin and institution admins shall be able to ask questions in English, Urdu or
  Roman Urdu in a chat that shows the steps the assistant takes and keeps the conversations.
- **AGENT-3:** The assistant shall answer only from live data through tools that respect the workspace
  and permissions: the Super Admin sees the whole platform, an institution admin only its own institution
  (SEC-1, SEC-2). Institutions get the chat on plans that include the AI copilot. CNIC numbers are masked.
- **AGENT-4:** Actions (reminders for unpaid fees, expiring offers and unfinished applications, renewal
  reminders, ticket replies, opening a ticket, closing an alert) shall only be prepared by the assistant
  and run after the person presses Confirm; each confirmed action is written to the audit log.
- **AGENT-5:** The platform fee paid by an institution shall be recorded when its subscription is renewed
  (amount, months, method, reference), so that the assistant can report fees and subscriptions that end soon.
- **AGENT-6:** Integrity rules shall look for activity that needs a review (bulk or overridden marks
  verifications, payments below the challan, stale payment proofs and fraud flags, repeated list revisions,
  revocation spikes, sensitive actions at night, offers above capacity, late applications) and show each
  finding with its evidence; findings are reviewed or dismissed with a note and are never treated as proof.
- **AGENT-7:** A daily briefing shall be prepared each morning for the Super Admin and for institutions
  whose plan includes it, with figures from the database and a short summary written by the AI when a
  provider is connected; it is delivered as a notification and an e-mail.
- **AGENT-8:** The number of messages per person and day shall be limited (`AI_DAILY_LIMIT`, default 200)
  and the tokens used shall be recorded.

## 4. Plans

| Plan | Custom branding | Daily AI briefing | AI copilot (chat and actions) |
| --- | --- | --- | --- |
| Starter | No | No | No |
| Standard | Yes | Yes | No |
| Enterprise | Yes | Yes | Yes |

The Super Admin always has the full assistant. Plans and their features can be changed on the Plans screen.

## 5. Schedule

Phase 5 was carried out after Phase 4 on the branch `phase5-ai-copilot`, in the same way as the earlier
phases: implementation, automated tests, browser and accessibility tests, documentation and screenshots.
