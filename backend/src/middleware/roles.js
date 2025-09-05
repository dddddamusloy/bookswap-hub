module.exports = function requireRole(role = "admin") {
    return (req, res, next) => {
      if (!req.user || req.user.role !== role) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
      next();
    };
  };
  