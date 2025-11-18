const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminInvite = require('../models/AdminInvite');
const { hashToken } = require('../utils/inviteTokens');
const { logAdminAction } = require('../services/adminLogger');
const auth = require('../middleware/auth');

const router = express.Router();

function issueAuthToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
}

function isAllowedPublicRole(role) {
  return ['player', 'coach'].includes(role);
}

// Register user (player or coach)
router.post('/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'email, password, role are required' });
    if (!isAllowedPublicRole(role)) {
      return res.status(403).json({ error: 'Role not allowed' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, role });
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
    const user = await User.findOne({ email: (email || '').toLowerCase() });
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
    if (invite.email !== email.toLowerCase()) {
      return res.status(400).json({ error: 'Invite email does not match' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(),
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
