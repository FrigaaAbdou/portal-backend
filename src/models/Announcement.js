const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    type: { type: String, enum: ['product_update', 'sponsor_spotlight', 'program_news', 'default'], default: 'default' },
    badge: { type: String, trim: true },
    audienceTags: [{ type: String, trim: true }],
    publishedAt: { type: Date, required: true },
    expiresAt: { type: Date },
    status: { type: String, enum: ['draft', 'scheduled', 'published'], default: 'draft' },
    cta: {
      label: { type: String, trim: true },
      url: { type: String, trim: true },
      ariaLabel: { type: String, trim: true },
    },
    image: { type: String, trim: true },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ status: 1, publishedAt: -1 });
AnnouncementSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
