// routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateStrongPassword } = require('../utils/password');


const router = express.Router();

const TOKEN_TTL = '7d';
const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS = 3;

function signToken(user) {
  return jwt.sign(
    { sub: user._id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Register
router.post('/register', async (req, res) => {
  const { name, email, password, confirmPassword } = req.body || {};

  if (!name || !email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (!validateStrongPassword(password)) {
    return res.status(400).json({
      error:
        'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.'
    });
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ error: 'Email already registered.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email: email.toLowerCase(), passwordHash });

  const token = signToken(user);
  return res.json({
    message: 'Registered successfully',
    token,
    user: { id: user._id, name: user.name, email: user.email }
  });
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    // If currently locked
    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
      return res.status(423).json({
        error: 'Account locked. Try again later.',
        locked: true,
        minutesLeft
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      // increment attempts and compute attemptsLeft
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_MS); // 1 hour
        user.failedLoginAttempts = 0; // reset after locking
        await user.save();
        return res.status(401).json({
          error: 'Too many attempts. Account locked for 1 hour.',
          locked: true,
          attemptsLeft: 0
        });
      } else {
        const attemptsLeft = Math.max(0, MAX_ATTEMPTS - user.failedLoginAttempts);
        await user.save();
        return res.status(401).json({
          error: 'Invalid email or password.',
          attemptsLeft
        });
      }
    }

    // success -> reset counters & return token
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    const token = jwt.sign(
      { sub: user._id, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    return res.json({
      message: 'Logged in',
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
