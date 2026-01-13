# sportall-backend

## Environment variables

Create a `.env` file (see `server/.env`) with the following keys:

```
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/Sportall
JWT_SECRET=your_jwt_secret
PASSWORD_MIN_LENGTH=8
PASSWORD_RESET_OTP_TTL_MINUTES=10
PASSWORD_RESET_OTP_MAX_ATTEMPTS=5
PASSWORD_RESET_REQUEST_WINDOW_MINUTES=5
PASSWORD_RESET_REQUEST_MAX=2
PASSWORD_RESET_TOKEN_TTL_MINUTES=5
CLIENT_ORIGIN=http://localhost:5171
RESEND_API_KEY=your_resend_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth
TWILIO_VERIFY_SERVICE_SID=your_twilio_verify_service
VERIFICATION_ALERT_EMAIL=ops@example.com # optional reminder summary recipient
```

`RESEND_API_KEY` powers email verification codes, while the Twilio variables power SMS verification through Twilio Verify.

## Password reset API

Endpoints under `/api/auth`:

- `POST /api/auth/reset/request` → send a 6-digit reset code (returns generic success).
- `POST /api/auth/reset/verify` → verify the code and receive a short-lived reset token.
- `POST /api/auth/reset/confirm` → set a new password using the reset token.

## Verification API

Endpoints under `/api/verification`:

- `POST /api/verification/start` → send email code via Resend.
- `POST /api/verification/email/confirm` → confirm email code.
- `POST /api/verification/phone/send` → send SMS via Twilio Verify (E.164 number required).
- `POST /api/verification/phone/confirm` → confirm SMS code.
- `POST /api/verification/stats` → submit stats snapshot + attestation (requires `statsSnapshot` object, `attested=true`, optional `supportingFiles`).
- `GET /api/verification/me` → fetch current verification state for the logged-in user.

Admin-only endpoints under `/api/admin/verifications` (requires JWT with `role=admin`):

- `GET /api/admin/verifications?status=in_review` → list submissions.
- `GET /api/admin/verifications/:id` → view detail.
- `POST /api/admin/verifications/:id/approve` → mark verified (optional `note`).
- `POST /api/admin/verifications/:id/reject` → send back for updates (requires `note`).

## Notifications & reminders

- Users receive email notifications when email/phone verification succeeds, when stats are submitted, and when admins approve or request updates.
- Optional reminder job: run `node server/scripts/verificationReminder.js` (or schedule via cron) to email users stuck on a step for more than 3 days and notify `VERIFICATION_ALERT_EMAIL` with a summary.
