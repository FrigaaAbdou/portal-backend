const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminInvite = require('../models/AdminInvite');
const { generateToken, hashToken } = require('../utils/inviteTokens');
const { generateNumericCode, hashCode } = require('../utils/verification');
const { sendEmail } = require('../services/resend');
const { logAdminAction } = require('../services/adminLogger');
const auth = require('../middleware/auth');

const router = express.Router();

const PASSWORD_MIN_LENGTH = Number.parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);
const MIN_PASSWORD_LENGTH = Number.isFinite(PASSWORD_MIN_LENGTH) ? PASSWORD_MIN_LENGTH : 8;
const RESET_OTP_TTL_MINUTES = parsePositiveInt(process.env.PASSWORD_RESET_OTP_TTL_MINUTES, 10);
const RESET_OTP_TTL_MS = RESET_OTP_TTL_MINUTES * 60 * 1000;
const RESET_OTP_MAX_ATTEMPTS = parsePositiveInt(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS, 5);
const RESET_REQUEST_WINDOW_MINUTES = parsePositiveInt(process.env.PASSWORD_RESET_REQUEST_WINDOW_MINUTES, 5);
const RESET_REQUEST_WINDOW_MS = RESET_REQUEST_WINDOW_MINUTES * 60 * 1000;
const RESET_REQUEST_MAX = parsePositiveInt(process.env.PASSWORD_RESET_REQUEST_MAX, 2);
const RESET_TOKEN_TTL_MINUTES = parsePositiveInt(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES, 5);
const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isPasswordValid(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

function issueAuthToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
}

function isAllowedPublicRole(role) {
  return ['player', 'coach'].includes(role);
}

function getResetRequestState(user, nowMs) {
  const requestedAt = user.resetOtpRequestedAt ? new Date(user.resetOtpRequestedAt).getTime() : 0;
  if (!requestedAt || nowMs - requestedAt >= RESET_REQUEST_WINDOW_MS) {
    return { withinWindow: false, count: 0 };
  }
  return { withinWindow: true, count: user.resetOtpRequestCount || 0 };
}

// Register user (player or coach)
router.post('/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'email, password, role are required' });
    if (!isAllowedPublicRole(role)) {
      return res.status(403).json({ error: 'Role not allowed' });
    }
    if (!isPasswordValid(password)) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return res.status(400).json({ error: 'email is required' });
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: normalizedEmail, passwordHash, role });
    const token = issueAuthToken(user);
    res.status(201).json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password || '', user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = issueAuthToken(user);
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Password reset request (send OTP)
router.post('/reset/request', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'email is required' });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.json({ success: true });

    const now = Date.now();
    const windowState = getResetRequestState(user, now);
    if (windowState.withinWindow && windowState.count >= RESET_REQUEST_MAX) {
      return res.json({ success: true });
    }

    const code = generateNumericCode();
    user.resetOtpHash = hashCode(code);
    user.resetOtpExpiresAt = new Date(now + RESET_OTP_TTL_MS);
    user.resetOtpAttempts = 0;
    if (windowState.withinWindow) {
      user.resetOtpRequestCount = windowState.count + 1;
    } else {
      user.resetOtpRequestCount = 1;
      user.resetOtpRequestedAt = new Date(now);
    }
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: 'Your Sportall password reset code',
        html: `<p>Your Sportall password reset code is <strong>${code}</strong>.</p><p>This code expires in ${RESET_OTP_TTL_MINUTES} minutes. If you did not request this, you can ignore this email.</p>`,
      });
    } catch (err) {
      console.error('Password reset email send failed', err);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Password reset request failed', err);
    return res.status(500).json({ error: 'Failed to request password reset' });
  }
});

// Password reset verify (OTP -> short-lived token)
router.post('/reset/verify', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ error: 'email and code are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'email and code are required' });
    }
    const cleanedCode = String(code).trim();
    if (!cleanedCode) {
      return res.status(400).json({ error: 'email and code are required' });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired code', code: 'OTP_INVALID' });
    }

    const now = Date.now();
    if (new Date(user.resetOtpExpiresAt).getTime() < now) {
      return res.status(400).json({ error: 'Code expired', code: 'OTP_EXPIRED' });
    }
    const attempts = user.resetOtpAttempts || 0;
    if (attempts >= RESET_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts', code: 'OTP_LOCKED' });
    }

    if (hashCode(cleanedCode) !== user.resetOtpHash) {
      user.resetOtpAttempts = attempts + 1;
      await user.save();
      if (user.resetOtpAttempts >= RESET_OTP_MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Too many attempts', code: 'OTP_LOCKED' });
      }
      return res.status(400).json({ error: 'Invalid code', code: 'OTP_INVALID' });
    }

    const resetToken = generateToken();
    user.resetTokenHash = hashToken(resetToken);
    user.resetTokenExpiresAt = new Date(now + RESET_TOKEN_TTL_MS);
    user.resetOtpHash = undefined;
    user.resetOtpExpiresAt = undefined;
    user.resetOtpAttempts = 0;
    await user.save();

    return res.json({ resetToken, expiresInMinutes: RESET_TOKEN_TTL_MINUTES });
  } catch (err) {
    console.error('Password reset verification failed', err);
    return res.status(500).json({ error: 'Failed to verify reset code' });
  }
});

// Password reset confirm (token -> new password)
router.post('/reset/confirm', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' });
    }
    const cleanedToken = String(token).trim();
    if (!cleanedToken) {
      return res.status(400).json({ error: 'token and password are required' });
    }
    if (!isPasswordValid(password)) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await User.findOne({ resetTokenHash: hashToken(cleanedToken) });
    if (!user || !user.resetTokenExpiresAt) {
      return res.status(400).json({ error: 'Reset token invalid', code: 'RESET_TOKEN_INVALID' });
    }
    if (new Date(user.resetTokenExpiresAt).getTime() < Date.now()) {
      user.resetTokenHash = undefined;
      user.resetTokenExpiresAt = undefined;
      await user.save();
      return res.status(400).json({ error: 'Reset token expired', code: 'RESET_TOKEN_EXPIRED' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    user.resetOtpHash = undefined;
    user.resetOtpExpiresAt = undefined;
    user.resetOtpAttempts = 0;
    user.resetOtpRequestedAt = undefined;
    user.resetOtpRequestCount = 0;
    await user.save();

    return res.json({ success: true });
  } catch (err) {
    console.error('Password reset confirm failed', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email role');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// Accept admin invite
router.post('/admin/accept-invite', async (req, res) => {
  try {
    const { token, email, password } = req.body || {};
    if (!token || !email || !password) {
      return res.status(400).json({ error: 'token, email, password are required' });
    }
    if (!isPasswordValid(password)) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const normalizedEmail = normalizeEmail(email);
    const invite = await AdminInvite.findOne({ tokenHash: hashToken(token) });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Invite already used or revoked' });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ error: 'Invite expired' });
    }
    if (invite.email !== normalizedEmail) {
      return res.status(400).json({ error: 'Invite email does not match' });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      role: invite.role || 'admin',
    });

    invite.status = 'accepted';
    invite.acceptedBy = user._id;
    invite.acceptedAt = new Date();
    await invite.save();

    await logAdminAction({
      actorId: invite.createdBy,
      action: 'admin_invite_accepted',
      entityType: 'AdminInvite',
      entityId: invite._id.toString(),
      details: { acceptedBy: user._id.toString() },
    });

    const tokenValue = issueAuthToken(user);
    res.status(201).json({ token: tokenValue, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

module.exports = router;
