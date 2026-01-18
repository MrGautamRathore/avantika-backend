const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const auth = require('../middleware/auth');

const router = express.Router();

// Register admin (only for initial setup)
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const admin = new Admin({ username, email, password });
    await admin.save();
    res.status(201).json({ message: 'Admin registered successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Login admin
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email }).maxTimeMS(30000);
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, admin: { id: admin._id, username: admin.username, email: admin.email } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get admin profile (protected)
router.get('/profile', auth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select('-password').maxTimeMS(30000);
    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
