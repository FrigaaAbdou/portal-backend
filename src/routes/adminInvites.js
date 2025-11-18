const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const AdminInvite = require('../models/AdminInvite');
const { logAdminAction } = require('../services/adminLogger');
const { generateToken, hashToken } = require('../utils/inviteTokens');

const router = express.Router();

const INVITE_TTL_HOURS = parseInt(process.env.ADMIN_INVITE_TTL_HOURS || '168', 10); // default 7 days

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const invites = await AdminInvite.find().sort({ createdAt: -1 }).lean();
    res.json({ data: invites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load invites' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const invite = await AdminInvite.create({
      email: email.toLowerCase(),
      tokenHash,
      expiresAt,
      createdBy: req.user.id,
    });

    await logAdminAction({
      actorId: req.user.id,
      action: 'admin_invite_created',
      entityType: 'AdminInvite',
      entityId: invite._id.toString(),
      details: { email: invite.email, expiresAt },
    });

    res.status(201).json({
      data: {
        id: invite._id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        token, // returned once so caller can send email
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

router.post('/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const invite = await AdminInvite.findById(id);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending invites can be revoked' });
    }
    invite.status = 'revoked';
    await invite.save();

    await logAdminAction({
      actorId: req.user.id,
      action: 'admin_invite_revoked',
      entityType: 'AdminInvite',
      entityId: invite._id.toString(),
      details: { email: invite.email },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

module.exports = router;
