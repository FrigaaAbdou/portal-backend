const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const PlayerProfile = require('../models/PlayerProfile');
const { notifyUser } = require('../services/notifyUser');
const { logAdminAction } = require('../services/adminLogger');

const router = express.Router();

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const { status = 'in_review', limit = 20, page = 1, division, jucoProgram, search, updatedBefore, updatedAfter } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const filter = {};
    if (status) filter['verification.status'] = status;
    if (division) filter.division = division;
    if (jucoProgram) filter.jucoCoach = jucoProgram;
    if (updatedBefore) filter['verification.updatedAt'] = { ...(filter['verification.updatedAt'] || {}), $lte: new Date(updatedBefore) };
    if (updatedAfter) filter['verification.updatedAt'] = { ...(filter['verification.updatedAt'] || {}), $gte: new Date(updatedAfter) };
    if (search) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ fullName: regex }, { school: regex }];
    }

    const [items, total] = await Promise.all([
      PlayerProfile.find(filter)
        .select('fullName school division jucoCoach verification status updatedAt verification.status verification.phone.verifiedAt phoneVerifiedAt')
        .skip(skip)
        .limit(safeLimit)
        .sort({ 'verification.updatedAt': -1 }),
      PlayerProfile.countDocuments(filter),
    ]);

    res.json({
      data: items,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load verifications' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const profile = await PlayerProfile.findById(req.params.id).populate('user', 'email role');
    if (!profile) return res.status(404).json({ error: 'Verification not found' });
    res.json({ data: profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load verification' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const profile = await PlayerProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Verification not found' });

    profile.verification = profile.verification || {};
    profile.verification.status = 'verified';
    profile.verification.stats = profile.verification.stats || {};
    profile.verification.stats.reviewerId = req.user.id;
    profile.verification.stats.reviewerNote = req.body.note || '';
    profile.verification.stats.verifiedAt = new Date();
    profile.verification.updatedAt = new Date();
    profile.verification.history = profile.verification.history || [];
    profile.verification.history.push({
      status: 'verified',
      note: req.body.note || '',
      actor: req.user.id,
      createdAt: new Date(),
    });
    await profile.save();

    await logAdminAction({
      actorId: req.user.id,
      action: 'verification_approved',
      entityType: 'PlayerProfile',
      entityId: profile._id.toString(),
      details: { reviewerNote: req.body.note || '' },
    });

    notifyUser(profile.user, 'Profile verified', 'Congratulations! Your Sportall profile has been verified by our team.').catch(() => {})

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve verification' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const { note } = req.body || {};
    if (!note) return res.status(400).json({ error: 'Rejection note is required' });

    const profile = await PlayerProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Verification not found' });

    profile.verification = profile.verification || {};
    profile.verification.status = 'needs_updates';
    profile.verification.stats = profile.verification.stats || {};
    profile.verification.stats.reviewerId = req.user.id;
    profile.verification.stats.reviewerNote = note;
    profile.verification.updatedAt = new Date();
    profile.verification.history = profile.verification.history || [];
    profile.verification.history.push({
      status: 'needs_updates',
      note,
      actor: req.user.id,
      createdAt: new Date(),
    });
    await profile.save();

    await logAdminAction({
      actorId: req.user.id,
      action: 'verification_rejected',
      entityType: 'PlayerProfile',
      entityId: profile._id.toString(),
      details: { note },
    });

    notifyUser(profile.user, 'Verification needs updates', `Reviewers left this note: ${note}. Please update your stats and resubmit.`).catch(() => {})

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject verification' });
  }
});

module.exports = router;
