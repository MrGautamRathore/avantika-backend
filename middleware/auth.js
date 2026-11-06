const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const SEEN_THROTTLE_MS = 2 * 60 * 1000;

// Verifies the JWT and loads the logged-in user (admin OR staff).
// Sets: req.admin (the user document) and req.userRole ('admin' | 'staff').
// The role and permissions are read fresh from the database on every request,
// so switching an access off or deactivating an account works immediately.
const authenticate = async (req, res, next) => {
  let user;
  try {
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    user = await Admin.findById(decoded.id).maxTimeMS(30000);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed' });
  }

  req.admin = user;
  // Old admin documents have no role field -> treat them as admin
  req.userRole = user.role === 'staff' ? 'staff' : 'admin';

  // "Online now" indicator for the dashboard (throttled, never blocks the request)
  const now = Date.now();
  if (!user.lastSeenAt || now - new Date(user.lastSeenAt).getTime() > SEEN_THROTTLE_MS) {
    Admin.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {});
  }

  next();
};

// Admin only. This is the DEFAULT export so every existing route that does
// `const auth = require('../middleware/auth')` stays admin-only.
// Every DELETE route keeps using this, so a staff token can never delete anything.
const adminOnly = (req, res, next) => {
  authenticate(req, res, () => {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  });
};

// Admin always passes. Staff passes only if the admin switched this access ON.
// Use it for create / update routes: requirePermission('packages')
const requirePermission = (key) => {
  if (!Admin.PERMISSION_KEYS.includes(key)) {
    throw new Error(`Unknown permission "${key}". Allowed: ${Admin.PERMISSION_KEYS.join(', ')}`);
  }
  return (req, res, next) => {
    authenticate(req, res, () => {
      if (req.userRole === 'admin') return next();
      if (req.admin.permissions && req.admin.permissions[key] === true) return next();
      return res.status(403).json({ message: 'You do not have access to this section' });
    });
  };
};

module.exports = adminOnly;
module.exports.authenticate = authenticate; // any active admin or staff
module.exports.adminOnly = adminOnly;
module.exports.requirePermission = requirePermission;