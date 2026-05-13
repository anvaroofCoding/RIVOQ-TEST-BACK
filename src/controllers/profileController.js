import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';
import { asyncHandler } from '../utils/validators.js';
import { User } from '../models/User.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { setPrivateNoStore } from '../utils/httpCache.js';

const SOCIAL_LINK_COIN_BONUS = 200;

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: Foydalanuvchi profili (ism, familiya, tanish ID, ijtimoiy havolalar)
 */

function trimOrEmpty(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Bo‘sh = ijtimoiy havola yo‘q */
export function normalizeSocialField(platform, raw) {
  let s = trimOrEmpty(raw);
  if (!s) return '';

  switch (platform) {
    case 'instagram': {
      s = s.replace(/^@+/, '');
      if (s.startsWith('http://') || s.startsWith('https://')) {
        try {
          const u = new URL(s);
          const parts = u.pathname.split('/').filter(Boolean);
          s = parts[0] ? parts[0].replace(/^@+/, '') : s;
        } catch {
          /* leave */
        }
      }
      return s.slice(0, 120);
    }
    case 'facebook': {
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      try {
        return new URL(s).href.slice(0, 500);
      } catch {
        return s.slice(0, 500);
      }
    }
    case 'x': {
      s = s.replace(/^@+/, '').trim();
      if (/^[A-Za-z0-9_]{1,80}$/.test(s)) {
        return `https://x.com/${s}`.slice(0, 500);
      }
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      try {
        return new URL(s).href.slice(0, 500);
      } catch {
        return s.slice(0, 500);
      }
    }
    case 'telegram': {
      s = s.replace(/^@+/, '');
      if (s.includes('://')) {
        try {
          const u = new URL(s);
          if (/\/\+/.test(u.pathname)) return '';
          const parts = u.pathname.split('/').filter(Boolean);
          if (parts.length) s = parts[parts.length - 1];
          return s.slice(0, 120);
        } catch {
          return s.slice(0, 120);
        }
      }
      return s.slice(0, 120);
    }
    default:
      return s.slice(0, 500);
  }
}

/**
 * Havola mavjud va bonus hali berilmagan — bir martalik 200 coin; `true` = DB ga save qilingan.
 */
async function grantPendingSocialRewards(user) {
  const checks = [
    ['socialInstagram', 'profileSocialInstagramBonusPaid', 'instagram', 'profile_social_instagram'],
    ['socialFacebook', 'profileSocialFacebookBonusPaid', 'facebook', 'profile_social_facebook'],
    ['socialTelegram', 'profileSocialTelegramBonusPaid', 'telegram', 'profile_social_telegram'],
    ['socialX', 'profileSocialXBonusPaid', 'x', 'profile_social_x'],
  ];

  const granted = [];

  for (const [field, paidFlag, platform, reason] of checks) {
    const link = trimOrEmpty(user[field]);
    if (!link || user[paidFlag] === true) continue;
    user.coins += SOCIAL_LINK_COIN_BONUS;
    user[paidFlag] = true;
    granted.push({ platform, reason });
  }

  if (!granted.length) return false;

  await user.save();
  try {
    await WalletTransaction.insertMany(
      granted.map((m) => ({
        user: user._id,
        kind: 'coin',
        amount: SOCIAL_LINK_COIN_BONUS,
        reason: m.reason,
        meta: { platform: m.platform },
      }))
    );
  } catch {
    /* yozuv tarixida xatolik — balans yangilandi */
  }

  return true;
}

/** GET /profile/me */
export const getMyProfile = asyncHandler(async (req, res) => {
  setPrivateNoStore(res);
  const uid = req.user._id;
  await allocateFriendIdIfMissing(uid);
  const user = await User.findById(uid);
  await grantPendingSocialRewards(user);
  const refreshed = await User.findById(uid).lean();

  res.status(StatusCodes.OK).json({
    success: true,
    data: { profile: sanitizeMyProfile(refreshed) },
  });
});

function mergeSocialFromBody(body) {
  if (!body?.social || typeof body.social !== 'object') return {};
  const s = body.social;
  return {
    ...(typeof s.instagram === 'string' ? { socialInstagram: s.instagram } : {}),
    ...(typeof s.facebook === 'string' ? { socialFacebook: s.facebook } : {}),
    ...(typeof s.telegram === 'string' ? { socialTelegram: s.telegram } : {}),
    ...(typeof s.x === 'string' ? { socialX: s.x } : {}),
  };
}

/** PATCH /profile/me */
export const patchMyProfile = asyncHandler(async (req, res) => {
  setPrivateNoStore(res);
  const uid = req.user._id;
  const raw = req.body || {};
  const body = { ...mergeSocialFromBody(raw), ...raw };
  await allocateFriendIdIfMissing(uid);

  const user = await User.findById(uid);
  if (!user) {
    throw new AppError('Foydalanuvchi topilmadi', StatusCodes.NOT_FOUND);
  }

  if (typeof body.firstName === 'string') user.firstName = body.firstName.trim().slice(0, 80);
  if (typeof body.lastName === 'string') user.lastName = body.lastName.trim().slice(0, 80);

  if (body.age !== undefined) {
    if (body.age === null || body.age === '') {
      user.age = null;
    } else {
      const a = Number(body.age);
      if (!Number.isInteger(a) || a < 7 || a > 130) {
        throw new AppError('Yosh 7–130 oraliqidagi butun son bo‘lishi kerak.', StatusCodes.BAD_REQUEST);
      }
      user.age = a;
    }
  }

  if (typeof body.biography === 'string') user.biography = body.biography.trim().slice(0, 2000);
  if (typeof body.avatar === 'string') {
    user.avatar = body.avatar.trim().slice(0, 2048) || null;
  }
  if (typeof body.phone === 'string') {
    user.phone = body.phone.trim().slice(0, 40);
  }

  if ('socialInstagram' in body) user.socialInstagram = normalizeSocialField('instagram', body.socialInstagram);
  if ('socialFacebook' in body) user.socialFacebook = normalizeSocialField('facebook', body.socialFacebook);
  if ('socialTelegram' in body) user.socialTelegram = normalizeSocialField('telegram', body.socialTelegram);
  if ('socialX' in body) user.socialX = normalizeSocialField('x', body.socialX);

  const combined = `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim();
  if (combined.length >= 2) user.name = combined.slice(0, 50);

  const rewarded = await grantPendingSocialRewards(user);
  if (!rewarded) await user.save();

  const refreshed = await User.findById(uid).lean();
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Profil yangilandi.',
    data: { profile: sanitizeMyProfile(refreshed) },
  });
});

function sanitizeMyProfile(u) {
  if (!u) return null;
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    age: u.age ?? null,
    biography: u.biography ?? '',
    avatar: u.avatar ?? null,
    friendId: u.friendId ?? null,
    social: {
      instagram: u.socialInstagram || '',
      facebook: u.socialFacebook || '',
      telegram: u.socialTelegram || '',
      x: u.socialX || '',
    },
    socialBonusesPaid: {
      instagram: u.profileSocialInstagramBonusPaid === true,
      facebook: u.profileSocialFacebookBonusPaid === true,
      telegram: u.profileSocialTelegramBonusPaid === true,
      x: u.profileSocialXBonusPaid === true,
    },
    coins: u.coins ?? 0,
    score: u.score ?? 0,
    phone: u.phone ?? '',
    role: u.role,
    companyId: u.companyId ?? null,
    companyLogo: u.companyLogo ?? null,
    updatedAt: u.updatedAt ?? null,
  };
}

function sanitizePublic(u) {
  if (!u) return null;
  return {
    friendId: u.friendId,
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    avatar: u.avatar ?? null,
    biography: u.biography ?? '',
    age: u.age ?? null,
    social: {
      instagram: u.socialInstagram || '',
      facebook: u.socialFacebook || '',
      telegram: u.socialTelegram || '',
      x: u.socialX || '',
    },
  };
}

/** GET /profile/by-friend/:friendId — jamoat (JWT shart emas) */
export const getPublicProfileByFriendId = asyncHandler(async (req, res, next) => {
  const friendIdRaw = trimOrEmpty(req.params?.friendId);
  const validNew = /^\d{10,16}$/.test(friendIdRaw);
  const validLegacy = /^[a-zA-Z0-9]{10,18}$/.test(friendIdRaw);
  if (!validNew && !validLegacy) {
    return next(new AppError('Tanish-ID noto‘g‘ri: 10–16 ta raqam yoki (eski) 10–18 belgili ID.', StatusCodes.BAD_REQUEST));
  }

  const u = await User.findOne({ friendId: friendIdRaw, isActive: true }).lean();
  if (!u || u.role === 'admin') {
    return next(new AppError('Profil topilmadi', StatusCodes.NOT_FOUND));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: { profile: sanitizePublic(u) },
  });
});
