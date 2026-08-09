const express = require('express');
const Booking = require('../models/Booking');
const Package = require('../models/Package');
const auth = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');
const {
  newBookingAdminTemplate,
  bookingConfirmationUserTemplate
} = require('../utils/emailTemplates');

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
      .populate('packageId', 'name images destination price duration type pickupPoint dropPoint personPricing');
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
      totalPrice,
      advancePayment,
      balancePayment
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
      updatedAt: Date.now()
    };

    // Handle package-based booking
    if (packageId) {
      const pkg = await Package.findById(packageId);
      if (!pkg) {
        return res.status(404).json({ message: 'Package not found' });
      }

      const people = numberOfPeople || 1;

      bookingData.packageId = packageId;
      bookingData.packageName = pkg.name;
      bookingData.packagePrice = pkg.price;
      bookingData.packageDuration = pkg.duration;

      // packageType, pickup and drop always come from the package itself —
      // never trust these from the client, since they define the pricing rule.
      bookingData.packageType = pkg.type;
      bookingData.pickupPoints = pkg.pickupPoint;
      bookingData.dropPoints = pkg.dropPoint;

      if (pkg.type === 'personal') {
        // Personal packages are priced per person via personPricing
        const perPersonPrice = pkg.priceFor ? pkg.priceFor(people) : pkg.price;
        bookingData.pricePerPerson = perPersonPrice;
        bookingData.totalPrice = totalPrice || (perPersonPrice * people);
      } else {
        // Group packages have one fixed total price, regardless of headcount
        bookingData.totalPrice = totalPrice || pkg.price;
      }

      bookingData.advancePayment = advancePayment || Math.round(bookingData.totalPrice * 0.4);
      bookingData.balancePayment = balancePayment || (bookingData.totalPrice - bookingData.advancePayment);
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

    // --- Emails: admin notification + user confirmation ---
    // Awaited (via Promise.allSettled so both fire in parallel, and one
    // failing doesn't stop the other) BEFORE responding — same reasoning as
    // in routes/contact.js: fire-and-forget emails were getting their Gmail
    // TLS handshake killed mid-connection once the response was sent.
    const emailJobs = [];
    if (process.env.ADMIN_EMAIL) {
      emailJobs.push(
        sendEmail({
          email: process.env.ADMIN_EMAIL,
          subject: `New Booking — ${newBooking.packageName || newBooking.serviceName || newBooking.name}`,
          html: newBookingAdminTemplate(newBooking)
        })
      );
    }
    if (newBooking.email) {
      emailJobs.push(
        sendEmail({
          email: newBooking.email,
          subject: `Booking Received — Avantika Travels`,
          html: bookingConfirmationUserTemplate(newBooking)
        })
      );
    }
    const results = await Promise.allSettled(emailJobs);
    results.forEach((r) => {
      if (r.status === 'rejected') console.error('Booking email failed:', r.reason.message);
    });

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
      packageName,
      packagePrice,
      packageDuration,
      packageType,
      pricePerPerson,
      serviceName,
      totalPrice,
      advancePayment,
      balancePayment,
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
      packageName,
      packagePrice,
      packageDuration,
      packageType,
      pricePerPerson,
      serviceName,
      totalPrice,
      advancePayment,
      balancePayment,
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