const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tagline: { type: String, default: "Discover the Divine Beauty of Madhya Pradesh" },
  description: { type: String, required: true },
  secondaryImage: {
    type: String,
    enum: ['/pik1.avif', '/pik2.avif', '/pik3.avif', '/pik4.avif', '/pik5.avif', '/pik6.avif', '/pik7.avif', '/pik8.avif', '/pik9.avif'],
    default: "/pik2.avif"
  },
  contactInfo: {
    email: { type: String, default: "info@avanikatravels.com" },
    phone: { type: String, default: "+91 8720006707" },
    alternatePhone: { type: String, default: "+91 8720006707" },
    location: { type: String, default: "Ujjain, Madhya Pradesh, India" },
    address: { type: String, default: "123, Mahakal Road, Near Mahakal Mandir, Ujjain, MP - 456001" },
    region: { type: String, default: "Madhya Pradesh" }
  },
  mainAttraction: { type: String, default: "Mahakal Mandir" },
  socialLinks: {
    facebook: { type: String, default: "https://facebook.com/avanikatravels" },
    instagram: { type: String, default: "https://instagram.com/avanikatravels" },
    twitter: { type: String, default: "https://twitter.com/avanikatravels" },
    youtube: { type: String, default: "https://youtube.com/avanikatravels" },
  },
  workingHours: { type: String, default: "Mon - Sat: 9:00 AM - 7:00 PM" },
  theme: {
    primaryColor: { type: String, default: '#f03e73' },
    secondaryColor: { type: String, default: '#ffffff' }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Website', websiteSchema);
