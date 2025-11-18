const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const Announcement = require('../models/Announcement');

const router = express.Router();

router.use(adminAuth);

// List announcements (admin)
router.get('/', async (req, res) => {
  try {
    const { status, includeExpired } = req.query || {};
    const filter = {};
    if (status) filter.status = status;
    if (includeExpired !== 'true') {
      filter.$or = [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: new Date() } }];
    }
    const items = await Announcement.find(filter).sort({ publishedAt: -1 }).lean();
    res.json({ data: items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

// Create announcement
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title || !payload.summary) {
      return res.status(400).json({ error: 'title and summary are required' });
    }
    const doc = await Announcement.create({
      ...payload,
      publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : new Date(),
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
    });
    res.status(201).json({ data: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Update announcement
router.put('/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    if (payload.publishedAt) payload.publishedAt = new Date(payload.publishedAt);
    if (payload.expiresAt) payload.expiresAt = new Date(payload.expiresAt);

    const updated = await Announcement.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Delete announcement
router.delete('/:id', async (req, res) => {
  try {
    const removed = await Announcement.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

module.exports = router;
