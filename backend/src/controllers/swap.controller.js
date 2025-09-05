const SwapRequest = require("../models/SwapRequest");
const Book = require("../models/Book");

exports.requestSwap = async (req, res, next) => {
  try {
    const { bookId, message } = req.body; // mongo _id of Book
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ ok: false, error: "Book not found" });
    if (String(book.owner) === req.user.id) {
      return res.status(400).json({ ok: false, error: "You own this book" });
    }
    const already = await SwapRequest.findOne({ requester: req.user.id, book: book._id, status: "pending" });
    if (already) return res.status(400).json({ ok: false, error: "Request already pending" });

    const swap = await SwapRequest.create({
      requester: req.user.id,
      owner: book.owner,
      book: book._id,
      message: message || ""
    });
    res.json({ ok: true, swap });
  } catch (e) { next(e); }
};

exports.myRequests = async (req, res, next) => {
  try {
    const swaps = await SwapRequest.find({ requester: req.user.id })
      .populate("book", "title author bookId imageUrl")
      .sort({ createdAt: -1 });
    res.json({ ok: true, swaps });
  } catch (e) { next(e); }
};

exports.incomingRequests = async (req, res, next) => {
  try {
    const swaps = await SwapRequest.find({ owner: req.user.id })
      .populate("book", "title author bookId imageUrl")
      .populate("requester", "name email")
      .sort({ createdAt: -1 });
    res.json({ ok: true, swaps });
  } catch (e) { next(e); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params; // swap _id
    const { action } = req.body; // approve | reject | cancel
    const swap = await SwapRequest.findById(id).populate("book");
    if (!swap) return res.status(404).json({ ok: false, error: "Not found" });

    if (action === "cancel") {
      if (String(swap.requester) !== req.user.id) return res.status(403).json({ ok: false, error: "Forbidden" });
      swap.status = "cancelled";
      await swap.save();
      return res.json({ ok: true, swap });
    }

    // owner actions
    if (String(swap.owner) !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    if (action === "approve") {
      swap.status = "approved";
      await swap.save();
      // mark book swapped
      const book = swap.book;
      book.status = "swapped";
      await book.save();
    } else if (action === "reject") {
      swap.status = "rejected";
      await swap.save();
    } else {
      return res.status(400).json({ ok: false, error: "Invalid action" });
    }
    res.json({ ok: true, swap });
  } catch (e) { next(e); }
};
