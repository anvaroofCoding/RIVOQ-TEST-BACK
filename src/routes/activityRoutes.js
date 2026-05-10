import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as activityController from '../controllers/activityController.js';

const router = express.Router();

/**
 * @swagger
 * /activity/heatmap:
 *   get:
 *     tags: [Test]
 *     summary: Monthly activity heatmap (GitHub-like)
 *     description: Returns per-day finished test counts for a month, mapped to discrete green levels (0 = red).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: false
 *         schema: { type: integer, example: 2026 }
 *       - in: query
 *         name: month
 *         required: false
 *         description: Month number 1-12
 *         schema: { type: integer, example: 5 }
 */
router.get('/activity/heatmap', authenticate, activityController.heatmapMonth);

export default router;
