const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Booking = require('../models/CustomBooking');
const Admin = require('../models/Admin');
const auth = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');
const {
  newBookingAdminTemplate,
  bookingConfirmationUserTemplate
} = require('../utils/emailTemplates');

const { adminOnly, requirePermission } = auth;
const authenticate = requirePermission('createBooking');
const router = express.Router();

// IMPORTANT: never let the browser cache these responses.
// Chrome caches "410 Gone" (used for expired links) with NO expiry, so a customer whose link
// was re-activated kept seeing the old "expired" answer from their own browser cache.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
const LINK_VALIDITY_MINUTES = Number(process.env.BOOKING_LINK_MINUTES) || 10;
// Default advance suggested to staff. Client's T&C (1.1) says 20%.
const DEFAULT_ADVANCE_PERCENT = Number(process.env.DEFAULT_ADVANCE_PERCENT) || 20;
// false (default): customer is allowed if IP matches OR it is the same browser/device.
// true: IP must match exactly.
const STRICT_IP_LOCK = process.env.STRICT_IP_LOCK === 'true';
const IS_PROD = process.env.NODE_ENV === 'production';
// Razorpay API base URL. Default is the standard Razorpay endpoint.
// Set RAZORPAY_API_BASE in env only if your dashboard gives a different endpoint.
const RZP_API_BASE = (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/+$/, '');

const TOKEN_RE = /^[a-f0-9]{32}$/;
const OID_RE = /^[a-f0-9]{24}$/i;
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,79}$/u;
const DEAL_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/]{2,29}$/;

const PRE_OPEN_STATUSES = ['pending', 'link_copied', 'sent_to_customer'];
const STAFF_SETTABLE = ['pending', 'link_copied', 'sent_to_customer', 'cancelled'];
const ADMIN_SETTABLE = [
  ...STAFF_SETTABLE,
  'opened',
  'submitted',
  'confirmed',
  'completed',
  'expired'
];

// -----------------------------------------------------------------------------
// SMALL HELPERS
// -----------------------------------------------------------------------------
function scrub(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

function cleanText(v, max = 500) {
  return scrub(v).slice(0, max);
}

function normalizeMobile(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(-10);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

function parseDateOnly(v) {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return { date: d, str: s };
}

function istToday() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function getBaseUrl(req) {
  const base = process.env.SITE_URL || process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:3000';
  return String(base).replace(/\/+$/, '');
}

function getClientIp(req) {
  const raw =
    req.headers['x-vercel-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.ip ||
    (req.socket && req.socket.remoteAddress) ||
    '';
  let ip = String(raw).split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return (ip || 'unknown').slice(0, 64);
}

function hashDevice(raw) {
  const t = String(raw || '').trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(t)) return '';
  return crypto.createHash('sha256').update(t).digest('hex');
}

function amountsOf(b) {
  const total = Number(b.totalPackageAmount || b.totalPrice || 0);
  const advance = Number(b.advanceAmountRequired || b.advancePayment || Math.round(total * DEFAULT_ADVANCE_PERCENT / 100));
  return { total, advance, balance: Math.max(0, total - advance) };
}

function isRazorpayConfigured() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(id && secret && !id.includes('your_key') && !secret.includes('your_secret'));
}

function rzpAuthHeader() {
  return 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
}

async function generateDealId() {
  for (let i = 0; i < 5; i++) {
    const id = `AT-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!(await Booking.exists({ dealId: id }))) return id;
  }
  return `AT-${Date.now().toString().slice(-8)}`;
}

// -----------------------------------------------------------------------------
// INPUT VALIDATION (staff / admin booking form)
// -----------------------------------------------------------------------------
function validateBookingInput(b, actor) {
  const errors = {};
  const d = {};

  const text = (key, max, required, label) => {
    const v = scrub(b[key]);
    if (required && !v) errors[key] = `${label} is required`;
    else if (v.length > max) errors[key] = `${label} is too long (max ${max} characters)`;
    d[key] = v.slice(0, max);
    return d[key];
  };

  // Booking details
  const dealId = scrub(b.dealId);
  if (dealId && !DEAL_RE.test(dealId)) {
    errors.dealId = 'Deal ID can have only letters, numbers, - _ / (3 to 30 characters)';
  }
  d.dealId = dealId;

  const bd = b.bookingDate ? parseDateOnly(b.bookingDate) : null;
  if (b.bookingDate && !bd) errors.bookingDate = 'Enter a valid booking date';
  d.bookingDate = bd ? bd.date : new Date();

  const sales = scrub(b.salesExecutiveName) || (actor && actor.username) || '';
  if (!NAME_RE.test(sales)) errors.salesExecutiveName = 'Enter a valid sales executive name';
  d.salesExecutiveName = sales.slice(0, 80);

  const custName = scrub(b.customerFullName).replace(/\s+/g, ' ');
  if (!NAME_RE.test(custName)) errors.customerFullName = 'Enter the customer full name (letters only)';
  d.customerFullName = custName.slice(0, 80);

  const mobile = normalizeMobile(b.mobileNumber);
  if (!MOBILE_RE.test(mobile)) errors.mobileNumber = 'Enter a valid 10-digit Indian mobile number';
  d.mobileNumber = mobile;

  const email = scrub(b.customerEmail).toLowerCase();
  if (email && (!EMAIL_RE.test(email) || email.length > 120)) errors.customerEmail = 'Enter a valid email address';
  d.customerEmail = email;

  const start = parseDateOnly(b.travelStartDate);
  const end = parseDateOnly(b.travelEndDate);
  if (!start) errors.travelStartDate = 'Enter a valid travel start date';
  else if (start.str < istToday()) errors.travelStartDate = 'Travel start date cannot be in the past';
  if (!end) errors.travelEndDate = 'Enter a valid travel end date';
  else if (start && end.str < start.str) errors.travelEndDate = 'End date cannot be before the start date';
  else if (start && end && (end.date - start.date) / 86400000 > 60) errors.travelEndDate = 'Trip cannot be longer than 60 days';
  if (start) d.travelStartDate = start.date;
  if (end) d.travelEndDate = end.date;

  const adults = Number(b.numberOfAdults);
  if (!Number.isInteger(adults) || adults < 1 || adults > 50) errors.numberOfAdults = 'Adults must be a whole number between 1 and 50';
  d.numberOfAdults = adults;

  text('numChildrenAndAges', 150, false, 'Children details');
  text('pickupLocation', 200, true, 'Pickup location');
  text('dropLocation', 200, true, 'Drop location');

  // Package & itinerary
  text('packageName', 150, true, 'Package name');
  text('hotelNameAndCategory', 200, true, 'Hotel name and category');
  text('dayWiseItinerary', 5000, true, 'Day wise itinerary');
  text('packageInclusion', 3000, true, 'Package inclusion');
  text('packageExclusion', 3000, true, 'Package exclusion');
  text('specialDarshanPasses', 300, false, 'Special darshan / entry passes');
  text('transportationDetails', 300, true, 'Transportation details');
  text('specialInstructions', 1500, false, 'Special instructions');
  text('destination', 100, false, 'Destination');
  text('duration', 50, false, 'Duration');

  if (b.packageId && OID_RE.test(String(b.packageId))) d.packageId = String(b.packageId);

  // Price & payment
  const total = Number(b.totalPackageAmount);
  const adv = Number(b.advanceAmountRequired);
  if (!Number.isFinite(total) || total <= 0) errors.totalPackageAmount = 'Enter a total amount greater than 0';
  else if (total > 10000000) errors.totalPackageAmount = 'Total amount looks too large. Please check';
  if (!Number.isFinite(adv) || adv <= 0) errors.advanceAmountRequired = 'Enter an advance amount greater than 0';
  else if (Number.isFinite(total) && adv > total) errors.advanceAmountRequired = 'Advance cannot be more than the total amount';
  d.totalPackageAmount = Math.round(total);
  d.advanceAmountRequired = Math.round(adv);

  const due = parseDateOnly(b.advancePaymentDueDate);
  if (!due) errors.advancePaymentDueDate = 'Enter the advance payment due date';
  else d.advancePaymentDueDate = due.date;

  return { errors, data: d };
}

// Copies validated data onto a Booking document (create + edit)
function applyBookingData(booking, d) {
  const adults = d.numberOfAdults;
  const total = d.totalPackageAmount;
  const adv = d.advanceAmountRequired;

  booking.dealId = d.dealId || booking.dealId;
  booking.bookingDate = d.bookingDate;
  booking.salesExecutiveName = d.salesExecutiveName;
  booking.customerFullName = d.customerFullName;
  booking.name = d.customerFullName;
  booking.mobileNumber = d.mobileNumber;
  booking.phone = d.mobileNumber;
  if (d.customerEmail) booking.email = d.customerEmail;
  booking.travelStartDate = d.travelStartDate;
  booking.travelEndDate = d.travelEndDate;
  booking.travelDate = d.travelStartDate;
  booking.numberOfAdults = adults;
  booking.numberOfPeople = adults;
  booking.numChildrenAndAges = d.numChildrenAndAges;
  booking.pickupLocation = d.pickupLocation;
  booking.pickupPoints = d.pickupLocation;
  booking.dropLocation = d.dropLocation;
  booking.dropPoints = d.dropLocation;

  booking.packageName = d.packageName;
  if (d.packageId) booking.packageId = d.packageId;
  booking.hotelNameAndCategory = d.hotelNameAndCategory;
  booking.dayWiseItinerary = d.dayWiseItinerary;
  booking.packageInclusion = d.packageInclusion;
  booking.packageExclusion = d.packageExclusion;
  booking.specialDarshanPasses = d.specialDarshanPasses;
  booking.transportationDetails = d.transportationDetails;
  booking.specialInstructions = d.specialInstructions;
  booking.customNotes = d.specialInstructions;
  booking.destination = d.destination || booking.destination || 'Ujjain & MP';
  booking.packageDuration = d.duration;
  booking.packageType = 'group';
  booking.pricePerPerson = Math.round(total / adults);

  booking.totalPackageAmount = total;
  booking.totalPrice = total;
  booking.packagePrice = total;
  booking.advanceAmountRequired = adv;
  booking.advancePayment = adv;
  booking.balancePayment = Math.max(0, total - adv);
  booking.advancePaymentDueDate = d.advancePaymentDueDate;
}

// -----------------------------------------------------------------------------
// VIEW BUILDERS
// -----------------------------------------------------------------------------
function adminView(b, req, now = new Date()) {
  const o = typeof b.toObject === 'function' ? b.toObject() : { ...b };
  const isAdmin = req.userRole === 'admin';
  const exp = o.tokenExpiresAt ? new Date(o.tokenExpiresAt) : null;
  const isPaid = o.paymentStatus === 'paid';
  const isExpired = !isPaid && (!exp || now > exp);

  let liveStatus = o.status || 'pending';
  if (isPaid || liveStatus === 'paid') {
    liveStatus = liveStatus === 'completed' || liveStatus === 'cancelled' ? liveStatus : 'confirmed';
  } else if (isExpired && liveStatus !== 'cancelled') {
    liveStatus = 'expired';
  }

  const view = {
    ...o,
    status: liveStatus,
    bookingStatus: o.status || 'pending',
    isPaid,
    isExpired,
    isLocked: Boolean(o.lockedIp),
    blockedCount: Array.isArray(o.blockedAttempts) ? o.blockedAttempts.length : 0,
    remainingSeconds: exp ? Math.max(0, Math.floor((exp.getTime() - now.getTime()) / 1000)) : 0,
    shareableUrl: `${getBaseUrl(req)}/secure-booking/${o.customBookingToken}`
  };

  delete view.lockedDeviceToken;
  delete view.razorpaySignature;
  if (!isAdmin) {
    delete view.lockedIp;
    delete view.lockedUserAgent;
    delete view.blockedAttempts;
  }
  return view;
}

function customerView(b) {
  const { total, advance, balance } = amountsOf(b);
  return {
    _id: b._id,
    dealId: b.dealId,
    bookingDate: b.bookingDate,
    packageName: b.packageName,
    destination: b.destination,
    packageDuration: b.packageDuration,
    travelStartDate: b.travelStartDate || b.travelDate,
    travelEndDate: b.travelEndDate,
    hotelNameAndCategory: b.hotelNameAndCategory,
    dayWiseItinerary: b.dayWiseItinerary,
    packageInclusion: b.packageInclusion,
    packageExclusion: b.packageExclusion,
    specialDarshanPasses: b.specialDarshanPasses,
    transportationDetails: b.transportationDetails,
    specialInstructions: b.specialInstructions,
    pickupLocation: b.pickupLocation || b.pickupPoints,
    dropLocation: b.dropLocation || b.dropPoints,
    numberOfAdults: b.numberOfAdults || b.numberOfPeople,
    numChildrenAndAges: b.numChildrenAndAges,
    totalPackageAmount: total,
    advanceAmountRequired: advance,
    balanceAmount: balance,
    advancePercent: total > 0 ? Math.round((advance / total) * 100) : 0,
    advancePaymentDueDate: b.advancePaymentDueDate,
    name: b.customerFullName || b.name,
    phone: b.mobileNumber || b.phone,
    email: b.email,
    paymentStatus: b.paymentStatus
  };
}

function receiptView(b) {
  const { total, advance } = amountsOf(b);
  const paid = Number(b.paidAmount || advance);
  return {
    _id: b._id,
    dealId: b.dealId,
    bookingDate: b.bookingDate,
    packageName: b.packageName,
    destination: b.destination,
    travelStartDate: b.travelStartDate || b.travelDate,
    travelEndDate: b.travelEndDate,
    hotelNameAndCategory: b.hotelNameAndCategory,
    pickupLocation: b.pickupLocation || b.pickupPoints,
    dropLocation: b.dropLocation || b.dropPoints,
    numberOfAdults: b.numberOfAdults || b.numberOfPeople,
    numChildrenAndAges: b.numChildrenAndAges,
    name: b.customerFullName || b.name,
    phone: b.mobileNumber || b.phone,
    email: b.email,
    totalPackageAmount: total,
    paidAmount: paid,
    advancePercent: total > 0 ? Math.round((paid / total) * 100) : 0,
    balanceAmount: Math.max(0, total - paid),
    gatewayFee: Number(b.gatewayFeeAmount || 0),
    paymentStatus: b.paymentStatus,
    paymentId: b.razorpayPaymentId,
    paidAt: b.paidAt,
    status: b.status
  };
}

// -----------------------------------------------------------------------------
// STAFF / ADMIN HELPERS
// -----------------------------------------------------------------------------
// Loads a custom booking by _id. Staff can only reach bookings they created.
async function loadBooking(req, res) {
  const id = String(req.params.id || '');
  if (!OID_RE.test(id)) {
    res.status(404).json({ success: false, message: 'Booking not found.' });
    return null;
  }
  const booking = await Booking.findOne({ _id: id, isCustomBooking: true });
  const notMine = booking && req.userRole === 'staff' && String(booking.createdBy || '') !== String(req.admin._id);
  if (!booking || notMine) {
    res.status(404).json({ success: false, message: 'Booking not found.' });
    return null;
  }
  return booking;
}

function sendValidationError(res, errors) {
  return res.status(400).json({ success: false, message: Object.values(errors)[0], errors });
}

// -----------------------------------------------------------------------------
// STAFF / ADMIN: Create booking + 10-minute link
// POST /api/custom-bookings/create
// -----------------------------------------------------------------------------
router.post('/create', authenticate, async (req, res) => {
  try {
    const { errors, data } = validateBookingInput(req.body, req.admin);
    if (Object.keys(errors).length) return sendValidationError(res, errors);

    if (data.dealId) {
      if (await Booking.exists({ dealId: data.dealId })) {
        return sendValidationError(res, { dealId: 'This Deal ID is already used. Generate a new one' });
      }
    } else {
      data.dealId = await generateDealId();
    }

    const customBookingToken = crypto.randomBytes(16).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + LINK_VALIDITY_MINUTES * 60 * 1000);

    const booking = new Booking({
      isCustomBooking: true,
      customBookingToken,
      tokenExpiresAt,
      tokenStatus: 'active',
      status: 'pending',
      paymentStatus: 'pending',
      createdBy: req.admin._id,
      createdByName: req.admin.username,
      createdByRole: req.userRole
    });
    applyBookingData(booking, data);
    await booking.save();

    res.status(201).json({
      success: true,
      message: 'Booking link generated successfully.',
      booking: adminView(booking, req),
      token: customBookingToken,
      expiresInMinutes: LINK_VALIDITY_MINUTES
    });
  } catch (error) {
    console.error('Error creating custom booking:', error);
    res.status(500).json({ success: false, message: 'Could not create the booking. Please try again.' });
  }
});

// -----------------------------------------------------------------------------
// STAFF / ADMIN: List bookings (staff see only their own)
// GET /api/custom-bookings/all
// -----------------------------------------------------------------------------
router.get(['/all', '/'], authenticate, async (req, res) => {
  try {
    const filter = { isCustomBooking: true };
    if (req.userRole === 'staff') filter.createdBy = req.admin._id;

    const bookings = await Booking.find(filter)
      .select('-razorpaySignature -lockedDeviceToken')
      .sort({ createdAt: -1 })
      .limit(150)
      .lean();

    const now = new Date();
    res.json({ success: true, bookings: bookings.map((b) => adminView(b, req, now)) });
  } catch (error) {
    console.error('Error listing custom bookings:', error);
    res.status(500).json({ success: false, message: 'Could not load bookings.' });
  }
});

// -----------------------------------------------------------------------------
// STAFF / ADMIN: Edit booking details (not allowed once paid)
// PUT /api/custom-bookings/:id
// -----------------------------------------------------------------------------
router.put('/:id', authenticate, async (req, res) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;

    if (booking.paymentStatus === 'paid') {
      return res.status(409).json({ success: false, message: 'This booking is already paid and cannot be edited.' });
    }

    const now = new Date();
    const paymentInProgress =
      booking.status === 'submitted' &&
      booking.razorpayOrderId &&
      booking.tokenExpiresAt &&
      now < new Date(booking.tokenExpiresAt);
    if (paymentInProgress) {
      return res.status(409).json({
        success: false,
        message: 'The customer is on the payment step right now. Wait for the link to expire, then edit.'
      });
    }

    const { errors, data } = validateBookingInput(req.body, req.admin);
    if (Object.keys(errors).length) return sendValidationError(res, errors);

    if (data.dealId && data.dealId !== booking.dealId) {
      if (await Booking.exists({ dealId: data.dealId, _id: { $ne: booking._id } })) {
        return sendValidationError(res, { dealId: 'This Deal ID is already used by another booking' });
      }
    }

    const priceChanged =
      Number(booking.totalPackageAmount) !== data.totalPackageAmount ||
      Number(booking.advanceAmountRequired) !== data.advanceAmountRequired;

    applyBookingData(booking, data);

    // A new Razorpay order is needed if the amount changed
    if (priceChanged) {
      booking.razorpayOrderId = undefined;
      booking.razorpayOrderAmount = undefined;
    }

    booking.lastEditedBy = req.admin._id;
    booking.lastEditedByName = req.admin.username;
    booking.lastEditedAt = now;
    await booking.save();

    res.json({ success: true, message: 'Booking updated.', booking: adminView(booking, req) });
  } catch (error) {
    console.error('Error editing custom booking:', error);
    res.status(500).json({ success: false, message: 'Could not update the booking.' });
  }
});

// -----------------------------------------------------------------------------
// STAFF / ADMIN: Update status
// PATCH /api/custom-bookings/:id/status
// -----------------------------------------------------------------------------
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;

    const newStatus = cleanText(req.body?.status, 30);
    const allowed = req.userRole === 'admin' ? ADMIN_SETTABLE : STAFF_SETTABLE;
    if (!allowed.includes(newStatus)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to set this status.' });
    }

    const isPaid = booking.paymentStatus === 'paid';
    if (isPaid && !(req.userRole === 'admin' && ['completed', 'cancelled', 'confirmed'].includes(newStatus))) {
      return res.status(409).json({ success: false, message: 'Paid bookings cannot be changed.' });
    }

    const now = new Date();
    booking.status = newStatus;
    booking.lastStatusUpdatedAt = now;

    if (newStatus === 'cancelled') {
      booking.cancelledAt = now;
      booking.tokenStatus = 'expired';
    } else if (newStatus === 'expired') {
      booking.tokenStatus = 'expired';
      booking.tokenExpiresAt = now;
    } else if (newStatus === 'confirmed' && !isPaid) {
      // Admin recorded an offline payment (cash / bank transfer)
      const { advance, total } = amountsOf(booking);
      booking.paymentStatus = 'paid';
      booking.tokenStatus = 'used';
      booking.manualPayment = true;
      booking.paidAmount = advance;
      booking.balancePayment = Math.max(0, total - advance);
      booking.paidAt = now;
    } else if (PRE_OPEN_STATUSES.includes(newStatus)) {
      const stillValid = booking.tokenExpiresAt && now < new Date(booking.tokenExpiresAt);
      booking.tokenStatus = stillValid ? 'active' : 'expired';
    }

    await booking.save();
    res.json({ success: true, message: 'Status updated.', booking: adminView(booking, req) });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, message: 'Could not update the status.' });
  }
});

// -----------------------------------------------------------------------------
// STAFF / ADMIN: Link copied / link sent tracking
// POST /api/custom-bookings/:id/link-action   body: { action: 'copied' | 'sent' }
// -----------------------------------------------------------------------------
router.post('/:id/link-action', authenticate, async (req, res) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;

    const action = String(req.body?.action || '');
    if (!['copied', 'sent'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }
    if (booking.paymentStatus === 'paid' || booking.status === 'cancelled') {
      return res.status(409).json({ success: false, message: 'This booking link is no longer active.' });
    }

    const now = new Date();
    if (!booking.tokenExpiresAt || now > new Date(booking.tokenExpiresAt)) {
      return res.status(410).json({ success: false, message: 'This link has expired. Re-activate it first.' });
    }

    booking.linkShareCount = (booking.linkShareCount || 0) + 1;
    if (action === 'copied') booking.linkCopiedAt = now;
    if (action === 'sent') booking.linkSentAt = now;

    // Status only moves forward: pending -> link_copied -> sent_to_customer
    const target = action === 'sent' ? 'sent_to_customer' : 'link_copied';
    const order = ['pending', 'link_copied', 'sent_to_customer'];
    if (order.includes(booking.status) && order.indexOf(target) > order.indexOf(booking.status)) {
      booking.status = target;
      booking.lastStatusUpdatedAt = now;
    }

    await booking.save();
    res.json({ success: true, booking: adminView(booking, req) });
  } catch (error) {
    console.error('Error recording link action:', error);
    res.status(500).json({ success: false, message: 'Could not update the link status.' });
  }
});

// -----------------------------------------------------------------------------
// STAFF / ADMIN: Re-activate a link (fresh 10 minutes + reset device lock)
// POST /api/custom-bookings/:id/reactivate
// -----------------------------------------------------------------------------
router.post('/:id/reactivate', authenticate, async (req, res) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;

    if (booking.paymentStatus === 'paid') {
      return res.status(409).json({ success: false, message: 'This booking is already paid.' });
    }

    const minutes = Math.min(60, Math.max(1, Number(req.body?.minutes) || LINK_VALIDITY_MINUTES));
    const now = new Date();

    booking.tokenExpiresAt = new Date(now.getTime() + minutes * 60 * 1000);
    booking.tokenStatus = 'active';
    booking.status = 'pending';
    booking.lastStatusUpdatedAt = now;
    booking.cancelledAt = undefined;
    // Release the single-device lock so the customer can open it again
    booking.lockedIp = null;
    booking.lockedDeviceToken = null;
    booking.lockedUserAgent = '';
    booking.ipLockedAt = undefined;
    booking.firstAccessedAt = undefined;

    await booking.save();
    res.json({
      success: true,
      message: `Link re-activated for ${minutes} minutes.`,
      booking: adminView(booking, req)
    });
  } catch (error) {
    console.error('Error reactivating link:', error);
    res.status(500).json({ success: false, message: 'Could not re-activate the link.' });
  }
});

// -----------------------------------------------------------------------------
// ADMIN ONLY: Delete a booking
// DELETE /api/custom-bookings/:id
// -----------------------------------------------------------------------------
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!OID_RE.test(id)) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const removed = await Booking.findOneAndDelete({ _id: id, isCustomBooking: true });
    if (!removed) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true, message: 'Booking removed.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not delete the booking.' });
  }
});

// =============================================================================
// PUBLIC (CUSTOMER) ROUTES
// =============================================================================

// Single-device lock. Binds the link to the first IP + browser that opens it.
// Returns { ok, booking }.
async function enforceDeviceLock(booking, req) {
  const ip = getClientIp(req);
  const device = hashDevice(req.headers['x-device-token']);
  const userAgent = cleanText(req.headers['user-agent'], 300);

  if (!booking.lockedIp) {
    const now = new Date();
    const bound = await Booking.findOneAndUpdate(
      { _id: booking._id, $or: [{ lockedIp: null }, { lockedIp: '' }, { lockedIp: { $exists: false } }] },
      {
        $set: {
          lockedIp: ip,
          lockedDeviceToken: device || null,
          lockedUserAgent: userAgent,
          ipLockedAt: now,
          firstAccessedAt: booking.firstAccessedAt || now
        }
      },
      { new: true }
    );
    if (bound) return { ok: true, booking: bound };
    // Someone else bound it a moment ago - re-read and compare below
    booking = await Booking.findById(booking._id);
  }

  const ipMatch = booking.lockedIp === ip;
  const deviceMatch = Boolean(device) && booking.lockedDeviceToken === device;
  const allowed = STRICT_IP_LOCK ? ipMatch : ipMatch || deviceMatch;

  if (!allowed) {
    await Booking.updateOne(
      { _id: booking._id },
      { $push: { blockedAttempts: { $each: [{ ip, userAgent, at: new Date() }], $slice: -20 } } }
    );
    return { ok: false, booking };
  }

  // Same browser, new IP (mobile network switch): let the lock follow the device
  if (!ipMatch && deviceMatch) {
    await Booking.updateOne({ _id: booking._id }, { $set: { lockedIp: ip } });
  }
  return { ok: true, booking };
}

function lockedResponse(res) {
  return res.status(403).json({
    success: false,
    error: 'locked',
    message:
      'This booking link is already in use on another device. For security, it can only be opened on the first device. Please contact Avantika Travels for a new link.'
  });
}

function sameDeviceOrIp(booking, req) {
  const device = hashDevice(req.headers['x-device-token']);
  const ipMatch = booking.lockedIp && booking.lockedIp === getClientIp(req);
  const deviceMatch = device && booking.lockedDeviceToken === device;
  return STRICT_IP_LOCK ? Boolean(ipMatch) : Boolean(ipMatch || deviceMatch);
}

// Staff/admin preview: lets the person who created a booking look at the customer page
// WITHOUT locking the link to their own device and without changing the booking status.
async function getPreviewUser(req) {
  try {
    const header = req.header('Authorization') || '';
    const t = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!t) return null;
    const decoded = jwt.verify(t, process.env.JWT_SECRET);
    const user = await Admin.findById(decoded.id);
    if (!user || user.isActive === false) return null;
    return user;
  } catch (e) {
    return null;
  }
}

async function findByToken(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  return Booking.findOne({ customBookingToken: token, isCustomBooking: true });
}

function notFound(res) {
  return res.status(404).json({
    success: false,
    error: 'not_found',
    message: 'This booking link is invalid or does not exist.'
  });
}

function expiredResponse(res) {
  return res.status(410).json({
    success: false,
    error: 'expired',
    message: `This booking link was valid for ${LINK_VALIDITY_MINUTES} minutes only and has expired. Please contact Avantika Travels for a new link.`
  });
}

// -----------------------------------------------------------------------------
// Customer opens the link
// GET /api/custom-bookings/access/:token
// -----------------------------------------------------------------------------
router.get('/access/:token', async (req, res) => {
  try {
    let booking = await findByToken(req.params.token);
    if (!booking) return notFound(res);

    // Preview mode (?preview=1): admin or the staff who created it. Never locks, never marks "opened".
    if (req.query.preview === '1') {
      const user = await getPreviewUser(req);
      const isAdminUser = Boolean(user) && user.role !== 'staff';
      const isOwner = Boolean(user) && String(booking.createdBy || '') === String(user._id);
      if (!isAdminUser && !isOwner) {
        return res.status(403).json({
          success: false,
          error: 'preview_forbidden',
          message:
            'Preview is only available to the admin or the staff member who created this booking. Please log in to the admin panel in this browser and try again.'
        });
      }
      const exp = booking.tokenExpiresAt ? new Date(booking.tokenExpiresAt) : null;
      return res.json({
        success: true,
        preview: true,
        booking: customerView(booking),
        remainingSeconds: exp ? Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000)) : 0,
        isDemoMode: false
      });
    }

    // Already paid: only the same device / IP sees the receipt
    if (booking.paymentStatus === 'paid') {
      if (!sameDeviceOrIp(booking, req)) {
        return res.json({
          success: true,
          isPaid: true,
          restricted: true,
          message: 'This booking is already confirmed. Please contact Avantika Travels if you need your voucher again.'
        });
      }
      return res.json({ success: true, isPaid: true, booking: receiptView(booking) });
    }

    if (booking.status === 'cancelled') {
      return res.status(410).json({
        success: false,
        error: 'cancelled',
        message: 'This booking has been cancelled. Please contact Avantika Travels.'
      });
    }

    // The customer may have paid but the page never got confirmed (bank fee, closed tab...).
    // Ask Razorpay before treating the link as expired.
    if (booking.razorpayOrderId && sameDeviceOrIp(booking, req)) {
      const rec = await reconcileOrder(booking, 'access');
      if (rec) return res.json({ success: true, isPaid: true, booking: receiptView(rec.booking) });
    }

    const now = new Date();
    const expiresAt = booking.tokenExpiresAt ? new Date(booking.tokenExpiresAt) : null;
    if (!expiresAt || now > expiresAt) {
      // Only flip to "expired" if the stored expiry is STILL in the past (a re-activation that
      // happened a moment ago must not be overwritten)
      await Booking.updateOne(
        { _id: booking._id, paymentStatus: { $ne: 'paid' }, tokenExpiresAt: { $lte: now } },
        {
          $set: {
            tokenStatus: 'expired',
            ...(['pending', 'link_copied', 'sent_to_customer', 'opened', 'submitted'].includes(booking.status)
              ? { status: 'expired', lastStatusUpdatedAt: now }
              : {})
          }
        }
      );
      return expiredResponse(res);
    }

    const lock = await enforceDeviceLock(booking, req);
    if (!lock.ok) return lockedResponse(res);
    booking = lock.booking;

    if (PRE_OPEN_STATUSES.includes(booking.status)) {
      await Booking.updateOne(
        { _id: booking._id, status: { $in: PRE_OPEN_STATUSES } },
        { $set: { status: 'opened', lastStatusUpdatedAt: now } }
      );
    }

    res.json({
      success: true,
      booking: customerView(booking),
      remainingSeconds: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
      isDemoMode: !isRazorpayConfigured() && !IS_PROD
    });
  } catch (error) {
    console.error('Error accessing booking link:', error);
    res.status(500).json({ success: false, error: 'generic', message: 'Something went wrong. Please try again.' });
  }
});

// -----------------------------------------------------------------------------
// RAZORPAY HELPERS (with debug logging)
// Logs never contain secrets: only ids (shortened), amounts, statuses and yes/no flags.
// Set RAZORPAY_DEBUG=false in the backend env to silence them.
// -----------------------------------------------------------------------------
const RZP_DEBUG = process.env.RAZORPAY_DEBUG !== 'false';
const REQUIRE_RAZORPAY_SIGNATURE = process.env.REQUIRE_RAZORPAY_SIGNATURE === 'true';

function rzpLog(tag, data) {
  if (!RZP_DEBUG) return;
  console.log(`[razorpay] ${tag}${data === undefined ? '' : ' ' + JSON.stringify(data)}`);
}

const mask = (v) => {
  const s = String(v || '');
  return s ? `${s.slice(0, 10)}...(${s.length})` : '(none)';
};

function rzpErr(e) {
  return (e && e.response && (e.response.data?.error || e.response.data)) || (e && e.message) || String(e);
}

async function rzpGet(path) {
  const r = await axios.get(`${RZP_API_BASE}${path}`, {
    headers: { Authorization: rzpAuthHeader() },
    timeout: 10000
  });
  return r.data;
}

async function rzpPost(path, body) {
  const r = await axios.post(`${RZP_API_BASE}${path}`, body, {
    headers: { Authorization: rzpAuthHeader(), 'Content-Type': 'application/json' },
    timeout: 10000
  });
  return r.data;
}

// -----------------------------------------------------------------------------
// Marks the booking paid (atomic + idempotent) and sends notifications once.
// Used by verify-payment, check-payment, access (reconcile) AND the webhook.
//   paidPaise    = the package advance we asked for (order amount)
//   gatewayPaise = what Razorpay actually charged the customer (can be higher when the
//                  bank / payment method adds its own convenience fee)
// -----------------------------------------------------------------------------
async function sendPaidNotifications(booking) {
  const { total, advance } = amountsOf(booking);
  const paidAdv = booking.paidAmount || advance;

  try {
    const emailJobs = [];
    if (process.env.ADMIN_EMAIL) {
      emailJobs.push(
        sendEmail({
          email: process.env.ADMIN_EMAIL,
          subject: `[ADVANCE PAID] Deal ${booking.dealId || ''} Confirmed — ${booking.packageName} (Adv: ₹${paidAdv} / Total: ₹${total})`,
          html: newBookingAdminTemplate(booking)
        })
      );
    }
    if (booking.email) {
      emailJobs.push(
        sendEmail({
          email: booking.email,
          subject: 'Booking Confirmed & Advance Received — Avantika Travels',
          html: bookingConfirmationUserTemplate(booking)
        })
      );
    }
    await Promise.allSettled(emailJobs);
  } catch (emailErr) {
    console.error('Email sending failed for paid booking:', emailErr.message);
  }

  try {
    const apiKey = process.env.AISENSY_API_KEY || process.env.AISENSY_PROJECT_API_KEY;
    if (apiKey && booking.phone) {
      let formattedPhone = booking.phone.replace(/\D/g, '');
      if (formattedPhone.length === 10) formattedPhone = '91' + formattedPhone;

      const payload = {
        apiKey,
        campaignName: 'avantika_booking_initiated',
        destination: formattedPhone,
        userName: 'Avantika Travels',
        templateParams: [
          booking.customerFullName || booking.name || 'Customer',
          booking.packageName || 'Custom Package',
          booking.packageName || 'Custom Package',
          booking.travelStartDate ? new Date(booking.travelStartDate).toLocaleDateString('en-IN') : 'TBD',
          String(total),
          String(paidAdv)
        ],
        source: 'custom-booking-paid'
      };

      await axios
        .post('https://backend.aisensy.com/campaign/t1/api/v2', payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        })
        .catch((err) => console.error('AiSensy error:', err.message));
    }
  } catch (waErr) {
    console.error('WhatsApp notify error:', waErr.message);
  }
}

async function finalizePaid(booking, { orderId, paymentId, signature, paidPaise, gatewayPaise }) {
  const { total, advance } = amountsOf(booking);
  const paid = paidPaise ? Math.round(paidPaise / 100) : advance;
  const gateway = gatewayPaise ? Number(gatewayPaise) / 100 : paid;
  const now = new Date();

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, paymentStatus: { $ne: 'paid' } },
    {
      $set: {
        status: 'confirmed',
        paymentStatus: 'paid',
        tokenStatus: 'used',
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature || '',
        paidAmount: paid,
        gatewayChargedAmount: gateway,
        gatewayFeeAmount: Math.max(0, Math.round((gateway - paid) * 100) / 100),
        advancePayment: paid,
        balancePayment: Math.max(0, total - paid),
        paidAt: now,
        updatedAt: now,
        lastStatusUpdatedAt: now,
        paymentIssue: ''
      }
    },
    { new: true }
  );

  if (!updated) {
    rzpLog('finalizePaid: already paid (idempotent)', { booking: String(booking._id) });
    return { booking: await Booking.findById(booking._id), already: true };
  }
  rzpLog('finalizePaid: booking confirmed', {
    booking: String(booking._id),
    dealId: updated.dealId,
    payment: mask(paymentId),
    advance: paid,
    gatewayCharged: gateway,
    extraFee: updated.gatewayFeeAmount
  });
  await sendPaidNotifications(updated);
  return { booking: updated, already: false };
}

// -----------------------------------------------------------------------------
// Asks Razorpay what happened to this booking's order. If a payment was captured
// (even though the customer's browser never reported back), the booking is confirmed.
// This covers: bank page closed too early, handler never fired, signature missing,
// customer closed the tab, amount slightly higher because of bank charges.
// -----------------------------------------------------------------------------
async function reconcileOrder(booking, source = 'reconcile') {
  try {
    const orderId = booking.razorpayOrderId;
    if (!orderId || orderId.startsWith('order_sim_') || !isRazorpayConfigured()) return null;

    const list = await rzpGet(`/orders/${orderId}/payments`);
    const items = Array.isArray(list.items) ? list.items : [];
    const expected = Number(booking.razorpayOrderAmount);

    rzpLog(`${source}: payments on order`, {
      order: mask(orderId),
      expectedPaise: expected,
      payments: items.map((p) => ({
        id: mask(p.id),
        status: p.status,
        amount: p.amount,
        method: p.method,
        bank: p.bank || undefined,
        fee: p.fee,
        error_code: p.error_code || undefined
      }))
    });

    for (const p of items) {
      if (p.status === 'authorized' && Number(p.amount) >= expected) {
        try {
          await rzpPost(`/payments/${p.id}/capture`, { amount: p.amount, currency: 'INR' });
          p.status = 'captured';
          rzpLog(`${source}: authorized payment captured`, { payment: mask(p.id) });
        } catch (e) {
          rzpLog(`${source}: capture failed`, rzpErr(e));
        }
      }
      if (p.status === 'captured' && Number(p.amount) >= expected && p.currency === 'INR') {
        return await finalizePaid(booking, {
          orderId,
          paymentId: p.id,
          signature: '',
          paidPaise: expected,
          gatewayPaise: Number(p.amount)
        });
      }
    }
    return null;
  } catch (e) {
    rzpLog(`${source}: failed`, rzpErr(e));
    return null;
  }
}

// -----------------------------------------------------------------------------
// Customer submits details -> create (or reuse) Razorpay order for the advance
// POST /api/custom-bookings/create-order/:token
// -----------------------------------------------------------------------------
router.post('/create-order/:token', async (req, res) => {
  try {
    let booking = await findByToken(req.params.token);
    if (!booking) return notFound(res);

    if (booking.paymentStatus === 'paid') {
      return res.status(409).json({ success: false, message: 'This booking is already paid.' });
    }
    if (booking.status === 'cancelled') {
      return res.status(410).json({ success: false, error: 'cancelled', message: 'This booking has been cancelled.' });
    }

    // The customer may already have paid on an earlier attempt (e.g. the bank added a fee and
    // the page did not complete). Check with Razorpay first and show the receipt if so.
    if (booking.razorpayOrderId && sameDeviceOrIp(booking, req)) {
      const rec = await reconcileOrder(booking, 'create-order');
      if (rec) {
        return res.json({ success: true, alreadyPaid: true, booking: receiptView(rec.booking) });
      }
    }

    const now = new Date();
    if (!booking.tokenExpiresAt || now > new Date(booking.tokenExpiresAt)) return expiredResponse(res);

    const lock = await enforceDeviceLock(booking, req);
    if (!lock.ok) return lockedResponse(res);
    booking = await Booking.findById(booking._id);

    // ---- validate customer inputs ----
    const b = req.body || {};
    const errors = {};
    const name = scrub(b.customerFullName || b.name).replace(/\s+/g, ' ');
    const mobile = normalizeMobile(b.mobileNumber || b.phone);
    const email = scrub(b.email).toLowerCase();
    const specialRequests = cleanText(b.specialRequests, 500);
    const consent = b.dpdpConsent || {};

    if (!NAME_RE.test(name)) errors.customerFullName = 'Enter your full name (letters only)';
    if (!MOBILE_RE.test(mobile)) errors.mobileNumber = 'Enter a valid 10-digit mobile number';
    if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Enter a valid email address';
    if (b.termsAcceptedByUser !== true) errors.termsAccepted = 'Please accept the booking terms and conditions to continue';
    if (consent.dataProcessing !== true) errors.dpdpConsent = 'Your consent for processing booking data is required';
    if (Object.keys(errors).length) return sendValidationError(res, errors);

    const { total, advance } = amountsOf(booking);
    if (!(advance > 0) || advance > total) {
      return res.status(400).json({
        success: false,
        message: 'This quotation has an invalid payment amount. Please contact Avantika Travels.'
      });
    }

    // ---- save customer details ----
    booking.customerFullName = name;
    booking.name = name;
    booking.mobileNumber = mobile;
    booking.phone = mobile;
    booking.email = email;
    booking.specialRequests = specialRequests;
    booking.termsAcceptedByUser = true;
    booking.termsAcceptedAt = now;
    booking.dpdpConsent = {
      dataProcessing: true,
      termsAccepted: true,
      marketingAccepted: consent.marketingAccepted === true,
      consentedAt: now,
      ipAddress: getClientIp(req)
    };
    booking.customerSubmittedAt = now;
    if (!['confirmed', 'paid'].includes(booking.status)) {
      booking.status = 'submitted';
      booking.lastStatusUpdatedAt = now;
    }

    const amountInPaise = Math.round(advance * 100);
    const bookingPayload = { id: booking._id, name, email, phone: mobile, packageName: booking.packageName };

    // ---- real Razorpay ----
    if (isRazorpayConfigured()) {
      // Reuse the order if nothing changed (customer closed the popup and retried)
      if (
        booking.razorpayOrderId &&
        !booking.razorpayOrderId.startsWith('order_sim_') &&
        Number(booking.razorpayOrderAmount) === amountInPaise
      ) {
        await booking.save();
        rzpLog('create-order: reusing existing order', { order: mask(booking.razorpayOrderId), amountInPaise });
        return res.json({
          success: true,
          orderId: booking.razorpayOrderId,
          amount: amountInPaise,
          advanceAmount: advance,
          totalAmount: total,
          currency: 'INR',
          keyId: process.env.RAZORPAY_KEY_ID,
          booking: bookingPayload
        });
      }

      try {
        rzpLog('create-order: creating order', {
          apiBase: RZP_API_BASE,
          keyIdPrefix: String(process.env.RAZORPAY_KEY_ID || '').slice(0, 9),
          booking: String(booking._id),
          dealId: booking.dealId,
          amountInPaise
        });

        const order = await rzpPost('/orders', {
          amount: amountInPaise,
          currency: 'INR',
          receipt: `rcpt_${booking._id.toString().slice(-10)}_${Date.now().toString().slice(-6)}`,
          notes: {
            bookingId: booking._id.toString(),
            dealId: booking.dealId || '',
            packageName: String(booking.packageName || '').slice(0, 100)
          }
        });

        rzpLog('create-order: order created', { order: mask(order.id), status: order.status, amount: order.amount });

        booking.razorpayOrderId = order.id;
        booking.razorpayOrderAmount = amountInPaise;
        await booking.save();

        return res.json({
          success: true,
          orderId: order.id,
          amount: order.amount,
          advanceAmount: advance,
          totalAmount: total,
          currency: order.currency || 'INR',
          keyId: process.env.RAZORPAY_KEY_ID,
          booking: bookingPayload
        });
      } catch (razorpayErr) {
        await booking.save();
        rzpLog('create-order: Razorpay REJECTED the order', rzpErr(razorpayErr));
        return res.status(502).json({
          success: false,
          message: 'Could not start the payment. Please try again in a moment.'
        });
      }
    }

    // ---- no keys configured ----
    if (IS_PROD) {
      console.error('Razorpay keys are missing in production environment.');
      return res.status(503).json({
        success: false,
        message: 'Online payment is temporarily unavailable. Please contact Avantika Travels.'
      });
    }

    // Local development simulation only
    const mockOrderId = `order_sim_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    booking.razorpayOrderId = mockOrderId;
    booking.razorpayOrderAmount = amountInPaise;
    await booking.save();
    return res.json({
      success: true,
      isDemoMode: true,
      orderId: mockOrderId,
      amount: amountInPaise,
      advanceAmount: advance,
      totalAmount: total,
      currency: 'INR',
      keyId: 'rzp_test_simulation',
      booking: bookingPayload
    });
  } catch (error) {
    console.error('Error creating payment order:', error);
    res.status(500).json({ success: false, message: 'Could not start the payment. Please try again.' });
  }
});

// -----------------------------------------------------------------------------
// Customer finished paying -> verify with Razorpay and confirm
// POST /api/custom-bookings/verify-payment/:token
//
// Security model: the payment is ALWAYS fetched from Razorpay's server with our secret key and
// must belong to THIS booking's order and cover its amount. The browser signature is checked
// when Razorpay sends it, but a missing signature no longer blocks a genuine payment
// (set REQUIRE_RAZORPAY_SIGNATURE=true to make it mandatory).
// -----------------------------------------------------------------------------
router.post('/verify-payment/:token', async (req, res) => {
  try {
    const booking = await findByToken(req.params.token);
    if (!booking) return notFound(res);

    const body = req.body || {};
    const paymentId = String(body.razorpay_payment_id || '');
    const orderId = String(body.razorpay_order_id || booking.razorpayOrderId || '');
    const signature = String(body.razorpay_signature || '');

    rzpLog('verify-payment: received from browser', {
      booking: String(booking._id),
      dealId: booking.dealId,
      bodyKeys: Object.keys(body),
      has_payment_id: Boolean(paymentId),
      has_order_id: Boolean(body.razorpay_order_id),
      has_signature: Boolean(signature),
      signatureLength: signature.length,
      orderInBody: mask(body.razorpay_order_id),
      orderOnBooking: mask(booking.razorpayOrderId),
      orderMatches: !body.razorpay_order_id || body.razorpay_order_id === booking.razorpayOrderId,
      bookingStatus: booking.status,
      alreadyPaid: booking.paymentStatus === 'paid'
    });

    // Idempotent: already confirmed (e.g. by webhook)
    if (booking.paymentStatus === 'paid') {
      if (!sameDeviceOrIp(booking, req)) {
        return res.json({ success: true, restricted: true, message: 'Booking confirmed.' });
      }
      return res.json({ success: true, message: 'Booking confirmed.', booking: receiptView(booking) });
    }

    const idRe = /^[A-Za-z0-9_]{5,64}$/;
    if (!idRe.test(paymentId) || !idRe.test(orderId)) {
      rzpLog('verify-payment: REJECTED - missing or malformed payment/order id');
      return res.status(400).json({ success: false, message: 'Invalid payment details.' });
    }
    // The order must be the one we created for THIS booking
    if (!booking.razorpayOrderId || booking.razorpayOrderId !== orderId) {
      rzpLog('verify-payment: REJECTED - order does not belong to this booking');
      return res.status(400).json({ success: false, message: 'Payment does not match this booking.' });
    }

    // Local simulation (only possible when the server itself is in demo mode)
    if (orderId.startsWith('order_sim_')) {
      if (isRazorpayConfigured() || IS_PROD) {
        return res.status(400).json({ success: false, message: 'Invalid payment.' });
      }
      const sim = await finalizePaid(booking, {
        orderId,
        paymentId: `sim_pay_${Date.now()}`,
        signature: 'simulation',
        paidPaise: booking.razorpayOrderAmount
      });
      return res.json({ success: true, message: 'Booking confirmed (simulation).', booking: receiptView(sim.booking) });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({ success: false, message: 'Payment verification is unavailable.' });
    }

    // 1) Browser signature (only when Razorpay sent one)
    if (signature) {
      const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
      const sigOk = safeEqual(expected, signature);
      rzpLog('verify-payment: signature check', { valid: sigOk });
      if (!sigOk) {
        return res.status(400).json({ success: false, message: 'Payment verification failed: invalid signature.' });
      }
    } else {
      rzpLog('verify-payment: WARNING no razorpay_signature received from checkout. Falling back to server-side payment lookup.', {
        requireSignature: REQUIRE_RAZORPAY_SIGNATURE
      });
      if (REQUIRE_RAZORPAY_SIGNATURE) {
        return res.status(400).json({ success: false, message: 'Payment verification failed: signature missing.' });
      }
    }

    // 2) Ask Razorpay directly (authoritative)
    let payment;
    try {
      payment = await rzpGet(`/payments/${paymentId}`);
    } catch (e) {
      rzpLog('verify-payment: could not fetch payment from Razorpay', rzpErr(e));
      // Maybe the payment lookup failed but the order shows it as paid
      const rec = await reconcileOrder(booking, 'verify-payment');
      if (rec) {
        return res.json({ success: true, message: 'Booking confirmed.', booking: receiptView(rec.booking) });
      }
      return res.status(502).json({
        success: false,
        message: 'We could not confirm your payment yet. Do not pay again. Please tap “Check payment status” or contact Avantika Travels with your Deal ID.'
      });
    }

    const expectedPaise = Number(booking.razorpayOrderAmount);
    rzpLog('verify-payment: payment from Razorpay', {
      payment: mask(payment.id),
      order: mask(payment.order_id),
      status: payment.status,
      amount: payment.amount,
      expectedPaise,
      currency: payment.currency,
      method: payment.method,
      bank: payment.bank || undefined,
      fee: payment.fee,
      tax: payment.tax,
      error_code: payment.error_code || undefined,
      error_description: payment.error_description || undefined
    });

    if (payment.order_id !== orderId || payment.currency !== 'INR') {
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { paymentIssue: `Payment ${paymentId} is for a different order/currency. Check Razorpay dashboard.` } }
      );
      return res.status(400).json({ success: false, message: 'Payment does not match this booking. Please contact Avantika Travels.' });
    }

    // The bank / payment method may add its own convenience fee, so the charged amount can be
    // HIGHER than the package advance. Lower than the advance is never accepted.
    if (Number(payment.amount) < expectedPaise) {
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { paymentIssue: `Payment ${paymentId} amount ${payment.amount} paise is LESS than required ${expectedPaise}. Check Razorpay dashboard.` } }
      );
      return res.status(400).json({ success: false, message: 'Payment amount is less than the required advance. Please contact Avantika Travels.' });
    }
    if (Number(payment.amount) > expectedPaise) {
      rzpLog('verify-payment: customer was charged extra (bank/gateway fee)', {
        extraPaise: Number(payment.amount) - expectedPaise
      });
    }

    if (payment.status === 'authorized') {
      try {
        await rzpPost(`/payments/${paymentId}/capture`, { amount: payment.amount, currency: 'INR' });
        payment.status = 'captured';
        rzpLog('verify-payment: authorized payment captured');
      } catch (e) {
        rzpLog('verify-payment: capture failed', rzpErr(e));
      }
    }
    if (payment.status !== 'captured') {
      const reason = payment.error_description ? ` (${payment.error_description})` : '';
      return res.status(400).json({
        success: false,
        message:
          payment.status === 'failed'
            ? `Payment failed${reason}. You can try again.`
            : 'Payment is not completed yet. Please wait a moment and tap “Check payment status”.'
      });
    }

    const result = await finalizePaid(booking, {
      orderId,
      paymentId,
      signature,
      paidPaise: expectedPaise,
      gatewayPaise: Number(payment.amount)
    });

    res.json({
      success: true,
      message: 'Advance payment verified and booking confirmed successfully!',
      booking: receiptView(result.booking)
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, message: 'Could not verify the payment. If money was deducted, please contact Avantika Travels.' });
  }
});

// -----------------------------------------------------------------------------
// Customer taps "Check payment status" (or the payment popup was closed)
// POST /api/custom-bookings/check-payment/:token
// -----------------------------------------------------------------------------
router.post('/check-payment/:token', async (req, res) => {
  try {
    const booking = await findByToken(req.params.token);
    if (!booking) return notFound(res);

    if (booking.paymentStatus === 'paid') {
      if (!sameDeviceOrIp(booking, req)) {
        return res.json({ success: true, paid: true, restricted: true, message: 'Booking confirmed.' });
      }
      return res.json({ success: true, paid: true, booking: receiptView(booking) });
    }

    if (!sameDeviceOrIp(booking, req)) return lockedResponse(res);

    const rec = await reconcileOrder(booking, 'check-payment');
    if (rec) return res.json({ success: true, paid: true, booking: receiptView(rec.booking) });

    res.json({ success: true, paid: false, message: 'No completed payment found for this booking yet.' });
  } catch (error) {
    console.error('Error checking payment:', error);
    res.status(500).json({ success: false, message: 'Could not check the payment status.' });
  }
});

// -----------------------------------------------------------------------------
// Razorpay webhook (safety net if the customer closes the tab after paying)
// POST /api/custom-bookings/razorpay-webhook
// Razorpay Dashboard -> Settings -> Webhooks: events payment.captured + order.paid
// Any other event that is ticked in the dashboard is simply acknowledged and ignored.
// -----------------------------------------------------------------------------
router.post('/razorpay-webhook', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('Razorpay webhook: RAZORPAY_WEBHOOK_SECRET is not set');
      return res.status(503).json({ ok: false, message: 'Webhook not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !req.rawBody) {
      rzpLog('webhook: REJECTED - no signature header or raw body', { hasSignature: Boolean(signature), hasRawBody: Boolean(req.rawBody) });
      return res.status(400).json({ ok: false });
    }

    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    if (!safeEqual(expected, signature)) {
      rzpLog('webhook: REJECTED - signature mismatch (check RAZORPAY_WEBHOOK_SECRET)');
      return res.status(400).json({ ok: false });
    }

    const event = req.body?.event;
    rzpLog('webhook: received', { event });
    if (!['payment.captured', 'order.paid'].includes(event)) return res.json({ ok: true, ignored: true });

    const payment = req.body?.payload?.payment?.entity;
    if (!payment || !payment.id || !payment.order_id) return res.json({ ok: true, ignored: true });

    const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });

    if (!booking) {
      // Payment on an order that is no longer the booking's current order (amount was edited)
      const bid = payment.notes && payment.notes.bookingId;
      rzpLog('webhook: no booking for this order', { order: mask(payment.order_id), notesBookingId: bid || undefined });
      if (bid && OID_RE.test(String(bid))) {
        await Booking.updateOne(
          { _id: bid, paymentStatus: { $ne: 'paid' } },
          {
            $set: {
              paymentIssue: `Payment ${payment.id} (₹${Number(payment.amount) / 100}) was received on an older order. Check Razorpay and refund or confirm manually.`
            }
          }
        );
      }
      return res.json({ ok: true });
    }

    if (booking.paymentStatus === 'paid') return res.json({ ok: true });

    const expectedPaise = Number(booking.razorpayOrderAmount);
    rzpLog('webhook: payment', {
      payment: mask(payment.id),
      status: payment.status,
      amount: payment.amount,
      expectedPaise,
      method: payment.method,
      bank: payment.bank || undefined
    });

    // Higher than expected is fine (bank / gateway fee). Lower is not.
    if (payment.status !== 'captured' || Number(payment.amount) < expectedPaise) {
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { paymentIssue: `Payment ${payment.id} amount/status mismatch. Check Razorpay dashboard.` } }
      );
      return res.json({ ok: true });
    }

    await finalizePaid(booking, {
      orderId: payment.order_id,
      paymentId: payment.id,
      signature: '',
      paidPaise: expectedPaise,
      gatewayPaise: Number(payment.amount)
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;