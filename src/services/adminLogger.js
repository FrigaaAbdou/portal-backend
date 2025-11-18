const AdminLog = require('../models/AdminLog');

async function logAdminAction({ actorId, action, entityType, entityId, details }) {
  try {
    if (!actorId || !action) return null;
    return await AdminLog.create({
      actor: actorId,
      action,
      entityType: entityType || null,
      entityId: entityId || null,
      details: details || null,
    });
  } catch (err) {
    console.error('Admin log failed', err);
    return null;
  }
}

module.exports = {
  logAdminAction,
};
