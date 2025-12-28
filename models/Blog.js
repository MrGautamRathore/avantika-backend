const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String },
  content: { type: String, required: true },
  author: { type: String, required: true },
  image:
    {
      public_id: { type: String },
      url: { type: String },
    },
  tags: [{ type: String }],
  date: { type: Date, default: Date.now },
  category: { type: String, required: true },
  views: { type: Number, default: 0 },
  published: { type: Boolean, default: false },
});

module.exports = mongoose.model("Blog", blogSchema);