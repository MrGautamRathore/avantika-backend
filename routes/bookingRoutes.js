const express = require('express');
const Booking = require('../models/Booking');
const Package = require('../models/Package');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all bookings (admin only)
router.get('/', async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('packageId', 'name images destination')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single booking
router.get('/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('packageId', 'name images destination price duration');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new booking (handles both package-based and service-only bookings)
router.post('/', async (req, res) => {
  try {
    const { 
      packageId, 
      serviceName,
      name, 
      email, 
      phone, 
      age,
      gender,
      profId,
      adharNumber,
      numberOfPeople, 
      travelDate, 
      specialRequests,
      pickupPoints,
      dropPoints,
      groupPackage,
      personalGroupPackage,
      roomType,
      totalPrice
    } = req.body;

    const bookingData = {
      name,
      email,
      phone,
      age,
      gender,
      profId,
      adharNumber,
      numberOfPeople: numberOfPeople || 1,
      travelDate,
      specialRequests,
      pickupPoints,
      dropPoints,
      groupPackage: groupPackage || false,
      personalGroupPackage: personalGroupPackage || false,
      roomType,
      updatedAt: Date.now()
    };

    // Handle package-based booking
    if (packageId) {
      const package = await Package.findById(packageId);
      if (!package) {
        return res.status(404).json({ message: 'Package not found' });
      }

      bookingData.packageId = packageId;
      bookingData.packageName = package.name;
      bookingData.packagePrice = package.price;
      bookingData.packageDuration = package.duration;
      
      // Calculate estimated total price (reference)
      bookingData.totalPrice = totalPrice || (package.price * (numberOfPeople || 1));
    } 
    // Handle service-only booking
    else if (serviceName) {
      bookingData.serviceName = serviceName;
      bookingData.totalPrice = totalPrice || 0;
    }
    // No package and no service - still allow booking (custom inquiry)
    else {
      bookingData.totalPrice = totalPrice || 0;
    }

    const booking = new Booking(bookingData);
    const newBooking = await booking.save();
    res.status(201).json(newBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update booking status (admin only)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate('packageId', 'name images destination');

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found' });
    res.json(updatedBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete booking (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: 'Booking deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update booking (admin only)
router.put('/:id', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      age,
      gender,
      profId,
      adharNumber,
      numberOfPeople, 
      travelDate, 
      specialRequests,
      pickupPoints,
      dropPoints,
      groupPackage,
      personalGroupPackage,
      roomType,
      packageName,
      packagePrice,
      packageDuration,
      serviceName,
      totalPrice,
      status
    } = req.body;

    const updateData = {
      name,
      email,
      phone,
      age,
      gender,
      profId,
      adharNumber,
      numberOfPeople,
      travelDate,
      specialRequests,
      pickupPoints,
      dropPoints,
      groupPackage,
      personalGroupPackage,
      roomType,
      packageName,
      packagePrice,
      packageDuration,
      serviceName,
      totalPrice,
      status,
      updatedAt: Date.now()
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );

    const updatedBooking = await Booking.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('packageId', 'name images destination');

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found' });
    res.json(updatedBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
