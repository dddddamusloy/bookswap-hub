// backend/src/server.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

/* CORS + parsers */
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* Mongo */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

/* Uploads dir */
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR));

/* Health */
app.get("/health", (_req, res) => res.send("ok"));

/* Routes */
const authRoutes = require("./routes/auth.routes");
app.use("/api/auth", authRoutes);

const bookRoutes = require("./routes/book.routes");
app.use("/api/books", bookRoutes);

const swapRoutes = require("./routes/swap.routes");
app.use("/api/swaps", swapRoutes);

const adminBookRoutes = require("./routes/admin.books");
app.use("/api/admin", adminBookRoutes);

/* 404 */
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

/* Errors */
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res
    .status(err.status || 500)
    .json({ ok: false, error: err.message || "Server error" });
});

/* Start */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server listening on http://localhost:${PORT} (CORS: ${ORIGIN})`)
);
