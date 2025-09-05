// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    // Login protection fields
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// virtual helper
userSchema.virtual('isLocked').get(function () {
  if (!this.lockUntil) return false;
  return this.lockUntil > new Date();
});

module.exports = mongoose.model('User', userSchema);
