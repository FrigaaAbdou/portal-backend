const express = require('express');
const auth = require('../middleware/auth');
const PlayerProfile = require('../models/PlayerProfile');
const User = require('../models/User');
const { generateNumericCode, buildCodeRecord, isCodeValid } = require('../utils/verification');
const resendClient = require('../services/resend');
const twilioVerify = require('../services/twilioVerify');
const { notifyUser } = require('../services/notifyUser');

const router = express.Router();

const EMAIL_RATE_LIMIT_MS = 60 * 1000; // 1 minute between sends
const PHONE_RATE_LIMIT_MS = 60 * 1000;

function getPlayerProfile(userId) {
  return PlayerProfile.findOne({ user: userId });
}

function getUser(userId) {
  return User.findById(userId).select('email');
}

router.post('/start', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await getPlayerProfile(userId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    if (profile.verification?.email?.lastSentAt && now - new Date(profile.verification.email.lastSentAt).getTime() < EMAIL_RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((EMAIL_RATE_LIMIT_MS - (now - new Date(profile.verification.email.lastSentAt).getTime())) / 1000);
      return res.status(429).json({ error: 'Please wait before requesting another code', retryAfter });
    }

    const code = generateNumericCode();
    const emailRecord = buildCodeRecord(code);

    profile.verification = profile.verification || {};
    profile.verification.status = 'email_pending';
    profile.verification.email = {
      ...profile.verification.email,
      ...emailRecord,
    };
    profile.verification.updatedAt = new Date();
    await profile.save();

    await resendClient.sendVerificationCode(user.email, code);

    return res.json({ success: true });
  } catch (err) {
    console.error('Email verification start failed', err);
    const status = err?.code ? 400 : 500;
    return res.status(status).json({
      error: 'Failed to send verification code',
      detail: err?.message || null,
      code: err?.code,
    });
  }
});

router.post('/email/confirm', auth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Code is required' });

    const profile = await getPlayerProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const record = profile.verification?.email;
    if (!record || !isCodeValid(record, code)) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    profile.verification.email = {
      ...profile.verification.email,
      codeHash: undefined,
      expiresAt: undefined,
      verifiedAt: new Date(),
    };
    profile.verification.status = 'phone_pending';
    profile.verification.updatedAt = new Date();
    await profile.save();

    notifyUser(req.user.id, 'Email verified', 'Your email address has been verified. Next, confirm your phone number.').catch(() => {})

    return res.json({ success: true, next: 'phone_pending' });
  } catch (err) {
    console.error('Email verification confirm failed', err);
    const status = err?.code ? 400 : 500;
    return res.status(status).json({
      error: 'Failed to confirm verification code',
      detail: err?.message || null,
      code: err?.code,
    });
  }
});

router.post('/phone/send', auth, async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const profile = await getPlayerProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const now = Date.now();
    if (profile.verification?.phone?.lastSentAt && now - new Date(profile.verification.phone.lastSentAt).getTime() < PHONE_RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((PHONE_RATE_LIMIT_MS - (now - new Date(profile.verification.phone.lastSentAt).getTime())) / 1000);
      return res.status(429).json({ error: 'Please wait before requesting another code', retryAfter });
    }

    const verificationSid = await twilioVerify.sendCode(phone);

    profile.verification = profile.verification || {};
    profile.verification.status = 'phone_pending';
    profile.verification.phone = {
      number: phone,
      serviceSid: verificationSid,
      lastSentAt: new Date(),
    };
    profile.verification.updatedAt = new Date();
    await profile.save();

    return res.json({ success: true });
  } catch (err) {
    console.error('Phone verification send failed', err);
    const status = err?.code ? 400 : 500;
    return res.status(status).json({
      error: 'Failed to send SMS verification code',
      detail: err?.message || null,
      code: err?.code,
    });
  }
});

router.post('/phone/confirm', auth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Code is required' });

    const profile = await getPlayerProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const phoneRecord = profile.verification?.phone;
    if (!phoneRecord?.number) {
      return res.status(400).json({ error: 'Phone verification not started' });
    }

    const confirmed = await twilioVerify.checkCode(phoneRecord.number, code);
    if (!confirmed) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    profile.verification.phone = {
      ...profile.verification.phone,
      verifiedAt: new Date(),
    };
    profile.verification.status = 'stats_pending';
    profile.verification.updatedAt = new Date();
    await profile.save();

    notifyUser(req.user.id, 'Phone verified', 'Your phone number has been verified. Submit your stats to finish verification.').catch(() => {})

    return res.json({ success: true, next: 'stats_pending' });
  } catch (err) {
    console.error('Phone verification confirm failed', err);
    const status = err?.code ? 400 : 500;
    return res.status(status).json({
      error: 'Failed to confirm phone verification code',
      detail: err?.message || null,
      code: err?.code,
    });
  }
});

router.post('/stats', auth, async (req, res) => {
  try {
    const { statsSnapshot, attested, supportingFiles = [] } = req.body || {};
    if (!statsSnapshot || typeof statsSnapshot !== 'object') {
      return res.status(400).json({ error: 'Stats snapshot is required' });
    }
    if (!attested) {
      return res.status(400).json({ error: 'You must certify your stats are accurate' });
    }

    const profile = await getPlayerProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    if (profile.verification?.status !== 'stats_pending' && profile.verification?.status !== 'needs_updates') {
      return res.status(400).json({ error: 'Stats cannot be submitted at this stage' });
    }

    profile.verification = profile.verification || {};
    profile.verification.status = 'in_review';
    profile.verification.stats = {
      snapshot: statsSnapshot,
      attested: Boolean(attested),
      supportingFiles: Array.isArray(supportingFiles) ? supportingFiles.slice(0, 5) : [],
      submittedAt: new Date(),
      reviewerId: undefined,
      reviewerNote: undefined,
      verifiedAt: undefined,
    };
    profile.verification.updatedAt = new Date();
    await profile.save();

    notifyUser(req.user.id, 'Stats submitted', 'Thanks! Your stats are now under review.').catch(() => {})

    return res.json({ success: true, next: 'in_review' });
  } catch (err) {
    console.error('Stats submission failed', err);
    const status = err?.code ? 400 : 500;
    return res.status(status).json({
      error: 'Failed to submit stats for review',
      detail: err?.message || null,
      code: err?.code,
    });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const profile = await getPlayerProfile(req.user.id).select('verification verificationStatus verificationNote');
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    return res.json({
      verification: profile.verification || null,
      legacyStatus: profile.verificationStatus,
      legacyNote: profile.verificationNote,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load verification status' });
  }
});

module.exports = router;
