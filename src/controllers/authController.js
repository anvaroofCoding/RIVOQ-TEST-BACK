import { asyncHandler } from '../utils/validators.js';
import { config } from '../config/index.js';
import { User } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import crypto from 'crypto';
import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';
import { sendOtpEmail, isOtpEmailConfiguredOrDevFallback } from '../utils/email.js';
import { allocateFriendIdIfMissing } from '../services/friendIdService.js';

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

export const googleCallback = asyncHandler(async (req, res) => {
  const { token, user } = req.user;

  const allowedSchemes = (process.env.APP_REDIRECT_SCHEMES || process.env.APP_REDIRECT_SCHEME || 'rivoq://,exp://')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Mobile deep link support: frontend can start OAuth with
  // /api/auth/google?redirect_uri=rivoq://auth/callback
  // We pass it through `state` and redirect back with token.
  const state = typeof req.query?.state === 'string' ? req.query.state : null;
  let redirectUri = typeof req.query?.redirect_uri === 'string' ? req.query.redirect_uri : null;
  let stateMobile = false;

  if (state) {
    try {
      const padded = state.replace(/-/g, '+').replace(/_/g, '/');
      const padLen = (4 - (padded.length % 4)) % 4;
      const decoded = Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (!redirectUri && parsed?.redirectUri) redirectUri = String(parsed.redirectUri);
      if (parsed?.mobile === true) stateMobile = true;
    } catch {
      // ignore bad state
    }
  }

  // If frontend didn't pass redirect_uri, only use a default app deep-link when explicitly requested.
  // Otherwise, normal web login should return JSON.
  const wantsMobile = String(req.query?.mobile || '') === '1' || stateMobile === true;
  if (!redirectUri && wantsMobile && process.env.APP_DEFAULT_REDIRECT_URI) {
    redirectUri = String(process.env.APP_DEFAULT_REDIRECT_URI);
  }

  const isAllowed = (uri) => {
    // 1) Allow custom schemes (rivoq://, exp://, etc.)
    if (allowedSchemes.some((scheme) => uri.startsWith(scheme))) return true;

    // 2) Allow localhost http(s) redirects (needed for Expo web / dev flows)
    try {
      const u = new URL(uri);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
      return false;
    } catch {
      return false;
    }
  };

  // If mobile flow is requested and redirectUri is valid, redirect (no JSON).
  if (wantsMobile && redirectUri && isAllowed(redirectUri)) {
    const url = new URL(redirectUri);
    url.searchParams.set('token', token);
    url.searchParams.set('userId', String(user._id));
    url.searchParams.set('email', String(user.email));
    const deepLink = url.toString();

    // Many mobile browsers block automatic 302 redirects to custom schemes (rivoq://, exp://).
    // Return a minimal bridge page that attempts to open the app automatically.
    // For normal http(s) redirects (localhost), a standard redirect is sufficient.
    if (deepLink.startsWith('http://') || deepLink.startsWith('https://')) {
      return res.redirect(deepLink);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening app…</title>
    <meta http-equiv="refresh" content="0;url=${deepLink}" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; }
      .muted { color:#666; margin-top: 12px; }
    </style>
  </head>
  <body>
    <h2>Opening the app…</h2>
    <p class="muted">Please wait while we redirect you.</p>
    <script>
      (function () {
        try { window.location.href = ${JSON.stringify(deepLink)}; } catch (e) {}
        setTimeout(function () {
          try { window.location.replace(${JSON.stringify(deepLink)}); } catch (e) {}
        }, 400);
      })();
    </script>
  </body>
</html>`);
  }

  // Default (web): return JSON
  return res.status(200).json({
    success: true,
    message: 'Google login successful',
    data: {
      user,
      token,
    },
  });
});

export const googleDebug = asyncHandler(async (req, res) => {
  if (config.node_env === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Google debug endpoint is disabled in production',
    });
  }

  res.status(200).json({
    success: true,
    data: {
      googleClientID: config.google.clientID,
      googleCallbackURL: config.google.callbackURL,
      googleSecretConfigured: config.google.secretConfigured,
      nodeEnv: config.node_env,
    },
  });
});

export const devToken = asyncHandler(async (req, res) => {
  if (config.node_env === 'production') {
    return res.status(403).json({
      success: false,
      message: 'devToken is disabled in production',
    });
  }

  const email = String(req.query.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'email query param is required',
    });
  }

  let user = await User.findOne({ email });
  if (!user) {
    // DEV convenience: auto-create a user so Swagger testing always works.
    user = await User.create({
      name: email.split('@')[0] || 'User',
      email,
      phone: '',
      password: Math.random().toString(36).slice(-10),
      role: 'user',
      isActive: true,
    });
  }

  const token = generateToken(user._id);
  await allocateFriendIdIfMissing(user._id);
  user = await User.findById(user._id);

  return res.status(200).json({
    success: true,
    data: { token, user: user.toJSON() },
  });
});

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const requestEmailCode = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required' });
  }

  if (!isOtpEmailConfiguredOrDevFallback()) {
    throw new AppError(
      'Email orqali kod yuborish uchun serverda SMTP sozlanmagan. Render → Environment: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.',
      StatusCodes.SERVICE_UNAVAILABLE
    );
  }

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: email.split('@')[0] || 'User',
      email,
      phone: '',
      password: Math.random().toString(36).slice(-10),
      role: 'user',
      isActive: true,
    });
  }

  const now = Date.now();
  const code = generateOtp6();
  user.emailOtpHash = hashOtp(code);
  user.emailOtpExpiresAt = new Date(now + 10 * 60 * 1000); // 10 min
  user.emailOtpLastSentAt = new Date(now);
  await user.save();

  const userId = user._id;
  res.status(200).json({
    success: true,
    message: 'Tasdiqlash kodi yaratildi; pochta yuborilmoqda. Bir necha soniya kuting.',
    data: {
      email,
      expiresInSeconds: 600,
      /** Mobil: `queued` — HTTP darhol qaytadi, SMTP fononda */
      emailDelivery: 'queued',
    },
  });

  void (async () => {
    try {
      await sendOtpEmail({ to: email, code });
    } catch (err) {
      console.error('[request-email-code]', err?.message || err);
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            emailOtpHash: null,
            emailOtpExpiresAt: null,
            emailOtpLastSentAt: null,
          },
        }
      ).catch(() => {});
    }
  })().catch((e) => console.error('[request-email-code-bg]', e?.message || e));
});

export const verifyEmailCode = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const code = String(req.body?.code || '').trim();

  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'email and code are required' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'code must be 6 digits' });
  }

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
    return res.status(400).json({ success: false, message: 'No code requested' });
  }
  if (Date.now() > user.emailOtpExpiresAt.getTime()) {
    return res.status(400).json({ success: false, message: 'Code expired' });
  }

  if (hashOtp(code) !== user.emailOtpHash) {
    return res.status(400).json({ success: false, message: 'Invalid code' });
  }

  user.emailVerified = true;
  user.emailOtpHash = null;
  user.emailOtpExpiresAt = null;
  await user.save();

  await allocateFriendIdIfMissing(user._id);
  const refreshed = await User.findById(user._id);

  const token = generateToken(user._id);
  return res.status(200).json({
    success: true,
    message: 'Email verified',
    data: {
      token,
      user: refreshed.toJSON(),
    },
  });
});
