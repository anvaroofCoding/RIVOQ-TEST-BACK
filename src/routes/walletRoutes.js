import express from 'express';
import StatusCodes from 'http-status-codes';
import { authenticate } from '../middleware/auth.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { Topic } from '../models/Topic.js';

const router = express.Router();

async function mapHistoryItems(rawItems) {
  const needLookupIds = [
    ...new Set(
      rawItems
        .filter((t) => {
          const m = t.meta || {};
          return m.topicId && (!m.topicName || !m.subjectName);
        })
        .map((t) => String(t.meta.topicId))
    ),
  ];

  let topicById = new Map();
  if (needLookupIds.length) {
    const topics = await Topic.find({ _id: { $in: needLookupIds } })
      .populate('subject', 'name')
      .lean();
    topicById = new Map(topics.map((doc) => [String(doc._id), doc]));
  }

  return rawItems.map((t) => {
    const meta = { ...(t.meta || {}) };
    let topicName = meta.topicName || null;
    let subjectName = meta.subjectName || null;
    let subjectId = meta.subjectId || null;

    if (meta.topicId && (!topicName || !subjectName)) {
      const doc = topicById.get(String(meta.topicId));
      if (doc) {
        topicName = topicName || doc.name || null;
        const sub = doc.subject;
        if (sub && typeof sub === 'object') {
          subjectName = subjectName || sub.name || null;
          subjectId = subjectId || sub._id || null;
        }
      }
    }

    let sourceLabel = null;
    if (subjectName && topicName) sourceLabel = `${subjectName} · ${topicName}`;
    else if (topicName) sourceLabel = topicName;
    else if (subjectName) sourceLabel = subjectName;
    else if (t.reason === 'test_90_percent_scaled_by_questions' || t.reason === 'test_result') {
      sourceLabel = 'Test natijasi';
    }

    return {
      _id: t._id,
      kind: t.kind,
      amount: t.amount,
      reason: t.reason,
      reasonKey: t.reason,
      sourceLabel,
      topic: meta.topicId ? { _id: meta.topicId, name: topicName } : null,
      subject: subjectId || subjectName ? { _id: subjectId || null, name: subjectName } : null,
      meta: {
        ...meta,
        topicName,
        subjectName,
        subjectId,
      },
      createdAt: t.createdAt,
    };
  });
}

/**
 * @swagger
 * /wallet/me:
 *   get:
 *     tags: [Test]
 *     summary: Get my coins/score (gamification wallet)
 *     security:
 *       - bearerAuth: []
 */
router.get('/wallet/me', authenticate, (req, res) => {
  const u = req.user;
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      coins: u.coins || 0,
      score: u.score || 0,
      dailyFinishedDate: u.dailyFinishedDate || null,
      dailyFinishedCount: u.dailyFinishedCount || 0,
      dailyScoreAwarded: u.dailyScoreAwarded === true,
    },
  });
});

/**
 * @swagger
 * /wallet/history:
 *   get:
 *     tags: [Test]
 *     summary: Wallet transactions history (coins/score sources)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: kind
 *         required: false
 *         description: Filter by kind (coin or score)
 *         schema: { type: string, enum: [coin, score] }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 */
router.get('/wallet/history', authenticate, async (req, res) => {
  const kind = typeof req.query?.kind === 'string' ? req.query.kind.trim() : '';
  const pageRaw = typeof req.query?.page === 'string' ? Number(req.query.page) : Number(req.query?.page);
  const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : Number(req.query?.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 20;
  const skip = (page - 1) * limit;

  const filter = { user: req.user._id };
  if (kind === 'coin' || kind === 'score') filter.kind = kind;

  const [total, items] = await Promise.all([
    WalletTransaction.countDocuments(filter),
    WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;
  const mappedItems = await mapHistoryItems(items);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      items: mappedItems,
      pagination: {
        kind: filter.kind || null,
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

