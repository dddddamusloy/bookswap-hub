// backend/src/routes/auth.routes.js
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

// ---- config (can be moved to env if you like)
const LOGIN_LIMIT = Number(process.env.LOGIN_LIMIT || 3);          // 3 tries
const LOCK_MS = Number(process.env.LOGIN_LOCK_MS || 60 * 60 * 1000); // 1 hour

// ---- helpers
function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function minutesLeft(dt) {
  const ms = Math.max(0, new Date(dt).getTime() - Date.now());
  return Math.ceil(ms / 60000);
}

// lightweight auth middleware just for /me
async function auth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

/* ================== REGISTER ================== */
router.post("/register", async (req, res) => {
  try {
    const { name = "", email = "", password = "" } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password required" });
    }

    const lower = String(email).toLowerCase().trim();
    const exists = await User.findOne({ email: lower });
    if (exists) return res.status(409).json({ ok: false, error: "Email already registered" });

    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      name: name?.trim() || lower.split("@")[0],
      email: lower,
      passwordHash,
      role: "user",
    });

    const token = signToken(user);
    return res.json({
      ok: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ================== LOGIN ================== */
router.post("/login", async (req, res) => {
  try {
    const { email = "", password = "" } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password required" });
    }

    const lower = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: lower });

    // If user doesn’t exist or has no hash, return generic
    if (!user || !user.passwordHash) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    // Locked?
    if (user.isLocked) {
      return res.status(403).json({
        ok: false,
        locked: true,
        minutesLeft: minutesLeft(user.lockUntil),
        error: "Account locked due to too many failed attempts.",
      });
    }

    // Compare safely (coerce to string to avoid "Illegal arguments: string, undefined")
    const ok = await bcrypt.compare(String(password), String(user.passwordHash));
    if (!ok) {
      await user.incLoginAttempts(LOGIN_LIMIT, LOCK_MS);
      const left = Math.max(0, LOGIN_LIMIT - user.failedLoginAttempts);
      return res.status(401).json({
        ok: false,
        error: "Invalid email or password",
        attemptsLeft: left,
      });
    }

    // Success -> reset counters
    await user.resetLoginAttempts();

    const token = signToken(user);
    return res.json({
      ok: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role || "user" },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ================== ME ================== */
router.get("/me", auth, async (req, res) => {
  const u = req.user;
  return res.json({
    ok: true,
    user: { id: u._id, name: u.name, email: u.email, role: u.role || "user" },
  });
});

/* ================== LOGOUT (stateless) ================== */
router.post("/logout", (_req, res) => {
  // If you later switch to cookies, clear cookie here.
  return res.json({ ok: true });
});

module.exports = router;
