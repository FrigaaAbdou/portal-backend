const CoachProfile = require('../models/CoachProfile');

module.exports = async function requireJucoCoach(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.user.role === 'admin') {
      return next();
    }

    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'JUCO coach access required' });
    }

    const coachProfile = await CoachProfile.findOne({ user: req.user.id }).select('coachType');
    if (!coachProfile) {
      return res.status(403).json({ error: 'Coach profile not found' });
    }

    if (coachProfile.coachType !== 'JUCO') {
      return res.status(403).json({ error: 'JUCO coach access required' });
    }

    req.user.juco = { coachType: coachProfile.coachType };
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to verify JUCO coach access' });
  }
};
