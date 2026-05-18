import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as companyController from '../controllers/companyController.js';

const router = express.Router();

router.use(authenticate, authorize('company', 'admin'));

/**
 * @swagger
 * /company/invites:
 *   get:
 *     tags: [Company]
 *     summary: Kompaniya test kirish kodlari (status bilan)
 *     security:
 *       - bearerAuth: []
 */
router.get('/invites', companyController.listCompanyInvites);

/**
 * @swagger
 * /company/invites/multi:
 *   post:
 *     tags: [Company]
 *     summary: Ko‘p mavzuli test kodi (har mavzuda random savollar soni)
 *     description: |
 *       `segments` — ketma-ket mavzular. `pickCount` berilsa, mavzudan shuncha ta random savol;
 *       berilmasa — barcha savollar. Foydalanuvchi avval 1-mavzuni, keyin 2-mavzuni yechadi.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [segments]
 *             properties:
 *               segments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [topicId]
 *                   properties:
 *                     topicId: { type: string }
 *                     pickCount: { type: integer, minimum: 1, description: "Bo'sh = barcha savollar" }
 *             example:
 *               segments:
 *                 - topicId: "665a..."
 *                   pickCount: 5
 *                 - topicId: "665b..."
 *                   pickCount: 5
 */
router.post('/invites/multi', companyController.createMultiTopicCompanyInvite);

/**
 * @swagger
 * /company/invites/{inviteId}:
 *   get:
 *     tags: [Company]
 *     summary: Bitta kod yozuvi
 *     security:
 *       - bearerAuth: []
 */
router.get('/invites/:inviteId', companyController.getCompanyInvite);

/**
 * @swagger
 * /company/invites/{inviteId}/participants:
 *   get:
 *     tags: [Company]
 *     summary: Ishtirokchilar monitoringi (shu kod raundi)
 *     security:
 *       - bearerAuth: []
 */
router.get('/invites/:inviteId/participants', companyController.listInviteParticipants);

router.get('/invites/:inviteId/plan', companyController.getInvitePlan);

/**
 * @swagger
 * /company/invites/{inviteId}/close:
 *   post:
 *     tags: [Company]
 *     summary: Testni tugatish (arxiv)
 *     security:
 *       - bearerAuth: []
 */
router.post('/invites/:inviteId/close', companyController.closeCompanyInvite);

/**
 * @swagger
 * /company/topics/{topicId}/invites:
 *   post:
 *     tags: [Company]
 *     summary: Yangi 6 raqamli kod (oldingi tugatilgandan keyin)
 *     security:
 *       - bearerAuth: []
 */
router.post('/topics/:topicId/invites', companyController.createCompanyInviteForTopic);

/**
 * @swagger
 * /company/participants/{userId}/block:
 *   post:
 *     tags: [Company]
 *     summary: Ishtirokchini kompaniya testlaridan bloklash
 *     security:
 *       - bearerAuth: []
 */
router.post('/participants/:userId/block', companyController.blockParticipant);

/**
 * @swagger
 * /company/participants/{userId}/unblock:
 *   post:
 *     tags: [Company]
 *     summary: Blokni olib tashlash
 *     security:
 *       - bearerAuth: []
 */
router.post('/participants/:userId/unblock', companyController.unblockParticipant);

/**
 * @swagger
 * /company/notifications:
 *   get:
 *     tags: [Company]
 *     summary: Cheating / qoida buzilish bildirishnomalari
 *     security:
 *       - bearerAuth: []
 */
router.get('/notifications', companyController.listCompanyAlerts);

export default router;
