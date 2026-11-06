const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
  packageName: { type: String },
  packagePrice: { type: Number },
  packageDuration: { type: String },

  // Snapshot of package.type at the time of booking ('group' | 'personal')
  packageType: {
    type: String,
    enum: ['group', 'personal'],
    default: 'group'
  },

  pricePerPerson: { type: Number, default: 0 },
  personPricing: [
    {
      persons: { type: Number },
      price: { type: Number }
    }
  ],
  serviceName: { type: String },

  // Deprecated fields
  groupPackage: { type: Boolean, default: false },
  personalGroupPackage: { type: Boolean, default: false },
  roomType: { type: String, enum: ['double', 'triple', 'quad', ''] },

  // Booking Details (Staff & Customer form fields)
  dealId: { type: String, default: '', index: true },
  bookingDate: { type: Date, default: Date.now },
  salesExecutiveName: { type: String, default: '' },
  customerFullName: { type: String, default: '' },
  mobileNumber: { type: String, default: '' },
  travelStartDate: { type: Date },
  travelEndDate: { type: Date },
  numberOfAdults: { type: Number, default: 1 },
  numChildrenAndAges: { type: String, default: '' },
  pickupLocation: { type: String, default: '' },
  dropLocation: { type: String, default: '' },

  // Package & Itinerary Details
  hotelNameAndCategory: { type: String, default: '' },
  dayWiseItinerary: { type: String, default: '' },
  packageInclusion: { type: String, default: '' },
  packageExclusion: { type: String, default: '' },
  specialDarshanPasses: { type: String, default: '' },
  transportationDetails: { type: String, default: '' },
  specialInstructions: { type: String, default: '' },

  // Package Price & Payment Details
  totalPackageAmount: { type: Number, default: 0 },
  advanceAmountRequired: { type: Number, default: 0 },
  advancePaymentDueDate: { type: Date },

  // Legacy mappings / sync
  pickupPoints: { type: String, default: '' },
  dropPoints: { type: String, default: '' },
  travelDate: { type: Date },
  destination: { type: String, default: '' },
  travelTime: { type: String, default: '' },

  name: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  age: { type: Number },
  gender: { type: String, enum: ['male', 'female', 'other', ''] },

  profId: { type: String },
  adharNumber: { type: String },

  numberOfPeople: { type: Number, default: 1 },
  packageIdRef: { type: String },

  specialRequests: { type: String },
  customNotes: { type: String },

  // ---------------------------------------------------------------------------
  // Who created / last edited the booking (staff or admin)
  // ---------------------------------------------------------------------------
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true },
  createdByName: { type: String, default: '' },
  createdByRole: { type: String, enum: ['admin', 'staff', ''], default: '' },
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  lastEditedByName: { type: String, default: '' },
  lastEditedAt: { type: Date },

  // ---------------------------------------------------------------------------
  // Custom 10-Minute Single-Device Booking Link Fields
  // ---------------------------------------------------------------------------
  isCustomBooking: { type: Boolean, default: false },
  customBookingToken: { type: String, unique: true, sparse: true, index: true },
  tokenExpiresAt: { type: Date },
  tokenStatus: {
    type: String,
    enum: ['active', 'used', 'expired'],
    default: 'active'
  },

  // Link sharing tracking (staff copied / sent the link)
  linkCopiedAt: { type: Date },
  linkSentAt: { type: Date },
  linkShareCount: { type: Number, default: 0 },

  // Single-device lock (set when the customer first opens the link)
  lockedIp: { type: String, default: null },
  lockedDeviceToken: { type: String, default: null }, // SHA-256 hash of the browser's device id
  lockedUserAgent: { type: String, default: '' },
  ipLockedAt: { type: Date },
  firstAccessedAt: { type: Date },
  blockedAttempts: [
    {
      ip: { type: String },
      userAgent: { type: String },
      at: { type: Date, default: Date.now },
      _id: false
    }
  ],

  // Payment Tracking (Razorpay)
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
razorpayOrderId: { type: String, index: true },
  razorpayOrderAmount: { type: Number }, // in paise
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  paidAmount: { type: Number, default: 0 },
  paidAt: { type: Date },
  manualPayment: { type: Boolean, default: false }, // admin marked as paid (cash / bank transfer)
  paymentIssue: { type: String, default: '' }, // set when a payment arrives that does not match the booking

  // Acceptance of Client Terms & DPDP Act 2023 Consent Audit Record
  termsAcceptedByUser: { type: Boolean, default: false },
  termsAcceptedAt: { type: Date },
  customerSubmittedAt: { type: Date },
  dpdpConsent: {
    dataProcessing: { type: Boolean, default: false },
    termsAccepted: { type: Boolean, default: false },
    marketingAccepted: { type: Boolean, default: false },
    consentedAt: { type: Date },
    ipAddress: { type: String }
  },

  status: {
    type: String,
    enum: [
      'pending',
      'link_copied',
      'sent_to_customer',
      'opened',
      'opened_by_customer',
      'submitted',
      'submitted_by_customer',
      'confirmed',
      'paid',
      'expired',
      'cancelled',
      'completed'
    ],
    default: 'pending'
  },
  lastStatusUpdatedAt: { type: Date, default: Date.now },
  cancelledAt: { type: Date },

  totalPrice: { type: Number, default: 0 },
  advancePayment: { type: Number, default: 0 },
  balancePayment: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

bookingSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('CustomBooking', bookingSchema);