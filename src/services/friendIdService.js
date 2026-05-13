import crypto from 'crypto';
import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';
import { User } from '../models/User.js';

const FRIEND_DIGITS = '0123456789';

function randomFriendIdString() {
  const len = crypto.randomInt(10, 17);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += FRIEND_DIGITS[crypto.randomInt(0, FRIEND_DIGITS.length)];
  }
  return out;
}

/**
 * Mobil profil uchun noyob `friendId` (faqat raqamlar, 10–16 ta).
 * Bazada bo‘lmasa yaratiladi; parallel so‘rovlarga chidamli.
 */
export async function allocateFriendIdIfMissing(userId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await User.findById(userId).select('friendId').lean();
    /** Eski format (harflar bilan) ham saqlanadi */
    if (existing?.friendId && String(existing.friendId).trim().length >= 10) {
      return String(existing.friendId).trim();
    }

    const candidate = randomFriendIdString();
    try {
      const updated = await User.findOneAndUpdate(
        {
          _id: userId,
          $or: [{ friendId: null }, { friendId: { $exists: false } }, { friendId: '' }],
        },
        { $set: { friendId: candidate } },
        { new: true, runValidators: true }
      );
      if (updated) return String(updated.friendId);
    } catch (err) {
      if (String(err?.code) === '11000') continue;
      throw err;
    }

    await new Promise((r) => setTimeout(r, crypto.randomInt(2, 8)));
  }

  throw new AppError('Tanish-ID yaratib bo‘lmadi — qayta urining.', StatusCodes.SERVICE_UNAVAILABLE);
}

/** Tayinlangan `friendId` bilan yangilanib olingan foydalanuvchi dokumenti */
export async function ensureUserFriendIdFresh(userId) {
  await allocateFriendIdIfMissing(userId);
  return User.findById(userId);
}
