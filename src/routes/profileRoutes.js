import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as profileController from '../controllers/profileController.js';

const router = express.Router();

/**
 * @swagger
 * /profile/me:
 *   get:
 *     tags: [Profile]
 *     summary: Mening profilim (+ tanish-ID, coins/score snapshot)
 *     security:
 *       - bearerAuth: []
 */
router.get('/profile/me', authenticate, profileController.getMyProfile);

/**
 * @swagger
 * /profile/me:
 *   patch:
 *     tags: [Profile]
 *     summary: Profil yangilash
 *     description: |
 *       Maiydonlar ixtiyoriy. Ism+familiya `name` maydoniga avtomatik qisqartiriladi (min 2 belgi).
 *       Ijtimoiy havola birinchi marta to‘ldirilganda 200 coin (har tarmoq alohida, bir martalik).
 *       `social` obyekt yoki ustki darajada `socialInstagram` va hk. qabul qilinadi.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               age: { type: integer, nullable: true, minimum: 7, maximum: 130 }
 *               biography: { type: string, maxLength: 2000 }
 *               avatar: { type: string, description: "Rasm URLi" }
 *               phone: { type: string }
 *               socialInstagram: { type: string }
 *               socialFacebook: { type: string }
 *               socialTelegram: { type: string }
 *               socialX: { type: string }
 *               social:
 *                 type: object
 *                 properties:
 *                   instagram: { type: string }
 *                   facebook: { type: string }
 *                   telegram: { type: string }
 *                   x: { type: string }
 */
router.patch('/profile/me', authenticate, profileController.patchMyProfile);

/**
 * @swagger
 * /profile/by-friend/{friendId}:
 *   get:
 *     tags: [Profile]
 *     summary: Tanish-ID bo'yicha ochiq profil
 *     description: JWT talab qilinmaydi. Admin akkauntlari yashirin.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema: { type: string, description: 'Yangi: 10–16 raqam; eski: 10–18 harf+raqam' }
 *     responses:
 *       404:
 *         description: Profil topilmadi
 */
router.get('/profile/by-friend/:friendId', profileController.getPublicProfileByFriendId);

export default router;
