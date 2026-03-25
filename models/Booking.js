const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Package details (optional - for package-based bookings)
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package'
  },
  packageName: {
    type: String
  },
  packagePrice: {
    type: Number
  },
  packageDuration: {
    type: String
  },
  
  // Service details (for service-only bookings)
  serviceName: {
    type: String
  },
  
  // Package type selection
  groupPackage: {
    type: Boolean,
    default: false
  },
  personalGroupPackage: {
    type: Boolean,
    default: false
  },
  
  // Travel details
  pickupPoints: {
    type: String
  },
  dropPoints: {
    type: String
  },
  travelDate: {
    type: Date
  },
  
  // Customer personal information
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  age: {
    type: Number
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', '']
  },
  
  // ID Details
  profId: {
    type: String
  },
  adharNumber: {
    type: String
  },
  
  // Number of passengers
  numberOfPeople: {
    type: Number,
    default: 1
  },
  
  // Room Type (for couples or standard)
  roomType: {
    type: String,
    enum: ['double', 'triple', 'quad']
  },
  
  // Package ID (for reference)
  packageIdRef: {
    type: String
  },
  

  
  // Special requests
  specialRequests: {
    type: String
  },
  
  // Booking status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  
  // Estimated Pricing (reference only - no payments)
  totalPrice: {
    type: Number,
    default: 0
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Booking', bookingSchema);
