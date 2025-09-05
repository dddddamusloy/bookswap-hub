const path = require("path");
const fs = require("fs");
const express = require("express");
const Book = require("../models/Book");
const SwapRequest = require("../models/SwapRequest");
const { requireAuth, requireAdmin } = require("../utils/auth");

const router = express.Router();

// all admin routes require auth + admin
router.use(requireAuth, requireAdmin);

// GET /api/admin/books?approval=pending  (or ?status=pending)
// If no query param -> return all books
router.get("/books", async (req, res) => {
  try {
    const { approval, status } = req.query;
    const val = approval || status; // support both keys
    const filter = val ? { approval: val } : {};
    const books = await Book.find(filter).sort({ createdAt: -1 });
    return res.json({ ok: true, books });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Failed to load admin books" });
  }
});

// PATCH /api/admin/books/:id/approve
router.patch("/books/:id/approve", async (req, res) => {
  try {
    const book = await Book.findByIdAndUpdate(req.params.id, { approval: "approved" }, { new: true });
    if (!book) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, book });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Approve failed" });
  }
});

// PATCH /api/admin/books/:id/reject
router.patch("/books/:id/reject", async (req, res) => {
  try {
    const book = await Book.findByIdAndUpdate(req.params.id, { approval: "rejected" }, { new: true });
    if (!book) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, book });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Reject failed" });
  }
});

// DELETE /api/admin/books/:id
router.delete("/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ ok: false, error: "Not found" });

    // delete image if exists
    if (book.image) {
      const rel = book.image.replace(/^\//, "");
      const abs = path.join(__dirname, "..", "..", rel);
      fs.unlink(abs, () => {});
    }

    // cancel pending swaps that involve this book
    await SwapRequest.updateMany(
      { status: "pending", $or: [{ book: book._id }, { offeredBook: book._id }] },
      { $set: { status: "rejected" } }
    );

    await Book.deleteOne({ _id: book._id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Delete failed" });
  }
});

module.exports = router;
