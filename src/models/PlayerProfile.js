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
    jucoCoach: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
    classYear: {
      type: String,
      enum: ['freshman', 'sophomore', ''],
      default: 'sophomore',
    },
    contactAccess: {
      type: String,
      enum: ['pending', 'authorized', 'revoked'],
      default: 'pending',
    },
    contactAccessUpdatedAt: { type: Date },

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

    verification: {
      status: {
        type: String,
        enum: ['none', 'email_pending', 'phone_pending', 'stats_pending', 'in_review', 'verified', 'needs_updates'],
        default: 'none',
      },
      email: {
        codeHash: { type: String },
        expiresAt: { type: Date },
        verifiedAt: { type: Date },
        lastSentAt: { type: Date },
      },
      phone: {
        number: { type: String, trim: true },
        codeHash: { type: String },
        expiresAt: { type: Date },
        verifiedAt: { type: Date },
        lastSentAt: { type: Date },
      },
      stats: {
        snapshot: { type: Object },
        attested: { type: Boolean, default: false },
        supportingFiles: [{ type: String }],
        submittedAt: { type: Date },
        reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewerNote: { type: String, trim: true, maxlength: 2000 },
        verifiedAt: { type: Date },
      },
      history: [
        {
          status: { type: String },
          note: { type: String, trim: true },
          actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      updatedAt: { type: Date },
    },
  },
  { timestamps: true }
);

PlayerProfileSchema.index({ positions: 1 });
PlayerProfileSchema.index({ division: 1, preferredLocation: 1 });
PlayerProfileSchema.index({ gpaNumeric: 1 });
PlayerProfileSchema.index({ verificationStatus: 1 });
PlayerProfileSchema.index({ budget: 1 });
PlayerProfileSchema.index({ jucoCoach: 1 });
PlayerProfileSchema.index({ contactAccess: 1 });

module.exports = mongoose.model('PlayerProfile', PlayerProfileSchema);
