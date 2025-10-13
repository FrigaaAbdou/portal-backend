const mongoose = require('mongoose');

const FavoritePlayerSchema = new mongoose.Schema(
  {
    coach: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    note: { type: String, trim: true, maxlength: 2000 },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

FavoritePlayerSchema.index({ coach: 1, player: 1 }, { unique: true });

module.exports = mongoose.model('FavoritePlayer', FavoritePlayerSchema);
