const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');

const router = express.Router();

router.use(adminAuth);

// List users with pagination and optional filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      role,
      search,
    } = req.query || {};

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 15, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const filter = {};
    if (role) filter.role = role;
    if (search) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.email = regex;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('email role subscriptionStatus createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      data: users,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// User detail
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('email role subscriptionStatus subscriptionCurrentPeriodEnd subscriptionPriceId stripeCustomerId stripeSubscriptionId createdAt updatedAt')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

module.exports = router;
