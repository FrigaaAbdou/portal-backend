const express = require('express');
const auth = require('../middleware/auth');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const requireRecruiter = require('../middleware/requireRecruiter');
const requireJucoCoach = require('../middleware/requireJucoCoach');
const { normalizeInstitutionName } = require('../utils/normalize');

const router = express.Router();

function sanitizePlayerForRole(profile, role) {
  if (!profile) return null;
  const obj = profile.toObject ? profile.toObject() : { ...profile };
  if (role === 'player') {
    delete obj.jucoCoachNote;
    delete obj.jucoCoachNoteUpdatedAt;
  }
  return obj;
}

// Create or update the current user's player profile
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};
    const update = {};

    const directFields = [
      'fullName',
      'dob',
      'city',
      'state',
      'country',
      'heightFeet',
      'heightInches',
      'weightLbs',
      'school',
      'division',
      'budget',
      'preferredLocation',
      'avatarUrl',
      'coverUrl',
    ];

    directFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        update[field] = data[field];
      }
    });

    if (Object.prototype.hasOwnProperty.call(data, 'bio')) {
      update.bio = data.bio;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'positions')) {
      update.positions = Array.isArray(data.positions)
        ? data.positions.filter(Boolean)
        : [];
    }

    if (Object.prototype.hasOwnProperty.call(data, 'school')) {
      const normalized = normalizeInstitutionName(data.school);
      update.schoolNormalized = normalized || undefined;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'highlightUrls')) {
      update.highlightUrls = Array.isArray(data.highlightUrls)
        ? data.highlightUrls.filter(Boolean)
        : [];
    } else if (
      Object.prototype.hasOwnProperty.call(data, 'highlightUrl1') ||
      Object.prototype.hasOwnProperty.call(data, 'highlightUrl2')
    ) {
      update.highlightUrls = [data.highlightUrl1, data.highlightUrl2].filter(Boolean);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'gpa')) {
      update.gpa = data.gpa;
      const parsed = parseFloat(data.gpa);
      if (Number.isFinite(parsed)) {
        update.gpaNumeric = parsed;
      } else {
        update.gpaNumeric = null;
      }
    }

    const statsFields = ['games', 'gamesStarted', 'goals', 'assists', 'points'];
    if (statsFields.some((field) => Object.prototype.hasOwnProperty.call(data, field))) {
      statsFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          update[`stats.${field}`] = data[field];
        }
      });
    }

    if (Object.prototype.hasOwnProperty.call(data, 'verificationStatus')) {
      update.verificationStatus = data.verificationStatus;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'verificationNote')) {
      update.verificationNote = data.verificationNote;
    }

    const profile = await PlayerProfile.findOneAndUpdate(
      { user: userId },
      { $set: update, $setOnInsert: { user: userId } },
      { new: true, upsert: true }
    );

    await linkJucoCoachForPlayer(profile);

    const response = sanitizePlayerForRole(profile, req.user.role);
    res.status(200).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save player profile' });
  }
});

// Get current user's player profile
router.get('/me', auth, async (req, res) => {
  try {
    const profile = await PlayerProfile.findOne({ user: req.user.id });
    const response = sanitizePlayerForRole(profile, req.user.role);
    res.json(response || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch player profile' });
  }
});

// Update JUCO coach note for a player
router.patch('/:id/juco-note', auth, requireJucoCoach, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Player id is required' });

    const player = await PlayerProfile.findById(id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    await linkJucoCoachForPlayer(player);

    const coachProfile = await CoachProfile.findOne({ user: req.user.id }).select('programNameNormalized coachType');
    if (!coachProfile || coachProfile.coachType !== 'JUCO') {
      return res.status(403).json({ error: 'JUCO coach profile required' });
    }

    const playerSchool = player.schoolNormalized || (player.school ? normalizeInstitutionName(player.school) : '');
    const coachProgram = coachProfile.programNameNormalized || '';

    if (!coachProgram) {
      return res.status(400).json({ error: 'Coach program name is required to set notes' });
    }

    if (!playerSchool) {
      return res.status(400).json({ error: 'Player must have a school on file before adding notes' });
    }

    if (playerSchool !== coachProgram) {
      return res.status(403).json({ error: 'Player does not belong to your program' });
    }

    if (player.jucoCoach && player.jucoCoach.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Another coach manages this player' });
    }

    const words = String(note || '').trim().split(/\s+/).filter(Boolean);
    if (words.length > 200) {
      return res.status(400).json({ error: 'Note exceeds 200-word limit' });
    }

    const body = words.join(' ');

    player.jucoCoach = req.user.id;
    if (words.length === 0) {
      player.jucoCoachNote = undefined;
      player.jucoCoachNoteUpdatedAt = undefined;
    } else {
      player.jucoCoachNote = body;
      player.jucoCoachNoteUpdatedAt = new Date();
    }

    await player.save();

    return res.json({
      success: true,
      note: player.jucoCoachNote || '',
      updatedAt: player.jucoCoachNoteUpdatedAt || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update JUCO note' });
  }
});

// Get players assigned to the current JUCO coach
router.get('/juco/my-players', auth, requireJucoCoach, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query || {};
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [players, total] = await Promise.all([
      PlayerProfile.find({ jucoCoach: req.user.id })
        .select(
          'fullName avatarUrl coverUrl city state country gpa gpaNumeric school schoolNormalized positions stats budget division preferredLocation verificationStatus updatedAt jucoCoachNote jucoCoachNoteUpdatedAt'
        )
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      PlayerProfile.countDocuments({ jucoCoach: req.user.id }),
    ]);

    res.json({
      data: players,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load JUCO roster' });
  }
});

// List players (coach/admin access) with optional filters
router.get('/', auth, requireRecruiter, async (req, res) => {
  try {
    const {
      search,
      position,
      positions,
      division,
      location,
      verificationStatus,
      gpaMin,
      gpaMax,
      budgetMin,
      budgetMax,
      page = 1,
      limit = 20,
    } = req.query || {};

    const filter = {};

    const parseNumber = (value) => {
      const num = parseFloat(value);
      return Number.isFinite(num) ? num : null;
    };

    const parseList = (value) => {
      if (!value) return [];
      return String(value)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    };

    const positionList = parseList(positions || position);
    if (positionList.length > 0) {
      filter.positions = { $in: positionList };
    }

    if (division) {
      filter.division = division;
    }

    if (location) {
      filter.preferredLocation = location;
    }

    const verificationList = parseList(verificationStatus);
    if (verificationList.length > 0) {
      filter.verificationStatus = { $in: verificationList };
    }

    const gpaBounds = {};
    const parsedGpaMin = parseNumber(gpaMin);
    const parsedGpaMax = parseNumber(gpaMax);
    if (parsedGpaMin !== null) gpaBounds.$gte = parsedGpaMin;
    if (parsedGpaMax !== null) gpaBounds.$lte = parsedGpaMax;
    if (Object.keys(gpaBounds).length > 0) {
      filter.gpaNumeric = gpaBounds;
    }

    const budgetBounds = {};
    const parsedBudgetMin = parseNumber(budgetMin);
    const parsedBudgetMax = parseNumber(budgetMax);
    if (parsedBudgetMin !== null) budgetBounds.$gte = parsedBudgetMin;
    if (parsedBudgetMax !== null) budgetBounds.$lte = parsedBudgetMax;
    if (Object.keys(budgetBounds).length > 0) {
      filter.budget = budgetBounds;
    }

    if (search && String(search).trim()) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { fullName: regex },
        { school: regex },
        { city: regex },
        { state: regex },
      ];
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [players, total] = await Promise.all([
      PlayerProfile.find(filter)
        .select('fullName avatarUrl coverUrl city state country gpa gpaNumeric school schoolNormalized positions stats budget division preferredLocation verificationStatus updatedAt jucoCoach jucoCoachNote jucoCoachNoteUpdatedAt')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      PlayerProfile.countDocuments(filter),
    ]);

    res.json({
      data: players,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list players' });
  }
});

// Get full profile for a specific player (recruiter access)
router.get('/:id', auth, requireRecruiter, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Player id is required' });
    }

    const profile = await PlayerProfile.findById(id)
      .select(
        'user avatarUrl coverUrl fullName dob city state country heightFeet heightInches weightLbs school schoolNormalized gpa gpaNumeric positions highlightUrls bio stats division budget preferredLocation verificationStatus verificationNote createdAt updatedAt jucoCoach jucoCoachNote jucoCoachNoteUpdatedAt'
      )
      .populate('user', 'email role');

    if (!profile) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ data: profile });
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.status(500).json({ error: 'Failed to fetch player profile' });
  }
});

module.exports = router;

async function linkJucoCoachForPlayer(profile) {
  if (!profile) return null;
  let normalizedSchool = profile.schoolNormalized;
  try {
    if (!normalizedSchool && profile.school) {
      normalizedSchool = normalizeInstitutionName(profile.school);
      if (normalizedSchool) {
        profile.schoolNormalized = normalizedSchool;
        await profile.save();
      }
    }
  } catch (err) {
    console.error('Failed to normalize school name for player', err);
  }

  if (!normalizedSchool) {
    if (profile.jucoCoach) {
      profile.jucoCoach = undefined;
      profile.jucoCoachNote = undefined;
      profile.jucoCoachNoteUpdatedAt = undefined;
      await profile.save();
    }
    return profile;
  }

  try {
    const coach = await CoachProfile.findOne({
      coachType: 'JUCO',
      programNameNormalized: normalizedSchool,
    }).select('user');

    if (!coach) {
      if (profile.jucoCoach) {
        profile.jucoCoach = undefined;
        profile.jucoCoachNote = undefined;
        profile.jucoCoachNoteUpdatedAt = undefined;
        await profile.save();
      }
      return profile;
    }

    const currentCoachId = profile.jucoCoach ? profile.jucoCoach.toString() : null;
    const nextCoachId = coach.user ? coach.user.toString() : null;

    if (nextCoachId && currentCoachId !== nextCoachId) {
      profile.jucoCoach = coach.user;
      await profile.save();
    }

    return profile;
  } catch (err) {
    console.error('Failed to link JUCO coach', err);
    return profile;
  }
}
