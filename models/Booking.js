const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
  packageName: { type: String },
  packagePrice: { type: Number },
  packageDuration: { type: String },

  // Snapshot of package.type at the time of booking ('group' | 'personal')
  packageType: {
    type: String,
    enum: ['group', 'personal']
  },

  // Snapshot of the per-person price used at booking time (only relevant for
  // 'personal' packages, since 'group' packages use a single fixed price)
  pricePerPerson: { type: Number },

  serviceName: { type: String },

  // Deprecated — kept only for backward compatibility with old bookings.
  // New bookings no longer let the user choose group/personal or a room type;
  // these values are inferred from the package itself (see packageType above).
  groupPackage: { type: Boolean, default: false },
  personalGroupPackage: { type: Boolean, default: false },
  roomType: { type: String, enum: ['double', 'triple', 'quad', ''] },

  // Pickup/drop are taken directly from the package's own pickupPoint/dropPoint
  // at booking time (not user-selectable), but stored here as a snapshot.
  pickupPoints: { type: String },
  dropPoints: { type: String },
  travelDate: { type: Date },

  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  age: { type: Number },
  gender: { type: String, enum: ['male', 'female', 'other', ''] },

  profId: { type: String },
  adharNumber: { type: String },

  numberOfPeople: { type: Number, default: 1 },

  packageIdRef: { type: String },

  specialRequests: { type: String },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },

  totalPrice: { type: Number, default: 0 },
  advancePayment: { type: Number, default: 0 },
  balancePayment: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);