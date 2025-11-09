/* eslint-disable no-console */
const mongoose = require('mongoose');
const PlayerProfile = require('../models/PlayerProfile');
const { notifyUser } = require('../services/notifyUser');
const { sendEmail } = require('../services/resend');

const REMINDER_AGE_MS = parseInt(process.env.VERIFICATION_REMINDER_AGE_MS || '', 10) || 3 * 24 * 60 * 60 * 1000;
const ADMIN_ALERT_EMAIL = process.env.VERIFICATION_ALERT_EMAIL;

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const cutoff = new Date(Date.now() - REMINDER_AGE_MS);
  const profiles = await PlayerProfile.find({
    'verification.status': { $in: ['email_pending', 'phone_pending', 'stats_pending'] },
    'verification.updatedAt': { $lte: cutoff },
  }).select('user verification.status');

  console.log(`Found ${profiles.length} profiles needing reminders`);

  for (const profile of profiles) {
    let message = 'Please continue your verification steps in Portal.';
    if (profile.verification.status === 'email_pending') message = 'Verify your email to continue your Portal verification.';
    if (profile.verification.status === 'phone_pending') message = 'Verify your phone number to continue your Portal verification.';
    if (profile.verification.status === 'stats_pending') message = 'Submit your stats to finish your Portal verification.';
    // eslint-disable-next-line no-await-in-loop
    await notifyUser(profile.user, 'Portal verification reminder', message).catch((err) => console.warn('Reminder failed', err.message));
  }

  if (ADMIN_ALERT_EMAIL) {
    await sendEmail({
      to: ADMIN_ALERT_EMAIL,
      subject: 'Portal verification reminder summary',
      html: `<p>${profiles.length} users are awaiting action as of ${new Date().toISOString()}.</p>`,
    }).catch((err) => console.warn('Admin alert failed', err.message));
  }

  await mongoose.disconnect();
}

run()
  .then(() => {
    console.log('Reminder run complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
