const express = require('express');
const Website = require('../models/Website');
const Review = require('../models/Review');
const auth = require('../middleware/auth');

const router = express.Router();

// Get website data
router.get('/', async (req, res) => {
  try {
    const website = await Website.findOne();
    if (!website) return res.status(404).json({ message: 'Website data not found' });
    res.json(website);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create or update website data (admin only)
router.post('/', auth, async (req, res) => {
  try {
    const existingWebsite = await Website.findOne();
    if (existingWebsite) {
      const updatedWebsite = await Website.findByIdAndUpdate(existingWebsite._id, req.body, { new: true });
      res.json(updatedWebsite);
    } else {
      const website = new Website(req.body);
      const newWebsite = await website.save();
      res.status(201).json(newWebsite);
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update website data (admin only)
router.put('/', auth, async (req, res) => {
  try {
    const website = await Website.findOne();
    if (!website) return res.status(404).json({ message: 'Website data not found' });
    const updatedWebsite = await Website.findByIdAndUpdate(website._id, req.body, { new: true });
    res.json(updatedWebsite);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get approved reviews for homepage
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(10);
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
