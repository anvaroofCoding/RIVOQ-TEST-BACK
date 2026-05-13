import express from 'express';
import StatusCodes from 'http-status-codes';
import { authenticate } from '../middleware/auth.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { Topic } from '../models/Topic.js';
import { User } from '../models/User.js';
import { claimDailyPresence } from '../services/testRewards.js';
import { setPrivateNoStore } from '../utils/httpCache.js';

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
    else if (t.reason === 'daily_presence') sourceLabel = 'Kunlik faollik («Bugun faolman»)';
    else if (t.reason === 'profile_social_instagram') sourceLabel = 'Profil · Instagram havolasi';
    else if (t.reason === 'profile_social_facebook') sourceLabel = 'Profil · Facebook havolasi';
    else if (t.reason === 'profile_social_telegram') sourceLabel = 'Profil · Telegram havolasi';
    else if (t.reason === 'profile_social_x') sourceLabel = 'Profil · X havolasi';
    else if (t.reason === 'admin_wallet_grant') {
      const em = meta.byAdminEmail ? String(meta.byAdminEmail).trim() : '';
      sourceLabel = em ? `Platforma sovg‘asi (admin · ${em})` : 'Platforma · admin sovg‘a (coin/score)';
    }
    else if (
      t.reason === 'test_90_percent_scaled_by_questions' ||
      t.reason === 'test_result' ||
      t.reason === 'test_finish_bonus' ||
      t.reason === 'test_milestone_80'
    ) {
      sourceLabel =
        t.reason === 'test_milestone_80'
          ? 'Test: 80%+ (jarayon bonusi)'
          : t.reason === 'test_finish_bonus'
            ? 'Test: yakun mukofoti'
            : 'Test natijasi';
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
router.get('/wallet/me', authenticate, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    const fresh = await User.findById(req.user._id)
      .select('coins score dailyFinishedDate dailyFinishedCount dailyScoreAwarded dailyPresenceDate updatedAt')
      .lean();
    if (!fresh) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    }
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        coins: Number(fresh.coins) || 0,
        score: Number(fresh.score) || 0,
        dailyFinishedDate: fresh.dailyFinishedDate || null,
        dailyFinishedCount: fresh.dailyFinishedCount || 0,
        dailyScoreAwarded: fresh.dailyScoreAwarded === true,
        dailyPresenceDate: fresh.dailyPresenceDate || null,
        /** mobil kesh bilan ziddiyatni tuzatish: har `/wallet/me` so‘rovida oxirgi server vaqti */
        walletSyncedAt: fresh.updatedAt ?? null,
      },
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * @swagger
 * /wallet/daily-active:
 *   post:
 *     tags: [Test]
 *     summary: Kunlik «Bugun faolman» (+2 coin, +1 score)
 *     description: Har kalendar kunida UTC bo‘yicha bir marta.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Qo‘llandi
 *       409:
 *         description: Bugun allaqachon olingan
 */
router.post('/wallet/daily-active', authenticate, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    const r = await claimDailyPresence(req.user._id);
    if (!r.ok) {
      const u = await User.findById(req.user._id).select('dailyPresenceDate').lean();
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "Bugungi kun uchun «faolman» mukofi allaqachon olingan.",
        data: { dailyPresenceDate: u?.dailyPresenceDate || null },
      });
    }

    req.user.coins = r.balance.coins;
    req.user.score = r.balance.score;
    req.user.dailyPresenceDate = r.dailyPresenceDate;

    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'Mukofot qo‘llandi (+2 coin, +1 score).',
      data: r,
    });
  } catch (e) {
    return next(e);
  }
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
router.get('/wallet/history', authenticate, async (req, res, next) => {
  try {
    setPrivateNoStore(res);
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
  } catch (e) {
    return next(e);
  }
});

export default router;

