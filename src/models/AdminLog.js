const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: String },
    details: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminLog', AdminLogSchema);
