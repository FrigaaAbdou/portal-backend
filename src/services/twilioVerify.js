const twilio = require('twilio');

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;

let client = null;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
  console.warn('Twilio Verify env vars missing; phone verification disabled.');
} else {
  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

async function sendCode(phone) {
  if (!client) throw new Error('Twilio client not configured');
  const verification = await client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verifications.create({
    to: phone,
    channel: 'sms',
  });
  return verification.sid;
}

async function checkCode(phone, code) {
  if (!client) throw new Error('Twilio client not configured');
  const check = await client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({
    to: phone,
    code,
  });
  return check.status === 'approved';
}

module.exports = {
  sendCode,
  checkCode,
};
