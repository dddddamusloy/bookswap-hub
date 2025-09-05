const Book = require("../models/Book");
const genPublicId = require("../utils/genPublicId");

exports.createBook = async (req, res, next) => {
  try {
    const { title, author, description } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const book = await Book.create({
      bookId: genPublicId("BK"),
      title, author, description,
      imageUrl,
      owner: req.user.id
    });
    res.json({ ok: true, book });
  } catch (e) { next(e); }
};

exports.listBooks = async (req, res, next) => {
  try {
    const books = await Book.find().populate("owner", "name email role").sort({ createdAt: -1 });
    res.json({ ok: true, books });
  } catch (e) { next(e); }
};

exports.myBooks = async (req, res, next) => {
  try {
    const books = await Book.find({ owner: req.user.id }).sort({ createdAt: -1 });
    res.json({ ok: true, books });
  } catch (e) { next(e); }
};

exports.updateBook = async (req, res, next) => {
  try {
    const { id } = req.params; // mongo _id
    const found = await Book.findById(id);
    if (!found) return res.status(404).json({ ok: false, error: "Not found" });
    if (String(found.owner) !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    if (req.file) found.imageUrl = `/uploads/${req.file.filename}`;
    ["title","author","description","status"].forEach(k => {
      if (req.body[k] !== undefined) found[k] = req.body[k];
    });
    await found.save();
    res.json({ ok: true, book: found });
  } catch (e) { next(e); }
};

exports.deleteBook = async (req, res, next) => {
  try {
    const { id } = req.params;
    const found = await Book.findById(id);
    if (!found) return res.status(404).json({ ok: false, error: "Not found" });
    if (String(found.owner) !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    await found.deleteOne();
    res.json({ ok: true });
  } catch (e) { next(e); }
};
