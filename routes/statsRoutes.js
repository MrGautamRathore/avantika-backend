const express = require('express');
const router = express.Router();
const MonthlyStats = require('../models/MonthlyStats');
const Contact = require('../models/Contact');
const Review = require('../models/Review');
const Package = require('../models/Package');
const Place = require('../models/Place');
const Blog = require('../models/Blog');
const auth = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');
const { monthlyStatsAdminTemplate } = require('../utils/emailTemplates');

// Get monthly stats
router.get('/monthly', auth, async (req, res) => {
  try {
    const stats = await MonthlyStats.find().sort({ year: -1, month: -1 });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching monthly stats', error: error.message });
  }
});

/**
 * Core logic extracted into its own function so both the HTTP route AND the
 * cron job (utils/cronJobs.js) can call it without duplicating code.
 * Returns the created stats doc, or null if it already existed.
 */
async function generateAndEmailMonthlyStats() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYear = now.getFullYear();

  const existingStats = await MonthlyStats.findOne({ month: currentMonth, year: currentYear });
  if (existingStats) return null;

  const totalContacts = await Contact.countDocuments();
  const totalReviews = await Review.countDocuments();
  const totalPackages = await Package.countDocuments();
  const totalPlaces = await Place.countDocuments();
  const totalBlogs = await Blog.countDocuments();
  const activePackages = await Package.countDocuments({ status: true });
  const activePlaces = await Place.countDocuments({ status: true });
  const publishedBlogs = await Blog.countDocuments({ published: true });
  const approvedReviews = await Review.countDocuments({ status: 'approved' });
  const respondedContacts = await Contact.countDocuments({ status: 'responded' });

  const stats = new MonthlyStats({
    month: currentMonth,
    year: currentYear,
    totalContacts,
    totalReviews,
    totalPackages,
    totalPlaces,
    totalBlogs,
    activePackages,
    activePlaces,
    publishedBlogs,
    approvedReviews,
    respondedContacts
  });

  await stats.save();

  // Pull previous month for growth comparison in the email
  let growth = {};
  const prevStats = await MonthlyStats.find().sort({ year: -1, month: -1 }).skip(1).limit(1);
  if (prevStats[0]) {
    const fields = [
      'totalContacts', 'totalReviews', 'totalPackages', 'totalPlaces', 'totalBlogs',
      'activePackages', 'activePlaces', 'publishedBlogs', 'approvedReviews', 'respondedContacts'
    ];
    fields.forEach((field) => {
      const current = stats[field] || 0;
      const previous = prevStats[0][field] || 0;
      growth[field] = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;
    });
  }

  if (process.env.ADMIN_EMAIL) {
    try {
      await sendEmail({
        email: process.env.ADMIN_EMAIL,
        subject: `Monthly Report — ${currentMonth} — Avantika Travels`,
        html: monthlyStatsAdminTemplate(stats, growth)
      });
    } catch (err) {
      console.error('Monthly stats email failed:', err.message);
    }
  }

  return stats;
}

// Generate current month stats (manual trigger, still available via admin panel)
router.post('/generate-current', auth, async (req, res) => {
  try {
    const stats = await generateAndEmailMonthlyStats();
    if (!stats) {
      return res.status(400).json({ message: 'Stats already generated for current month' });
    }
    res.json({ message: 'Monthly stats generated successfully', stats });
  } catch (error) {
    res.status(500).json({ message: 'Error generating monthly stats', error: error.message });
  }
});

// Get stats comparison (current vs previous month)
router.get('/comparison', auth, async (req, res) => {
  try {
    const stats = await MonthlyStats.find().sort({ year: -1, month: -1 }).limit(2);
    const comparison = {
      current: stats[0] || null,
      previous: stats[1] || null,
      growth: {}
    };

    if (comparison.current && comparison.previous) {
      const fields = [
        'totalContacts', 'totalReviews', 'totalPackages', 'totalPlaces', 'totalBlogs',
        'activePackages', 'activePlaces', 'publishedBlogs', 'approvedReviews', 'respondedContacts'
      ];

      fields.forEach(field => {
        const current = comparison.current[field] || 0;
        const previous = comparison.previous[field] || 0;
        comparison.growth[field] = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous * 100);
      });
    }

    res.json(comparison);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats comparison', error: error.message });
  }
});

module.exports = router;
module.exports.generateAndEmailMonthlyStats = generateAndEmailMonthlyStats;