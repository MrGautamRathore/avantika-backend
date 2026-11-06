const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Which sections a staff member can open / edit.
// Admin can switch each one on or off per staff member.
const PERMISSION_DEFAULTS = {
  createBooking: true, // create + manage own booking links (the original staff role)
  bookings: false,
  contacts: false,
  reviews: false,
  packages: false,
  blogs: false,
  gallery: false,
  places: false // destinations
};
const PERMISSION_KEYS = Object.keys(PERMISSION_DEFAULTS);

const permissionsShape = {};
PERMISSION_KEYS.forEach((key) => {
  permissionsShape[key] = { type: Boolean, default: PERMISSION_DEFAULTS[key] };
});

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  // 'admin' = full access, 'staff' = only the sections enabled in `permissions`
  role: { type: String, enum: ['admin', 'staff'], default: 'admin' },
  permissions: permissionsShape,
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  lastLoginAt: { type: Date },
  lastSeenAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);

Admin.PERMISSION_KEYS = PERMISSION_KEYS;
Admin.PERMISSION_DEFAULTS = PERMISSION_DEFAULTS;

// Always returns a full { key: boolean } map (works for lean docs and old docs too).
Admin.normalizePermissions = function (perms, allTrue = false) {
  const out = {};
  PERMISSION_KEYS.forEach((key) => {
    if (allTrue) out[key] = true;
    else if (perms && typeof perms[key] === 'boolean') out[key] = perms[key];
    else out[key] = PERMISSION_DEFAULTS[key];
  });
  return out;
};

module.exports = Admin;