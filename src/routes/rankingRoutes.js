import express from 'express';
import StatusCodes from 'http-status-codes';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';

const router = express.Router();

/**
 * @swagger
 * /rankings:
 *   get:
 *     tags: [Test]
 *     summary: Global score leaderboard (rank by score)
 *     description: Returns users ordered by score (desc). Rank is computed from pagination offset.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 */
router.get('/rankings', authenticate, async (req, res) => {
  const pageRaw = typeof req.query?.page === 'string' ? Number(req.query.page) : Number(req.query?.page);
  const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : Number(req.query?.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 50;
  const skip = (page - 1) * limit;

  const filter = { role: 'user', isActive: true };

  const total = await User.countDocuments(filter);

  // Same score => same displayed rank (dense rank), but pagination is stable by rowNumber.
  const pipeline = [
    { $match: filter },
    { $sort: { score: -1, updatedAt: -1 } },
    {
      $setWindowFields: {
        // MongoDB requires window sortBy to have exactly ONE top-level field for $denseRank/$documentNumber.
        // We still apply a stable tie-break sort BEFORE this stage via $sort above.
        sortBy: { score: -1 },
        output: {
          rank: { $denseRank: {} },
          rowNumber: { $documentNumber: {} },
        },
      },
    },
    { $match: { rowNumber: { $gt: skip, $lte: skip + limit } } },
    { $project: { _id: 1, email: 1, name: 1, score: 1, rank: 1 } },
  ];

  const users = await User.aggregate(pipeline);

  const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;

  const items = users.map((u) => ({
    rank: u.rank,
    email: u.email,
    name: u.name,
    score: u.score || 0,
  }));

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
    },
  });
});

export default router;
