const User = require('../models/User');
const { sendEmail } = require('./resend');

async function notifyUser(userId, subject, message) {
  if (!userId) return;
  const user = await User.findById(userId).select('email');
  if (!user || !user.email) return;
  await sendEmail({
    to: user.email,
    subject,
    html: `<p>${message}</p>`,
  });
}

module.exports = {
  notifyUser,
};
