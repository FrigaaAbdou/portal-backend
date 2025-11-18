const express = require('express');
const auth = require('../middleware/auth');
const CoachProfile = require('../models/CoachProfile');
const PlayerProfile = require('../models/PlayerProfile');
const { normalizeInstitutionName } = require('../utils/normalize');

const router = express.Router();

// Create/update current user's coach profile
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};
    const update = {};

    const directFields = [
      'coachType',
      'firstName',
      'lastName',
      'phone',
      'website',
      'roleTitle',
      'programName',
      'programCity',
      'programState',
      'bio',
      'recruitingBudgetRange',
      'minGpa',
      'otherCriteria',
      'jucoRole',
      'jucoProgram',
      'jucoLeague',
      'jucoCity',
      'jucoState',
      'jucoPhone',
      'jucoEmail',
      'jucoExperience',
      'hasCertification',
      'verifyNote',
      'acceptAccuracy',
      'acceptLegal',
      'uniProgram',
      'division',
      'conference',
      'position',
      'uniAddress',
      'uniPhone',
    ];

    directFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        update[field] = data[field];
      }
    });

    if (Object.prototype.hasOwnProperty.call(data, 'priorityPositions')) {
      update.priorityPositions = Array.isArray(data.priorityPositions)
        ? data.priorityPositions.filter(Boolean)
        : [];
    }

    if (Object.prototype.hasOwnProperty.call(data, 'programName')) {
      const normalized = normalizeInstitutionName(data.programName);
      update.programNameNormalized = normalized || undefined;
    }

    const profile = await CoachProfile.findOneAndUpdate(
      { user: userId },
      { $set: update, $setOnInsert: { user: userId } },
      { new: true, upsert: true }
    );

    await linkPlayersToJucoCoach(profile);
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save coach profile' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const profile = await CoachProfile.findOne({ user: req.user.id });
    res.json(profile || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch coach profile' });
  }
});



async function linkPlayersToJucoCoach(coachProfile) {
  if (!coachProfile) return;
  if (coachProfile.coachType !== 'JUCO') return;
  let normalized = coachProfile.programNameNormalized;
  try {
    if (!normalized && coachProfile.programName) {
      normalized = normalizeInstitutionName(coachProfile.programName);
      if (normalized) {
        coachProfile.programNameNormalized = normalized;
        await coachProfile.save();
      }
    }
  } catch (err) {
    console.error('Failed to normalize JUCO program name', err);
  }
  if (!normalized) return;

  try {
    await PlayerProfile.updateMany(
      { schoolNormalized: normalized },
      {
        $set: {
          jucoCoach: coachProfile.user,
        },
      }
    );

    await PlayerProfile.updateMany(
      {
        jucoCoach: coachProfile.user,
        schoolNormalized: { $ne: normalized },
      },
      {
        $unset: {
          jucoCoach: '',
          jucoCoachNote: '',
          jucoCoachNoteUpdatedAt: '',
        },
      }
    );
  } catch (err) {
    console.error('Failed to link JUCO coach to players', err);
  }
}

module.exports = router;
