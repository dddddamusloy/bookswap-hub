// backend/src/models/Book.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// Public base URL of your backend (for full image URLs in virtual)
// Set this in Render env vars (one of these):
// PUBLIC_BASE_URL=https://bookswap-hub.onrender.com
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  process.env.SERVER_PUBLIC_URL ||
  "";

// Human-friendly id, e.g. BK-3F7A2C
function makeBookId() {
  return "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Ensure the stored image path is consistent (e.g. "/uploads/file.jpg")
function normalizeImagePath(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (/^https?:\/\//i.test(s)) return s; // already absolute URL
  s = s.replace(/^\/+/, "");             // drop leading slashes
  if (!s.startsWith("uploads/")) s = `uploads/${s}`;
  return `/${s}`;                         // store with leading slash
}

const BookSchema = new Schema(
  {
    title:       { type: String, required: true, trim: true },
    author:      { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // Store a normalized relative path ("/uploads/xxx.jpg") or absolute URL
    image:       { type: String, default: null, set: normalizeImagePath },

    // Human-friendly id shown in the UI
    bookId:      { type: String, default: makeBookId, index: true },

    // Ownership (either/both are OK)
    owner:       { type: Schema.Types.ObjectId, ref: "User", required: false },
    ownerEmail:  { type: String, trim: true, lowercase: true, default: null },

    // Availability (user-controlled)
    status:      { type: String, enum: ["available", "swapped"], default: "available" },

    // Moderation (admin-controlled)
    approval:    { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },

    // Legacy (optional)
    ownerId:     { type: String, required: false, select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Always ensure bookId exists
BookSchema.pre("save", function (next) {
  if (!this.bookId) this.bookId = makeBookId();
  // Re-run normalizer in case image was mutated bypassing the setter
  if (this.isModified("image")) this.image = normalizeImagePath(this.image);
  next();
});

// Computed full URL for the image (use this in the frontend if present)
BookSchema.virtual("imageUrl").get(function () {
  const img = this.image;
  if (!img) return null;
  if (/^https?:\/\//i.test(img)) return img;
  // If PUBLIC_BASE_URL is set, return absolute URL; else return relative
  return PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}${img}` : img;
});

module.exports = mongoose.model("Book", BookSchema);
