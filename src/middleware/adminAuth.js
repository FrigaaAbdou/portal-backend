const auth = require('./auth');
const requireAdmin = require('./requireAdmin');

// Composes auth + admin check so admin routes can reuse a single middleware.
module.exports = function adminAuth(req, res, next) {
  return auth(req, res, () => requireAdmin(req, res, next));
};
