const CoachProfile = require('../models/CoachProfile');

module.exports = async function requireRecruiter(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.user.role === 'admin') {
      return next();
    }

    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'Recruiter access required' });
    }

    const coachProfile = await CoachProfile.findOne({ user: req.user.id }).select('coachType');
    if (!coachProfile) {
      return res.status(403).json({ error: 'Recruiter profile not found' });
    }

    if (coachProfile.coachType !== 'NCAA') {
      return res.status(403).json({ error: 'NCAA/NAIA recruiter access required' });
    }

    req.user.recruiter = { coachType: coachProfile.coachType };
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to verify recruiter access' });
  }
};
