const mongoose = require('mongoose');

const StatsSchema = new mongoose.Schema(
  {
    games: { type: Number, default: 0 },
    gamesStarted: { type: Number, default: 0 },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
  },
  { _id: false }
);

const PlayerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    avatarUrl: { type: String, trim: true },
    coverUrl: { type: String, trim: true },
    jucoCoach: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    jucoCoachNote: { type: String, trim: true, maxlength: 2000 },
    jucoCoachNoteUpdatedAt: { type: Date },

    // Personal
    fullName: { type: String, trim: true },
    dob: { type: Date },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    heightFeet: { type: Number, min: 0, max: 9 },
    heightInches: { type: Number, min: 0, max: 11 },
    weightLbs: { type: Number, min: 0 },

    // Background
    school: { type: String, trim: true },
    schoolNormalized: { type: String, trim: true, lowercase: true, index: true },
    gpa: { type: String, trim: true },
    gpaNumeric: { type: Number, min: 0, max: 4 },
    positions: [{ type: String, trim: true }], // e.g., QB, RB, WR, ...
    highlightUrls: [{ type: String, trim: true }],
    bio: { type: String, trim: true, maxlength: 2000 },

    // Stats
    stats: { type: StatsSchema, default: () => ({}) },

    // Preferences
    division: {
      type: String,
      enum: ['NCAA D1', 'NCAA D2', 'NCAA D3', 'NAIA', 'NJCAA', ''],
      default: ''
    },
    budget: { type: Number, min: 0 },
    preferredLocation: { type: String, trim: true },

    // Verification (MVP)
    verificationStatus: { type: String, enum: ['none', 'requested', 'verified', 'rejected'], default: 'none' },
    verificationNote: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

PlayerProfileSchema.index({ positions: 1 });
PlayerProfileSchema.index({ division: 1, preferredLocation: 1 });
PlayerProfileSchema.index({ gpaNumeric: 1 });
PlayerProfileSchema.index({ verificationStatus: 1 });
PlayerProfileSchema.index({ budget: 1 });
PlayerProfileSchema.index({ jucoCoach: 1 });

module.exports = mongoose.model('PlayerProfile', PlayerProfileSchema);
