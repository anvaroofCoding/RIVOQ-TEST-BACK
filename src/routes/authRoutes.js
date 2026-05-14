import express from 'express';
import passport from 'passport';
import * as authController from '../controllers/authController.js';
import { isGoogleOAuthEnabled } from '../config/passport.js';

const router = express.Router();

const googleLoginUnavailable = (req, res) => {
  res.status(503).json({
    success: false,
    message:
      'Google bilan kirish bu serverda sozlanmagan. Render’da GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET va GOOGLE_CALLBACK_URL qo‘shing.',
  });
};

// Google OAuth Routes
/**
 * @swagger
 * /auth/google:
 *   get:
 *     tags: [Auth]
 *     summary: Initiate Google login
 *     description: Redirects to Google login page for Google OAuth
 *     security: []
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         required: false
 *         description: Optional mobile deep link (e.g. rivoq://auth/callback). If provided, callback will redirect there with token.
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirect to Google login page
 */
router.get(
  '/google',
  (req, res, next) => {
    if (!isGoogleOAuthEnabled()) {
      return googleLoginUnavailable(req, res);
    }
    const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : null;
    const mobile = String(req.query?.mobile || '') === '1';

    // base64url encode JSON into OAuth state (mobile deep link flow).
    const statePayload = {
      ...(redirectUri ? { redirectUri } : {}),
      ...(mobile ? { mobile: true } : {}),
    };
    const hasState = Object.keys(statePayload).length > 0;
    const state = hasState
      ? Buffer.from(JSON.stringify(statePayload), 'utf8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/g, '')
      : undefined;

    return passport.authenticate('google', {
      scope: ['openid', 'profile', 'email'],
      prompt: 'select_account',
      session: false,
      ...(state ? { state } : {}),
    })(req, res, next);
  }
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Google OAuth callback
 *     description: Google redirects here after authentication
 *     security: []
 *     parameters:
 *       - in: query
 *         name: state
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Google authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *       302:
 *         description: Redirect to failure URL when authentication fails
 */
router.get(
  '/google/callback',
  (req, res, next) => {
    if (!isGoogleOAuthEnabled()) {
      return googleLoginUnavailable(req, res);
    }
    // If someone opens callback URL directly (without Google redirect),
    // start the OAuth flow properly via /auth/google (which includes scope).
    if (!req.query?.code && !req.query?.error) {
      return res.redirect('/api/auth/google');
    }
    next();
  },
  passport.authenticate('google', { session: false, failureRedirect: '/api-docs' }),
  authController.googleCallback
);

/**
 * @swagger
 * /auth/dev-token:
 *   get:
 *     tags: [Auth]
 *     summary: (DEV only) Get JWT token by user email
 *     description: Development helper for Swagger testing. Disabled in production.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema: { type: string }
 */
router.get('/dev-token', authController.devToken);

/**
 * @swagger
 * /auth/email/request-code:
 *   post:
 *     tags: [Auth]
 *     summary: Request 6-digit email login code
 *     description: |
 *       HTTP darhol `200` qaytadi (`data.emailDelivery: queued`); SMTP yuborish fononda.
 *       SMTP xato bo‘lsa OTP bekor qilinadi — foydalanuvchi qayta «kod yuborish»ni bosadi.
 *       Productionda SMTP sozlanmagan bo‘lsa `503`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 */
router.post('/email/request-code', authController.requestEmailCode);

/**
 * @swagger
 * /auth/email/verify-code:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email code and get JWT token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *                 example: "123456"
 */
router.post('/email/verify-code', authController.verifyEmailCode);

export default router;
