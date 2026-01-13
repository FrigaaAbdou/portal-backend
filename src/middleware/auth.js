const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.sub) return res.status(401).json({ error: 'Invalid token' });
    const user = await User.findById(decoded.sub).select('role passwordChangedAt');
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.passwordChangedAt && decoded.iat) {
      const changedAt = new Date(user.passwordChangedAt).getTime();
      if (changedAt > decoded.iat * 1000) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }
    req.user = { id: user._id.toString(), role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
