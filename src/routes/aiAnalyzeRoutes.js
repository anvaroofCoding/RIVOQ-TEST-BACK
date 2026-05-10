import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as aiAnalyzeController from '../controllers/aiAnalyzeController.js';

const router = express.Router();

/**
 * @swagger
 * /sessions/{sessionId}/questions/{index}/analyze:
 *   post:
 *     tags: [AI]
 *     summary: AI analysis for one finished history question (Groq)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: index
 *         required: true
 *         description: Question index (0-based) inside the finished session
 *         schema: { type: integer, minimum: 0 }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lang:
 *                 type: string
 *                 example: "uz"
 *               model:
 *                 type: string
 *                 example: "llama-3.3-70b-versatile"
 *     responses:
 *       200:
 *         description: Analysis JSON
 */
router.post('/sessions/:sessionId/questions/:index/analyze', authenticate, aiAnalyzeController.analyzeHistoryQuestion);

export default router;
