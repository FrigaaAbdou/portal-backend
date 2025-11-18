const mongoose = require('mongoose');

const AdminInviteSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    role: { type: String, enum: ['admin'], default: 'admin' },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminInvite', AdminInviteSchema);
