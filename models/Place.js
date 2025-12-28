const mongoose = require("mongoose");

const placeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true },
  description: { type: String, required: true },
  location: { type: String, required: true },
  images: [
    {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
  ],
  price: { type: Number, required: true },
  visitors: { type: Number, default: 0 },
  trips: { type: Number, default: 0 },
  cleaness: { type: Number, default: 0 },
  category: { type: String, default: "" },
  openingHours: { type: String, default: "" },
  bestTimeToVisit: { type: String, default: "" },
  rating: { type: Number, default: 0 },
  entryFee: { type: Number, default: 0 },
  isAtive: { type: Boolean, default: false },
});

module.exports = mongoose.model("Place", placeSchema);