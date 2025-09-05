const mongoose = require("mongoose");

const SwapRequestSchema = new mongoose.Schema({
  // The owner's book being requested
  book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },

  // The requester's book offered in exchange
  offeredBook: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },

  // Who owns the target book (receiver of the request)
  ownerEmail: { type: String, index: true, required: true },

  // Who is making the request
  requesterEmail: { type: String, index: true, required: true },

  message: { type: String, default: "" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
}, { timestamps: true });

// Helpful indexes
SwapRequestSchema.index({ requesterEmail: 1, createdAt: -1 });
SwapRequestSchema.index({ ownerEmail: 1, createdAt: -1 });

module.exports = mongoose.model("SwapRequest", SwapRequestSchema);
