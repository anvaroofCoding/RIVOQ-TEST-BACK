import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { listMonitoringParticipants } from './companyInviteService.js';

function displayName(u) {
  const fn = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
  return fn || u?.name || '—';
}

/** Admin: barcha userlar; Company: faqat o‘z testlarida qatnashganlar */
export async function listNotificationRecipients(companyId, { search = '' } = {}) {
  if (companyId) {
    const rows = await listMonitoringParticipants(companyId, { search });
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const id = String(r.userId || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: r.name, email: r.email });
    }
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  const filter = { role: 'user', isActive: { $ne: false } };
  const q = String(search || '').trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { firstName: rx }, { lastName: rx }];
  }

  const users = await User.find(filter)
    .select('name email firstName lastName')
    .sort({ name: 1 })
    .limit(500)
    .lean();

  return users.map((u) => ({
    id: String(u._id),
    name: displayName(u),
    email: u.email || '—',
  }));
}

export async function sendNotificationsToUsers({ userIds, title, body, sender }) {
  const ids = [...new Set((userIds || []).map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Kamida bitta foydalanuvchi tanlang');
  if (!ids.every((id) => mongoose.isValidObjectId(id))) {
    throw new Error('Noto‘g‘ri foydalanuvchi ID');
  }

  const titleTrim = String(title || '').trim();
  const bodyTrim = String(body || '').trim();
  if (!titleTrim || !bodyTrim) throw new Error('Sarlavha va matn to‘ldiring');

  const fromRole = sender?.role === 'company' ? 'company' : 'admin';
  const senderId = sender?.id ? String(sender.id) : '';

  if (fromRole === 'company') {
    if (!senderId) throw new Error('Kompaniya aniqlanmadi');
    const allowed = await listNotificationRecipients(senderId, {});
    const allowedSet = new Set(allowed.map((u) => u.id));
    const denied = ids.filter((id) => !allowedSet.has(id));
    if (denied.length) {
      throw new Error(
        'Faqat o‘z testlaringizda qatnashgan foydalanuvchilarga xabar yuborish mumkin'
      );
    }
  } else {
    const count = await User.countDocuments({
      _id: { $in: ids },
      role: 'user',
      isActive: { $ne: false },
    });
    if (count !== ids.length) {
      throw new Error('Ba’zi foydalanuvchilar topilmadi yoki yuborish mumkin emas');
    }
  }

  const docs = ids.map((userId) => ({
    user: userId,
    type: 'system',
    title: titleTrim.slice(0, 120),
    body: bodyTrim.slice(0, 500),
    data: {
      screen: 'Notifications',
      from: fromRole,
      senderId,
    },
  }));

  await Notification.insertMany(docs);
  return { sent: docs.length };
}
