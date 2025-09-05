// backend/src/models/Book.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

function makeBookId() {
  // simple human-friendly id, e.g. BK-3F7A2C
  return "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

const BookSchema = new Schema(
  {
    title:        { type: String, required: true, trim: true },
    author:       { type: String, required: true, trim: true },
    description:  { type: String, default: "" },
    image:        { type: String, default: null },

    // Human-friendly id shown in the UI
    bookId:       { type: String, default: makeBookId, index: true },

    // Ownership (either/both are OK)
    owner:        { type: Schema.Types.ObjectId, ref: "User", required: false },
    ownerEmail:   { type: String, trim: true, lowercase: true, default: null },

    // Availability (user-controlled)
    status:       { type: String, enum: ["available", "swapped"], default: "available" },

    // Moderation (admin-controlled)
    approval:     { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },

    // ---- Legacy fields (no longer required) ----
    // If your old schema had ownerId, keep it optional so old docs still load.
    ownerId:      { type: String, required: false, select: false },
  },
  { timestamps: true }
);

// Ensure bookId exists on new docs
BookSchema.pre("save", function (next) {
  if (!this.bookId) this.bookId = makeBookId();
  next();
});

module.exports = mongoose.model("Book", BookSchema);
