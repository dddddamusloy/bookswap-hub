const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    const raw = req.headers.authorization || "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "No token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(401).json({ ok: false, error: "User not found" });

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

// Only email admin@mail.com is admin (simple rule like Pawfect Match)
function requireAdmin(req, res, next) {
  if ((req.user?.email || "").toLowerCase() === "admin@mail.com") return next();
  return res.status(403).json({ ok: false, error: "Admin only" });
}

module.exports = { requireAuth, requireAdmin };
