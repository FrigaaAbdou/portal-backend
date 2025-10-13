const mongoose = require('mongoose');

const CoachProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

    coachType: { type: String, enum: ['JUCO', 'NCAA'], required: true },

    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    roleTitle: { type: String, trim: true },
    programName: { type: String, trim: true },
    programNameNormalized: { type: String, trim: true, lowercase: true, index: true },
    programCity: { type: String, trim: true },
    programState: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 2000 },
    recruitingBudgetRange: { type: String, trim: true },
    priorityPositions: [{ type: String, trim: true }],
    minGpa: { type: String, trim: true },
    otherCriteria: { type: String, trim: true, maxlength: 2000 },

    // JUCO fields
    jucoRole: { type: String, trim: true }, // Head Coach | Assistant Coach
    jucoProgram: { type: String, trim: true },
    jucoLeague: { type: String, trim: true }, // NJCAA | CCCAA | NWAC
    jucoCity: { type: String, trim: true },
    jucoState: { type: String, trim: true },
    jucoPhone: { type: String, trim: true },
    jucoEmail: { type: String, trim: true },
    jucoExperience: { type: String, trim: true },

    // JUCO verification
    hasCertification: { type: String, enum: ['', 'Yes', 'No'], default: '' },
    verifyNote: { type: String, trim: true },
    acceptAccuracy: { type: Boolean, default: false },
    acceptLegal: { type: Boolean, default: false },

    // NCAA / NAIA fields
    uniProgram: { type: String, trim: true },
    division: { type: String, enum: ['NCAA D1', 'NCAA D2', 'NCAA D3', 'NAIA', ''], default: '' },
    conference: { type: String, trim: true },
    position: { type: String, trim: true }, // legacy field (optional)
    uniAddress: { type: String, trim: true },
    uniPhone: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CoachProfile', CoachProfileSchema);
