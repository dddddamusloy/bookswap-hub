// backend/src/routes/swap.routes.js
const express = require("express");
const Book = require("../models/Book");
const SwapRequest = require("../models/SwapRequest");

const router = express.Router();

/**
 * POST /api/swaps/request
 * body: { bookId, offeredBookId, requesterEmail, message }
 */
router.post("/request", async (req, res) => {
  try {
    const { bookId, offeredBookId, requesterEmail, message } = req.body || {};
    if (!bookId || !offeredBookId || !requesterEmail) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    const [book, offered] = await Promise.all([
      Book.findById(bookId),
      Book.findById(offeredBookId),
    ]);

    if (!book || !offered) {
      return res.status(404).json({ ok: false, error: "Book not found" });
    }
    // Public book must be approved and available
    if (book.approval !== "approved" || book.status !== "available") {
      return res.status(400).json({ ok: false, error: "Target book not swappable" });
    }
    // Offered book must be available
    if (offered.status !== "available") {
      return res.status(400).json({ ok: false, error: "Your offered book is not available" });
    }
    // Need an owner to receive the request
    if (!book.ownerEmail) {
      return res.status(400).json({ ok: false, error: "Target book has no owner email" });
    }
    // Prevent requesting your own book
    if ((book.ownerEmail || "").toLowerCase() === (requesterEmail || "").toLowerCase()) {
      return res.status(400).json({ ok: false, error: "You already own this book" });
    }

    const swap = await SwapRequest.create({
      book: book._id,
      offeredBook: offered._id,
      requesterEmail,
      ownerEmail: book.ownerEmail,
      message: message || "",
      status: "pending",
    });

    return res.json({ ok: true, request: swap });
  } catch (e) {
    console.error("Swap request error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Failed to create request" });
  }
});

/**
 * GET /api/swaps/incoming?email=owner@example.com
 * Returns requests where you are the owner of the target book
 */
router.get("/incoming", async (req, res) => {
  try {
    const email = (req.query.email || "").toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Email required" });

    const swaps = await SwapRequest.find({ ownerEmail: email })
      .sort({ createdAt: -1 })
      .populate("book")
      .populate("offeredBook");

    return res.json({ ok: true, swaps });
  } catch (e) {
    console.error("Incoming swaps error:", e);
    return res.status(500).json({ ok: false, error: "Failed to load incoming swaps" });
  }
});

/**
 * GET /api/swaps/mine?email=user@example.com
 * Returns requests you sent
 */
router.get("/mine", async (req, res) => {
  try {
    const email = (req.query.email || "").toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Email required" });

    const swaps = await SwapRequest.find({ requesterEmail: email })
      .sort({ createdAt: -1 })
      .populate("book")
      .populate("offeredBook");

    return res.json({ ok: true, swaps });
  } catch (e) {
    console.error("My swaps error:", e);
    return res.status(500).json({ ok: false, error: "Failed to load your requests" });
  }
});

/**
 * POST /api/swaps/:id/approve   body: { ownerEmail }
 * POST /api/swaps/:id/reject    body: { ownerEmail }
 */
router.post("/:id/approve", async (req, res) => {
  try {
    const swap = await SwapRequest.findById(req.params.id);
    if (!swap) return res.status(404).json({ ok: false, error: "Not found" });

    // simple owner check
    if (
      (req.body?.ownerEmail || "").toLowerCase() !==
      (swap.ownerEmail || "").toLowerCase()
    ) {
      return res.status(403).json({ ok: false, error: "Not allowed" });
    }
    if (swap.status !== "pending") {
      return res.status(400).json({ ok: false, error: "Already resolved" });
    }

    swap.status = "approved";
    await swap.save();

    // When approved, mark both books as swapped
    await Promise.all([
      Book.findByIdAndUpdate(swap.book, { status: "swapped" }),
      Book.findByIdAndUpdate(swap.offeredBook, { status: "swapped" }),
      // Auto-reject other pending swaps that involve either book
      SwapRequest.updateMany(
        {
          _id: { $ne: swap._id },
          status: "pending",
          $or: [{ book: swap.book }, { book: swap.offeredBook }, { offeredBook: swap.book }, { offeredBook: swap.offeredBook }],
        },
        { $set: { status: "rejected" } }
      ),
    ]);

    const populated = await SwapRequest.findById(swap._id)
      .populate("book")
      .populate("offeredBook");

    return res.json({ ok: true, swap: populated });
  } catch (e) {
    console.error("Approve swap error:", e);
    return res.status(500).json({ ok: false, error: "Approve failed" });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const swap = await SwapRequest.findById(req.params.id);
    if (!swap) return res.status(404).json({ ok: false, error: "Not found" });

    if (
      (req.body?.ownerEmail || "").toLowerCase() !==
      (swap.ownerEmail || "").toLowerCase()
    ) {
      return res.status(403).json({ ok: false, error: "Not allowed" });
    }
    if (swap.status !== "pending") {
      return res.status(400).json({ ok: false, error: "Already resolved" });
    }

    swap.status = "rejected";
    await swap.save();

    const populated = await SwapRequest.findById(swap._id)
      .populate("book")
      .populate("offeredBook");

    return res.json({ ok: true, swap: populated });
  } catch (e) {
    console.error("Reject swap error:", e);
    return res.status(500).json({ ok: false, error: "Reject failed" });
  }
});

module.exports = router;
