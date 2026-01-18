const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting (disabled for development)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 1000 // limit each IP to 1000 requests per windowMs
// });
// app.use(limiter);

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
});

module.exports = app;
