import express from 'express';
import StatusCodes from 'http-status-codes';
import { authenticate } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';
import { TestSession } from '../models/TestSession.js';
import { User } from '../models/User.js';

const router = express.Router();

function todayKeyLocal(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function computeDenseRankForUser(userId) {
  const me = await User.findById(userId).select({ score: 1, isActive: 1, role: 1 }).lean();
  if (!me) return null;
  if (me.role !== 'user' || me.isActive === false) return null;
  const myScore = Number(me.score || 0);
  const higherDistinctScores = await User.distinct('score', { role: 'user', isActive: true, score: { $gt: myScore } });
  return 1 + (higherDistinctScores?.length || 0);
}

/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [Test]
 *     summary: List my notifications (pagination)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread
 *         required: false
 *         description: If true, return only unread notifications
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 */
router.get('/notifications', authenticate, async (req, res) => {
  const unread = String(req.query?.unread || '') === 'true';
  const pageRaw = typeof req.query?.page === 'string' ? Number(req.query.page) : Number(req.query?.page);
  const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : Number(req.query?.limit);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 20;
  const skip = (page - 1) * limit;

  const filter = { user: req.user._id };
  if (unread) filter.readAt = null;

  const [total, items] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      items,
      pagination: { page, limit, total, totalPages, hasPrev: page > 1, hasNext: page < totalPages },
    },
  });
});

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     tags: [Test]
 *     summary: Unread notifications count
 *     security:
 *       - bearerAuth: []
 */
router.get('/notifications/unread-count', authenticate, async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, readAt: null });
  res.status(StatusCodes.OK).json({ success: true, data: { unreadCount: count } });
});

/**
 * @swagger
 * /notifications/{id}/read:
 *   post:
 *     tags: [Test]
 *     summary: Mark one notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.post('/notifications/:id/read', authenticate, async (req, res) => {
  const { id } = req.params;
  await Notification.updateOne({ _id: id, user: req.user._id }, { $set: { readAt: new Date() } });
  res.status(StatusCodes.OK).json({ success: true });
});

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     tags: [Test]
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 */
router.post('/notifications/read-all', authenticate, async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.status(StatusCodes.OK).json({ success: true });
});

/**
 * @swagger
 * /notifications/sync:
 *   post:
 *     tags: [Test]
 *     summary: Generate notifications if needed (daily reminder + rank change)
 *     description: Call this when app opens or when user enters notifications screen.
 *     security:
 *       - bearerAuth: []
 */
router.post('/notifications/sync', authenticate, async (req, res) => {
  const now = new Date();
  const today = todayKeyLocal(now);

  // 1) Daily reminder after 18:00 if user has not finished any test today
  if (now.getHours() >= 18 && req.user.lastReminderDate !== today) {
    const started = new Date(now);
    started.setHours(0, 0, 0, 0);
    const ended = new Date(now);
    ended.setHours(23, 59, 59, 999);

    const finishedToday = await TestSession.countDocuments({
      user: req.user._id,
      status: 'finished',
      finishedAt: { $gte: started, $lte: ended },
    });

    if (finishedToday === 0) {
      await Notification.create({
        user: req.user._id,
        type: 'daily_reminder',
        title: 'Bugun test yechmadingiz',
        body: 'Bugun hech qanday test yechmadingiz. 1 ta test yechib, reytingingizni oshiring.',
        data: { screen: 'Subjects' },
      });
    }

    await User.updateOne({ _id: req.user._id }, { $set: { lastReminderDate: today } });
  }

  // 2) Rank change notification (compare to lastKnownRank)
  const currentRank = await computeDenseRankForUser(req.user._id);
  if (currentRank && req.user.lastKnownRank && currentRank !== req.user.lastKnownRank) {
    const wentUp = currentRank < req.user.lastKnownRank;
    await Notification.create({
      user: req.user._id,
      type: wentUp ? 'rank_up' : 'rank_down',
      title: wentUp ? 'Tabriklaymiz!' : 'Reyting pasaydi',
      body: wentUp
        ? `Reytingingiz yaxshilandi: ${req.user.lastKnownRank}-o‘rindan ${currentRank}-o‘ringa ko‘tarildingiz.`
        : `Reytingingiz tushib qoldi: ${req.user.lastKnownRank}-o‘rindan ${currentRank}-o‘ringa. Harakat qiling!`,
      data: { screen: 'Ranking', prevRank: req.user.lastKnownRank, currentRank },
    });
  }

  if (currentRank && currentRank !== req.user.lastKnownRank) {
    await User.updateOne({ _id: req.user._id }, { $set: { lastKnownRank: currentRank } });
  }

  const unreadCount = await Notification.countDocuments({ user: req.user._id, readAt: null });
  const latest = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20).lean();

  res.status(StatusCodes.OK).json({
    success: true,
    data: { unreadCount, latest },
  });
});

export default router;

