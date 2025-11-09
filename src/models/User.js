const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['player', 'coach', 'admin'], required: true },
    subscriptionStatus: { type: String, enum: ['none', 'active', 'past_due', 'canceled'], default: 'none' },
    emailVerified: { type: Boolean, default: false },
    stripeCustomerId: { type: String, index: true },
    stripeSubscriptionId: { type: String, index: true },
    subscriptionCurrentPeriodEnd: { type: Date },
    subscriptionPriceId: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
