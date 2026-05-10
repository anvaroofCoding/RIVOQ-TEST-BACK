import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as aiController from '../controllers/aiController.js';

const router = express.Router();

/**
 * @swagger
 * /ai/chat:
 *   post:
 *     tags: [AI]
 *     summary: Groq chat completion (fast LLM)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Simple single-turn prompt (alternative to messages)
 *               messages:
 *                 type: array
 *                 description: OpenAI-style chat messages
 *                 items:
 *                   type: object
 *                   required: [role, content]
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [system, user, assistant]
 *                     content:
 *                       type: string
 *               model:
 *                 type: string
 *                 example: "llama-3.3-70b-versatile"
 *               temperature:
 *                 type: number
 *               maxTokens:
 *                 type: number
 *     responses:
 *       200:
 *         description: LLM response text
 */
router.post('/ai/chat', authenticate, aiController.chat);

export default router;
