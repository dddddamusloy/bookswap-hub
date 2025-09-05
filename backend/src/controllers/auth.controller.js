const jwt = require("jsonwebtoken");
const User = require("../models/User");

function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
  // cookie flags good for Vercel/Render later
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false  // set true when on HTTPS (Vercel/Render)
  });
}

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ ok: false, error: "Email already used" });
    const user = await User.create({ name, email, password, role: role === "admin" ? "admin" : "user" });
    setAuthCookie(res, { id: user._id, role: user.role });
    res.json({ ok: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ ok: false, error: "Invalid credentials" });
    }
    setAuthCookie(res, { id: user._id, role: user.role });
    res.json({ ok: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
};

exports.me = async (req, res) => {
  res.json({ ok: true, user: req.user });
};

exports.logout = async (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
};
