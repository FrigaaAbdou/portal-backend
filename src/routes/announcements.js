const express = require('express');
const path = require('path');

const router = express.Router();

const ANNOUNCEMENTS_PATH = path.resolve(
  __dirname,
  '../../client/src/data/announcements.json',
);

function loadAnnouncements() {
  try {
    // Node caches JSON imports, so we clear it to pick up manual edits quickly.
    delete require.cache[ANNOUNCEMENTS_PATH];
    return require(ANNOUNCEMENTS_PATH);
  } catch (err) {
    console.error('Unable to load announcements config', err);
    return [];
  }
}

router.get('/', (req, res) => {
  const includeExpired = req.query.includeExpired === 'true';
  const announcements = loadAnnouncements();
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
