const mongoose = require('mongoose');

const personPricingSubSchema = new mongoose.Schema({
  persons: { type: Number, required: true },
  price: { type: Number, required: true }
}, { _id: false });

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  duration: { type: String, required: true },
  destination: { type: String, required: true },
  category: { type: String, required: true },
  type: {
    type: String,
    enum: ['group', 'personal'],
    default: 'group',
    required: true
  },
  images: [
    {
      public_id: { type: String, required: true },
      url: { type: String, required: true },
    },
  ],
  itinerary: [{ type: String }],
  inclusions: [{ type: String }],
  exclusions: [{ type: String }],
  pickupPoint: { type: String },
  dropPoint: { type: String },
  tripDate: { type: Date },
  upcomingDates: [{ type: Date }],
  status: { type: Boolean, default: true },
  personPricing: [personPricingSubSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Virtual / Method: get price for a specific number of persons
packageSchema.methods.priceFor = function(numberOfPeople) {
  if (!this.personPricing || this.personPricing.length === 0) {
    return this.price;
  }
  const entry = this.personPricing.find(p => p.persons === Number(numberOfPeople));
  return entry ? entry.price : this.price;
};

// Ensure all per-person prices (1-12) are present; missing ones default to the base price.
// Also rebuilds personPricing whenever the base price changes but no explicit personPricing
// overrides were provided, so all defaults stay in sync with price.
/* packageSchema.pre('validate', function(next) {
  const base = Number(this.price) || 0;

  if (!this.personPricing || this.personPricing.length === 0) {
    // No custom pricing provided -> all default to base price
    this.personPricing = Array.from({ length: 12 }, (_, i) => ({ persons: i + 1, price: base }));
    return next();
  }

  // Some pricing provided -> fill any missing persons (1-12) with base price
  const priceMap = new Map(
    this.personPricing
      .filter(p => p && Number(p.persons) >= 1 && Number(p.persons) <= 12)
      .map(p => [Number(p.persons), Number(p.price) || base])
  );

  const normalized = [];
  for (let i = 1; i <= 12; i++) {
    normalized.push({ persons: i, price: priceMap.has(i) ? priceMap.get(i) : base });
  }
  this.personPricing = normalized;

  return next();
});
 */

packageSchema.pre('validate', function (next) {
  if (this.type === 'group') {
    // Group packages don't use per-person pricing — keep it clean/empty
    this.personPricing = [];
    return next();
  }

  const base = Number(this.price) || 0;

  if (!this.personPricing || this.personPricing.length === 0) {
    this.personPricing = Array.from({ length: 12 }, (_, i) => ({ persons: i + 1, price: base }));
    return next();
  }

  const priceMap = new Map(
    this.personPricing
      .filter(p => p && Number(p.persons) >= 1 && Number(p.persons) <= 12)
      .map(p => [Number(p.persons), Number(p.price) || base])
  );

  const normalized = [];
  for (let i = 1; i <= 12; i++) {
    normalized.push({ persons: i, price: priceMap.has(i) ? priceMap.get(i) : base });
  }
  this.personPricing = normalized;

  return next();
});
module.exports = mongoose.model('Package', packageSchema);

