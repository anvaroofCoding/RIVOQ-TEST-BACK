import { User } from '../models/User.js';

export function isUserBlockedByCompany(userOrLean, companyId) {
  if (!userOrLean || !companyId) return false;
  const blocks = userOrLean.companyBlocks || [];
  return blocks.some((b) => String(b.company) === String(companyId));
}

export async function blockUserForCompany(userId, companyId, reason = '') {
  const user = await User.findById(userId);
  if (!user) throw new Error('Foydalanuvchi topilmadi');
  if (user.role === 'company' || user.role === 'admin') {
    throw new Error('Kompaniya yoki admin akkauntini bloklash mumkin emas');
  }

  const cid = String(companyId);
  const exists = (user.companyBlocks || []).some((b) => String(b.company) === cid);
  if (!exists) {
    user.companyBlocks = user.companyBlocks || [];
    user.companyBlocks.push({
      company: companyId,
      blockedAt: new Date(),
      reason: String(reason || '').slice(0, 500),
    });
    await user.save();
  }
  return user;
}

export async function unblockUserForCompany(userId, companyId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('Foydalanuvchi topilmadi');

  const cid = String(companyId);
  const before = (user.companyBlocks || []).length;
  user.companyBlocks = (user.companyBlocks || []).filter((b) => String(b.company) !== cid);
  if (user.companyBlocks.length !== before) {
    await user.save();
  }
  return user;
}
