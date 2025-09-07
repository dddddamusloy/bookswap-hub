// backend/src/routes/book.routes.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const Book = require("../models/Book");

const router = express.Router();

/* ------------ Cloudinary config ------------ */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});

const CLOUD_FOLDER = process.env.CLOUDINARY_FOLDER || "bookswaphub";

/* Multer in-memory so we can stream to Cloudinary */
const upload = multer({ storage: multer.memoryStorage() });

function uploadToCloudinary(fileBuffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: CLOUD_FOLDER, resource_type: "image", public_id: undefined },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

/* Helper: normalize owner info from either ObjectId or email */
function ownerMatch(userId, email) {
  const or = [];
  if (userId && mongoose.isValidObjectId(userId)) or.push({ owner: userId });
  if (email) or.push({ ownerEmail: (email || "").toLowerCase().trim() });
  return or.length ? { $or: or } : {};
}

/* ================== LIST (public) ================== */
router.get("/", async (_req, res) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 }).lean();
    res.json({ ok: true, books });
  } catch (e) {
    console.error("List books error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ============ MY BOOKS (requires email in query) ============ */
router.get("/mybooks", async (req, res) => {
  try {
    const email = (req.query.email || "").toLowerCase().trim();
    const match = ownerMatch(req.user?.id, email); // works with email alone
    const books = await Book.find(match).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, books });
  } catch (e) {
    console.error("My books error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ================== CREATE (upload to Cloudinary) ================== */
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { title, author, description = "", ownerEmail = null } = req.body;

    if (!title || !author) {
      return res.status(400).json({ ok: false, error: "Title and author are required" });
    }

    let image = null;

    // If a file was uploaded, push it to Cloudinary
    if (req.file && cloudinary.config().cloud_name) {
      const up = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      image = up.secure_url; // <-- store this URL
    } else if (req.file) {
      // Fallback: if you *really* want to keep local uploads alive (not recommended on Render)
      // you could save to /uploads here. But persistence will still be a problem.
      console.warn("[books] Received file but Cloudinary is not configured; skipping upload.");
    }

    const doc = await Book.create({
      title: title.trim(),
      author: author.trim(),
      description,
      image: image || null,
      ownerEmail: ownerEmail ? ownerEmail.toLowerCase().trim() : null,
      // owner: req.user?.id  // if you later add auth middleware
    });

    res.json({ ok: true, book: doc });
  } catch (e) {
    console.error("Create book error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ================== UPDATE (re-upload to Cloudinary if file) ================== */
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const id = req.params.id;
    const { title, author, description } = req.body;

    const update = {};
    if (typeof title === "string") update.title = title.trim();
    if (typeof author === "string") update.author = author.trim();
    if (typeof description === "string") update.description = description;

    if (req.file && cloudinary.config().cloud_name) {
      const up = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      update.image = up.secure_url;
    }

    const book = await Book.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!book) return res.status(404).json({ ok: false, error: "Book not found" });

    res.json({ ok: true, book });
  } catch (e) {
    console.error("Update book error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ================== DELETE (owner or admin) ================== */
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const ownerEmail = (req.query.email || "").toLowerCase().trim();

    // simple owner check by email; admins delete via /api/admin
    const doc = await Book.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "Book not found" });

    if (ownerEmail && doc.ownerEmail && doc.ownerEmail === ownerEmail) {
      await Book.findByIdAndDelete(id);
      return res.json({ ok: true });
    }

    // If you later add auth with req.user + role, allow admin here.
    return res.status(403).json({ ok: false, error: "Forbidden" });
  } catch (e) {
    console.error("Delete book error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
