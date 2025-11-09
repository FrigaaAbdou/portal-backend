const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Portal <no-reply@portal.app>';

if (!RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not configured. Email verification will not work.');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.warn('Resend client not initialized, skipping email send');
    return;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });
}

async function sendVerificationCode(to, code) {
  await sendEmail({
    to,
    subject: 'Your Portal verification code',
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
  })
}

module.exports = {
  sendEmail,
  sendVerificationCode,
};
