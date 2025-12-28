const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  logo: { type: String },
  description: { type: String, required: true },
  heroImage: { type: String },
  contactInfo: {
    email: { type: String },
    phone: { type: String },
    address: { type: String }
  },
  socialLinks: {
    facebook: { type: String },
    instagram: { type: String },
    twitter: { type: String }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Website', websiteSchema);
