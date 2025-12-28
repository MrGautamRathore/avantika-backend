const express = require('express');
const router = express.Router();
const MonthlyStats = require('../models/MonthlyStats');
const Contact = require('../models/Contact');
const Review = require('../models/Review');
const Package = require('../models/Package');
const Place = require('../models/Place');
const Blog = require('../models/Blog');
const auth = require('../middleware/auth');

// Get monthly stats
router.get('/monthly', auth, async (req, res) => {
  try {
    const stats = await MonthlyStats.find().sort({ year: -1, month: -1 });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching monthly stats', error: error.message });
  }
});

// Generate current month stats
router.post('/generate-current', auth, async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYear = now.getFullYear();

    // Check if stats already exist for current month
    const existingStats = await MonthlyStats.findOne({ month: currentMonth, year: currentYear });
    if (existingStats) {
      return res.status(400).json({ message: 'Stats already generated for current month' });
    }

    // Calculate stats
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
