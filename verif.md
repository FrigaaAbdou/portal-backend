Step-by-step plan

Data & Config Prep

Extend User/PlayerProfile schema with a verification object (overall status, email/phone code metadata, stats snapshot, attestation flag, review history).
Add env vars for Resend/Twilio (already done) plus a TWILIO_VERIFY_SERVICE_SID.
Set up utility helpers for hashing codes, checking expiry, and logging status changes.
Email Verification APIs

POST /api/verification/start: issue email code (generate hash, expiry), send via Resend, set status='email_pending'.
POST /api/verification/email/confirm: validate code, clear token, mark emailVerifiedAt, advance to phone_pending.
Add rate limiting per user to prevent code spam.
Phone Verification APIs

POST /api/verification/phone/send: accept an E.164 number, call Twilio Verify to send SMS, store phone + request SID.
POST /api/verification/phone/confirm: check verification code with Twilio, mark phoneVerifiedAt, advance to stats_pending.
Stats Attestation Submission

POST /api/verification/stats: receive current stats snapshot + boolean “I certify” + optional supporting file URLs; store snapshot, set status='in_review'.
GET /api/verification/me: expose the user’s verification state so the UI can show progress at any time.
Admin Review Workflow

Admin routes: list pending (GET /api/admin/verifications?status=in_review), view details, approve (POST …/approve), reject/request updates (POST …/reject with note).
Approve sets status='verified', stores reviewer ID, timestamps; reject sets status='needs_updates' and captures the note.

Frontend User Experience

Add a “Get Verified” entry on Profile/Settings that opens a stepper/modal.
Step 1 UI: email code entry + resend. Step 2: international phone input + SMS code. Step 3: stats review form with attestation checkbox + submit.
Progress bar/status chips so users always see which step they’re on, plus messages when awaiting admin review or needing updates.

Admin UI

New page or section in the dashboard listing verifications with filters.
Detail view showing submitted stats vs current profile, attestation info, file links, and action buttons (Approve/Reject/Request update).

Notifications & Reminders

Email users when each step succeeds/fails, when admin approves/rejects, and when action is required.
Optional cron job to remind users stuck on a step or alert admins of pending reviews.

Testing & Hardening

Unit/integration tests for the new endpoints (code expiry, rate limits, state transitions).
Mock email/SMS providers in tests.
Manual QA on the full flow (happy path + error states).
Document the verification process for support/ops.
This sequence keeps the implementation incremental: build backend scaffolding first, then user-facing stepper, then admin tooling, finishing with notifications/polish