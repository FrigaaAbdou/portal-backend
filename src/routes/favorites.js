const express = require('express');
const auth = require('../middleware/auth');
const requireRecruiter = require('../middleware/requireRecruiter');
const FavoritePlayer = require('../models/FavoritePlayer');
const PlayerProfile = require('../models/PlayerProfile');

const router = express.Router();

// List favorites for current coach
router.get('/', auth, requireRecruiter, async (req, res) => {
  try {
    const favorites = await FavoritePlayer.find({ coach: req.user.id })
      .sort({ createdAt: -1 })
      .populate('player', 'fullName avatarUrl school positions stats budget division preferredLocation gpa verificationStatus updatedAt');

    res.json(favorites.map((fav) => ({
      id: fav._id,
      note: fav.note || '',
      tags: fav.tags || [],
      createdAt: fav.createdAt,
      updatedAt: fav.updatedAt,
      player: fav.player,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load favorites' });
  }
});

// Add or update a favorite
router.post('/', auth, requireRecruiter, async (req, res) => {
  try {
    const { playerId, note, tags } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId is required' });

    const player = await PlayerProfile.findById(playerId).select('_id');
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const update = {};
    if (note !== undefined) update.note = note;
    if (Array.isArray(tags)) update.tags = tags.filter(Boolean);

    const favorite = await FavoritePlayer.findOneAndUpdate(
      { coach: req.user.id, player: player._id },
      { $set: update, $setOnInsert: { coach: req.user.id, player: player._id } },
      { new: true, upsert: true }
    ).populate('player', 'fullName avatarUrl school positions stats budget division preferredLocation gpa verificationStatus updatedAt');

    res.status(201).json({
      id: favorite._id,
      note: favorite.note || '',
      tags: favorite.tags || [],
      createdAt: favorite.createdAt,
      updatedAt: favorite.updatedAt,
      player: favorite.player,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save favorite' });
  }
});

// Update note/tags for a favorite
router.patch('/:id', auth, requireRecruiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { note, tags } = req.body || {};

    const update = {};
    if (note !== undefined) update.note = note;
    if (Array.isArray(tags)) update.tags = tags.filter(Boolean);

    const favorite = await FavoritePlayer.findOneAndUpdate(
      { _id: id, coach: req.user.id },
      { $set: update },
      { new: true }
    ).populate('player', 'fullName avatarUrl school positions stats budget division preferredLocation gpa verificationStatus updatedAt');

    if (!favorite) return res.status(404).json({ error: 'Favorite not found' });

    res.json({
      id: favorite._id,
      note: favorite.note || '',
      tags: favorite.tags || [],
      createdAt: favorite.createdAt,
      updatedAt: favorite.updatedAt,
      player: favorite.player,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});

// Remove a favorite by player id
router.delete('/:playerId', auth, requireRecruiter, async (req, res) => {
  try {
    const { playerId } = req.params;
    const favorite = await FavoritePlayer.findOneAndDelete({ coach: req.user.id, player: playerId });
    if (!favorite) return res.status(404).json({ error: 'Favorite not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

module.exports = router;
