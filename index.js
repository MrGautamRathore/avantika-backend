const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Trust reverse proxies (Vercel) to read accurate client IP addresses for secure link binding
app.set('trust proxy', true);

// Cron jobs (start after server boot)
const startCronJobs = require('./utils/cronJobs');

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

// Optional: set ALLOWED_ORIGINS="https://www.yoursite.com,https://yoursite.com" in the backend
// environment to accept browser requests only from your frontend. If not set, all origins
// are accepted (same as before).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const corsOptions = {
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Keep the raw request body - needed to verify the Razorpay webhook signature
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/avantika-travels', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB connected');
})
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/packages', require('./routes/packageRoutes'));
app.use('/api/places', require('./routes/placeRoutes'));
app.use('/api/blogs', require('./routes/blogRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/contacts', require('./routes/contactRoutes'));
app.use('/api/website', require('./routes/websiteRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/galleries', require('./routes/galleryRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/custom-bookings', require('./routes/customBookingRoutes'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Start scheduled jobs once the server is up.
  try {
    startCronJobs();
    console.log('[cron] Cron job runner initialised.');
  } catch (err) {
    console.error('[cron] Failed to initialise cron jobs:', err.message);
  }
});

module.exports = app;