const express = require('express');
const path = require('path');
const Announcement = require('../models/Announcement');

const router = express.Router();

const ANNOUNCEMENTS_PATH = path.resolve(
  __dirname,
  '../../client/src/data/announcements.json',
);

async function loadAnnouncements() {
  try {
    const docs = await Announcement.find({}).lean();
    if (docs && docs.length > 0) return docs;
  } catch (err) {
    console.error('Unable to load announcements from DB', err);
  }
  try {
    delete require.cache[ANNOUNCEMENTS_PATH];
    return require(ANNOUNCEMENTS_PATH);
  } catch (err) {
    console.error('Unable to load announcements config', err);
    return [];
  }
}

router.get('/', async (req, res) => {
  const includeExpired = req.query.includeExpired === 'true';
  const announcements = await loadAnnouncements();
  const now = Date.now();

  const payload = announcements
    .filter(
      (item) =>
        includeExpired || !item.expiresAt || new Date(item.expiresAt).getTime() >= now,
    )
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

  res.json({ data: payload });
});

module.exports = router;
