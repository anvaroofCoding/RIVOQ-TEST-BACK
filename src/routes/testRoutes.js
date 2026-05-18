import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as testController from '../controllers/testController.js';

const router = express.Router();

/**
 * @swagger
 * /me:
 *   get:
 *     tags: [Test]
 *     summary: Get current user profile
 *     description: Mongo `_id` bilan birga `friendId` ham qaytadi — do‘stlar/sheriklar uchun ekranda **`friendId`** (10–16 raqam) ishlating; uzun hex bu emas.
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authenticate, testController.me);

/**
 * @swagger
 * /subjects:
 *   get:
 *     tags: [Test]
 *     summary: List subjects (Fan) with search & pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         description: Search query (matches name or description)
 *         schema: { type: string }
 *         example: "math"
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number (1-based)
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Page size (max 100)
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 */
router.get('/subjects', authenticate, testController.listSubjects);

/**
 * @swagger
 * /subjects/{subjectId}/topics:
 *   get:
 *     tags: [Test]
 *     summary: List topics (Mavzu) by subject with search & pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         required: false
 *         description: Search query (matches name or description)
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number (1-based)
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Page size (max 100)
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 */
router.get('/subjects/:subjectId/topics', authenticate, testController.listTopicsBySubject);

/**
 * @swagger
 * /topics/preview-by-code:
 *   post:
 *     tags: [Test]
 *     summary: Kod bo'yicha test haqida ma'lumot (sessiya ochilmaydi)
 *     description: |
 *       Mobil ilova: foydalanuvchi 6 raqamni kiritgach, avval ushbu endpoint orqali fan/mavzu/vaqt/savollar soni chiqadi.
 *       "Testni boshlash" bosilgach esa `/topics/start-with-code` chaqiriladi — undan keyingi oqim jamoat testi bilan bir xil.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 pattern: '^\\d{6}$'
 *                 example: "482193"
 *     responses:
 *       200:
 *         description: Fan + mavzu meta (sessiya yo'q)
 *       400:
 *         description: Kod yoki mavzu noto'g'ri
 *       404:
 *         description: Kod topilmadi
 */
/**
 * @swagger
 * /company-test/resume:
 *   get:
 *     tags: [Test]
 *     summary: Kompaniya testini davom ettirish (kod kerak emas)
 *     description: |
 *       Ilova ochilganda chaqiring. Ochiq `in_progress` sessiya bo‘lsa va test yopilmagan bo‘lsa —
 *       `canResume: true` + joriy savol.
 *       Har javobda emas — faqat refresh / ilova ochilganda.
 *       `clearResumePin: true` faqat `already_finished`, `blocked_by_company`, `test_closed`, `session_expired`.
 *       `no_active_session` va `invite_not_found` — pin saqlanadi (vaqtinchalik).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *         description: Pin saqlangan sessiya ID (refreshda aniqroq topish)
 *     responses:
 *       200:
 *         description: Davom ettirish mumkin yoki sabab bilan rad (`clearResumePin`, `pinPolicy`)
 */
router.get('/company-test/resume', authenticate, testController.resumeCompanyTest);

router.post('/topics/preview-by-code', authenticate, testController.previewTopicByAccessCode);

/**
 * @swagger
 * /sessions/{sessionId}/test-plan:
 *   get:
 *     tags: [Test]
 *     summary: Test rejasi (mavzular ketma-ketligi, joriy segment)
 *     description: Ko‘p mavzuli kompaniya testi — qaysi mavzuda ekansiz va keyingi qadam.
 *     security:
 *       - bearerAuth: []
 */
router.get('/sessions/:sessionId/test-plan', authenticate, testController.getSessionTestPlan);

/**
 * @swagger
 * /sessions/{sessionId}/segment-transition:
 *   get:
 *     tags: [Test]
 *     summary: Keyingi mavzuga o‘tish ogohlantirishi
 *     description: |
 *       `atIndex` — tekshiriladigan savol indeksi (odatda joriy `currentIndex`).
 *       `segmentTransition` bo‘lsa, ilova modal ko‘rsatadi.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: atIndex
 *         schema: { type: integer }
 */
router.get('/sessions/:sessionId/segment-transition', authenticate, testController.getSessionSegmentTransition);

/**
 * @swagger
 * /topics/start-with-code:
 *   post:
 *     tags: [Test]
 *     summary: 6 raqamli kod bilan test sessiyasini boshlash (maxfiy mavzu)
 *     description: Use for private tests that do not appear in the public catalog. Body must include the numeric code issued by the company in AdminJS.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 pattern: '^\\d{6}$'
 *                 example: "482193"
 *     responses:
 *       201:
 *         description: Sessiya yaratildi — birinchi savol `data.current` da
 */
router.post('/topics/start-with-code', authenticate, testController.startTopicWithAccessCode);

/**
 * @swagger
 * /topics/{topicId}/start:
 *   post:
 *     tags: [Test]
 *     summary: Start a test session for a public catalog topic
 *     description: Company-private topics must use POST /topics/start-with-code instead.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema: { type: string }
 */
router.post('/topics/:topicId/start', authenticate, testController.startTopic);

/**
 * @swagger
 * /sessions/history:
 *   get:
 *     tags: [Test]
 *     summary: Finished tests history (list)
 *     description: |
 *       Paginated finished sessions. Sanalar: `startedAt`, `expiresAt`, `finishedAt` (yakun vaqti — eski yozuvlar uchun `createdAt` fallback),
 *       `finishedAtRecorded` (DB dagi `finishedAt`), `createdAt`, `updatedAt`, `durationSeconds`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         description: Search by topic/test name
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 */
router.get('/sessions/history', authenticate, testController.listSessionHistory);

/**
 * @swagger
 * /sessions/{sessionId}/history:
 *   get:
 *     tags: [Test]
 *     summary: Finished test history detail (per-question review)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 */
router.get('/sessions/:sessionId/history', authenticate, testController.getSessionHistoryDetail);

/**
 * @swagger
 * /sessions/{sessionId}:
 *   get:
 *     tags: [Test]
 *     summary: Get session status and current question
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 */
router.get('/sessions/:sessionId', authenticate, testController.getSession);

/**
 * @swagger
 * /sessions/{sessionId}/notify-company-test-tab-leave:
 *   post:
 *     tags: [Test]
 *     summary: Kompaniya testida ekrandan chiqish haqida kompaniyaga xabar (faqat kodli test)
 *     description: |
 *       Mobil: `document.visibility` / app background — foydalanuvchi testdan chiqib ketgan vaqt **kamida 1 soniya**
 *       bo‘lgach qaytganda chaqiring. **Faqat** `POST /topics/start-with-code` orqali boshlangan sessiya uchun ishlaydi;
 *       bildirishnoma **faqat** ushbu testni ochgan kompaniya akkauntiga (`role=company`) ketadi.
 *       Bir xil sessiyada spam oldini olish: ~90 soniyada bir marta.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hiddenDurationMs]
 *             properties:
 *               hiddenDurationMs:
 *                 type: number
 *                 description: Yashirin/hidden holat davomiyligi (ms), kamida 1000
 *                 minimum: 1000
 *                 example: 1500
 *     responses:
 *       201:
 *         description: Kompaniyaga notification yaratildi
 *       200:
 *         description: cooldown — yangi notification yuborilmadi
 *       400:
 *         description: Jamoat testi yoki hiddenDurationMs noto‘g‘ri
 */
router.post(
  '/sessions/:sessionId/notify-company-test-tab-leave',
  authenticate,
  testController.notifyCompanyTestTabLeave
);

/**
 * @swagger
 * /sessions:
 *   get:
 *     tags: [Test]
 *     summary: List my test sessions (archive)
 *     security:
 *       - bearerAuth: []
 */
router.get('/sessions', authenticate, testController.listMySessions);

/**
 * @swagger
 * /sessions/{sessionId}/answer:
 *   post:
 *     tags: [Test]
 *     summary: Submit answer for current question (moves to next)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answer]
 *             properties:
 *               answer:
 *                 type: string
 */
router.post('/sessions/:sessionId/answer', authenticate, testController.answerSession);

/**
 * @swagger
 * /sessions/{sessionId}/answers/{index}:
 *   patch:
 *     tags: [Test]
 *     summary: Update an existing answer by question index (A/B/C/D or option text)
 *     description: Allows changing previously selected answers while session is in_progress.
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
 *         description: Question index (0-based)
 *         schema: { type: integer, minimum: 0 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answer]
 *             properties:
 *               answer:
 *                 type: string
 *                 example: "B"
 *     responses:
 *       200:
 *         description: Updated answer + refreshed score
 */
router.patch('/sessions/:sessionId/answers/:index', authenticate, testController.updateSessionAnswer);

/**
 * @swagger
 * /sessions/{sessionId}/finish:
 *   post:
 *     tags: [Test]
 *     summary: Finish a session early (manual submit)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session finished summary
 */
router.post('/sessions/:sessionId/finish', authenticate, testController.finishSession);

/**
 * @swagger
 * /sessions/{sessionId}/results:
 *   get:
 *     tags: [Test]
 *     summary: Get finished session results (includes correct answers)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 */
router.get('/sessions/:sessionId/results', authenticate, testController.getSessionResults);

/**
 * @swagger
 * /analytics/me:
 *   get:
 *     tags: [Test]
 *     summary: Analytics summary for current user
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics/me', authenticate, testController.myAnalytics);

export default router;

