const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const Book = require("../models/Book");
const SwapRequest = require("../models/SwapRequest");
const { requireAuth } = require("../utils/auth");

const router = express.Router();

// uploads dir (src/routes -> ../../uploads)
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const stamp = Date.now();
    cb(null, `${stamp}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage });

/* CREATE */
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { title, author, description, ownerEmail } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const doc = {
      title,
      author,
      description,
      image,
      status: "available",      // owner-controlled
      approval: "pending",      // admin-controlled
      ownerEmail: ownerEmail ? String(ownerEmail).toLowerCase() : null,
    };
    if (req.user && (req.user._id || req.user.id)) {
      doc.owner = req.user._id || req.user.id;
    }

    const saved = await Book.create(doc);
    return res.json({ ok: true, book: saved });
  } catch (err) {
    console.error("Create book error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Upload failed" });
  }
});

/* PUBLIC LIST — only approved & available */
router.get("/", async (_req, res) => {
  try {
    const books = await Book.find({
      approval: "approved",
      status: "available",
    })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, books });
  } catch (err) {
    console.error("List books error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load books" });
  }
});

/* MY BOOKS — show everything I own (any status/approval) */
router.get("/mybooks", requireAuth, async (req, res) => {
  try {
    const meId = req.user._id;
    const meEmail = (req.user.email || "").toLowerCase();

    const books = await Book.find({
      $or: [{ owner: meId }, { ownerEmail: meEmail }],
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, books });
  } catch (err) {
    console.error("My books error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load my books" });
  }
});

/* UPDATE (owner can edit details/availability; admin can also) */
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { title, author, description, status } = req.body;
    const update = { title, author, description };
    if (status) update.status = status; // owner controls available/swapped
    if (req.file) update.image = `/uploads/${req.file.filename}`;

    const saved = await Book.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    return res.json({ ok: true, book: saved });
  } catch (err) {
    console.error("Update book error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Update failed" });
  }
});

/* DELETE (owner by email OR admin via /api/admin/books/:id) */
router.delete("/:id", async (req, res) => {
  try {
    const email = (req.query.email || "").toLowerCase();
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ ok: false, error: "Book not found" });

    if (email && (book.ownerEmail || "").toLowerCase() !== email) {
      return res.status(403).json({ ok: false, error: "Not allowed" });
    }

    if (book.image) {
      const rel = book.image.replace(/^\//, "");
      const abs = path.join(__dirname, "..", "..", rel);
      fs.unlink(abs, () => {}); // best-effort
    }

    await SwapRequest.updateMany(
      {
        status: "pending",
        $or: [{ book: book._id }, { offeredBook: book._id }],
      },
      { $set: { status: "rejected" } }
    );

    await Book.deleteOne({ _id: book._id });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Delete book error:", err);
    return res.status(500).json({ ok: false, error: "Delete failed" });
  }
});

module.exports = router;
