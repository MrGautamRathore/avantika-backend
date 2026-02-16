const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  location: { type: String, required: true },
  passengerName: { type: String, required: true },
  story: { type: String, required: true },
  images: [
    {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
  ],
  status: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Gallery', gallerySchema);
