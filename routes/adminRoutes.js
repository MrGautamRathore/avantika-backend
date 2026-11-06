const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Booking = require('../models/Booking');
const CustomBooking = require('../models/CustomBooking');
const Contact = require('../models/Contact');
const Review = require('../models/Review');
const auth = require('../middleware/auth');

const { authenticate, adminOnly } = auth;
const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,59}$/u;
const OID_RE = /^[a-f0-9]{24}$/i;

const DAY_MS = 24 * 3600 * 1000;
const IST_MS = 5.5 * 3600 * 1000;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 72) return 'Password must be 72 characters or less';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number';
  return null;
}

function publicUser(u) {
  const role = u.role === 'staff' ? 'staff' : 'admin';
  return {
    id: u._id,
    username: u.username,
    name: u.username,
    email: u.email,
    role,
    permissions: Admin.normalizePermissions(u.permissions, role === 'admin'),
    isActive: u.isActive !== false,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
    lastSeenAt: u.lastSeenAt || null
  };
}

// Takes only known keys with real boolean values from the request body.
function pickPermissions(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Admin.PERMISSION_KEYS.forEach((key) => {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  });
  return out;
}

// NOTE: there is no public /register route on purpose.
// Staff accounts are created only by a logged-in admin (POST /staff below).
// The very first admin is created with: node scripts/createAdmin.js

// -----------------------------------------------------------------------------
// Login (admin + staff)
// -----------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server is not configured correctly' });
    }

    const user = await Admin.findOne({
      email: { $in: [email, email.toLowerCase()] }
    }).maxTimeMS(30000);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Your account is deactivated. Please contact the admin.' });
    }

    const role = user.role === 'staff' ? 'staff' : 'admin';
    const token = jwt.sign({ id: user._id, role }, process.env.JWT_SECRET, {
      expiresIn: role === 'staff' ? '12h' : '1d'
    });

    const now = new Date();
    await Admin.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, lastSeenAt: now } });
    user.lastLoginAt = now;
    user.lastSeenAt = now;

    res.json({ token, admin: publicUser(user) });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// -----------------------------------------------------------------------------
// Profile (admin + staff) - used by the admin layout to verify the session,
// role and the latest access switches
// -----------------------------------------------------------------------------
router.get('/profile', authenticate, async (req, res) => {
  res.json(publicUser(req.admin));
});

// -----------------------------------------------------------------------------
// STAFF MANAGEMENT (admin only)
// -----------------------------------------------------------------------------

// Register a new staff member (with the access the admin chose)
router.post('/staff', adminOnly, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().replace(/\s+/g, ' ');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const errors = {};
    if (!NAME_RE.test(username)) errors.username = 'Enter a valid full name (letters only, 2-60 characters)';
    if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Enter a valid email address';
    const pwErr = validatePassword(password);
    if (pwErr) errors.password = pwErr;

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: Object.values(errors)[0], errors });
    }

    const exists = await Admin.findOne({ $or: [{ email }, { username }] }).lean();
    if (exists) {
      const field = exists.email === email ? 'email' : 'username';
      return res.status(409).json({
        message: field === 'email' ? 'An account with this email already exists' : 'This name is already used by another account',
        errors: { [field]: 'Already in use' }
      });
    }

    const staff = new Admin({
      username,
      email,
      password,
      role: 'staff',
      permissions: Admin.normalizePermissions(pickPermissions(req.body?.permissions)),
      isActive: true,
      createdBy: req.admin._id
    });
    await staff.save();

    res.status(201).json({ message: 'Staff account created', staff: publicUser(staff) });
  } catch (error) {
    console.error('Create staff error:', error.message);
    res.status(500).json({ message: 'Could not create staff account' });
  }
});

// List staff
router.get('/staff', adminOnly, async (req, res) => {
  try {
    const staff = await Admin.find({ role: 'staff' }).sort({ createdAt: -1 }).lean();
    res.json({ staff: staff.map(publicUser) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load staff list' });
  }
});

// Activate / deactivate, rename, reset password, or change access of a staff member
router.patch('/staff/:id', adminOnly, async (req, res) => {
  try {
    if (!OID_RE.test(req.params.id)) return res.status(404).json({ message: 'Staff not found' });

    const staff = await Admin.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    if (req.body?.isActive !== undefined) {
      staff.isActive = Boolean(req.body.isActive);
    }

    if (req.body?.username !== undefined) {
      const username = String(req.body.username).trim().replace(/\s+/g, ' ');
      if (!NAME_RE.test(username)) return res.status(400).json({ message: 'Enter a valid full name' });
      const clash = await Admin.findOne({ username, _id: { $ne: staff._id } }).lean();
      if (clash) return res.status(409).json({ message: 'This name is already used by another account' });
      staff.username = username;
    }

    if (req.body?.permissions !== undefined) {
      const changes = pickPermissions(req.body.permissions);
      Object.keys(changes).forEach((key) => staff.set(`permissions.${key}`, changes[key]));
    }

    if (req.body?.password) {
      const pwErr = validatePassword(String(req.body.password));
      if (pwErr) return res.status(400).json({ message: pwErr });
      staff.password = String(req.body.password); // hashed by the pre-save hook
    }

    await staff.save();
    res.json({ message: 'Staff account updated', staff: publicUser(staff) });
  } catch (error) {
    console.error('Update staff error:', error.message);
    res.status(500).json({ message: 'Could not update staff account' });
  }
});

// Delete a staff member (their bookings stay in the database)
router.delete('/staff/:id', adminOnly, async (req, res) => {
  try {
    if (!OID_RE.test(req.params.id)) return res.status(404).json({ message: 'Staff not found' });
    const staff = await Admin.findOneAndDelete({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    res.json({ message: 'Staff account deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete staff account' });
  }
});

// -----------------------------------------------------------------------------
// DASHBOARD (admin only)
// GET /api/admin/dashboard-stats?days=7|30|90
// -----------------------------------------------------------------------------
function istDayKeys(n) {
  const keys = [];
  const nowIst = Date.now() + IST_MS;
  for (let i = n - 1; i >= 0; i--) {
    keys.push(new Date(nowIst - i * DAY_MS).toISOString().slice(0, 10));
  }
  return keys;
}

// Counts documents per IST day. Falls back to the ObjectId time if a doc has no createdAt.
async function dailyCounts(Model, since) {
  return Model.aggregate([
    { $addFields: { _ts: { $ifNull: ['$createdAt', { $toDate: '$_id' }] } } },
    { $match: { _ts: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$_ts', timezone: 'Asia/Kolkata' } },
        count: { $sum: 1 }
      }
    }
  ]);
}

function mergeCounts(lists) {
  const map = {};
  lists.flat().forEach((row) => {
    map[row._id] = (map[row._id] || 0) + row.count;
  });
  return map;
}

const tsOf = (doc) => doc.createdAt || (doc._id && doc._id.getTimestamp ? doc._id.getTimestamp() : null);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

router.get('/dashboard-stats', adminOnly, async (req, res) => {
  try {
    const requested = Number(req.query.days);
    const days = [7, 30, 90].includes(requested) ? requested : 30;

    // Current period + the period before it (for the up/down percentage)
    const keys = istDayKeys(days * 2);
    const since = new Date(`${keys[0]}T00:00:00+05:30`);

    // If both booking models point to the same collection, count it only once
    const bookingModels =
      Booking.collection.name === CustomBooking.collection.name ? [Booking] : [Booking, CustomBooking];

    const [bookingRows, contactRows, reviewRows, reviewAgg, pendingBookings, pendingContacts] = await Promise.all([
      Promise.all(bookingModels.map((M) => dailyCounts(M, since))),
      dailyCounts(Contact, since),
      dailyCounts(Review, since),
      Review.aggregate([{ $group: { _id: null, total: { $sum: 1 }, avg: { $avg: '$rating' } } }]),
      Booking.countDocuments({ status: 'pending', isCustomBooking: { $ne: true } }),
      Contact.countDocuments({ status: 'pending' })
    ]);

    const bookingMap = mergeCounts(bookingRows);
    const contactMap = mergeCounts([contactRows]);
    const reviewMap = mergeCounts([reviewRows]);

    const toSeries = (map) => keys.map((k) => map[k] || 0);
    const all = {
      bookings: toSeries(bookingMap),
      contacts: toSeries(contactMap),
      reviews: toSeries(reviewMap)
    };

    const labels = keys.slice(days);
    const series = {};
    const totals = {};
    Object.keys(all).forEach((name) => {
      series[name] = all[name].slice(days);
      totals[name] = { current: sum(all[name].slice(days)), previous: sum(all[name].slice(0, days)) };
    });

    // Latest activity
    const recentOf = async (Model, limit = 5) => Model.find().sort({ _id: -1 }).limit(limit).lean();
    const [recentBookingLists, recentContacts, recentReviews, staffDocs] = await Promise.all([
      Promise.all(bookingModels.map((M) => recentOf(M))),
      recentOf(Contact),
      recentOf(Review),
      Admin.find({ role: 'staff' }).sort({ isActive: -1, lastSeenAt: -1 }).limit(20).lean()
    ]);

    const recentBookings = recentBookingLists
      .flat()
      .map((b) => ({
        id: b._id,
        name: b.customerFullName || b.name || 'Customer',
        title: b.packageName || b.serviceName || 'Custom inquiry',
        status: b.status || 'pending',
        at: tsOf(b)
      }))
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 5);

    const now = Date.now();
    const members = staffDocs.map((s) => {
      const perms = Admin.normalizePermissions(s.permissions);
      const seen = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
      return {
        id: s._id,
        name: s.username,
        isActive: s.isActive !== false,
        online: s.isActive !== false && seen > 0 && now - seen < ONLINE_WINDOW_MS,
        lastSeenAt: s.lastSeenAt || s.lastLoginAt || null,
        accessCount: Object.values(perms).filter(Boolean).length,
        accessTotal: Admin.PERMISSION_KEYS.length
      };
    });

    res.json({
      days,
      labels,
      series,
      totals,
      pending: { bookings: pendingBookings, contacts: pendingContacts },
      reviews: {
        total: reviewAgg[0]?.total || 0,
        average: reviewAgg[0]?.avg != null ? Number(reviewAgg[0].avg.toFixed(1)) : null
      },
      recent: {
        bookings: recentBookings,
        contacts: recentContacts.map((c) => ({
          id: c._id,
          name: c.name || 'Visitor',
          title: c.subject || 'New inquiry',
          status: c.status || 'pending',
          at: tsOf(c)
        })),
        reviews: recentReviews.map((r) => ({
          id: r._id,
          name: r.name || r.userName || r.author || 'Guest',
          rating: r.rating != null ? Number(r.rating) : null,
          title: String(r.comment || r.review || r.message || '').slice(0, 90),
          at: tsOf(r)
        }))
      },
      staff: {
        total: members.length,
        active: members.filter((m) => m.isActive).length,
        online: members.filter((m) => m.online).length,
        members
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error.message);
    res.status(500).json({ message: 'Could not load dashboard data' });
  }
});

module.exports = router;