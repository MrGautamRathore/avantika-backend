const mongoose = require('mongoose');

const monthlyStatsSchema = new mongoose.Schema({
  month: { type: String, required: true }, // Format: YYYY-MM
  year: { type: Number, required: true },
  totalContacts: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  totalPackages: { type: Number, default: 0 },
  totalPlaces: { type: Number, default: 0 },
  totalBlogs: { type: Number, default: 0 },
  activePackages: { type: Number, default: 0 },
  activePlaces: { type: Number, default: 0 },
  publishedBlogs: { type: Number, default: 0 },
  approvedReviews: { type: Number, default: 0 },
  respondedContacts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Compound index to ensure unique month-year combination
monthlyStatsSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyStats', monthlyStatsSchema);
