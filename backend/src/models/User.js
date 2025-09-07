// backend/src/models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },

    // Login protection fields
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    // Optional role support (user, admin)
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true }
);

/**
 * Virtual helper: check if account is currently locked
 */
userSchema.virtual("isLocked").get(function () {
  if (!this.lockUntil) return false;
  return this.lockUntil > new Date();
});

/**
 * Instance method: increment login attempts and lock if needed
 */
userSchema.methods.incLoginAttempts = async function (limit = 3, lockTimeMs = 60 * 60 * 1000) {
  // If lock has expired, reset counters
  if (this.lockUntil && this.lockUntil < new Date()) {
    this.failedLoginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.failedLoginAttempts += 1;
    // Lock the account if over limit and not already locked
    if (this.failedLoginAttempts >= limit && !this.isLocked) {
      this.lockUntil = new Date(Date.now() + lockTimeMs);
    }
  }
  return this.save();
};

/**
 * Instance method: reset login attempts
 */
userSchema.methods.resetLoginAttempts = async function () {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
  return this.save();
};

module.exports = mongoose.model("User", userSchema);
