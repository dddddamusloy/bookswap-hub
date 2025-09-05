// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Simple admin: allow emails in ADMIN_EMAILS (comma-separated)
function requireAdmin(req, res, next) {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (req.user && list.includes((req.user.email || '').toLowerCase())) return next();
  return res.status(403).json({ error: 'Admin only' });
}

module.exports = { requireAuth, requireAdmin };
